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

  // ---------- Recent visits (last 50, with full UTM columns) ----------
  // Increased from 20 → 50 and added ALL utm_* columns so the admin can
  // filter by any UTM dimension (source/medium/campaign/content/term/uid)
  // per the user spec point E ("Always add the utms on the columns and as
  // a filter").
  const recentVisits = await db.referralVisit.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      referrer: { select: { name: true, email: true, utmUid: true } },
    },
  });
  const recentVisitsJson = recentVisits.map((v) => ({
    id: v.id,
    createdAt: v.createdAt.toISOString(),
    landingPath: v.landingPath,
    utmSource: v.utmSource,
    utmMedium: v.utmMedium,
    utmCampaign: v.utmCampaign,
    utmContent: v.utmContent,
    utmTerm: v.utmTerm,
    utmUid: v.utmUid,
    isNewVisitor: v.isNewVisitor,
    referrer: {
      name: v.referrer.name,
      email: v.referrer.email,
      utmUid: v.referrer.utmUid ?? v.utmUid,
    },
  }));

  // ---------- Recent signups (last 50, with full UTM columns) ----------
  const recentSignups = await db.referralAttribution.findMany({
    orderBy: { convertedAt: "desc" },
    take: 50,
    include: {
      referredUser: { select: { name: true, email: true } },
      referrer: { select: { name: true, email: true, utmUid: true } },
    },
  });
  const recentSignupsJson = recentSignups.map((s) => ({
    id: s.id,
    convertedAt: s.convertedAt.toISOString(),
    utmUid: s.utmUid,
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

  // ---------- Event registrations / check-ins / attended (Task 3-H) ----------
  // Pulls RSVPs that were attributed to a referrer (referredByUserId IS NOT NULL)
  // and joins to the event so the admin sees — per event — how many registered,
  // how many checked in at the door (doorCheckedAt), and how many attended
  // (doorCheckedAt + the co-host approved them: approvedAt IS NOT NULL).
  //
  // "Attended" here = door-staff scanned their code AND a co-host had pre-
  // approved them (the strictest signal of a real, intentional attendee).
  const attributedRsvps = await db.eventRsvp.findMany({
    where: { referredByUserId: { not: null } },
    select: {
      id: true,
      eventId: true,
      status: true,
      referredByUserId: true,
      checkedInAt: true,
      doorCheckedAt: true,
      approvedAt: true,
      attendedAt: true,
      noShow: true,
      createdAt: true,
      email: true,
      name: true,
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      referredBy: { select: { id: true, name: true, email: true, utmUid: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const eventRegistrations = attributedRsvps.map((r) => ({
    rsvpId: r.id,
    eventId: r.event.id,
    eventTitle: r.event.title,
    eventSlug: r.event.slug,
    eventStartsAt: r.event.startsAt.toISOString(),
    attendeeName: r.name,
    attendeeEmail: r.email,
    status: r.status,
    registeredAt: r.createdAt.toISOString(),
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    doorCheckedAt: r.doorCheckedAt?.toISOString() ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    // "Attended" — prefer the explicit post-event attendedAt field
    // (set by admins via PATCH /api/admin/rsvps/[id]/attendance). Fall
    // back to the strict door signal (co-host pre-approved AND door
    // staff scanned the code) when attendance hasn't been marked yet.
    attendedAt: r.attendedAt?.toISOString() ?? null,
    noShow: r.noShow,
    attended: r.attendedAt != null ? true : !!(r.doorCheckedAt && r.approvedAt),
    referrer: r.referredBy
      ? {
          id: r.referredBy.id,
          name: r.referredBy.name,
          email: r.referredBy.email,
          utmUid: r.referredBy.utmUid,
        }
      : null,
  }));

  // ---------- Members "interested in" long-tail (Task 3-G) ----------
  // Raw counts per distinct interestedIn keyword. The CLIENT applies
  // the <10% grouping (groupLongTail helper) so the threshold can be
  // tweaked without a server round-trip.
  const membersWithInterests = await db.user.findMany({
    where: { interestedIn: { not: null } },
    select: { interestedIn: true, role: true, utmUid: true, createdAt: true },
  });
  // interestedIn is a free-text field — split on commas + semicolons so
  // each individual interest gets counted.
  const interestCounts = new Map<string, number>();
  for (const m of membersWithInterests) {
    if (!m.interestedIn) continue;
    const parts = m.interestedIn
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0) {
      // No separators — treat the whole string as one interest
      interestCounts.set(m.interestedIn, (interestCounts.get(m.interestedIn) || 0) + 1);
    } else {
      for (const p of parts) {
        interestCounts.set(p, (interestCounts.get(p) || 0) + 1);
      }
    }
  }
  const interestedInRows = Array.from(interestCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

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
    // New sections (Task 3):
    eventRegistrations,
    interestedInRows,
  });
}
