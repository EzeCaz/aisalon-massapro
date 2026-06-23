import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * PATCH /api/admin/registrants/[id]
 * Update a registrant's status, name, email, OR explicitly link to a
 * platform user via `userId`.
 *
 * Body: { status?: string, name?: string|null, email?: string, userId?: string|null }
 *
 * - status: GOING | MAYBE | NOT_GOING
 * - name: free text
 * - email: if changed, (eventId, email) uniqueness applies; if the new
 *   email matches a platform user, userId is auto-rebased to that user
 * - userId: explicitly link/unlink the RSVP to a platform user. Pass
 *   null to unlink. Pass a user ID to link (the user must exist). This
 *   is used by the "Add to existing member" dialog in the admin
 *   registrants table — the admin picks a member from a searchable
 *   list, and the RSVP is linked to that user without changing the
 *   RSVP's email (the member might have signed up with a different
 *   email, e.g. a secondary email).
 *
 * If both `email` and `userId` are provided, `userId` wins (explicit
 * link takes precedence over auto-link-by-email).
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
  const { status, name, email, userId } = body as {
    status?: string;
    name?: string | null;
    email?: string;
    userId?: string | null;
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
  let autoLinkedUserId: string | null | undefined;
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
      autoLinkedUserId = linked?.id || null;
    }
  }

  // Explicit userId link/unlink — takes precedence over auto-link-by-email.
  let explicitUserId: string | null | undefined;
  if (userId !== undefined) {
    if (userId === null) {
      explicitUserId = null;
    } else {
      // Validate the user exists.
      const target = await db.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!target) {
        return NextResponse.json(
          { error: "The selected member no longer exists." },
          { status: 404 }
        );
      }
      explicitUserId = userId;
    }
  }

  // Resolve final userId: explicit > auto-link > leave unchanged
  const finalUserId =
    explicitUserId !== undefined
      ? explicitUserId
      : autoLinkedUserId !== undefined
      ? autoLinkedUserId
      : undefined;

  const updated = await db.eventRsvp.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(name !== undefined ? { name: name?.trim() || null } : {}),
      ...(newEmail !== undefined ? { email: newEmail } : {}),
      ...(finalUserId !== undefined ? { userId: finalUserId } : {}),
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
