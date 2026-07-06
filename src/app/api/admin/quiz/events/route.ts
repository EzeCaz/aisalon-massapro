import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getCoHostedEventIds } from "@/lib/permissions";

/**
 * GET /api/admin/quiz/events
 * ---------------------------
 * Returns the list of events the current user can link a quiz to.
 * Admins+ see all events. CO_HOST users see only their co-hosted events.
 *
 * Used by the Control Room's "Link to event" picker.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me || !can(me.role, "quiz.host")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scopedEventIds = await getCoHostedEventIds(me.id, me.role);

  const events = await db.event.findMany({
    where:
      scopedEventIds === null
        ? {}
        : scopedEventIds.length === 0
        ? { id: "____never____" }
        : { id: { in: scopedEventIds } },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      chapter: true,
    },
    take: 100,
  });

  return NextResponse.json({ events });
}
