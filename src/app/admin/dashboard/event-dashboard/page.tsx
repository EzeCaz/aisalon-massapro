import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny, getCoHostedEventIds, isSuperAdmin } from "@/lib/permissions";
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
 * Auth: requires members.view permission (ADMIN + SUPER_ADMIN) OR
 * eventdata.viewCoHosted (CO_HOST). CO_HOST users see only data for
 * events they co-host — both the events dropdown and the RSVPs list
 * are scoped server-side to their co-hosted events.
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
  if (!canAny(me.role, ["members.view", "eventdata.viewCoHosted"])) {
    redirect("/events");
  }

  // Determine event-scoping. For ADMIN+ this is null (all events).
  // For CO_HOST, this is the list of event IDs they co-host.
  const scopedEventIds = await getCoHostedEventIds(me.id, me.role);

  // Fetch events for the event-picker dropdown, with their RSVP
  // counts so the admin can see how big each event is at a glance.
  // Scope by event IDs for CO_HOST users.
  const events = await db.event.findMany({
    where: scopedEventIds === null ? undefined : { id: { in: scopedEventIds } },
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

  // Fetch RSVPs (scoped for CO_HOST) — the client will filter by event
  // when an event is selected. Includes the linked user (with all the
  // profile fields the charts care about: company, interestedIn, etc.)
  // and the referring member (referredBy) so the dashboard can show
  // "UTM UID" of the referrer as a column + filter (Item 2E).
  const rsvps = await db.eventRsvp.findMany({
    where: scopedEventIds === null ? undefined : { eventId: { in: scopedEventIds } },
    orderBy: [{ event: { startsAt: "desc" } }, { createdAt: "desc" }],
    select: {
      id: true,
      eventId: true,
      email: true,
      name: true,
      status: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      checkInCode: true,
      checkedInAt: true,
      doorCheckedAt: true,
      doorCheckedBy: true,
      approvedAt: true,
      attendedAt: true,
      noShow: true,
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
          utmUid: true,
        },
      },
      referredBy: {
        // The referring member — surfaced so the Event Dashboard can show
        // the referrer's UTM UID as a column + filter (Item 2E). The User
        // model only has utmUid (no utmSource/utmMedium/etc.) — those raw
        // UTMs live on ReferralVisit, not User. So this dashboard only
        // exposes utmUid for now (documented in worklog impl-dashboard-unify).
        select: {
          id: true,
          email: true,
          name: true,
          utmUid: true,
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
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/80 underline-offset-4 hover:underline"
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
