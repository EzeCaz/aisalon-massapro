import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  getUserScope,
  type UserScope,
  getEffectiveRole,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ReportClient } from "./report-client";
import { Globe2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Email Report — AI Salon Admin" };

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

export default async function EmailReportPage({
  searchParams,
}: {
  searchParams: Promise<{ row?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/email/report");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, role: true, chapterId: true },
  });
  if (!me) redirect("/login");

  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  if (!can(effectiveRole, "members.view")) redirect("/events");

  const scope = await getUserScope(me.id);

  // TSK-0075: resolve admin's chapter name so the report page's preview
  // dialog shows {{chapter_name}} substituted with the admin's chapter.
  let previewChapterName = "";
  if (me.chapterId) {
    const ch = await db.chapter.findUnique({
      where: { id: me.chapterId },
      select: { name: true },
    });
    if (ch?.name) previewChapterName = ch.name;
  }

  // Fetch all audiences in scope so the batch-action "Send to audience"
  // picker has the full list. Same scoping as the main email page.
  const emailModelWhere =
    scope.kind === "global"
      ? {}
      : scope.kind === "country"
      ? { OR: [{ chapterId: null }, { chapter: { countryId: scope.countryId } }] }
      : scope.kind === "chapter"
      ? { OR: [{ chapterId: null }, { chapterId: scope.chapterId }] }
      : { id: "___NEVER___" };

  const audiences = await db.emailAudience.findMany({
    where: emailModelWhere,
    orderBy: [{ isTest: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      kind: true,
      isTest: true,
      _count: { select: { flowSteps: true } },
    },
  });

  const badge = scopeBadge(scope);

  // Optional ?row=campaign:xxx — when the user clicks the report icon on
  // a specific campaign row in /admin/email, they land here with that row
  // pre-selected so they can immediately preview / act on it.
  const sp = await searchParams;
  const initialRowId = sp.row || null;

  const audiencesJson = audiences.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    kind: a.kind,
    isTest: a.isTest,
    flowStepsCount: a._count.flowSteps,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs role={effectiveRole} />

        {/* Scope badge (same as other email admin pages) */}
        <div className="mb-4 flex items-center gap-2 text-xs text-black/60">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${badge.color}`}>
            <Globe2 className="h-2.5 w-2.5" />
            {badge.label} scope
          </span>
          <span>
            · Unified report of every email send — campaigns, flows, and
            manual queue sends in one filterable view.
          </span>
        </div>

        {/* Back link — this is a standalone page, not a tab.
            Clicking "Report" in the email admin nav (from /admin/email or
            /admin/email/flows) or the campaign row's report icon lands here. */}
        <div className="mb-4">
          <Link
            href="/admin/email"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#FF005A] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to email admin
          </Link>
        </div>

        <ReportClient audiences={audiencesJson} initialRowId={initialRowId} previewChapterName={previewChapterName} />
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
