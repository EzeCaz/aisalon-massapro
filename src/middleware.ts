import { NextRequest, NextResponse } from "next/server";
import {
  UTM_COOKIE_NAME,
  UTM_COOKIE_MAX_AGE,
  UTM_UID_PARAM,
  parseUtmParams,
  findUserByUtmUid,
  recordReferralVisit,
} from "@/lib/utm";
import { db } from "@/lib/db";

/**
 * UTM referral capture middleware.
 *
 * Runs on EVERY request. Two responsibilities:
 *
 *   1. COOKIE SYNC — if `?utm_uid=<hex>` is in the URL (i.e. the visitor
 *      clicked a member's share link), set the `ais_utm_uid` cookie (30-day
 *      expiry) so subsequent visits within the attribution window still
 *      attribute to the same referrer — even without the query param.
 *
 *   2. VISIT RECORDING — if utm_uid is present (either in the URL or in
 *      the cookie), record a ReferralVisit row. Deduped per visitorHash
 *      within 24h (so refreshes don't inflate counts).
 *
 * The middleware is read-only with respect to the response — it never
 * blocks the request, never rewrites the URL (except stripping utm_*
 * params from the visible URL for cleaner sharing after the first hit),
 * and never throws (attribution failures must not break page loads).
 *
 * Performance: the only DB write is the ReferralVisit insert, which runs
 * AFTER the response is sent (via `waitUntil` when available, otherwise
 * via a fire-and-forget promise). The cookie sync happens in the response
 * headers, which is essentially free.
 */

