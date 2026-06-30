import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/me/referral-stats
 *
 * Returns the signed-in user's referral stats:
 *   - visits: total ReferralVisit rows where referrerUserId = me.id
 *   - newVisitors: subset of visits where isNewVisitor = true
 *   - signups: total ReferralAttribution rows where referrerUserId = me.id
 *   - rsvps: total EventRsvp rows where referredByUserId = me.id
 *
 * Used by the ReferralShareCard on /profile and /events.
 *
 * Auth: signed-in user only. Returns 401 if no session.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, utmUid: true },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [visits, newVisitors, signups, rsvps] = await Promise.all([
    db.referralVisit.count({ where: { referrerUserId: me.id } }),
    db.referralVisit.count({ where: { referrerUserId: me.id, isNewVisitor: true } }),
    db.referralAttribution.count({ where: { referrerUserId: me.id } }),
    db.eventRsvp.count({ where: { referredByUserId: me.id } }),
  ]);

  return NextResponse.json({
    visits,
    newVisitors,
    signups,
    rsvps,
    utmUid: me.utmUid,
  });
}
