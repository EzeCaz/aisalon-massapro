/**
 * UTM tracking utilities.
 *
 * The flow:
 *   1. Member clicks "Share my link" on /profile or /events/[slug]
 *      → we generate a share URL like
 *        https://aisalon.massapro.com/e/ai-salon-human?utm_source=member&utm_medium=referral&utm_campaign=aisalon&utm_uid=603f865c709e
 *
 *   2. Visitor lands on that URL → middleware (or a server component)
 *      reads utm_uid from the query string, looks up the referrer user,
 *      writes a ReferralVisit row, sets an HTTP-only cookie
 *      `ais_utm_uid` (30-day expiry) so subsequent visits are still
 *      attributed even without the query param.
 *
 *   3. Visitor signs up → /api/auth/signup reads `ais_utm_uid` cookie,
 *      creates a ReferralAttribution row linking the new user to the
 *      referrer.
 *
 *   4. Visitor RSVPs → /api/events/[slug]/rsvp reads `ais_utm_uid` cookie,
 *      sets `referredByUserId` on the EventRsvp row.
 *
 *   5. Admin opens /admin/analytics → sees referrals per member,
 *      signups attributed, RSVPs by referrer, top-performing events, etc.
 *
 * SECURITY:
 *   - The utmUid is NOT a secret — it's an opaque identifier meant to be
 *     shared publicly (it's literally in the URL the member shares).
 *   - The cookie `ais_utm_uid` is HTTP-only + SameSite=Lax (not Strict —
 *     we want it to survive cross-site clicks from social media).
 */

import { db } from "@/lib/db";

/** Cookie name for the 30-day attribution window. */
export const UTM_COOKIE_NAME = "ais_utm_uid";
/** Cookie expiry in seconds (30 days). */
export const UTM_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
/** Query param name for the unique hex referrer ID. */
export const UTM_UID_PARAM = "utm_uid";

/**
 * Generate a new 12-char lowercase hex utmUid.
 * 16^12 ≈ 2.8×10^14 possibilities — collision-resistant enough for our
 * member base (currently ~200, expected lifetime <100k).
 */
