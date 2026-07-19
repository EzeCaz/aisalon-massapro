import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ChapterMapPanel } from "@/components/ais/chapter-map-panel";
import { SeedV7Button } from "@/components/ais/seed-v7-button";
import Link from "next/link";
import { Globe2, MapPin, Users, CalendarDays, Plus } from "lucide-react";

export const metadata = { title: "Chapters — AI Salon" };

export default async function ChaptersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/chapters");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, countryId: true, chapterId: true },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN role
  let myRole = me.role;
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({ where: { id: me.id }, data: { role: ROLES.SUPER_ADMIN } });
    myRole = ROLES.SUPER_ADMIN;
  }

  // Gate: SUPER_ADMIN + ADMIN can view. CHAPTER_ORGANIZER sees only their own
  // chapter (still useful but read-only). MEMBER/SPEAKER → /events.
  if (!can(myRole, "members.view") && !isSuperAdminEmail(me.email)) redirect("/events");

  const isSuperAdmin = isSuperAdminEmail(me.email) || myRole === ROLES.SUPER_ADMIN;

  // Scope: Super Admin sees all countries; Admin sees only their country.
  const countryWhere = isSuperAdmin ? {} : { id: me.countryId ?? "___NEVER___" };
  const countries = await db.country.findMany({
    where: countryWhere,
    include: {
      chapters: {
        include: {
          _count: {
            select: {
              users: true,
              events: true,
              rsvps: true,
              speakers: true,
              emailQueueItems: true,
              // EventMockupDefault + QuizSession are scoped through Event,
              // not directly on Chapter. We compute them separately below
              // by joining through events.
            },
          },
        },
        orderBy: { name: "asc" },
      },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });

  // Fetch mockup + quiz counts per chapter by joining through events.
  // EventMockupDefault.eventId → Event.chapterId
  // QuizSession.eventId → Event.chapterId
  const chapterIds = countries.flatMap((c) => c.chapters.map((ch) => ch.id));
  const [mockupCounts, quizCounts] = await Promise.all([
    db.eventMockupDefault.groupBy({
      by: ["eventId"],
      where: { event: { chapterId: { in: chapterIds } } },
      _count: { _all: true },
    }),
    db.quizSession.groupBy({
      by: ["eventId"],
      where: { event: { chapterId: { in: chapterIds } } },
      _count: { _all: true },
    }),
  ]);

  // Resolve eventId → chapterId, then sum per chapter.
  const eventsInScope = await db.event.findMany({
    where: { chapterId: { in: chapterIds } },
    select: { id: true, chapterId: true },
  });
  const eventToChapter = new Map<string, string>();
  for (const e of eventsInScope) {
    if (e.chapterId) eventToChapter.set(e.id, e.chapterId);
  }
  const mockupPerChapter = new Map<string, number>();
  for (const m of mockupCounts) {
    if (!m.eventId) continue;
    const chId = eventToChapter.get(m.eventId);
    if (!chId) continue;
    mockupPerChapter.set(chId, (mockupPerChapter.get(chId) ?? 0) + m._count._all);
  }
  const quizPerChapter = new Map<string, number>();
  for (const q of quizCounts) {
    if (!q.eventId) continue;
    const chId = eventToChapter.get(q.eventId);
    if (!chId) continue;
    quizPerChapter.set(chId, (quizPerChapter.get(chId) ?? 0) + q._count._all);
  }

  // Flatten into a chapters list for the map panel.
  const chapters = countries.flatMap((country) =>
    country.chapters.map((ch) => ({
      id: ch.id,
      name: ch.name,
      slug: ch.slug,
      city: ch.city,
      countryId: country.id,
      countryName: country.name,
      countryCode: country.code,
      countryFlagEmoji: country.flagEmoji,
      memberCount: ch._count.users,
      eventCount: ch._count.events,
      rsvpCount: ch._count.rsvps,
      speakerCount: ch._count.speakers,
      emailCount: ch._count.emailQueueItems,
      mockupCount: mockupPerChapter.get(ch.id) ?? 0,
      quizCount: quizPerChapter.get(ch.id) ?? 0,
    }))
  );

  // Summary totals across visible scope
  const totalChapters = chapters.length;
  const totalMembers = chapters.reduce((s, ch) => s + ch.memberCount, 0);
  const totalEvents = chapters.reduce((s, ch) => s + ch.eventCount, 0);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
              V7 Hierarchy
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black flex items-center gap-3">
              <Globe2 className="h-8 w-8 text-[#820A7D]" />
              Global → Country → Chapter
            </h1>
            <p className="mt-2 text-sm text-black/80 max-w-3xl">
              Every member, event, speaker, registrant, RSVP, email, and referral in the platform is
              attached to a <strong>Chapter</strong> inside a <strong>Country</strong>. Super Admins
              see the full tree; Admins see only their country. Click a country or chapter pin on the
              map to drill into its counts.
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <SeedV7Button compact />
              <Link
                href="/admin/countries"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#820A7D] text-[#820A7D] font-semibold px-3 py-2 text-xs hover:bg-[#820A7D] hover:text-white whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" /> Add country
              </Link>
              <Link
                href="/admin/chapters/new"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#820A7D] text-white font-semibold px-3 py-2 text-xs hover:bg-[#820A7D]/90 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" /> Add chapter
              </Link>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Countries" value={countries.length} accent="#820A7D" icon={<Globe2 className="h-4 w-4" />} />
          <StatCard label="Chapters" value={totalChapters} accent="#FF005A" icon={<MapPin className="h-4 w-4" />} />
          <StatCard label="Members (scoped)" value={totalMembers} accent="#00E6FF" icon={<Users className="h-4 w-4" />} />
          <StatCard label="Events (scoped)" value={totalEvents} accent="#007E72" icon={<CalendarDays className="h-4 w-4" />} />
        </div>

        {/* World map + chapter tree panel */}
        {chapters.length === 0 ? (
          <div className="rounded-md border border-black/10 bg-black/[0.02] p-8 sm:p-10">
            <div className="max-w-2xl mx-auto text-center space-y-5">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#820A7D]/10">
                <Globe2 className="h-6 w-6 text-[#820A7D]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-black mb-1">
                  No countries in your scope yet
                </h2>
                <p className="text-sm text-black/70">
                  The platform starts empty. Seed the default{" "}
                  <strong>Israel + Tel Aviv</strong> hierarchy with one click
                  (backfills every existing member, event, RSVP, speaker,
                  email, and referral to that scope), or manually create a
                  country from scratch.
                </p>
              </div>
              {isSuperAdmin ? (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <SeedV7Button />
                  <Link
                    href="/admin/countries"
                    className="inline-flex items-center gap-2 rounded-md border border-[#820A7D] text-[#820A7D] font-semibold px-4 py-2 text-sm hover:bg-[#820A7D] hover:text-white"
                  >
                    <Plus className="h-4 w-4" /> Create a country manually
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-black/60">
                  Ask a Super Admin to seed the hierarchy or create a country
                  and assign you to it.
                </p>
              )}
            </div>
          </div>
        ) : (
          <ChapterMapPanel chapters={chapters} isSuperAdmin={isSuperAdmin} />
        )}

        {/* Footer info */}
        <div className="mt-12 rounded-md border border-[#00E6FF]/30 bg-[#00E6FF]/[0.04] px-5 py-4 text-sm text-black/80">
          <p className="font-semibold text-[#007E72] mb-1">How scoping works</p>
          <ul className="space-y-1 text-xs text-black/70 list-disc pl-5">
            <li><strong>Super Admin</strong> — sees all countries + chapters (global scope).</li>
            <li><strong>Admin</strong> — sees only their country + all chapters inside it.</li>
            <li><strong>Chapter Organizer</strong> — sees only their assigned chapter.</li>
            <li><strong>Member</strong> — country is set on signup; chapter is auto-set on first RSVP.</li>
            <li>Every new event, RSVP, speaker, email queue row, and referral inherits the chapter scope of its creator / event.</li>
          </ul>
        </div>
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon · V7 Hierarchy</span>
          <span>Platform by <a href="https://massapro.com" className="text-black/80 underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer">MassaPro</a></span>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, accent, icon }: { label: string; value: number; accent: string; icon?: React.ReactNode }) {
  return (
    <div className="border border-black/10 rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/80 flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 text-3xl font-extrabold text-black">{value}</div>
    </div>
  );
}
