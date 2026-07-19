import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canAny,
  getCoHostedEventIds,
  getUserScope,
  isSuperAdminEmail,
  scopeEventWhere,
  scopeChapterWhere,
  type UserScope,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { RegistrantsTabClient } from "./registrants-tab-client";
import { Globe2 } from "lucide-react";

export const metadata = { title: "Registrants — Admin — AI Salon" };

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

export default async function AdminRegistrantsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/registrants");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true },
  });
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

  // Build the where clause: combine scope filter (chapter/country) with
  // per-event scoping for CHAPTER_ORGANIZER/CO_HOST.
  const rsvpScopeWhere = scopeChapterWhere(scope);
  const rsvpWhere =
    scopedEventIds === null
      ? rsvpScopeWhere
      : { ...rsvpScopeWhere, eventId: { in: scopedEventIds } };

  // Fetch RSVPs with check-in code + door-check-in state + approval info.
  const rsvps = await db.eventRsvp.findMany({
    where: rsvpWhere,
    orderBy: [{ event: { startsAt: "desc" } }, { createdAt: "desc" }],
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
      user: { select: { id: true, email: true, name: true } },
      approvedByCoHost: { select: { id: true, email: true, name: true } },
    },
  });

  // Fetch events for the filter, with their RSVP count.
  const events = await db.event.findMany({
    where: scopedEventIds === null ? scopeEventWhere(scope) : { id: { in: scopedEventIds } },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      _count: { select: { rsvps: true } },
    },
  });

  const coHostedEventIds: string[] = scopedEventIds ?? [];

  const rsvpsJson = JSON.parse(JSON.stringify(rsvps));
  const eventsJson = JSON.parse(JSON.stringify(events));

  // V7: load all countries + chapters (Super Admin only — for the scope filter).
  let allCountries: { id: string; name: string; code: string; flagEmoji: string | null; slug: string; isActive: boolean }[] = [];
  let allChapters: { id: string; name: string; slug: string; countryId: string; city: string | null; isActive: boolean }[] = [];
  if (isSuperAdminEmail(me.email)) {
    [allCountries, allChapters] = await Promise.all([
      db.country.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, flagEmoji: true, slug: true, isActive: true },
        orderBy: { name: "asc" },
      }),
      db.chapter.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true, countryId: true, city: true, isActive: true },
        orderBy: [{ country: { name: "asc" } }, { name: "asc" }],
      }),
    ]);
  }

  const badge = scopeBadge(scope);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <AdminTabs />

        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2 flex items-center gap-2">
            Admin Panel · Registrants · V7
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${badge.color}`}>
              <Globe2 className="h-2.5 w-2.5" />
              {badge.label}
            </span>
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Event registrants (RSVPs)
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Every RSVP across every event — manual additions, paper RSVPs
            imported after the fact, and self-service RSVPs from the event
            pages. Each RSVP inherits the chapter scope of its event.
          </p>
        </div>

        <RegistrantsTabClient
          rsvps={rsvpsJson}
          events={eventsJson}
          currentUserRole={me.role}
          currentUserEmail={me.email}
          coHostedEventIds={coHostedEventIds}
          allCountries={allCountries}
          allChapters={allChapters}
        />
      </main>
    </div>
  );
}
