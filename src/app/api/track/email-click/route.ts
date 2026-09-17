/**
 * GET /api/track/email-click?id=<queueId>&target=<url>
 *
 * 302-redirects to the target URL. Side effects:
 *   - Marks the EmailQueue row as CLICKED (sets clickedAt).
 *   - Creates a TrackingLog row with type="CLICK" + targetUrl.
 *   - Constructs + persists the Meta CAPI payload (sends to Meta if env is set).
 *
 * If the target is missing or invalid, redirect to the site root.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildMetaPayload, recordAndSendMeta } from "@/lib/email-orchestrator/meta-capi";

export const dynamic = "force-dynamic";

const ALLOWED_PROTOCOLS = ["http:", "https:"];
// Phase 2 (joincoma.com): the FALLBACK_URL is used when a click-tracking
// link is malformed (missing ?target). Previously hard-coded to
// aisalon.massapro.com — meant a Coma user clicking a corrupted link
// landed on the AIS site. Now: resolve from the request host so the
// fallback matches the brand the user was on when they clicked.
function getFallbackUrl(req: NextRequest): string {
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "";
  const normalizedHost = host.toLowerCase().split(":")[0];
  // Coma brand hosts → platform.joincoma.com (the app surface; /login
  // would be apex, but the click fallback should go to the app root).
  if (
    normalizedHost === "joincoma.com" ||
    normalizedHost === "platform.joincoma.com" ||
    normalizedHost === "www.joincoma.com" ||
    normalizedHost === "coma.massapro.com" ||
    normalizedHost.endsWith(".joincoma.com")
  ) {
    return "https://platform.joincoma.com";
  }
  // AIS + unknown → aisalon.massapro.com (the legacy default).
  return "https://aisalon.massapro.com";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const queueId = url.searchParams.get("id");
  const FALLBACK_URL = getFallbackUrl(req);
  const target = url.searchParams.get("target") || FALLBACK_URL;

  // Validate target URL — must be http(s) and absolute. Otherwise fall back.
  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
    if (!ALLOWED_PROTOCOLS.includes(targetUrl.protocol)) {
      targetUrl = new URL(FALLBACK_URL);
    }
  } catch {
    targetUrl = new URL(FALLBACK_URL);
  }

  // Best-effort tracking — never block the redirect on errors.
  if (queueId) {
    try {
      const row = await db.emailQueue.findUnique({
        where: { id: queueId },
        select: { id: true, email: true, status: true, clickedAt: true, openedAt: true },
      });
      if (row) {
        const userAgent = req.headers.get("user-agent") || null;
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

        const payload = buildMetaPayload({
          queueId: row.id,
          type: "CLICK",
          email: row.email,
          targetUrl: targetUrl.toString(),
          eventTime: new Date(),
        });

        await db.$transaction(async (tx) => {
          await tx.emailQueue.update({
            where: { id: row.id },
            data: {
              status: "CLICKED",
              clickedAt: new Date(),
              openedAt: row.openedAt ?? new Date(), // a click implies an open
            },
          });
          await recordAndSendMeta(
            payload,
            row.id,
            "CLICK",
            targetUrl.toString(),
            userAgent,
            ip,
            tx,
          );
        });
      }
    } catch (err) {
      console.error("[track/email-click] error:", err);
    }
  }

  return NextResponse.redirect(targetUrl.toString(), {
    status: 302,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
