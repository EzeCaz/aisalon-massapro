import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/permissions";

/**
 * GET /api/admin/analytics
 *
 * Returns aggregated UTM referral analytics for the admin dashboard.
 *
 * Response shape:
 *   {
 *     "summary": {
 *       "totalVisits": number,
 *       "totalNewVisitors": number,
 *       "totalSignups": number,
 *       "totalRsvps": number,
 *       "activeReferrers": number  // members with >=1 visit
 *     },
 *     "topReferrers": [
 *       {
 *         "userId": string,
 *         "name": string,
 *         "email": string,
 *         "utmUid": string,
 *         "visits": number,
 *         "newVisitors": number,
 *         "signups": number,
 *         "rsvps": number,
 *         "lastVisitAt": string  // ISO
 *       }
 *     ],
 *     "recentVisits": [
 *       {
 *         "id": string,
 *         "createdAt": string,
 *         "landingPath": string,
 *         "utmCampaign": string|null,
 *         "referrer": { "name": string|null, "email": string, "utmUid": string }
 *       }
 *     ],
 *     "recentSignups": [
 *       {
 *         "id": string,
 *         "convertedAt": string,
 *         "referredUser": { "name": string|null, "email": string },
 *         "referrer": { "name": string|null, "email": string, "utmUid": string }
 *       }
 *     ],
 *     "visitsByDay": [ { "day": "2026-07-01", "visits": number, "signups": number } ],
 *     "topLandingPages": [ { "path": string, "visits": number } ]
 *   }
 *
 * Auth: ADMIN or SUPER_ADMIN only. CO_HOST gets 403 (they only have
 * event-scoped access, not site-wide analytics).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || (me.role !== ROLES.ADMIN && me.role !== ROLES.SUPER_ADMIN)) {
    return NextResponse.json({ error: "Forbidden — Admin access required" }, { status: 403 });
  }

  // ---------- Summary counts ----------
  const [
    totalVisits,
    totalNewVisitors,
    totalSignups,
    totalRsvps,
    activeReferrers,
  ] = await Promise.all([
    db.referralVisit.count(),
    db.referralVisit.count({ where: { isNewVisitor: true } }),
    db.referralAttribution.count(),
    db.eventRsvp.count({ where: { NOT: { referredByUserId: null } } }),
    db.referralVisit.groupBy({
      by: ["referrerUserId"],
      _count: { _all: true },
    }).then((rows) => rows.length),
  ]);

  // ---------- Top referrers (by visits, top 20) ----------
  // Group visits by referrerUserId, then join to User + count signups + RSVPs
  const topReferrerRows = await db.referralVisit.groupBy({
    by: ["referrerUserId", "utmUid"],
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });
  const referrerUserIds = topReferrerRows.map((r) => r.referrerUserId);
  const referrerUsers = await db.user.findMany({
    where: { id: { in: referrerUserIds } },
    select: { id: true, name: true, email: true, utmUid: true },
  });
  const referrerUserMap = new Map(referrerUsers.map((u) => [u.id, u]));
  // Signup + RSVP counts per referrer (in parallel)
  const [signupCounts, rsvpCounts, newVisitorCounts] = await Promise.all([
    db.referralAttribution.groupBy({
      by: ["referrerUserId"],
      _count: { _all: true },
    }),
    db.eventRsvp.groupBy({
      by: ["referredByUserId"],
      _count: { _all: true },
    }),
    db.referralVisit.groupBy({
      by: ["referrerUserId"],
      where: { isNewVisitor: true },
      _count: { _all: true },
    }),
  ]);
  const signupMap = new Map(signupCounts.map((r) => [r.referrerUserId, r._count._all]));
  const rsvpMap = new Map(
    rsvpCounts
      .filter((r): r is typeof r & { referredByUserId: string } => !!r.referredByUserId)
      .map((r) => [r.referredByUserId, r._count._all])
  );
  const newVisitorMap = new Map(newVisitorCounts.map((r) => [r.referrerUserId, r._count._all]));
  const topReferrers = topReferrerRows.map((r) => {
    const u = referrerUserMap.get(r.referrerUserId);
    return {
      userId: r.referrerUserId,
      name: u?.name ?? null,
      email: u?.email ?? "(unknown)",
      utmUid: r.utmUid,
      visits: r._count._all,
      newVisitors: newVisitorMap.get(r.referrerUserId) ?? 0,
      signups: signupMap.get(r.referrerUserId) ?? 0,
      rsvps: rsvpMap.get(r.referrerUserId) ?? 0,
      lastVisitAt: r._max.createdAt?.toISOString() ?? null,
    };
  });

  // ---------- Recent visits (last 20) ----------
  const recentVisits = await db.referralVisit.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      referrer: { select: { name: true, email: true, utmUid: true } },
    },
  });
  const recentVisitsJson = recentVisits.map((v) => ({
    id: v.id,
    createdAt: v.createdAt.toISOString(),
    landingPath: v.landingPath,
    utmCampaign: v.utmCampaign,
    isNewVisitor: v.isNewVisitor,
    referrer: {
      name: v.referrer.name,
      email: v.referrer.email,
      utmUid: v.referrer.utmUid ?? v.utmUid,
    },
  }));

  // ---------- Recent signups (last 20) ----------
  const recentSignups = await db.referralAttribution.findMany({
    orderBy: { convertedAt: "desc" },
    take: 20,
    include: {
      referredUser: { select: { name: true, email: true } },
      referrer: { select: { name: true, email: true, utmUid: true } },
    },
  });
  const recentSignupsJson = recentSignups.map((s) => ({
    id: s.id,
    convertedAt: s.convertedAt.toISOString(),
    referredUser: {
      name: s.referredUser.name,
      email: s.referredUser.email,
    },
    referrer: {
      name: s.referrer.name,
      email: s.referrer.email,
      utmUid: s.referrer.utmUid ?? s.utmUid,
    },
  }));

  // ---------- Visits by day (last 30 days) ----------
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentVisitsForChart = await db.referralVisit.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const recentSignupsForChart = await db.referralAttribution.findMany({
    where: { convertedAt: { gte: thirtyDaysAgo } },
    select: { convertedAt: true },
    orderBy: { convertedAt: "asc" },
  });
  // Bucket by day (YYYY-MM-DD)
  const dayMap = new Map<string, { visits: number; signups: number }>();
  for (const v of recentVisitsForChart) {
    const day = v.createdAt.toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, { visits: 0, signups: 0 });
    dayMap.get(day)!.visits++;
  }
  for (const s of recentSignupsForChart) {
    const day = s.convertedAt.toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, { visits: 0, signups: 0 });
    dayMap.get(day)!.signups++;
  }
  // Fill in missing days (so the chart has continuous X axis)
  const visitsByDay: { day: string; visits: number; signups: number }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const counts = dayMap.get(day) ?? { visits: 0, signups: 0 };
    visitsByDay.push({ day, ...counts });
  }

  // ---------- Top landing pages ----------
  const topLandingPagesRows = await db.referralVisit.groupBy({
    by: ["landingPath"],
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });
  const topLandingPages = topLandingPagesRows.map((r) => ({
    path: r.landingPath,
    visits: r._count._all,
  }));

  return NextResponse.json({
    summary: {
      totalVisits,
      totalNewVisitors,
      totalSignups,
      totalRsvps,
      activeReferrers,
    },
    topReferrers,
    recentVisits: recentVisitsJson,
    recentSignups: recentSignupsJson,
    visitsByDay,
    topLandingPages,
  });
}
