import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canAny,
  getCoHostedEventIds,
  getUserScope,
  scopeEventWhere,
  scopeChapterWhere,
  scopeUserWhere,
  type UserScope,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { SpeakersTabClient } from "./speakers-tab-client";
import { Globe2 } from "lucide-react";

export const metadata = { title: "Speakers — Admin — AI Salon" };

function scopeBadge(scope: UserScope): { label: string; color: string } {
  switch (scope.kind) {
    case "global":
      return { label: "Global", color: "bg-[#820A7D] text-white" };
    case "country":
      return { label: "Country", color: "bg-[#FF005A] text-white" };
    case "chapter":
      return { label: "Chapter", color: "bg-[#00E6FF]/20 text-[#007E72] border border-[#00E6FF]/40" };
    case "none":
      return { label: "No scope", color: "bg-black/10 text-black/60" };
  }
}

export default async function AdminSpeakersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/speakers");

  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) redirect("/login");
  // Gate: ADMIN+ (members.view) OR CHAPTER_ORGANIZER/CO_HOST (eventdata.viewCoHosted).
  if (!canAny(me.role, ["members.view", "eventdata.viewCoHosted"])) {
    redirect("/events");
  }

  // V7: scope by chapter/country
  const scope = await getUserScope(me.id);

  // Determine event-scoping. For ADMIN+ this is null (all events in scope).
  // For CHAPTER_ORGANIZER/CO_HOST, this is the list of event IDs they manage.
  const scopedEventIds = await getCoHostedEventIds(me.id, me.role);

  // Build the where clause: scope filter + per-event scoping for organizers.
  const speakerScopeWhere = scopeChapterWhere(scope);
  const speakerWhere =
    scopedEventIds === null
      ? speakerScopeWhere
      : { ...speakerScopeWhere, eventId: { in: scopedEventIds } };

  // Load speakers (scoped), plus the events themselves.
  const speakers = await db.speaker.findMany({
    where: speakerWhere,
    orderBy: [{ event: { startsAt: "desc" } }, { order: "asc" }],
    include: {
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          startsAt: true,
          chapterRef: {
            select: {
              id: true,
              name: true,
              slug: true,
              country: { select: { name: true, code: true, flagEmoji: true } },
            },
          },
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
    where: scopedEventIds === null ? scopeEventWhere(scope) : { id: { in: scopedEventIds } },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      _count: { select: { speakers: true } },
    },
  });

  // All platform users in scope — for the "link user to speaker" picker.
  const shouldLoadUsers = canAny(me.role, ["members.view"]);
  const users = shouldLoadUsers
    ? await db.user.findMany({
        where: scopeUserWhere(scope),
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

  const badge = scopeBadge(scope);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <AdminTabs />

        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2 flex items-center gap-2">
            Admin Panel · Speakers · V7
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${badge.color}`}>
              <Globe2 className="h-2.5 w-2.5" />
              {badge.label}
            </span>
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Speakers across all events
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Every speaker roster across every event in your scope. Each speaker inherits
            the chapter scope of their event.
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
