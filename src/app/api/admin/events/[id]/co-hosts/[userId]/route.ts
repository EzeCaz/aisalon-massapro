import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdmin } from "@/lib/permissions";

/**
 * DELETE /api/admin/events/[id]/co-hosts/[userId]
 *
 * Remove a co-host from an event. Admin/Super-Admin only.
 *
 * Note: this does NOT downgrade the user's role back to MEMBER — they
 * may be a co-host on other events, and downgrading would break that.
 * Role management is done separately via /api/admin/members/[id].
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
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(me.role, "events.edit") && !isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json({ error: "Forbidden — Admins only" }, { status: 403 });
  }

  const { id: eventId, userId } = await params;

  const existing = await db.eventCoHost.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Co-host not found for this event" }, { status: 404 });
  }

  await db.eventCoHost.delete({
    where: { eventId_userId: { eventId, userId } },
  });

  return NextResponse.json({ ok: true });
}
