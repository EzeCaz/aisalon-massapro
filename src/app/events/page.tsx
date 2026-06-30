import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { EventsList } from "./events-list";
import { MyRegisteredEvents } from "./my-registered-events";
import Link from "next/link";

export const metadata = { title: "Events — AI Salon Tel Aviv" };

/**
 * /events — public events list.
 *
 * This page used to redirect anonymous visitors to /login. Per the
 * new product spec ("the event page and all the events must be public,
 * but when the user is not logged in it should say Join AI Salon"),
 * the list is now viewable by anyone. Anonymous visitors see a
 * "Join AI Salon" banner at the top that routes to /login?callbackUrl=/events.
 *
 * Signed-in members still get redirected to /onboarding if they haven't
 * completed the intake form (so they can't browse the member directory
 * etc. until they've filled in their profile).
 *
 * Each event card links to /events/[slug] — that page handles anonymous
 * visitors by redirecting them to the public /e/[slug] landing page
 * (where they can register / sign up).
 */
export default async function EventsPage() {
  const session = await getServerSession(authOptions);
  let me: { id: string; email: string; name: string | null } | null = null;
  if (session?.user?.email) {
    me = await db.user.findUnique({
      where: { email: session.user.email },
      include: { tags: true },
    });
    // Signed-in users must complete onboarding before browsing the
    // members-only directory features (the events list itself is
    // still public, but we keep the gate here for consistency with
    // other member pages).
    if (me && needsOnboarding(me)) redirect("/onboarding");
  }

  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      _count: { select: { images: true, speakers: true } },
      // The "main" image — used as the event's profile picture / banner
      // thumbnail on the events list. Falls back to null when no main
      // image has been set by the admin yet.
      mainImage: { select: { id: true, fileUrl: true, caption: true } },
    },
  });

  // Fetch the signed-in user's RSVPs so we can show a "Your registered
  // events" section at the top with quick calendar-save buttons.
  let myRsvps: Array<{
    id: string;
    status: string;
    event: {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      venue: string | null;
      address: string | null;
      city: string | null;
      country: string | null;
      startsAt: Date;
      endsAt: Date;
    };
  }> = [];
  if (me) {
    myRsvps = await db.eventRsvp.findMany({
      where: { email: me.email, status: "GOING" },
      orderBy: { event: { startsAt: "asc" } },
      select: {
        id: true,
        status: true,
        event: {
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            venue: true,
            address: true,
            city: true,
            country: true,
            startsAt: true,
            endsAt: true,
          },
        },
      },
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* "Join AI Salon" banner — only for anonymous visitors. */}
        {!me && (
          <div className="mb-8 rounded-xl border border-[#FF005A]/20 bg-gradient-to-br from-[#FF005A]/5 to-[#00E6FF]/5 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[#FF005A] mb-1">
                Join AI Salon
              </p>
              <h2 className="text-lg sm:text-xl font-extrabold text-black">
                Sign up to RSVP, check in at the door, and upload photos.
              </h2>
              <p className="mt-1 text-sm text-black/60">
                Browsing is free — but you&apos;ll need a free account to register for events.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/login?callbackUrl=/events"
                className="inline-flex items-center justify-center rounded-md bg-[#FF005A] text-white font-semibold px-5 py-2.5 text-sm hover:bg-[#D8004D] ais-lift"
              >
                Join AI Salon →
              </Link>
              <Link
                href="/login?callbackUrl=/events"
                className="inline-flex items-center justify-center rounded-md border border-black/15 bg-white text-black font-semibold px-5 py-2.5 text-sm hover:bg-black/5"
              >
                Sign in
              </Link>
            </div>
          </div>
        )}

        {/* Page header */}
        <div className="mb-10">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            AI Salon Tel Aviv
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight">
            Upcoming & past <span className="ais-gradient-text">gatherings</span>
          </h1>
          <p className="mt-3 text-base text-black/60 max-w-2xl">
            Events at Google for Startups Campus TLV and partner venues.
            Click any event to view the agenda, speakers, and shared photo gallery.
          </p>
        </div>

        {/* "Your registered events" — only for signed-in users with
            upcoming RSVPs. Shows a compact list with Save-to-Calendar
            buttons so users can quickly add events to their calendar. */}
        {me && myRsvps.length > 0 && (
          <MyRegisteredEvents
            rsvps={myRsvps.map((r) => ({
              id: r.id,
              status: r.status,
              event: {
                ...r.event,
                startsAt: r.event.startsAt.toISOString(),
                endsAt: r.event.endsAt.toISOString(),
              },
            }))}
          />
        )}

        <EventsList events={events} />
      </main>
      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/40 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/60 underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              MassaPro
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
