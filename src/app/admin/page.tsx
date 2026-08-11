import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  getEffectiveRole,
  isSuperAdminEmail,
  normalizeRole,
  ROLES,
  roleLabel,
  getUserScope,
  scopeUserWhere,
  scopeEventWhere,
  type UserScope,
} from "@/lib/permissions";
import { getBrandConfig, type BrandConfig } from "@/lib/brand/brand-config";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { AdminMembersTable } from "./admin-members-table";
import { AdminEventsList } from "./admin-events-list";
import Link from "next/link";
import { BarChart3, ArrowRight, Mail, Archive, Globe2 } from "lucide-react";

export const metadata = { title: "Admin" };

function scopeBadge(scope: UserScope, brand: BrandConfig): { label: string; color: string } {
  // Brand-aware scope badge — uses the active brand's palette instead of
  // the legacy AIS pink/cyan. Same semantic meaning, brand-native colors.
  switch (scope.kind) {
    case "global":
      return { label: "Global scope", color: `bg-[${brand.primaryColor}] text-white` };
    case "country":
      return { label: "Country scope", color: `bg-[${brand.accentColor}] text-white` };
    case "chapter":
      return {
        label: "Chapter scope",
        color: `bg-[${brand.primaryColor}]/10 text-[${brand.primaryColor}] border border-[${brand.primaryColor}]/30`,
      };
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

  // BRAND RESOLUTION: resolve the active brand from the user's persisted
  // brandSlug. A Coma admin sees a Coma-branded admin panel — navy/amber
  // palette, "Coma" wordmark, Coma tagline in the footer, no "AI Salon"
  // or "Tel Aviv" mentions. Legacy users with no brandSlug fall back to
  // AIS (the platform default), preserving the original look for existing
  // AI Salon admins.
  const brand = getBrandConfig(me.brandSlug ?? "aisalon");
  const isComa = brand.slug === "coma";

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

  // TSK-0058: Resolve the EFFECTIVE role (honors "View as" override for
  // SUPER_ADMIN). The gate below uses this instead of `me.role` so that
  // when a Super Admin is viewing-as Member/Speaker, they're redirected
  // to /events just like a real Member would be.
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const viewAsChapterId = (session.user as { viewAsChapterId?: string | null }).viewAsChapterId ?? null;
  const isSuper = isSuperAdminEmail(me.email) || normalizeRole(me.role) === ROLES.SUPER_ADMIN;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);

  // Permission gate: any role with members.view (SUPER_ADMIN + ADMIN)
  // can access this page. CHAPTER_ORGANIZER + MEMBER + SPEAKER are
  // redirected to /events.
  // TSK-0058: gate on EFFECTIVE role so view-as is honored.
  if (!can(effectiveRole, "members.view")) redirect("/events");

  // V7: scope the queries based on the user's country/chapter.
  // TSK-0058: pass viewAs opts so the scope reflects the impersonated
  // (role, chapter) — e.g. viewing-as Chapter Organizer scopes the data
  // to that chapter, viewing-as Member returns {kind:"none"} (though the
  // gate above already redirected in that case).
  const scope = await getUserScope(
    me.id,
    isSuper ? { isSuperAdminCaller: true, viewAsRole, viewAsChapterId } : undefined,
  );
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

  // V7: load all countries + chapters (Super Admin only — used by the
  // CountryChapterScopeFilter on the Members table).
  // TSK-0058: gate on effectiveRole === SUPER_ADMIN so viewing-as a
  // lower role hides the country/chapter filter (the impersonated role
  // wouldn't have access to all countries/chapters anyway).
  let allCountries: { id: string; name: string; code: string; flagEmoji: string | null; slug: string; isActive: boolean }[] = [];
  let allChapters: { id: string; name: string; slug: string; countryId: string; city: string | null; isActive: boolean }[] = [];
  if (effectiveRole === ROLES.SUPER_ADMIN) {
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

  // Serialize to plain JSON (Date -> ISO string) so the client component
  // types match what Prisma returns at runtime.
  const membersJson = JSON.parse(JSON.stringify(members));
  const eventsJson = JSON.parse(JSON.stringify(events));
  const allSpeakersJson = JSON.parse(JSON.stringify(allSpeakers));

  // Scope badge for the header
  const badge = scopeBadge(scope, brand);
  const myChapterName = me.chapter?.name;
  const myCountryName = me.country?.name;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs role={effectiveRole} />
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p
              className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-2"
              style={{ color: brand.accentColor }}
            >
              {brand.displayName} Admin Panel · V7 Hierarchy
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
              Manage community & events
            </h1>
            <p className="mt-2 text-sm text-black/80 max-w-2xl">
              You are signed in as <strong className="font-mono">{me.email}</strong> with the{" "}
              <span
                className="inline-flex items-center gap-1 font-semibold"
                style={{ color: brand.accentColor }}
              >
                {roleLabel(effectiveRole)}
                {isSuper && viewAsRole && (
                  <span className="ml-1 text-[0.65rem] font-normal text-black/50">
                    (viewing as — real role: {roleLabel(me.role)})
                  </span>
                )}
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
          <StatCard label="Members" value={members.length} accent={brand.primaryColor} />
          <StatCard label="Imported" value={members.filter((m) => m.importSource).length} accent={brand.accentColor} />
          <StatCard label="Events" value={events.length} accent={brand.secondaryColor} />
          <StatCard label="Linked to speaker" value={members.filter((m) => m.speakers.length > 0).length} accent={brand.primaryColor} />
        </div>

        {/* Super-Admin-only archive link — TSK-0058: gate on effectiveRole
            so viewing-as a lower role hides the archive block. */}
        {effectiveRole === ROLES.SUPER_ADMIN && (
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
            currentUserRole={effectiveRole}
            allCountries={allCountries}
            allChapters={allChapters}
          />
        </section>

        {/* Events section */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-black">Events</h2>
            <Link
              href="/admin/events"
              className="text-xs font-semibold hover:underline"
              style={{ color: brand.accentColor }}
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
          <span>© {new Date().getFullYear()} {brand.displayName} · {brand.tagline}</span>
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
