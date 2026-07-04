import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * DELETE /api/admin/events/[id]/cohosts/[userId]
 *
 * Removes a user from this event's co-host list. Idempotent — if the
 * user wasn't a co-host, returns 200 anyway (no error).
 *
 * Note: this does NOT downgrade the user's role back to MEMBER. They may
 * still be a co-host of other events, and even if not, downgrading role
 * silently is too surprising. The admin can change the role separately
 * via the member management UI if needed.
 *
 * Admin-only (events.edit).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "events.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: eventId, userId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // deleteMany is safe here — if the row doesn't exist, it returns
  // { count: 0 } instead of throwing, which is the idempotent behavior
  // we want.
  await db.eventCoHost.deleteMany({
    where: { eventId, userId },
  });

  return NextResponse.json({ ok: true });
}
