import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdmin } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import Link from "next/link";
import { ArrowLeft, BarChart3, CalendarDays } from "lucide-react";
import { EventDashboardClient } from "./event-dashboard-client";

export const metadata = {
  title: "Event Dashboard — Admin — AI Salon Tel Aviv",
};

/**
 * /admin/dashboard/event-dashboard — Event-centric analytics dashboard.
 *
 * Shows per-event (or all-event) breakdowns of:
 *   - Registrants (RSVPs)
 *   - Generated attendee codes
 *   - Checked-in attendees (door check-ins)
 *   - Member attributes of registrants: company, interested in,
 *     profile categories, applied for, role, source, etc.
 *
 * Uses the SAME bar/pie/table chart system as the member dashboard — the
 * admin can toggle each chart individually or switch all at once.
 *
 * Auth: requires members.view permission (ADMIN + SUPER_ADMIN).
 */
export default async function EventDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/dashboard/event-dashboard");
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!me) redirect("/login");
  if (!can(me.role, "members.view")) redirect("/events");

  // Fetch ALL events for the event-picker dropdown, with their RSVP
  // counts so the admin can see how big each event is at a glance.
  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      endsAt: true,
      venue: true,
      city: true,
      _count: { select: { rsvps: true, speakers: true, images: true } },
    },
  });

  // Fetch ALL RSVPs across all events — the client will filter by event
  // when an event is selected. Includes the linked user (with all the
  // profile fields the charts care about: company, interestedIn, etc.).
  const rsvps = await db.eventRsvp.findMany({
    orderBy: [{ event: { startsAt: "desc" } }, { createdAt: "desc" }],
    include: {
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          startsAt: true,
          endsAt: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          interestedIn: true,
          profileCategories: true,
          appliedFor: true,
          role: true,
          importSource: true,
          mobile: true,
          bio: true,
        },
      },
    },
  });

  const eventsJson = JSON.parse(JSON.stringify(events));
  const rsvpsJson = JSON.parse(JSON.stringify(rsvps));
  const isSuper = isSuperAdmin({ email: me.email, role: me.role });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        <div className="mb-8">
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center gap-1 text-xs font-semibold text-black/50 hover:text-black mb-3"
          >
            <ArrowLeft className="h-3 w-3" /> Back to member dashboard
          </Link>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            <BarChart3 className="inline h-3 w-3 mr-1" />
            Admin Panel · Event Dashboard
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Event <span className="ais-gradient-text">insights</span>
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            Per-event breakdown of registrants, generated check-in codes,
            and door check-ins. Filter by event (or view all events at
            once), then explore the member-level attributes of registrants
            — company, interests, profile categories, role, and source —
            using the same bar/pie/table chart system as the member
            dashboard.
          </p>
        </div>

        <EventDashboardClient
          events={eventsJson}
          rsvps={rsvpsJson}
          isSuperAdmin={isSuper}
        />
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

// Suppress unused-import warning for CalendarDays — kept for future
// "filter by date range" feature.
void CalendarDays;
