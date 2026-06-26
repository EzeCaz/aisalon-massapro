import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { RegistrantsTabClient } from "./registrants-tab-client";

export const metadata = { title: "Registrants — Admin — AI Salon Tel Aviv" };

export default async function AdminRegistrantsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/registrants");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!me) redirect("/login");
  if (!can(me.role, "members.view")) redirect("/events");

  // Fetch RSVPs with check-in code + door-check-in state.
  // Only fetch user info for RSVPs that have a linked user.
  const rsvps = await db.eventRsvp.findMany({
    orderBy: [{ event: { startsAt: "desc" } }, { createdAt: "desc" }],
    include: {
      event: {
        select: { id: true, title: true, slug: true, startsAt: true },
      },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  // Fetch all events for the filter, with their RSVP count.
  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      _count: { select: { rsvps: true } },
    },
  });

  // Fetch co-hosted event IDs for the current user — CO_HOSTs can
  // generate check-in codes only for events they co-host.
  const coHostedEventIds: string[] = [];
  if (me.role === "CO_HOST") {
    const coHostRows = await db.eventCoHost.findMany({
      where: { userId: me.id },
      select: { eventId: true },
    });
    coHostedEventIds.push(...coHostRows.map((r) => r.eventId));
  }

  const rsvpsJson = JSON.parse(JSON.stringify(rsvps));
  const eventsJson = JSON.parse(JSON.stringify(events));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <AdminTabs />

        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Admin Panel · Registrants
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Event registrants (RSVPs)
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            Every RSVP across every event — manual additions, paper RSVPs
            imported after the fact, and self-service RSVPs from the event
            pages. The check-in code column shows each attendee&apos;s
            8-character door code (or a Generate button if they don&apos;t
            have one yet). Once a code is scanned at the door it is marked
            as &quot;used&quot; and cannot be reused.
          </p>
        </div>

        <RegistrantsTabClient
          rsvps={rsvpsJson}
          events={eventsJson}
          currentUserRole={me.role}
          currentUserEmail={me.email}
          coHostedEventIds={coHostedEventIds}
        />
      </main>
    </div>
  );
}
