import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { MyCodeCard } from "./my-code-card";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import type { Metadata } from "next";

/**
 * /e/[slug]/my-code — focused, mobile-first page that shows the current
 * user's check-in code for an event.
 *
 * Use case: an attendee gets an email/SMS on the day of the event with a
 * link like https://aisalon.massapro.com/e/ai-salon-human/my-code. They
 * tap it on their phone while walking to the venue, see their code
 * instantly, and show it at the door. No tabs, no scroll, no distractions.
 *
 * States:
 *   - Not signed in              → redirect to /login?callbackUrl=/e/[slug]/my-code
 *   - Event not found            → 404
 *   - Signed in, no RSVP         → friendly "you're not registered" + CTA to /e/[slug]
 *   - RSVP'd, no code, window closed → "Check-in opens 2h before the event"
 *   - RSVP'd, no code, window open   → "I'm here — Check in" button
 *   - RSVP'd, code exists        → big code + copy button (primary case)
 *
 * Auth: requires sign-in. Anonymous visitors are bounced to /login with a
 * callback URL so they land back here after authenticating.
 *
 * Note: this page is intentionally NOT indexed by search engines (noindex),
 * because the URL alone doesn't reveal the code (auth required) but we
 * still don't want it cluttering search results.
 */

type Params = { params: Promise<{ slug: string }> };

export const metadata: Metadata = {
  title: "My check-in code — AI Salon Tel Aviv",
  description: "Your unique entry code for the event.",
  robots: { index: false, follow: false },
};

export default async function MyCodePage({ params }: Params) {
  const { slug } = await params;

  // ── Auth gate ────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/e/${slug}/my-code`)}`);
  }

  // ── Load event + user ────────────────────────────────────────────────────
  const [event, me] = await Promise.all([
    db.event.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        subtitle: true,
        slug: true,
        startsAt: true,
        endsAt: true,
        venue: true,
        city: true,
        mainImage: { select: { fileUrl: true } },
      },
    }),
    db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, name: true },
    }),
  ]);

  if (!event || !me) {
    notFound();
  }

  // Load the RSVP now that we have the event id.
  const rsvpRow = await db.eventRsvp.findUnique({
    where: { eventId_email: { eventId: event.id, email: me.email } },
    select: {
      id: true,
      status: true,
      checkInCode: true,
      checkedInAt: true,
    },
  });

  // Serialize dates for the client component.
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#007E72]/5 via-white to-[#00E6FF]/5 flex flex-col">
      <header className="py-5 px-4 flex justify-center border-b border-black/5">
        <AiSalonLogoServer />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <MyCodeCard
          event={{
            id: event.id,
            title: event.title,
            subtitle: event.subtitle,
            slug: event.slug,
            startsAt: event.startsAt.toISOString(),
            endsAt: event.endsAt.toISOString(),
            venue: event.venue,
            city: event.city,
            mainImageUrl: event.mainImage?.fileUrl ?? null,
          }}
          me={{ id: me.id, email: me.email, name: me.name }}
          initialRsvp={
            rsvpRow
              ? {
                  id: rsvpRow.id,
                  status: rsvpRow.status,
                  checkInCode: rsvpRow.checkInCode,
                  checkedInAt: rsvpRow.checkedInAt?.toISOString() ?? null,
                }
              : null
          }
        />
      </main>

      <footer className="py-4 px-4 text-center text-xs text-black/40">
        Show this code at the door ·{" "}
        <a
          href={`/e/${slug}`}
          className="underline hover:text-black/70"
        >
          View event details
        </a>
      </footer>
    </div>
  );
}
