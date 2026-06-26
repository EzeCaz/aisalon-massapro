import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * RSVP API for the public event page (/e/[slug]).
 *
 *   GET    /api/events/[slug]/rsvp        — returns the current user's RSVP
 *                                          status for this event (or null).
 *   POST   /api/events/[slug]/rsvp        — creates or upgrades an RSVP
 *                                          (status=GOING, source=EVENT_PAGE).
 *                                          Idempotent — if an RSVP already
 *                                          exists for (eventId, email), it is
 *                                          updated in place.
 *   DELETE /api/events/[slug]/rsvp        — cancels the current user's RSVP
 *                                          (deletes the row). Does NOT clear
 *                                          a checkInCode if one exists —
 *                                          door staff may already have
 *                                          verified the attendee.
 *
 * Auth: all three methods require a signed-in user. Anonymous visitors see
 * only the public event page and are routed to /login when they click
 * "Register".
 */

type Params = { params: Promise<{ slug: string }> };

async function getUser(req: NextRequest, slug: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { user: null, event: null, status: 401 as const };
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true },
  });
  if (!user) return { user: null, event: null, status: 401 as const };
  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true, title: true, startsAt: true, endsAt: true },
  });
  if (!event) return { user: null, event: null, status: 404 as const };
  return { user, event, status: 200 as const };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const { user, event, status } = await getUser(_req, slug);
  if (status === 401) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  if (status === 404 || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const rsvp = await db.eventRsvp.findUnique({
    where: { eventId_email: { eventId: event.id, email: user!.email } },
    select: {
      id: true,
      status: true,
      source: true,
      checkInCode: true,
      checkedInAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ rsvp });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const { user, event, status } = await getUser(_req, slug);
  if (status === 401) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  if (status === 404 || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Upsert the RSVP. We key on the (eventId, email) unique constraint so
  // clicking "Register" multiple times is safe — the existing row is just
  // upgraded to status=GOING. The checkInCode (if any) is preserved.
  const rsvp = await db.eventRsvp.upsert({
    where: { eventId_email: { eventId: event.id, email: user!.email } },
    create: {
      eventId: event.id,
      userId: user!.id,
      email: user!.email,
      name: user!.name,
      status: "GOING",
      source: "EVENT_PAGE",
    },
    update: {
      userId: user!.id,
      status: "GOING",
    },
    select: {
      id: true,
      status: true,
      source: true,
      checkInCode: true,
      checkedInAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ rsvp });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const { user, event, status } = await getUser(_req, slug);
  if (status === 401) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  if (status === 404 || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Cancel the RSVP. We DELETE the row so the user can re-register later
  // if they change their mind. If a checkInCode exists, we keep it intact
  // (detached from the deleted RSVP) — door staff may have already verified
  // the attendee and we don't want to invalidate their entry ticket for
  // future events. In practice this is rare; cancellation on event day
  // after checking in is unusual.
  await db.eventRsvp.deleteMany({
    where: { eventId: event.id, email: user!.email },
  });

  return NextResponse.json({ ok: true });
}
