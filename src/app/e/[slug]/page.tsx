import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { PublicEventPage } from "./public-event-page";
import type { Metadata } from "next";
import { resolveBrandMetadata } from "@/lib/brand/brand-metadata";
import { checkChapterMembership } from "@/lib/membership";

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
 *
 * Auth: NONE required to view. The session is read to customize the CTA:
 *
 *   - Anonymous          → "Register to event" → /login?callbackUrl=/e/[slug]
 *   - Signed-in, no RSVP  → "Register to event" → POST /api/events/[slug]/rsvp
 *   - Signed-in + RSVP'd  → "You're registered" + check-in button (if window open)
 *   - Checked-in          → Big green panel showing the unique code
 */

type Params = { params: Promise<{ slug: string }> };

/**
 * BRAND-AWARE metadata (Phase 2 of Coma brand isolation):
 *  - The event title is returned BARE — the root layout's brand-aware
 *    template appends the active brand suffix ("<Event> — Coma Tel Aviv"
 *    on coma.massapro.com, "<Event> — AI Salon Tel Aviv" on AIS).
 *    Returning "${event.title} — AI Salon Tel Aviv" here caused a DOUBLE
 *    suffix under the new template, so the suffix is dropped.
 *  - Fallbacks no longer hard-code "AI Salon Tel Aviv".
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: { title: true, subtitle: true, description: true, mainImage: { select: { fileUrl: true } } },
  });
  if (!event) return { title: "Event" };
  const description = event.subtitle || event.description?.slice(0, 160) || "Community event";
  return {
    title: event.title,
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
      // Community gating (user spec 2026-09-19): the join/register flow
      // needs the event's community so non-members can be routed through
      // the "join the community + fill the form" dialog.
      chapterRef: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          timezone: true,
          isActive: true,
          brand: { select: { slug: true, displayName: true } },
          country: { select: { name: true, code: true, flagEmoji: true } },
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
  let me: { id: string; email: string; name: string | null; utmUid: string | null; role: string; chapterId: string | null } | null = null;
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
      select: { id: true, email: true, name: true, utmUid: true, role: true, chapterId: true },
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

  // COMMUNITY MEMBERSHIP (user spec 2026-09-19): compute the signed-in
  // user's membership in the event's community server-side so the CTA
  // renders the correct state without a flash ("Register" vs "Join the
  // community to register"). The client re-verifies via the membership
  // API in case membership changed (e.g. joined in another tab).
  const chapterRef = event.chapterRef;
  let isMember = true;
  if (me && chapterRef) {
    const membership = await checkChapterMembership(me.id, chapterRef.id, me.chapterId ?? null);
    isMember = membership.isMember;
  }
  const chapter = chapterRef
    ? {
        id: chapterRef.id,
        name: chapterRef.name,
        slug: chapterRef.slug,
        city: chapterRef.city,
        timezone: chapterRef.timezone,
        isActive: chapterRef.isActive,
        brand: chapterRef.brand,
        country: chapterRef.country,
      }
    : null;

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
  };

  // BRAND-AWARE (Phase 3): resolve brand (host for anonymous visitors —
  // cookies are host-scoped so host and brand always agree) and pass it
  // down so the public event page never renders hard-coded AIS copy.
  const { brand } = await resolveBrandMetadata();
  return (
    <PublicEventPage
      event={serialized}
      me={me}
      brand={brand}
      chapter={chapter}
      initialIsMember={isMember}
    />
  );
}
