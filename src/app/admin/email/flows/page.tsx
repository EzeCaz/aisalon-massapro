import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { FlowBuilderClient } from "./flow-builder-client";

export const metadata = { title: "Email Flows — Admin — AI Salon Tel Aviv" };

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

  // Load templates + events for the dropdowns.
  const [templates, events] = await Promise.all([
    db.emailStageTemplate.findMany({
      where: { isActive: true },
      orderBy: { stage: "asc" },
      select: { id: true, name: true, subject: true, stage: true },
    }),
    db.event.findMany({
      orderBy: { startsAt: "desc" },
      take: 50,
      select: { id: true, title: true, slug: true, startsAt: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader me={me} />
      <AdminTabs />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Email Flows</h1>
            <p className="text-sm text-neutral-500">
              Build automated email sequences with conditional branches and audience filters.
            </p>
          </div>
          <a
            href="/admin/email"
            className="text-sm text-[#FF005A] hover:underline"
          >
            ← Back to email
          </a>
        </div>

        <FlowBuilderClient templates={templates} events={events} />
      </main>
    </div>
  );
}
