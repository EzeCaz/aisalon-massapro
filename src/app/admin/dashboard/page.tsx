import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  getEffectiveRole,
  getUserScope,
  scopeUserWhere,
  type UserScope,
} from "@/lib/permissions";
import { getBrandConfig, type BrandConfig } from "@/lib/brand/brand-config";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import Link from "next/link";
import { ArrowLeft, BarChart3, Globe2 } from "lucide-react";
import { MemberDashboard } from "./member-dashboard";

export const metadata = { title: "Member Dashboard" };

function scopeBadge(scope: UserScope, brand: BrandConfig): { label: string; color: string } {
  // Scope badge colors derived from the active brand's palette so a Coma
  // admin sees navy/amber badges instead of the legacy AIS pink/cyan.
  // The semantic meaning of each scope level is unchanged — only the
  // visual treatment follows the brand.
  switch (scope.kind) {
    case "global":
      // Primary brand color for the highest scope level.
      return { label: "Global", color: `bg-[${brand.primaryColor}] text-white` };
    case "country":
      // Accent color for country scope.
      return { label: "Country", color: `bg-[${brand.accentColor}] text-white` };
    case "chapter":
      // Soft tint of the primary color for chapter scope.
      return {
        label: "Chapter",
        color: `bg-[${brand.primaryColor}]/10 text-[${brand.primaryColor}] border border-[${brand.primaryColor}]/30`,
      };
    case "none":
      return { label: "No scope", color: "bg-black/10 text-black/60" };
  }
}

/**
 * /admin/dashboard — admin-only analytics dashboard built from the
 * onboarding form data + spreadsheet import data. Shows breakdowns
 * of "interested in", "profile categories", "applied for", source
 * (imported vs self-registered), tag distribution, signups over time,
 * plus a filterable / sortable members table.
 *
 * TSK-0075: scoped to the admin's chapter/country. A Montreal admin
 * sees only Montreal members; a TLV admin sees only TLV members.
 */
export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/dashboard");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  // BRAND RESOLUTION: resolve the active brand from the user's persisted
  // brandSlug. A Coma user (signed up via /login?brand=coma or
  // coma.massapro.com) sees a Coma-branded dashboard — navy/amber palette,
  // "Coma" wordmark, Coma tagline in the footer. Legacy users with no
  // brandSlug fall back to AIS (the platform default), preserving the
  // original look for existing AI Salon admins.
  const brand = getBrandConfig(me.brandSlug ?? "aisalon");
  const isComa = brand.slug === "coma";

  // TSK-0058: gate on EFFECTIVE role so a SUPER_ADMIN viewing-as Member
  // is redirected to /events (the dashboard is admin-only data).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  if (!can(effectiveRole, "members.view")) redirect("/events");

  // TSK-0075: scope the members query to the admin's chapter/country.
  const scope = await getUserScope(me.id);
  const badge = scopeBadge(scope, brand);

  // Fetch members in scope (with the fields the dashboard cares about).
  const members = await db.user.findMany({
    where: { ...scopeUserWhere(scope), archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      tags: true,
      _count: { select: { images: true, presentations: true, speakers: true } },
    },
  });

  // Serialize (Date -> ISO string) for the client component.
  const membersJson = JSON.parse(JSON.stringify(members));

  // "New chapter" CTA — Coma admins who haven't created their first
  // chapter yet see a prominent call-to-action card at the top of the
  // dashboard. This treats the dashboard as a "new chapter" experience
  // for Coma: the first thing a fresh Coma admin does is provision their
  // chapter (city, country, brand images, social links). AIS admins with
  // an existing chapter don't see this CTA.
  const showNewChapterCta = isComa && !me.chapterId;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs role={effectiveRole} />
        {/* Scope badge (TSK-0075) */}
        <div className="mb-4 flex items-center gap-2 text-xs text-black/60">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${badge.color}`}>
            <Globe2 className="h-2.5 w-2.5" />
            {badge.label} scope
          </span>
          <span>
            · Showing {members.length} member{members.length === 1 ? "" : "s"} in your{" "}
            {scope.kind === "global" ? "global view" : scope.kind === "country" ? "country" : "chapter"}.
          </span>
        </div>

        {/* NEW CHAPTER CTA — Coma-only, shown when the admin has no chapter yet.
            This is the "new chapter onboarding" entry point, branded with the
            Coma logo (hero banner) + navy/amber palette. The CTA links to the
            existing /admin/chapter-onboarding flow, which is brand-aware. */}
        {showNewChapterCta && (
          <div
            className="mb-8 rounded-2xl overflow-hidden border border-black/10"
            style={{ background: `linear-gradient(135deg, ${brand.primaryColor} 0%, ${brand.primaryColor}DD 60%, ${brand.accentColor}33 100%)` }}
          >
            <div className="grid md:grid-cols-[1.4fr_1fr] gap-0">
              <div className="p-8 sm:p-10 text-white">
                <p
                  className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-3"
                  style={{ color: brand.accentColor }}
                >
                  Welcome to {brand.displayName}
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold mb-3 leading-tight">
                  Launch your first chapter
                </h2>
                <p className="text-sm sm:text-base text-white/85 mb-6 max-w-lg leading-relaxed">
                  Your {brand.displayName} platform is ready. The next step is to provision
                  your first chapter — pick a city, upload your chapter&apos;s brand imagery,
                  and set your community social links. The onboarding wizard takes about 5 minutes.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/admin/chapter-onboarding"
                    className="inline-flex items-center gap-2 rounded-md font-semibold px-5 py-3 text-sm transition-colors"
                    style={{ background: brand.accentColor, color: brand.primaryColor }}
                  >
                    Start chapter onboarding
                    <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                  </Link>
                  <Link
                    href="/admin/chapters/new"
                    className="inline-flex items-center gap-2 rounded-md border border-white/40 text-white font-semibold px-5 py-3 text-sm hover:bg-white/10 transition-colors"
                  >
                    Or create a chapter manually
                  </Link>
                </div>
              </div>
              {/* Coma hero banner (transparent PNG on the brand-colored panel) */}
              <div className="hidden md:flex items-center justify-center p-8">
                {brand.heroBanner ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.heroBanner}
                    alt={`${brand.displayName} brand mark`}
                    className="max-w-full max-h-[200px] object-contain"
                    style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.2))" }}
                  />
                ) : (
                  <span
                    className="text-5xl font-extrabold lowercase tracking-tight"
                    style={{ color: brand.accentColor }}
                  >
                    {brand.wordmark}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs font-semibold text-black/50 hover:text-black mb-3"
          >
            <ArrowLeft className="h-3 w-3" /> Back to admin
          </Link>
          <p
            className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-2"
            style={{ color: brand.accentColor }}
          >
            <BarChart3 className="inline h-3 w-3 mr-1" />
            {brand.displayName} Admin Panel · Member Dashboard
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Community <span style={{ color: brand.primaryColor }}>insights</span>
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Breakdown of the {members.length} {scope.kind === "global" ? "members platform-wide" : "members in your scope"} — pulled from both
            the intake spreadsheet (imported members) and the self-service onboarding
            form (self-registered members). Use the filters on the right to slice the data.
          </p>
        </div>

        <MemberDashboard members={membersJson} brandSlug={brand.slug} brandColors={{
          primary: brand.primaryColor,
          accent: brand.accentColor,
          secondary: brand.secondaryColor,
        }} />
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
