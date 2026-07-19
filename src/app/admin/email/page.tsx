import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  getUserScope,
  scopeUserWhere,
  type UserScope,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { EmailTabClient } from "./email-tab-client";
import { runSeed } from "@/lib/email-orchestrator/seed";
import { Globe2 } from "lucide-react";

export const metadata = { title: "Email Campaigns — AI Salon Admin" };

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

export default async function EmailTabPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/email");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!me) redirect("/login");
  if (!can(me.role, "members.view")) redirect("/events");

  // V7: scope email flows/campaigns/audiences/templates by chapter.
  // Global templates (chapterId = null) are visible to everyone.
  const scope = await getUserScope(me.id);
  // For email models that store chapterId, "global scope" = see all rows
  // (including chapterId=null globals). "Country scope" = rows where
  // chapterId IS NULL (global templates) OR chapter.countryId = scope.countryId.
  // "Chapter scope" = rows where chapterId IS NULL OR chapterId = scope.chapterId.
  const emailModelWhere =
    scope.kind === "global"
      ? {}
      : scope.kind === "country"
      ? { OR: [{ chapterId: null }, { chapter: { countryId: scope.countryId } }] }
      : scope.kind === "chapter"
      ? { OR: [{ chapterId: null }, { chapterId: scope.chapterId }] }
      : { id: "___NEVER___" };

  // Resolve the active top-level tab from the URL. Defaults to "campaigns".
  const sp = await searchParams;
  const tabParam = (sp.tab || "campaigns").toLowerCase();
  const activeTab: "campaigns" | "orchestrator" | "flows" =
    tabParam === "orchestrator" ? "orchestrator" : tabParam === "flows" ? "flows" : "campaigns";

  // Ensure the test audience + stage templates exist (idempotent). Same
  // seed that runs on /admin/email/flows — both pages share the same DB.
  try {
    await runSeed();
  } catch (e) {
    console.error("[admin/email/page] seed failed:", e);
  }

  // Pre-fetch initial lists for the client. The client can re-fetch via
  // API when it needs fresh data (after creating/sending a campaign).
  const [campaigns, templates, membersCount, tags, flows, audiences, stageTemplates] = await Promise.all([
    db.emailCampaign.findMany({
      where: emailModelWhere,
      orderBy: { createdAt: "desc" },
      include: {
        template: { select: { id: true, name: true, category: true } },
        creator: { select: { id: true, email: true, name: true } },
        chapter: { select: { id: true, name: true, slug: true, country: { select: { name: true, code: true, flagEmoji: true } } } },
        _count: { select: { recipients: true, events: true } },
      },
    }),
    db.emailTemplate.findMany({
      where: emailModelWhere,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { campaigns: true } },
        creator: { select: { id: true, email: true, name: true } },
        chapter: { select: { id: true, name: true, slug: true } },
      },
    }),
    db.user.count({ where: scopeUserWhere(scope) }),
    db.memberTag.findMany({
      select: { id: true, label: true, color: true },
      distinct: ["label"],
      orderBy: { label: "asc" },
    }),
    db.emailFlow.findMany({
      where: emailModelWhere,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { steps: true } },
        chapter: { select: { id: true, name: true, slug: true } },
      },
    }),
    db.emailAudience.findMany({
      where: emailModelWhere,
      orderBy: [{ isTest: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        kind: true,
        isTest: true,
        emailsJson: true,
        _count: { select: { flowSteps: true } },
      },
    }),
    db.emailStageTemplate.findMany({
      where: emailModelWhere,
      orderBy: [{ stage: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        subject: true,
        stage: true,
        isDefault: true,
        isActive: true,
        _count: { select: { flowSteps: true } },
      },
    }),
  ]);

  const badge = scopeBadge(scope);

  // Serialize (Date -> ISO string) for the client
  const campaignsJson = JSON.parse(JSON.stringify(campaigns));
  const templatesJson = JSON.parse(JSON.stringify(templates));
  const flowsJson = JSON.parse(JSON.stringify(flows));
  const audiencesJson = audiences.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    kind: a.kind,
    isTest: a.isTest,
    flowStepsCount: a._count.flowSteps,
    emailsCount: safeParseEmails(a.emailsJson).length,
  }));
  const stageTemplatesJson = stageTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    stage: t.stage,
    isDefault: t.isDefault,
    isActive: t.isActive,
    flowStepsCount: t._count.flowSteps,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />
        <div className="mb-4 flex items-center gap-2 text-xs text-black/60">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${badge.color}`}>
            <Globe2 className="h-2.5 w-2.5" />
            {badge.label} scope
          </span>
          <span>
            · Email campaigns, flows, audiences, and templates are scoped to your{" "}
            {scope.kind === "global" ? "global view" : scope.kind === "country" ? "country" : "chapter"}.
            Global templates (no chapter) are visible to all admins.
          </span>
        </div>
        <EmailTabClient
          initialCampaigns={campaignsJson}
          initialTemplates={templatesJson}
          membersCount={membersCount}
          tags={tags.map((t) => ({ label: t.label, color: t.color }))}
          adminEmail={me.email || ""}
          activeTab={activeTab}
          flows={flowsJson}
          audiences={audiencesJson}
          stageTemplates={stageTemplatesJson}
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

function safeParseEmails(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}
