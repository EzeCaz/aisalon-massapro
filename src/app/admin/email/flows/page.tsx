import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canAny,
  getEffectiveRole,
  getUserScope,
  scopeEventWhere,
  type UserScope,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { FlowsPageClient } from "./flows-page-client";
import { runSeed } from "@/lib/email-orchestrator/seed";
import { EmailAdminNav } from "@/components/ais/email-admin-nav";
import {
  parseSpec,
  resolveAudienceEmails,
} from "@/lib/email-orchestrator/audience-filter";
import { Globe2 } from "lucide-react";

export const metadata = { title: "Email Flows — Admin — AI Salon" };

export const dynamic = "force-dynamic";

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

export default async function FlowBuilderPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/email/flows");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true, chapterId: true },
  });
  if (!me) redirect("/login");

  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  if (!canAny(effectiveRole, ["members.view"])) {
    redirect("/events");
  }

  // TSK-0075: resolve the admin's chapter name (via V7 chapterId → Chapter.name)
  // so the template editor preview can substitute {{chapter_name}} with the
  // admin's actual chapter (e.g. "Montreal") instead of "Tel Aviv".
  let previewChapterName = "";
  if (me.chapterId) {
    const ch = await db.chapter.findUnique({
      where: { id: me.chapterId },
      select: { name: true },
    });
    if (ch?.name) previewChapterName = ch.name;
  }

  // TSK-0075: scope templates + events + audiences by chapter.
  // Global templates (chapterId=null) are visible to all admins.
  // Events are scoped via scopeEventWhere (chapterRef.countryId / chapterId).
  const scope = await getUserScope(me.id);
  const emailModelWhere =
    scope.kind === "global"
      ? {}
      : scope.kind === "country"
      ? { OR: [{ chapterId: null }, { chapter: { countryId: scope.countryId } }] }
      : scope.kind === "chapter"
      ? { OR: [{ chapterId: null }, { chapterId: scope.chapterId }] }
      : { id: "___NEVER___" };

  // Ensure the test audience + stage templates exist (idempotent).
  // Safe to run on every page load — runSeed is idempotent.
  try {
    await runSeed();
  } catch (e) {
    console.error("[flows/page] seed failed:", e);
  }

  // Load templates + events + audiences for the dropdowns (scoped).
  const [templates, events, audiences] = await Promise.all([
    // TSK-0074: was db.emailStageTemplate (legacy, now EmailStageTemplateLegacy).
    // Now reads from the unified EmailTemplate2 table.
    db.emailTemplate2.findMany({
      where: emailModelWhere,
      orderBy: [{ stage: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        subject: true,
        stage: true,
        isDefault: true,
        isActive: true,
      },
    }),
    db.event.findMany({
      where: scopeEventWhere(scope),
      orderBy: { startsAt: "desc" },
      take: 50,
      select: { id: true, title: true, slug: true, startsAt: true },
    }),
    db.emailAudience.findMany({
      where: emailModelWhere,
      orderBy: [{ isTest: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        emailsJson: true,
        filtersJson: true,
        kind: true,
        isTest: true,
      },
    }),
  ]);

  // Parse audience emails for the client. For STATIC audiences, parse emailsJson.
  // For DYNAMIC audiences, resolve the live email list + count so the flow
  // builder can display how many recipients each audience currently matches
  // (instead of showing 0 — DYNAMIC audiences store filtersJson, not emails).
  const audiencesParsed = await Promise.all(
    audiences.map(async (a) => {
      if (a.kind === "STATIC") {
        const emails = safeParseEmails(a.emailsJson);
        return {
          id: a.id,
          name: a.name,
          slug: a.slug,
          kind: a.kind as "STATIC" | "DYNAMIC",
          isTest: a.isTest,
          emails,
          emailCount: emails.length,
          emailPreview: emails.slice(0, 3),
        };
      }
      // DYNAMIC — resolve live email list + count.
      let emailCount = 0;
      let emailPreview: string[] = [];
      try {
        if (a.filtersJson) {
          const spec = parseSpec(a.filtersJson);
          if (spec) {
            const all = await resolveAudienceEmails(spec);
            emailCount = all.length;
            emailPreview = all.slice(0, 3);
          }
        }
      } catch {
        // ignore resolution errors — UI still renders with 0.
      }
      return {
        id: a.id,
        name: a.name,
        slug: a.slug,
        kind: a.kind as "STATIC" | "DYNAMIC",
        isTest: a.isTest,
        emails: [] as string[],
        emailCount,
        emailPreview,
        // Include the parsed filter spec so the AudiencesClient editor can
        // load existing rules when the user clicks an audience to edit it.
        // Without this, the editor receives `filters: undefined` and falls
        // back to the default placeholder rule — making it look like the
        // saved rules were "reset" every time the user re-opens the audience.
        filters: a.filtersJson ? parseSpec(a.filtersJson) : null,
      };
    }),
  );

  const badge = scopeBadge(scope);

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />
      <AdminTabs role={effectiveRole} />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <EmailAdminNav active="flows" />
        <div className="mb-4 flex items-center gap-2 text-xs text-black/60">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${badge.color}`}>
            <Globe2 className="h-2.5 w-2.5" />
            {badge.label} scope
          </span>
          <span>
            · Flows, audiences, and templates are scoped to your{" "}
            {scope.kind === "global" ? "global view" : scope.kind === "country" ? "country" : "chapter"}.
            Global templates (no chapter) are visible to all admins.
          </span>
        </div>
        <FlowsPageClient
          templates={templates}
          events={events.map((e) => ({ ...e, startsAt: e.startsAt.toISOString() }))}
          initialAudiences={audiencesParsed}
          previewChapterName={previewChapterName}
        />
      </main>
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