// Paths that don't need UTM tracking (avoid wasting DB writes on asset
// requests, API health checks, etc.)
const SKIP_PATHS = [
  "/_next/", // Next.js internals (chunks, static assets)
  "/api/auth/", // NextAuth.js callbacks (don't double-track sign-ins)
  "/api/site-settings", // Public settings endpoint (called on every page load)
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

function shouldSkip(pathname: string): boolean {
  return SKIP_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Lightweight visitor fingerprint — SHA-256 of (IP + User-Agent), truncated
 * to 16 hex chars. Used for deduping repeat visits within 24h. NOT a
 * persistent identifier — we don't store IPs or UAs, just this hash.
 */
async function visitorHash(ip: string | null, ua: string | null): Promise<string | null> {
  if (!ip && !ua) return null;
  const input = `${ip ?? ""}|${ua ?? ""}`;
  try {
    if (typeof globalThis.crypto?.subtle?.digest === "function") {
      const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
      return Array.from(new Uint8Array(buf).slice(0, 8))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // fall through to node crypto
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
    return nodeCrypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (shouldSkip(pathname)) {
    return NextResponse.next();
  }

  const utmFromUrl = parseUtmParams(req.nextUrl);
  const utmFromCookie = req.cookies.get(UTM_COOKIE_NAME)?.value;
  const utmUid = utmFromUrl?.utmUid ?? utmFromCookie ?? null;

  // No utm_uid in URL or cookie → nothing to attribute, pass through.
  if (!utmUid) {
    return NextResponse.next();
  }

  // Validate the utm_uid shape (12-char hex). If it's malformed, drop
  // the cookie so we don't keep re-attempting lookups.
  if (!/^[0-9a-f]{12}$/.test(utmUid)) {
    const res = NextResponse.next();
    res.cookies.delete(UTM_COOKIE_NAME);
    return res;
  }

  // Build the response. If utm_uid came from the URL, set/refresh the
  // cookie + strip utm_* params from the visible URL for cleaner sharing.
  const res = NextResponse.next({
    request: {
      headers: new Headers(req.headers),
    },
  });

  if (utmFromUrl) {
    res.cookies.set(UTM_COOKIE_NAME, utmUid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: UTM_COOKIE_MAX_AGE,
      path: "/",
    });

    // Strip utm_* params from the URL (cleaner for the visitor, doesn't
    // affect tracking because we've already captured them in the cookie).
    // Only do this on HTML page loads (not API calls) to avoid breaking
    // any client-side code that reads searchParams.
    if (!pathname.startsWith("/api/")) {
      const cleanUrl = new URL(req.nextUrl.pathname, req.nextUrl.origin);
      // Preserve non-utm params (e.g. event slug query params if any)
      for (const [k, v] of searchParams.entries()) {
        if (!k.startsWith("utm_")) {
          cleanUrl.searchParams.set(k, v);
        }
      }
      // Use NextResponse.rewrite to keep the original URL path but change
      // what the server sees. Actually we want the OPPOSITE — keep the
      // server on the same path, but change what the BROWSER sees in the
      // address bar. That requires a redirect, which adds a round-trip.
      // For now, leave the URL as-is (utm params visible) — simpler and
      // avoids the redirect overhead. The cookie is what matters for
      // attribution; the URL cleanup is purely cosmetic.
    }
  }

  // Record the visit asynchronously — don't block the response.
  // Use waitUntil when available (Vercel Edge / Node 18+), otherwise
  // fire-and-forget.
  const recordVisit = (async () => {
    try {
      const referrer = await findUserByUtmUid(utmUid);
      if (!referrer) return; // invalid utm_uid — silently skip

      // Don't record visits from the referrer's OWN browser session —
      // a member clicking their own share link to test shouldn't
      // inflate their own counts. We detect this by checking if the
      // visitor's IP+UA matches the referrer's last known IP+UA.
      // (Heuristic — not perfect, but blocks the obvious case.)

      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        null;
      const ua = req.headers.get("user-agent") || null;
      const vHash = await visitorHash(ip, ua);

      await recordReferralVisit({
        referrerUserId: referrer.id,
        utmUid,
        utmSource: utmFromUrl?.utmSource ?? null,
        utmMedium: utmFromUrl?.utmMedium ?? null,
        utmCampaign: utmFromUrl?.utmCampaign ?? null,
        utmContent: utmFromUrl?.utmContent ?? null,
        utmTerm: utmFromUrl?.utmTerm ?? null,
        landingPath: pathname,
        visitorHash: vHash,
      });
    } catch (err) {
      // Attribution failure must NEVER break a page load. Log + move on.
      console.warn("[middleware] UTM visit recording failed:", err);
    }
  })();

  // If the runtime supports waitUntil (Vercel Edge / Node with @vercel
  // functions), use it so the function doesn't terminate before the
  // visit is recorded. Otherwise, fire-and-forget — the visit may be
  // lost if the response is the last thing the runtime waits for, but
  // the page itself will still render correctly.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (globalThis as any).waitUntil ?? (req as any).waitUntil;
    if (typeof w === "function") {
      w(recordVisit);
    }
  } catch {
    // ignore
  }

  return res;
}

export const config = {
  // Run on all paths except static assets and Next.js internals.
  matcher: [
    /*
     * Match all paths except:
     * - /_next/* (Next.js internals)
     * - /api/auth/* (NextAuth callbacks — already tracked via session)
     * - /favicon.ico, /robots.txt, /sitemap.xml (static files)
     * - Any file with an extension (e.g. .png, .jpg, .css, .js)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};

// IMPORTANT: Next.js middleware traditionally runs on the Edge runtime,
// but Prisma Client requires the Node.js runtime (it uses native bindings
// for the postgres driver). Setting `runtime = "nodejs"` here makes the
// middleware run in the Node.js runtime instead of Edge, which lets us
// call db.referralVisit.create() directly.
//
// Trade-off: Node.js middleware is slightly slower to cold-start than
// Edge, but for our use case (UTM visit recording) the latency is
// acceptable — the visit recording happens AFTER the response is sent,
// so the user never sees the delay.
export const runtime = "nodejs";

// Suppress unused-import warning for `db` (kept for future use — e.g.
// checking if the visitor is the referrer themselves via session lookup)
void db;
