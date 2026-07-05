import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  canSeeAdminNav,
  getCoHostedEventIds,
  getSpeakerEventIds,
  isSuperAdminEmail,
  ROLES,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { EventPrepListClient } from "./event-prep-list-client";

export const metadata = { title: "Event Prep — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

/**
 * /admin/event-prep — Event Prep landing page.
 *
 * Shows the user a list of events they have read-only access to:
 *
 *   - SPEAKER       → events where they are linked as a Speaker
 *                     (via Speaker.userId). Read-only view — they
 *                     cannot edit agenda, event details, or speakers.
 *   - CO_HOST       → events they co-host (via EventCoHost). Read-only
 *                     here; the editable surfaces live in /admin/events/[id]
 *                     for CO_HOSTs of the event.
 *   - ADMIN+        → all events. Read-only here; the editable surfaces
 *                     live in /admin/events/[id].
 *
 * Click an event card to drill into /admin/event-prep/[id] for the
 * full read-only detail view (agenda, speakers, basic event info).
 */
export default async function EventPrepPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/event-prep");
  }

  let me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN role from email allowlist
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Gate: must be SPEAKER, CO_HOST, ADMIN, or SUPER_ADMIN.
  // (MEMBERs and unknown roles are redirected.)
  if (!canSeeAdminNav(me.role)) {
    redirect("/events");
  }

  // Determine which events this user can prep for.
  //   - ADMIN+       → all events (null scope)
  //   - CO_HOST      → events they co-host
  //   - SPEAKER      → events they speak at
  let eventIds: string[] | null = null;
  if (me.role === ROLES.SPEAKER) {
    eventIds = await getSpeakerEventIds(me.id);
  } else if (me.role === ROLES.CO_HOST) {
    eventIds = await getCoHostedEventIds(me.id, me.role);
  }
  // ADMIN+ leaves eventIds = null (no filter)

  const events = await db.event.findMany({
    where: eventIds === null ? undefined : { id: { in: eventIds } },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      chapter: true,
      venue: true,
      city: true,
      startsAt: true,
      endsAt: true,
      description: true,
      takeaways: true,
      intendedFor: true,
      _count: {
        select: {
          speakers: true,
          agenda: true,
          images: true,
          presentations: true,
          rsvps: true,
        },
      },
    },
  });

  // For SPEAKER, also fetch the speaker row to show "you're speaking at
  // this event" context (role, topic, etc.)
  let mySpeakerRows: Array<{
    eventId: string;
    name: string;
    role: string | null;
    company: string | null;
    topic: string | null;
    order: number;
  }> = [];
  if (me.role === ROLES.SPEAKER) {
    mySpeakerRows = await db.speaker.findMany({
      where: { userId: me.id },
      select: {
        eventId: true,
        name: true,
        role: true,
        company: true,
        topic: true,
        order: true,
      },
    });
  }

  const eventsJson = JSON.parse(
    JSON.stringify(
      events.map((e) => ({
        ...e,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
      }))
    )
  );
  const mySpeakerRowsJson = JSON.parse(JSON.stringify(mySpeakerRows));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <AdminTabs />

        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Event Prep
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Your <span className="ais-gradient-text">events</span>
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            {me.role === ROLES.SPEAKER
              ? "Events you are speaking at. Click an event to view the agenda, your speaker slot, and event details. This is a read-only view — to update your bio or topic, contact the event organizer."
              : me.role === ROLES.CO_HOST
                ? "Events you are co-hosting. Click an event to view the agenda, speakers, and event details. Use the tabs above to manage registrants, check-in, and mockups for these events."
                : "All events on the platform. Click an event to view a read-only prep summary. Use the Events tab to edit event details, agenda, and speakers."}
          </p>
        </div>

        <EventPrepListClient
          events={eventsJson}
          mySpeakerRows={mySpeakerRowsJson}
          userRole={me.role}
        />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>Platform by MassaPro</span>
        </div>
      </footer>
    </div>
  );
}

// `can` is imported for symmetry with other admin pages — used as a
// signal that this page follows the standard auth-gate pattern. We
// don't call it directly here because canSeeAdminNav already covers
// the role check.
void can;
