import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny, getEffectiveRole} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { FlowsPageClient } from "./flows-page-client";
import { runSeed } from "@/lib/email-orchestrator/seed";
import { EmailAdminNav } from "@/components/ais/email-admin-nav";
import {
  parseSpec,
  resolveAudienceEmails,
} from "@/lib/email-orchestrator/audience-filter";

export const metadata = { title: "Email Flows — Admin — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

export default async function FlowBuilderPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/email/flows");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!me) redirect("/login");

  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  if (!canAny(effectiveRole, ["members.view"])) {
    redirect("/events");
  }

  // Ensure the test audience + stage templates exist (idempotent).
  // Safe to run on every page load — runSeed is idempotent.
  try {
    await runSeed();
  } catch (e) {
    console.error("[flows/page] seed failed:", e);
  }

  // Load templates + events + audiences for the dropdowns.
  const [templates, events, audiences] = await Promise.all([
    // TSK-0074: was db.emailStageTemplate (legacy, now EmailStageTemplateLegacy).
    // Now reads from the unified EmailTemplate2 table.
    db.emailTemplate2.findMany({
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
      orderBy: { startsAt: "desc" },
      take: 50,
      select: { id: true, title: true, slug: true, startsAt: true },
    }),
    db.emailAudience.findMany({
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

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />
      <AdminTabs role={effectiveRole} />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <EmailAdminNav active="flows" />
        <FlowsPageClient
          templates={templates}
          events={events.map((e) => ({ ...e, startsAt: e.startsAt.toISOString() }))}
          initialAudiences={audiencesParsed}
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
