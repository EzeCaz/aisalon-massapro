import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * GET /api/admin/events/[id]/rsvps
 *
 * Returns ALL RSVPs for this event, including:
 *   - the RSVP row (status, source, checkInCode, checkedInAt, createdAt)
 *   - the linked user (id, email, name, company) — null for guest RSVPs
 *   - whether the user has checked in (checkInCode is set)
 *
 * Auth: SUPER_ADMIN or ADMIN only (`events.edit` permission). Used by
 * the "Registrations" sub-tab in the admin event manager to show door
 * staff a live list of who's checked in and what their code is.
 *
 * Query params:
 *   ?status=GOING       — filter by RSVP status
 *   ?checkedIn=true     — only checked-in attendees
 *   ?checkedIn=false    — only registered-but-not-checked-in
 */
type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || !can(me.role, "events.edit")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Verify the event exists (don't leak existence via 404 — return 404 only).
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, startsAt: true, endsAt: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Optional query filters.
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const checkedInFilter = url.searchParams.get("checkedIn");

  const where: {
    eventId: string;
    status?: string;
    checkInCode?: { not: null } | null;
  } = { eventId };
  if (statusFilter) where.status = statusFilter;
  if (checkedInFilter === "true") where.checkInCode = { not: null };
  if (checkedInFilter === "false") where.checkInCode = null;

  const rsvps = await db.eventRsvp.findMany({
    where,
    orderBy: [{ checkedInAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      source: true,
      checkInCode: true,
      checkedInAt: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          photoUrl: true,
          image: true,
        },
      },
    },
  });

  // Summary counts — useful for the admin UI to show "X registered, Y checked in".
  const total = await db.eventRsvp.count({ where: { eventId } });
  const checkedIn = await db.eventRsvp.count({
    where: { eventId, checkInCode: { not: null } },
  });

  return NextResponse.json({
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
    },
    rsvps: rsvps.map((r) => ({
      ...r,
      checkedInAt: r.checkedInAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    summary: { total, checkedIn, pending: total - checkedIn },
  });
}
