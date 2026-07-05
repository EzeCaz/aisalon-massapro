import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendRsvpConfirmationEmail, emailConfigured } from "@/lib/email";
import { generateIcs } from "@/lib/calendar";
import { getReferrerUserId, UTM_COOKIE_NAME } from "@/lib/utm";

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
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      description: true,
      venue: true,
      address: true,
      city: true,
      country: true,
    },
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
  const wasAlreadyRegistered = !!(await db.eventRsvp.findUnique({
    where: { eventId_email: { eventId: event.id, email: user!.email } },
    select: { id: true },
  }));

  // UTM referral attribution — if the visitor arrived via a member's
  // share link (cookie `ais_utm_uid` set), attribute this RSVP to that
  // referrer. Only set on NEW RSVPs (existing RSVPs keep their original
  // referrer). Falls back to null if no cookie or invalid utmUid.
  let referredByUserId: string | null = null;
  if (!wasAlreadyRegistered) {
    const utmCookie = _req.cookies.get(UTM_COOKIE_NAME)?.value;
    referredByUserId = await getReferrerUserId(utmCookie);
  }

  const rsvp = await db.eventRsvp.upsert({
    where: { eventId_email: { eventId: event.id, email: user!.email } },
    create: {
      eventId: event.id,
      userId: user!.id,
      email: user!.email,
      name: user!.name,
      status: "GOING",
      source: "EVENT_PAGE",
      referredByUserId,
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

  // Send a confirmation email with .ics attachment IF:
  //   - This is a NEW registration (not a re-registration of an existing GOING RSVP)
  //   - SMTP is configured
  // We don't email on every click — only the first time the user registers.
  if (!wasAlreadyRegistered && emailConfigured()) {
    try {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");
      const eventUrl = `${siteUrl.replace(/\/$/, "")}/events/${slug}`;
      const icsContent = generateIcs({
        title: event.title,
        description: event.description,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        venue: event.venue,
        address: event.address,
        city: event.city,
        country: event.country,
        url: eventUrl,
      });
      await sendRsvpConfirmationEmail({
        to: user!.email,
        name: user!.name,
        eventTitle: event.title,
        eventStartsAt: event.startsAt.toISOString(),
        eventEndsAt: event.endsAt.toISOString(),
        eventVenue: event.venue,
        eventAddress: event.address,
        eventCity: event.city,
        eventCountry: event.country,
        eventDescription: event.description,
        eventUrl,
        icsContent,
      });
    } catch (err) {
      // Don't fail the RSVP if the email fails — the registration is
      // still valid. Just log it.
      console.error("[rsvp] Confirmation email failed:", err);
    }
  }

  // --- Trigger any flows that fire on RSVP_GOING ---
  // (best-effort — flow worker will pick up on next cron tick. Only trigger
  // for NEW registrations, not re-registrations, to avoid duplicate sends.)
  if (!wasAlreadyRegistered) {
    try {
      const { triggerFlowsForRsvp } = await import("@/lib/email-orchestrator/flow-trigger");
      await triggerFlowsForRsvp({
        rsvpId: rsvp.id,
        triggerKind: "RSVP_GOING",
      });
    } catch (err) {
      console.error("[rsvp] flow trigger failed:", err);
    }
  }

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
