import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendRsvpConfirmationEmail, emailConfigured } from "@/lib/email";
import { generateIcs } from "@/lib/calendar";

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

  // ── Server-side tracking: record a TrackedLead + (optionally) a
  // ReferralConversion. This is the source-of-truth for the admin
  // Analytics dashboard. Client-side trackEvent("rsvp") fires GA4 /
  // Meta Pixel — this server record is what the dashboard reads.
  // Only recorded for NEW registrations to avoid double-counting.
  if (!wasAlreadyRegistered) {
    try {
      const cookieHeader = _req.headers.get("cookie") || "";
      const affMatch = cookieHeader
        .split("; ")
        .find((c) => c.startsWith("massapro_affiliate="));
      let affId: string | null = null;
      let utm: {
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
        utmContent?: string;
        utmTerm?: string;
      } = {};
      let ftUtm: typeof utm = {};
      if (affMatch) {
        try {
          const parsed = JSON.parse(
            decodeURIComponent(affMatch.split("=").slice(1).join("=")),
          ) as {
            affId?: string;
            utm?: typeof utm;
            ftUtm?: typeof utm;
          };
          affId = parsed.affId || null;
          utm = parsed.utm || {};
          ftUtm = parsed.ftUtm || {};
        } catch {
          /* swallow bad cookie */
        }
      }
      const sessionId =
        _req.headers.get("x-massapro-session") || "srv_no_session";

      await db.trackedLead.create({
        data: {
          sessionId,
          affId: affId || undefined,
          userId: user!.id,
          name: user!.name || user!.email,
          email: user!.email,
          phone: null,
          company: null,
          conversionType: "rsvp",
          conversionRef: event.id,
          initialStatus: "GOING",
          utmSource: utm.utmSource || null,
          utmMedium: utm.utmMedium || null,
          utmCampaign: utm.utmCampaign || null,
          utmContent: utm.utmContent || null,
          utmTerm: utm.utmTerm || null,
          ftUtmSource: ftUtm.utmSource || null,
          ftUtmMedium: ftUtm.utmMedium || null,
          ftUtmCampaign: ftUtm.utmCampaign || null,
          ftUtmContent: ftUtm.utmContent || null,
          ftUtmTerm: ftUtm.utmTerm || null,
        },
      });

      // If the affId is a member referral code (SAL-...), record a
      // ReferralConversion.
      if (affId && affId.startsWith("SAL-")) {
        const referrer = await db.user.findFirst({
          where: { referralCode: affId },
          select: { id: true },
        });
        if (referrer) {
          try {
            await db.referralConversion.create({
              data: {
                referringUserId: referrer.id,
                referredEmail: user!.email,
                referredUserId: user!.id,
                conversionType: "rsvp",
                conversionRef: event.id,
                affId,
                utmSnapshot: {
                  utm,
                  ftUtm,
                  sessionId,
                },
                sessionId,
              },
            });
          } catch (err: unknown) {
            // P2002 = unique constraint violation (already attributed)
            if (
              err &&
              typeof err === "object" &&
              "code" in err &&
              (err as { code: string }).code === "P2002"
            ) {
              // Ignore duplicate
            } else {
              throw err;
            }
          }
        }
      }
    } catch (err) {
      // Tracking failures must NEVER block the RSVP.
      console.error("[rsvp] Tracking failed:", err);
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
