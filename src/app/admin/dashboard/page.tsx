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
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import Link from "next/link";
import { ArrowLeft, BarChart3, Globe2 } from "lucide-react";
import { MemberDashboard } from "./member-dashboard";

export const metadata = { title: "Member Dashboard — AI Salon" };

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

  // TSK-0058: gate on EFFECTIVE role so a SUPER_ADMIN viewing-as Member
  // is redirected to /events (the dashboard is admin-only data).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  if (!can(effectiveRole, "members.view")) redirect("/events");

  // TSK-0075: scope the members query to the admin's chapter/country.
  const scope = await getUserScope(me.id);
  const badge = scopeBadge(scope);

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
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs font-semibold text-black/50 hover:text-black mb-3"
          >
            <ArrowLeft className="h-3 w-3" /> Back to admin
          </Link>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            <BarChart3 className="inline h-3 w-3 mr-1" />
            Admin Panel · Member Dashboard
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Community <span className="ais-gradient-text">insights</span>
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Breakdown of the {members.length} members in your scope — pulled from both
            the intake spreadsheet (imported members) and the self-service onboarding
            form (self-registered members). Use the filters on the right to slice the data.
          </p>
        </div>

        <MemberDashboard members={membersJson} />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon · Empowering AI Connections</span>
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