export function generateUtmUid(): string {
  // Use Web Crypto (works in both Node 18+ and Edge runtime)
  const bytes = new Uint8Array(6);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback to Node's crypto module (only in Node runtime, not Edge)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
    nodeCrypto.randomFillSync(bytes);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Look up a user by their utmUid. Returns null if not found.
 * Used by the middleware and the signup/rsvp endpoints to attribute the
 * visit/conversion to the right referrer.
 */
export async function findUserByUtmUid(
  utmUid: string
): Promise<{ id: string; name: string | null; email: string } | null> {
  if (!utmUid || !/^[0-9a-f]{12}$/.test(utmUid)) return null;
  const u = await db.user.findUnique({
    where: { utmUid },
    select: { id: true, name: true, email: true },
  });
  return u;
}

/**
 * Build a share URL for a member with their UTM params appended.
 *
 * Usage:
 *   const url = buildShareUrl({
 *     baseUrl: "https://aisalon.massapro.com",
 *     path: "/e/ai-salon-human",
 *     utmUid: "603f865c709e",
 *     campaign: "ai-salon-human-launch",
 *   });
 */
export function buildShareUrl(opts: {
  baseUrl: string;
  path: string;
  utmUid: string;
  campaign?: string;
  medium?: string;
  source?: string;
  content?: string;
}): string {
  const url = new URL(opts.path, opts.baseUrl);
  url.searchParams.set(UTM_UID_PARAM, opts.utmUid);
  url.searchParams.set("utm_source", opts.source ?? "member");
  url.searchParams.set("utm_medium", opts.medium ?? "referral");
  url.searchParams.set("utm_campaign", opts.campaign ?? "aisalon");
  if (opts.content) url.searchParams.set("utm_content", opts.content);
  return url.toString();
}

/**
 * Parse UTM params from a URL or request. Returns null if no utm_uid
 * is present (in which case there's nothing to attribute).
 */
export function parseUtmParams(
  url: URL
): {
  utmUid: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
} | null {
  const utmUid = url.searchParams.get(UTM_UID_PARAM);
  if (!utmUid) return null;
  return {
    utmUid,
    utmSource: url.searchParams.get("utm_source"),
    utmMedium: url.searchParams.get("utm_medium"),
    utmCampaign: url.searchParams.get("utm_campaign"),
    utmContent: url.searchParams.get("utm_content"),
    utmTerm: url.searchParams.get("utm_term"),
  };
}

/**
 * Record a referral visit. Called by the middleware when a visitor
 * lands with utm_uid in the URL.
 *
 * Idempotency: if the same visitorHash has already been recorded for
 * this referrerUserId within the last 24h, we DON'T create a new row
 * (avoids inflating counts from a single user refreshing the page).
 *
 * Returns the ReferralVisit row (existing or new).
 */
export async function recordReferralVisit(opts: {
  referrerUserId: string;
  utmUid: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  landingPath: string;
  visitorHash?: string | null;
}): Promise<{ id: string; isNewVisitor: boolean }> {
  // Check for a recent duplicate visit (same referrer + same visitorHash, last 24h)
  if (opts.visitorHash) {
    const recent = await db.referralVisit.findFirst({
      where: {
        referrerUserId: opts.referrerUserId,
        visitorHash: opts.visitorHash,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true, isNewVisitor: true },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      // Same visitor already came through this referrer's link today —
      // don't double-count. Return the existing row.
      return recent;
    }
  }

  // Determine if this is a new visitor (never seen before for this referrer)
  const isNewVisitor =
    !opts.visitorHash ||
    !(await db.referralVisit.findFirst({
      where: {
        referrerUserId: opts.referrerUserId,
        visitorHash: opts.visitorHash,
      },
      select: { id: true },
    }));

  const visit = await db.referralVisit.create({
    data: {
      referrerUserId: opts.referrerUserId,
      utmUid: opts.utmUid,
      utmSource: opts.utmSource ?? null,
      utmMedium: opts.utmMedium ?? null,
      utmCampaign: opts.utmCampaign ?? null,
      utmContent: opts.utmContent ?? null,
      utmTerm: opts.utmTerm ?? null,
      landingPath: opts.landingPath,
      visitorHash: opts.visitorHash ?? null,
      isNewVisitor,
    },
    select: { id: true, isNewVisitor: true },
  });
  return visit;
}

/**
 * Attribute a signup to a referrer. Called from /api/auth/signup after
 * the new user is created.
 *
 * Idempotency: if the user already has a ReferralAttribution row, we
 * don't create a second one.
 */
export async function attributeSignup(opts: {
  newUserId: string;
  utmUid: string;
  referralVisitId?: string | null;
}): Promise<void> {
  const referrer = await db.user.findUnique({
    where: { utmUid: opts.utmUid },
    select: { id: true, utmUid: true },
  });
  if (!referrer || !referrer.utmUid) return;

  // Don't attribute if the referrer is the same as the new user (i.e.
  // the member signed up via their OWN share link — common during testing)
  if (referrer.id === opts.newUserId) return;

  // Idempotency: at most one attribution per new user
  const existing = await db.referralAttribution.findUnique({
    where: { referredUserId: opts.newUserId },
    select: { id: true },
  });
  if (existing) return;

  await db.referralAttribution.create({
    data: {
      referredUserId: opts.newUserId,
      referrerUserId: referrer.id,
      utmUid: referrer.utmUid,
      referralVisitId: opts.referralVisitId ?? null,
    },
  });
}

/**
 * Look up the referrer's userId from a utmUid string. Used by the RSVP
 * endpoint to set `referredByUserId` on the new EventRsvp row.
 *
 * Returns null if the utmUid is invalid or doesn't match any user.
 */
export async function getReferrerUserId(
  utmUid: string | null | undefined
): Promise<string | null> {
  if (!utmUid) return null;
  const referrer = await findUserByUtmUid(utmUid);
  return referrer?.id ?? null;
}
