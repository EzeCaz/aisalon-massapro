import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  isSuperAdminEmail,
  ROLES,
  roleLabel,
  getUserScope,
  scopeUserWhere,
  scopeEventWhere,
  type UserScope,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { AdminMembersTable } from "./admin-members-table";
import { AdminEventsList } from "./admin-events-list";
import Link from "next/link";
import { BarChart3, ArrowRight, Mail, Archive, Globe2 } from "lucide-react";

export const metadata = { title: "Admin — AI Salon" };

function scopeBadge(scope: UserScope): { label: string; color: string } {
  switch (scope.kind) {
    case "global":
      return { label: "Global scope", color: "bg-[#820A7D] text-white" };
    case "country":
      return { label: "Country scope", color: "bg-[#FF005A] text-white" };
    case "chapter":
      return { label: "Chapter scope", color: "bg-[#00E6FF]/20 text-[#007E72] border border-[#00E6FF]/40" };
    case "none":
      return { label: "No scope", color: "bg-black/10 text-black/60" };
  }
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin");

  let me = await db.user.findUnique({
    where: { email: session.user.email },
    include: { tags: true, country: true, chapter: true },
  });
  if (!me) redirect("/login");

  // Auto-sync: if the user's email is in the SUPER_ADMIN_EMAILS allowlist
  // but their DB role isn't SUPER_ADMIN yet, upgrade it inline so the UI
  // immediately reflects their true role. This keeps the hard-coded email
  // allowlist authoritative regardless of DB state.
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // New permission gate: any role with members.view (SUPER_ADMIN + ADMIN)
  // can access this page. CHAPTER_ORGANIZER + MEMBER are redirected to /events.
  if (!can(me.role, "members.view") && !isSuperAdminEmail(me.email)) redirect("/events");

  // V7: scope the queries based on the user's country/chapter
  const scope = await getUserScope(me.id);
  const scopeUserFilter = scopeUserWhere(scope);
  const scopeEventFilter = scopeEventWhere(scope);

  const members = await db.user.findMany({
    where: { archivedAt: null, ...scopeUserFilter },
    orderBy: [{ importSource: "desc" }, { createdAt: "desc" }],
    include: {
      tags: true,
      country: { select: { id: true, name: true, code: true, flagEmoji: true } },
      chapter: { select: { id: true, name: true, slug: true, city: true } },
      _count: { select: { images: true } },
      speakers: {
        select: {
          id: true,
          name: true,
          topic: true,
          event: { select: { id: true, title: true, slug: true } },
        },
      },
      secondaryEmails: { select: { id: true, email: true, label: true, createdAt: true } },
    },
  });

  const archivedCount = await db.user.count({
    where: { archivedAt: { not: null }, ...scopeUserFilter },
  });

  const events = await db.event.findMany({
    where: scopeEventFilter,
    orderBy: { startsAt: "desc" },
    include: {
      chapterRef: { select: { id: true, name: true, slug: true, country: { select: { name: true, code: true, flagEmoji: true } } } },
      _count: { select: { images: true, speakers: true } },
    },
  });

  // All speakers across all events in scope — for the "Link user to speaker" picker
  // V7: scope speakers by chapter — either the chapterId on Speaker rows
  // (denormalized from Event.chapterId), or fall back to filtering by
  // the events in scope.
  const speakerScopeChapterIds =
    scope.kind === "global"
      ? null
      : scope.kind === "country"
      ? (await db.chapter.findMany({ where: { countryId: scope.countryId }, select: { id: true } })).map((c) => c.id)
      : scope.kind === "chapter"
      ? [scope.chapterId]
      : [];
  const allSpeakers = await db.speaker.findMany({
    where: speakerScopeChapterIds === null
      ? {}
      : { chapterId: { in: speakerScopeChapterIds } },
    orderBy: [{ event: { startsAt: "desc" } }, { order: "asc" }],
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true } },
    },
  });

  // Serialize to plain JSON (Date -> ISO string) so the client component
  // types match what Prisma returns at runtime.
  const membersJson = JSON.parse(JSON.stringify(members));
  const eventsJson = JSON.parse(JSON.stringify(events));
  const allSpeakersJson = JSON.parse(JSON.stringify(allSpeakers));

  // Scope badge for the header
  const badge = scopeBadge(scope);
  const myChapterName = me.chapter?.name;
  const myCountryName = me.country?.name;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
              Admin Panel · V7 Hierarchy
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
              Manage community & events
            </h1>
            <p className="mt-2 text-sm text-black/80 max-w-2xl">
              You are signed in as <strong className="font-mono">{me.email}</strong> with the{" "}
              <span className="inline-flex items-center gap-1 font-semibold text-[#FF005A]">
                {roleLabel(me.role)}
              </span>{" "}
              role.
              {" "}Your active scope:{" "}
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${badge.color}`}>
                <Globe2 className="h-3 w-3" />
                {badge.label}
                {scope.kind === "country" && myCountryName && ` · ${myCountryName}`}
                {scope.kind === "chapter" && myChapterName && ` · ${myChapterName}`}
              </span>
              .{" "}
              {scope.kind === "global" && "Super Admins can delete members and change roles."}
              {scope.kind === "country" && "You see all chapters in your country."}
              {scope.kind === "chapter" && "You see only your chapter."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/chapters"
              className="inline-flex items-center gap-2 rounded-md border border-[#820A7D] text-[#820A7D] font-semibold px-3 py-2.5 text-sm hover:bg-[#820A7D] hover:text-white ais-lift whitespace-nowrap"
            >
              <Globe2 className="h-4 w-4" />
              Chapters
            </Link>
            <Link
              href="/admin/reports"
              className="inline-flex items-center gap-2 rounded-md border border-[#007E72] text-[#007E72] font-semibold px-3 py-2.5 text-sm hover:bg-[#007E72] hover:text-white ais-lift whitespace-nowrap"
            >
              <BarChart3 className="h-4 w-4" />
              Reports
            </Link>
            <Link
              href="/admin/email"
              className="inline-flex items-center gap-2 rounded-md bg-[#820A7D] text-white font-semibold px-4 py-2.5 text-sm hover:bg-[#820A7D]/90 ais-lift whitespace-nowrap"
            >
              <Mail className="h-4 w-4" />
              Email campaigns
            </Link>
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2.5 text-sm hover:bg-black/90 ais-lift whitespace-nowrap"
            >
              <BarChart3 className="h-4 w-4" />
              Member dashboard
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <StatCard label="Members" value={members.length} accent="#FF005A" />
          <StatCard label="Imported" value={members.filter((m) => m.importSource).length} accent="#00E6FF" />
          <StatCard label="Events" value={events.length} accent="#007E72" />
          <StatCard label="Linked to speaker" value={members.filter((m) => m.speakers.length > 0).length} accent="#820A7D" />
        </div>

        {/* Super-Admin-only archive link */}
        {isSuperAdminEmail(me.email) && (
          <div className="mb-8 rounded-md border border-[#820A7D]/30 bg-[#820A7D]/[0.04] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-[#820A7D]" />
              <div>
                <p className="text-sm font-semibold text-black">
                  Archived members: {archivedCount}
                </p>
                <p className="text-xs text-black/50">
                  Archived members are hidden from the main list. Only Super Admins can view and restore them.
                </p>
              </div>
            </div>
            <Link
              href="/admin/members/archive"
              className="inline-flex items-center gap-2 rounded-md bg-[#820A7D] text-white font-semibold px-3 py-1.5 text-xs hover:bg-[#820A7D]/90 whitespace-nowrap"
            >
              <Archive className="h-3.5 w-3.5" />
              View archive
            </Link>
          </div>
        )}

        {/* Members section */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-black mb-1">Community members</h2>
          <p className="text-sm text-black/80 mb-4">
            Assign tags to members — speakers, builders, investors, founders, etc. Tags appear on
            their profile and the user menu.
          </p>
          <AdminMembersTable
            members={membersJson}
            events={eventsJson}
            allSpeakers={allSpeakersJson}
            currentUserEmail={me.email}
            currentUserRole={me.role}
          />
        </section>

        {/* Events section */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-black">Events</h2>
            <Link
              href="/admin/events"
              className="text-xs font-semibold text-[#FF005A] hover:underline"
            >
              Manage all events →
            </Link>
          </div>
          <p className="text-sm text-black/80 mb-4">
            Recent events in the platform. Click an event to edit details, manage co-hosts, and view RSVPs.
          </p>
          <AdminEventsList events={eventsJson} />
        </section>
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

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="border border-black/10 rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/80">
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 text-3xl font-extrabold text-black">{value}</div>
    </div>
  );
}
