import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  isSuperAdminEmail,
  ROLES,
  getUserScope,
  scopeEventWhere,
  type UserScope,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { AdminEventsListWithActions } from "./admin-events-list-with-actions";
import Link from "next/link";
import { CalendarPlus, Globe2 } from "lucide-react";

type CountryRow = { id: string; name: string; code: string; flagEmoji: string | null; slug: string; isActive: boolean };
type ChapterRow = { id: string; name: string; slug: string; countryId: string; city: string | null; isActive: boolean };
type CityRow = { name: string; countryId: string; chapterId: string };

export const metadata = { title: "Events — Admin — AI Salon" };

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

export default async function AdminEventsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/events");

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN role from the allowlist
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Permission gate: ADMIN + SUPER_ADMIN + CHAPTER_ORGANIZER can manage events.
  if (!can(me.role, "events.edit") && !isSuperAdminEmail(me.email)) {
    redirect("/events");
  }

  // V7: scope events by user's country/chapter
  const scope = await getUserScope(me.id);
  const scopeFilter = scopeEventWhere(scope);

  const events = await db.event.findMany({
    where: scopeFilter,
    orderBy: { startsAt: "desc" },
    include: {
      chapterRef: {
        select: {
          id: true,
          name: true,
          slug: true,
          countryId: true,
          country: { select: { name: true, code: true, flagEmoji: true } },
        },
      },
      _count: {
        select: {
          images: true,
          speakers: true,
          agenda: true,
          rsvps: true,
        },
      },
      coHosts: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              photoUrl: true,
              image: true,
              company: true,
              role: true,
            },
          },
        },
      },
      mainImage: { select: { id: true, fileUrl: true, caption: true } },
    },
  });

  // Compute check-in counts in a single batched query
  const checkedInCounts = await Promise.all(
    events.map((e) =>
      db.eventRsvp.count({ where: { eventId: e.id, checkedInAt: { not: null } } })
    )
  );

  const serialized = events.map((e, i) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    subtitle: e.subtitle,
    chapter: e.chapter,
    venue: e.venue,
    city: e.city,
    country: e.country,
    chapterId: e.chapterId,
    isCrossChapter: e.isCrossChapter,
    chapterRef: e.chapterRef
      ? {
          id: e.chapterRef.id,
          name: e.chapterRef.name,
          slug: e.chapterRef.slug,
          countryId: e.chapterRef.countryId,
          country: e.chapterRef.country,
        }
      : null,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    mainImage: e.mainImage
      ? { id: e.mainImage.id, fileUrl: e.mainImage.fileUrl }
      : null,
    coHosts: e.coHosts.map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.user.name || c.user.email,
      userPhotoUrl: c.user.photoUrl || c.user.image || null,
    })),
    _count: {
      images: e._count.images,
      speakers: e._count.speakers,
      agenda: e._count.agenda,
      rsvps: e._count.rsvps,
      checkedIn: checkedInCounts[i],
    },
  }));

  // V7: load countries + chapters for the scope filter. Loaded for ALL
  // admin roles (not just Super Admin) — scoped to the user's permissions:
  //   - SUPER_ADMIN       → all countries + all chapters
  //   - ADMIN             → their country only + chapters in that country
  //   - CHAPTER_ORGANIZER → their chapter only (single-item list)
  // The country selector is auto-locked when the user has only one country
  // (i.e. non-Super-Admin); the chapter selector is auto-locked when the
  // user has only one chapter (Chapter Organizer). This is enforced by the
  // AdminEventsListWithActions component via the `scopeLockedTo` prop.
  //
  // Also extract unique cities from the events themselves — these are
  // the actual venue cities (event.city), which may differ from the
  // chapter's city (e.g. a Tel Aviv chapter event hosted in Herzliya).
  let allCountries: CountryRow[] = [];
  let allChapters: ChapterRow[] = [];

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
  } else if (me.role === ROLES.ADMIN && me.countryId) {
    // Admin: scoped to their country only.
    const [country, chapters] = await Promise.all([
      db.country.findUnique({
        where: { id: me.countryId },
        select: { id: true, name: true, code: true, flagEmoji: true, slug: true, isActive: true },
      }),
      db.chapter.findMany({
        where: { countryId: me.countryId, isActive: true },
        select: { id: true, name: true, slug: true, countryId: true, city: true, isActive: true },
        orderBy: { name: "asc" },
      }),
    ]);
    allCountries = country ? [country] : [];
    allChapters = chapters;
  } else if (me.role === ROLES.CHAPTER_ORGANIZER && me.chapterId) {
    // Chapter Organizer: scoped to their chapter only.
    const chapter = await db.chapter.findUnique({
      where: { id: me.chapterId },
      select: { id: true, name: true, slug: true, countryId: true, city: true, isActive: true, country: { select: { id: true, name: true, code: true, flagEmoji: true, slug: true, isActive: true } } },
    });
    if (chapter) {
      allChapters = [chapter];
      allCountries = chapter.country ? [chapter.country] : [];
    }
  }

  // Extract unique cities from the events in scope. Each city is paired
  // with its chapterId + countryId so the filter can contextualize the
  // city dropdown (only show cities in the selected country/chapter).
  const cityMap = new Map<string, CityRow>();
  for (const e of events) {
    if (!e.city) continue;
    const chapterId = e.chapterId;
    const countryId = e.chapterRef?.countryId;
    if (!chapterId || !countryId) continue;
    const key = `${e.city}|${chapterId}`;
    if (!cityMap.has(key)) {
      cityMap.set(key, { name: e.city, countryId, chapterId });
    }
  }
  const allCities = Array.from(cityMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const badge = scopeBadge(scope);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <AdminTabs />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2 flex items-center gap-2">
              Admin · V7
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${badge.color}`}>
                <Globe2 className="h-2.5 w-2.5" />
                {badge.label}
              </span>
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black leading-tight">
              Manage <span className="ais-gradient-text">events</span>
            </h1>
            <p className="mt-2 text-sm text-black/80 max-w-2xl">
              Edit event details, manage co-hosts, view RSVPs &amp; check-in stats.
              Events are scoped to your{" "}
              {scope.kind === "global" ? "global (all countries)" : scope.kind === "country" ? "country" : "chapter"}.
            </p>
          </div>
          <Link
            href="/admin/events/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] hover:bg-[#D8004D] text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            <CalendarPlus className="h-4 w-4" />
            New event
          </Link>
        </div>

        <AdminEventsListWithActions
          events={serialized}
          allCountries={allCountries}
          allChapters={allChapters}
          allCities={allCities}
          isSuperAdmin={isSuperAdminEmail(me.email)}
          scope={scope}
        />
      </main>
      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon · V7 Hierarchy</span>
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
