import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny, getCoHostedEventIds } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { SpeakersTabClient } from "./speakers-tab-client";

export const metadata = { title: "Speakers — Admin — AI Salon Tel Aviv" };

export default async function AdminSpeakersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/speakers");

  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) redirect("/login");
  // Gate: ADMIN+ (members.view) OR CO_HOST (eventdata.viewCoHosted).
  // CO_HOST users see only speakers for events they co-host.
  if (!canAny(me.role, ["members.view", "eventdata.viewCoHosted"])) {
    redirect("/events");
  }

  // Determine event-scoping. For ADMIN+ this is null (all events).
  // For CO_HOST, this is the list of event IDs they co-host.
  const scopedEventIds = await getCoHostedEventIds(me.id, me.role);

  // Load speakers across all events (or scoped events for CO_HOST),
  // plus the events themselves so the client can render an event
  // picker when adding a new speaker.
  const speakers = await db.speaker.findMany({
    where: scopedEventIds === null ? undefined : { eventId: { in: scopedEventIds } },
    orderBy: [{ event: { startsAt: "desc" } }, { order: "asc" }],
    include: {
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          startsAt: true,
        },
      },
      user: {
        select: { id: true, email: true, name: true },
      },
      _count: {
        select: {
          images: true,
          presentations: true,
          messages: true,
        },
      },
    },
  });

  const events = await db.event.findMany({
    where: scopedEventIds === null ? undefined : { id: { in: scopedEventIds } },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      _count: { select: { speakers: true } },
    },
  });

  // All platform users — for the "link user to speaker" picker.
  // (Only loaded for ADMIN+ — CO_HOSTs get an empty list since they
  // can't link users and shouldn't see the full member directory.)
  const shouldLoadUsers = canAny(me.role, ["members.view"]);
  const users = shouldLoadUsers
    ? await db.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      })
    : [];

  const speakersJson = JSON.parse(JSON.stringify(speakers));
  const eventsJson = JSON.parse(JSON.stringify(events));
  const usersJson = JSON.parse(JSON.stringify(users));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <AdminTabs />

        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Admin Panel · Speakers
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Speakers across all events
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            Every speaker roster across every event. Add a new speaker to an
            event, edit their bio / topic / role, link them to a platform
            user account (enables two-way in-app chat), or remove them.
          </p>
        </div>

        <SpeakersTabClient
          speakers={speakersJson}
          events={eventsJson}
          users={usersJson}
        />
      </main>
    </div>
  );
}
