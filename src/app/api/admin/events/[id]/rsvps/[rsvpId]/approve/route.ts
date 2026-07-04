import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isEventCoHost, ROLES } from "@/lib/permissions";

/**
 * POST /api/admin/events/[id]/rsvps/[rsvpId]/approve
 *
 * Co-host pre-approval for door check-in. Marks an RSVP as "approved to
 * check in at the door" by setting `approvedByCoHostId` + `approvedAt`
 * on the EventRsvp row. Door-staff lookup at /admin/check-in will then
 * show "Approved by [name] at HH:MM on DD MMM YY" instead of rejecting
 * the code as "Not approved".
 *
 * Body: { } (no payload — the rsvpId is in the URL)
 *
 * Auth: requires events.edit (admin/super-admin) OR co-host of this event.
 *
 * Returns:
 *   200 + { ok: true, rsvp: {...} }    on success
 *   400 if the RSVP has no check-in code (cannot approve a code that doesn't exist)
 *   403 if caller is not an admin or co-host of this event
 *   404 if the event or RSVP doesn't exist (or RSVP doesn't belong to this event)
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; rsvpId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, role: true, email: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id: eventId, rsvpId } = await ctx.params;

  // Verify event exists
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, startsAt: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Permission: admin/super-admin OR co-host of this event
  const isGlobalAdmin = can(me.role, "events.edit");
  if (!isGlobalAdmin) {
    const coHost = await isEventCoHost(me.id, eventId);
    if (!coHost) {
      return NextResponse.json(
        {
          error:
            "You are not a co-host of this event. Only admins and event co-hosts can approve check-in codes.",
        },
        { status: 403 }
      );
    }
  }

  // Fetch the RSVP, scoping by eventId so a co-host of event A cannot
  // approve an RSVP for event B by guessing its rsvpId.
  const rsvp = await db.eventRsvp.findFirst({
    where: { id: rsvpId, eventId },
    select: { id: true, checkInCode: true, approvedByCoHostId: true, approvedAt: true },
  });
  if (!rsvp) {
    return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
  }

  // Sanity: cannot approve a code that doesn't exist
  if (!rsvp.checkInCode) {
    return NextResponse.json(
      {
        error:
          "This RSVP has no check-in code yet. The attendee must generate one from the event page before you can approve it.",
      },
      { status: 400 }
    );
  }

  // Idempotent: if already approved by someone, return the existing record
  if (rsvp.approvedByCoHostId && rsvp.approvedAt) {
    const approver = await db.user.findUnique({
      where: { id: rsvp.approvedByCoHostId },
      select: { id: true, name: true, email: true },
    });
    return NextResponse.json({
      ok: true,
      alreadyApproved: true,
      approvedBy: approver,
      approvedAt: rsvp.approvedAt.toISOString(),
    });
  }

  // Set approval
  const now = new Date();
  await db.eventRsvp.update({
    where: { id: rsvpId },
    data: {
      approvedByCoHostId: me.id,
      approvedAt: now,
    },
  });

  return NextResponse.json({
    ok: true,
    alreadyApproved: false,
    approvedBy: { id: me.id, name: me.name, email: me.email },
    approvedAt: now.toISOString(),
  });
}

/**
 * DELETE /api/admin/events/[id]/rsvps/[rsvpId]/approve
 *
 * Revoke a previous approval (un-approve). Same auth as POST.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; rsvpId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id: eventId, rsvpId } = await ctx.params;

  const isGlobalAdmin = can(me.role, "events.edit");
  if (!isGlobalAdmin) {
    const coHost = await isEventCoHost(me.id, eventId);
    if (!coHost) {
      return NextResponse.json(
        { error: "You are not a co-host of this event." },
        { status: 403 }
      );
    }
  }

  // Only allow un-approving if the code has NOT yet been used at the door.
  // Once doorCheckedAt is set, the approval is historical fact and should
  // stay immutable for audit trail purposes.
  const rsvp = await db.eventRsvp.findFirst({
    where: { id: rsvpId, eventId },
    select: { id: true, doorCheckedAt: true },
  });
  if (!rsvp) {
    return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
  }
  if (rsvp.doorCheckedAt) {
    return NextResponse.json(
      {
        error:
          "Cannot revoke approval — this code has already been used at the door. The approval is now part of the audit trail.",
      },
      { status: 400 }
    );
  }

  await db.eventRsvp.update({
    where: { id: rsvpId },
    data: {
      approvedByCoHostId: null,
      approvedAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}

// Silence unused import warning for ROLES (kept for clarity / future use)
void ROLES;
