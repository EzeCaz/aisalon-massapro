import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * PATCH /api/admin/registrants/[id]
 * Update a registrant's status, name, or email.
 *
 * Body: { status?: string, name?: string|null, email?: string }
 *
 * When email is changed, the (eventId, email) uniqueness constraint
 * applies — if the new email already exists on a different RSVP for
 * the same event, we return 409 Conflict. If the new email matches a
 * platform user, the RSVP's userId link is auto-rebased to that user.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.eventRsvp.findUnique({
    where: { id },
    select: { id: true, eventId: true, email: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
  }

  const body = await req.json();
  const { status, name, email } = body as {
    status?: string;
    name?: string | null;
    email?: string;
  };

  const allowedStatuses = ["GOING", "MAYBE", "NOT_GOING"];
  if (status && !allowedStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${allowedStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  // If email is being changed, validate + check uniqueness on (eventId, email).
  let newEmail: string | undefined;
  let linkedUserId: string | null | undefined;
  if (email !== undefined) {
    newEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }
    if (newEmail !== existing.email) {
      const clash = await db.eventRsvp.findUnique({
        where: {
          eventId_email: { eventId: existing.eventId, email: newEmail },
        },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        return NextResponse.json(
          { error: "Another RSVP with this email already exists for the same event." },
          { status: 409 }
        );
      }
      // Re-link to platform user if one exists with the new email.
      const linked = await db.user.findUnique({
        where: { email: newEmail },
        select: { id: true },
      });
      linkedUserId = linked?.id || null;
    }
  }

  const updated = await db.eventRsvp.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(name !== undefined ? { name: name?.trim() || null } : {}),
      ...(newEmail !== undefined ? { email: newEmail } : {}),
      ...(linkedUserId !== undefined ? { userId: linkedUserId } : {}),
    },
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ rsvp: updated });
}

/**
 * DELETE /api/admin/registrants/[id]
 * Permanently remove a registrant (e.g. removing a test entry, or
 * honoring a deletion request).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.eventRsvp.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
  }

  await db.eventRsvp.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
