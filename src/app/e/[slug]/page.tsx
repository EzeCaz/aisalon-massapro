import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { PublicEventPage } from "./public-event-page";
import type { Metadata } from "next";

/**
 * /e/[slug] — PUBLIC event landing page.
 *
 * This is the shareable, conversion-optimized page for each event. Unlike
 * the members-only /events/[slug] page (which requires login + onboarding
 * and shows the full tabbed experience with photo upload, presentations,
 * community chat, etc.), this page is fully public and serves three jobs:
 *
 *   1. Show the event details (hero, description, speakers, agenda) so
 *      anyone who clicks a shared link can decide whether to attend.
 *   2. Convert anonymous visitors into registered members via the
 *      "Register to event" CTA (which routes to /login?callbackUrl=/e/[slug]
 *      so the user lands back here after signing in).
 *   3. On the day of the event, show a second "I'm here — Check in" button
 *      that issues a unique 8-char code the user shows at the door.
 *   4. Show a Community Testimonials section — existing testimonials on
 *      top (event-scoped feed, readable by anyone) and a create form
 *      below (signed-in members only) with all 4 scope chips:
 *      🌍 Community, 📍 This event, 🎤 A speaker, 🗓 A session. The
 *      chapter is auto-filled from the event's chapter (shown as a
 *      read-only badge in the form).
 *
 * Auth: NONE required to view. The session is read to customize the CTA:
 *
 *   - Anonymous          → "Register to event" → /login?callbackUrl=/e/[slug]
 *   - Signed-in, no RSVP  → "Register to event" → POST /api/events/[slug]/rsvp
 *   - Signed-in + RSVP'd  → "You're registered" + check-in button (if window open)
 *   - Checked-in          → Big green panel showing the unique code
 */

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: { title: true, subtitle: true, description: true, mainImage: { select: { fileUrl: true } } },
  });
  if (!event) return { title: "Event — AI Salon Tel Aviv" };
  const description = event.subtitle || event.description?.slice(0, 160) || "AI Salon Tel Aviv event";
  return {
    title: `${event.title} — AI Salon Tel Aviv`,
    description,
    openGraph: {
      title: event.title,
      description,
      type: "website",
      ...(event.mainImage?.fileUrl
        ? { images: [{ url: event.mainImage.fileUrl, width: 1200, height: 630, alt: event.title }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      ...(event.mainImage?.fileUrl ? { images: [event.mainImage.fileUrl] } : {}),
    },
  };
}

export default async function PublicEventPageRoute({ params }: Params) {
  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    include: {
      mainImage: { select: { id: true, fileUrl: true, caption: true } },
      // V7: include chapterRef so the page can show the chapter name and
      // pass it to the testimonials form (auto-filled chapter badge).
      chapterRef: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          country: { select: { name: true, code: true, flagEmoji: true } },
        },
      },
      speakers: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          company: true,
          bio: true,
          topic: true,
          photoUrl: true,
        },
      },
      agenda: {
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          title: true,
          description: true,
          type: true,
          speaker: { select: { id: true, name: true, role: true, company: true, photoUrl: true } },
          // Multi-speaker panel support — same minimal shape as the lead speaker.
          panelists: {
            orderBy: { order: "asc" },
            select: { id: true, name: true, role: true, company: true, photoUrl: true },
          },
        },
      },
      _count: { select: { speakers: true, agenda: true, rsvps: true } },
    },
  });
  if (!event) notFound();

  // Count RSVPs with status="GOING" — this is the number shown in the
  // black "X Going" pill in the meta line (matching the spec example
  // "Tel Aviv Monday, July 13, 2026 · 18:00 – 21:30 · ISR · 14 Going").
  // The _count.rsvps above counts ALL RSVPs (incl. MAYBE / NOT_GOING);
  // we keep that for the secondary "{n} registered" stat, but use the
  // GOING count for the pill since it represents committed attendees.
  const rsvpsGoing = await db.eventRsvp.count({
    where: { eventId: event.id, status: "GOING" },
  });
  // Read the session (optional). The page works for anonymous visitors,
  // but if the user is signed in we preload their RSVP + check-in status
  // so the client component can render the right CTA without a flash.
  const session = await getServerSession(authOptions);
  let me: { id: string; email: string; name: string | null; utmUid: string | null; role: string } | null = null;
  let rsvp: {
    id: string;
    status: string;
    source: string;
    checkInCode: string | null;
    checkedInAt: Date | null;
    createdAt: Date;
  } | null = null;

  if (session?.user?.email) {
    const meRow = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, name: true, utmUid: true, role: true },
    });
    if (meRow) {
      me = meRow;
      rsvp = await db.eventRsvp.findUnique({
        where: { eventId_email: { eventId: event.id, email: me.email } },
        select: {
          id: true,
          status: true,
          source: true,
          checkInCode: true,
          checkedInAt: true,
          createdAt: true,
        },
      });
    }
  }

  // Build the testimonials events catalog. This is what powers the form's
  // "speaker" and "session" pickers on the public event page — the form
  // is locked to this event (eventId passed), so the catalog only needs
  // to include the current event's speakers + agenda. We still build the
  // full shape so the form code can be reused unchanged.
  //
  // Only fetch when there's a signed-in user (the form is hidden for
  // anonymous visitors — they see a sign-in CTA instead).
  let testimonialsEventsCatalog: Array<{
    id: string;
    slug: string;
    title: string;
    chapterId: string | null;
    speakers: Array<{ id: string; label: string }>;
    agendaItems: Array<{ id: string; label: string }>;
  }> = [];
  if (me) {
    // We only need this event's speakers + agenda for the form pickers.
    // The form's "This event" / "A speaker" / "A session" scope chips
    // all operate on the locked event, so a single-element catalog is
    // sufficient. (The community-scope chip doesn't need any catalog.)
    testimonialsEventsCatalog = [
      {
        id: event.id,
        slug: event.slug,
        title: event.title,
        chapterId: event.chapterId,
        speakers: event.speakers.map((s) => ({
          id: s.id,
          label: `${s.name}${s.company ? ` · ${s.company}` : ""}${s.topic ? ` — ${s.topic}` : ""}`,
        })),
        agendaItems: event.agenda.map((a) => {
          const time = new Date(a.startsAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Jerusalem",
          });
          return { id: a.id, label: `${time} · ${a.title}` };
        }),
      },
    ];
  }

  // Serialize all Date fields to ISO strings for the client component.
  const serialized = {
    ...event,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    agenda: event.agenda.map((a) => ({
      ...a,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt?.toISOString() ?? null,
    })),
    rsvp: rsvp
      ? {
          ...rsvp,
          checkedInAt: rsvp.checkedInAt?.toISOString() ?? null,
          createdAt: rsvp.createdAt.toISOString(),
        }
      : null,
    // Add the GOING count alongside the existing _count.rsvps (total).
    // The client component uses rsvpsGoing for the black "X Going" pill
    // in the meta line.
    rsvpsGoing,
    // Chapter name for the testimonials form's auto-filled chapter badge.
    // Falls back to the legacy free-form `chapter` string when the event
    // has no chapterRef (data integrity issue — old rows).
    chapterName: event.chapterRef?.name ?? event.chapter,
  };

  return (
    <PublicEventPage
      event={serialized}
      me={me}
      testimonialsEventsCatalog={testimonialsEventsCatalog}
    />
  );
}
