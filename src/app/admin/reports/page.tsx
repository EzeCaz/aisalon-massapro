import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  isSuperAdmin,
  getUserScope,
  isSuperAdminEmail,
  ROLES,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import Link from "next/link";
import { BarChart3, Globe2, MapPin, TrendingUp, Users, CalendarDays, Mail, Mic2 } from "lucide-react";

export const metadata = { title: "Reports — AI Salon" };

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/reports");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, countryId: true, chapterId: true },
  });
  if (!me) redirect("/login");

  let myRole = me.role;
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({ where: { id: me.id }, data: { role: ROLES.SUPER_ADMIN } });
    myRole = ROLES.SUPER_ADMIN;
  }

  if (!can(myRole, "members.view")) redirect("/events");

  const scope = await getUserScope(me.id);
  const isGlobal = scope.kind === "global";

  // Build scope filter for chapter-scoped queries
  const chapterIds =
    scope.kind === "global"
      ? null
      : scope.kind === "country"
      ? (await db.chapter.findMany({ where: { countryId: scope.countryId }, select: { id: true } })).map((c) => c.id)
      : scope.kind === "chapter"
      ? [scope.chapterId]
      : [];

  // No data outside scope
  const chapterFilter = chapterIds === null ? {} : { chapterId: { in: chapterIds } };
  const eventChapterFilter = chapterIds === null
    ? {}
    : { chapterRef: { id: { in: chapterIds } } };
  const userChapterFilter =
    scope.kind === "global"
      ? {}
      : scope.kind === "country"
      ? { countryId: scope.countryId }
      : scope.kind === "chapter"
      ? { OR: [{ chapterId: scope.chapterId }, { countryId: scope.countryId, chapterId: null }] }
      : { id: "___NEVER___" };

  // Aggregate counts
  const [totalMembers, totalEvents, totalRsvps, totalSpeakers, totalEmailsSent, totalReferralVisits] = await Promise.all([
    db.user.count({ where: { ...userChapterFilter, archivedAt: null } }),
    db.event.count({ where: eventChapterFilter }),
    db.eventRsvp.count({ where: chapterFilter }),
    db.speaker.count({ where: chapterFilter }),
    db.emailQueue.count({ where: { ...chapterFilter, status: "SENT" } }),
    db.referralVisit.count({ where: chapterFilter }),
  ]);

  // Breakdown by chapter (for cross-chapter comparison)
  const chapters = await db.chapter.findMany({
    where: chapterIds === null ? {} : { id: { in: chapterIds } },
    include: {
      country: { select: { name: true, code: true, flagEmoji: true } },
      _count: {
        select: {
          users: true,
          events: true,
          rsvps: true,
          speakers: true,
          emailQueueItems: true,
          referralVisits: true,
        },
      },
    },
    orderBy: [{ country: { name: "asc" } }, { name: "asc" }],
  });

  // Breakdown by country (one level up)
  const countries = await db.country.findMany({
    where: scope.kind === "global" ? {} : { id: scope.kind === "country" ? scope.countryId : scope.kind === "chapter" ? scope.countryId : "___NEVER___" },
    include: {
      _count: { select: { users: true } },
      chapters: { select: { id: true, _count: { select: { users: true, events: true } } } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            V7 Reports
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-[#820A7D]" />
            Cross-chapter reports
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-3xl">
            Aggregated view of members, events, RSVPs, speakers, emails sent, and referrals —
            broken down by <strong>Country</strong> and <strong>Chapter</strong>.{" "}
            {isGlobal ? (
              <>You are viewing <strong>Global</strong> scope (all countries).</>
            ) : scope.kind === "country" ? (
              <>You are viewing <strong>Country</strong> scope (your country only).</>
            ) : scope.kind === "chapter" ? (
              <>You are viewing <strong>Chapter</strong> scope (your chapter only).</>
            ) : (
              <>No admin scope.</>
            )}
          </p>
        </div>

        {/* Top-level stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          <StatCard label="Members" value={totalMembers} accent="#FF005A" icon={<Users className="h-4 w-4" />} />
          <StatCard label="Events" value={totalEvents} accent="#007E72" icon={<CalendarDays className="h-4 w-4" />} />
          <StatCard label="RSVPs" value={totalRsvps} accent="#820A7D" icon={<CalendarDays className="h-4 w-4" />} />
          <StatCard label="Speakers" value={totalSpeakers} accent="#FFB300" icon={<Mic2 className="h-4 w-4" />} />
          <StatCard label="Emails sent" value={totalEmailsSent} accent="#00E6FF" icon={<Mail className="h-4 w-4" />} />
          <StatCard label="Referral visits" value={totalReferralVisits} accent="#FF005A" icon={<TrendingUp className="h-4 w-4" />} />
        </div>

        {/* Country breakdown */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-black mb-3 flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-[#820A7D]" />
            By country
          </h2>
          <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.03] text-xs uppercase tracking-wider text-black/70">
                <tr>
                  <th className="text-left px-4 py-3">Country</th>
                  <th className="text-right px-4 py-3">Members</th>
                  <th className="text-right px-4 py-3">Chapters</th>
                  <th className="text-right px-4 py-3">Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {countries.map((c) => {
                  const eventsInCountry = c.chapters.reduce((s, ch) => s + ch._count.events, 0);
                  return (
                    <tr key={c.id} className="hover:bg-black/[0.015]">
                      <td className="px-4 py-3 font-semibold text-black">
                        <span className="mr-2">{c.flagEmoji ?? "🏳️"}</span>
                        {c.name}
                        <span className="ml-2 text-xs font-mono text-black/40">({c.code})</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{c._count.users}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.chapters.length}</td>
                      <td className="px-4 py-3 text-right font-mono">{eventsInCountry}</td>
                    </tr>
                  );
                })}
                {countries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-black/50">
                      No countries in scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Chapter breakdown */}
        <section>
          <h2 className="text-lg font-bold text-black mb-3 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#FF005A]" />
            By chapter
          </h2>
          <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.03] text-xs uppercase tracking-wider text-black/70">
                <tr>
                  <th className="text-left px-4 py-3">Chapter</th>
                  <th className="text-left px-4 py-3">Country</th>
                  <th className="text-right px-4 py-3">Members</th>
                  <th className="text-right px-4 py-3">Events</th>
                  <th className="text-right px-4 py-3">RSVPs</th>
                  <th className="text-right px-4 py-3">Speakers</th>
                  <th className="text-right px-4 py-3">Emails</th>
                  <th className="text-right px-4 py-3">Referrals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {chapters.map((ch) => (
                  <tr key={ch.id} className="hover:bg-black/[0.015]">
                    <td className="px-4 py-3 font-semibold text-black">
                      {ch.name}
                      {ch.city && <span className="ml-2 text-xs text-black/40">{ch.city}</span>}
                    </td>
                    <td className="px-4 py-3 text-black/70">
                      <span className="mr-1.5">{ch.country.flagEmoji}</span>
                      {ch.country.name}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{ch._count.users}</td>
                    <td className="px-4 py-3 text-right font-mono">{ch._count.events}</td>
                    <td className="px-4 py-3 text-right font-mono">{ch._count.rsvps}</td>
                    <td className="px-4 py-3 text-right font-mono">{ch._count.speakers}</td>
                    <td className="px-4 py-3 text-right font-mono">{ch._count.emailQueueItems}</td>
                    <td className="px-4 py-3 text-right font-mono">{ch._count.referralVisits}</td>
                  </tr>
                ))}
                {chapters.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-black/50">
                      No chapters in scope.{" "}
                      <Link href="/admin/chapters" className="text-[#FF005A] hover:underline">Add one →</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon · V7 Reports</span>
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
        <span className="text-[0.6rem] font-bold uppercase tracking-widest text-black/80 flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 text-2xl font-extrabold text-black">{value}</div>
    </div>
  );
}
