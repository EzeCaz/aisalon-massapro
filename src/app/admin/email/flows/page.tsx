import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { FlowsPageClient } from "./flows-page-client";
import { runSeed } from "@/lib/email-orchestrator/seed";

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
  if (!canAny(me.role, ["members.view"])) {
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
    db.emailStageTemplate.findMany({
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
        kind: true,
        isTest: true,
      },
    }),
  ]);

  // Parse audience emails for the client. For STATIC audiences, parse emailsJson.
  // For DYNAMIC, the client should call /api/email-audiences/[id]/emails to resolve.
  const audiencesParsed = audiences.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    kind: a.kind as "STATIC" | "DYNAMIC",
    isTest: a.isTest,
    emails: safeParseEmails(a.emailsJson),
  }));

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />
      <AdminTabs />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Email Automation</h1>
            <p className="text-sm text-neutral-500">
              Build automated flows, manage reusable audiences, and edit email templates with A/B subject testing.
            </p>
          </div>
          <a
            href="/admin/email"
            className="text-sm text-[#FF005A] hover:underline"
          >
            ← Back to email
          </a>
        </div>

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
