import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { MockupsClient } from "./mockups-client";

export const metadata = { title: "Mockups — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

/**
 * /admin/mockups
 *
 * Reference library for AI Salon event mockups:
 *   1. Brand Assets — the 5 core brand images (TLV Meerkat, chapter
 *      profiles, speaker overlays) used as building blocks for mockups.
 *   2. Mockup Templates — the 4 canonical event visuals (Speaker Intro,
 *      Meet the Speaker, Agenda, Event Profile) that chapters should
 *      reproduce for every event.
 *   3. AI Event Mockup Template Generator — the full system prompt that
 *      admins can copy into Grok Imagine / Flux / Midjourney along with
 *      structured event JSON to generate new on-brand mockups.
 *
 * Permission gate: ADMIN + SUPER_ADMIN (members.view) OR CO_HOST
 * (eventdata.viewCoHosted). CO_HOSTs see the same mockup reference
 * library — useful for producing event visuals for events they
 * co-host.
 */

export default async function AdminMockupsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/mockups");
  }

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN status (same pattern as /admin + /admin/images)
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Visible to ADMIN + SUPER_ADMIN (members.view) OR CO_HOST
  // (eventdata.viewCoHosted — they can use mockups for their events).
  if (
    !canAny(me.role, ["members.view", "eventdata.viewCoHosted"]) &&
    !isSuperAdminEmail(me.email)
  ) {
    redirect("/events");
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        {/* Header */}
        <div className="mb-10">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Visual Resources
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Mockups
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl leading-relaxed">
            The AI Salon Tel Aviv brand asset library, the four canonical
            event mockup templates, and the AI Event Mockup Template
            Generator system prompt. Use these together to produce on-brand
            promotional visuals for every chapter event.
          </p>
        </div>

        <MockupsClient />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/40 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>Platform by MassaPro</span>
        </div>
      </footer>
    </div>
  );
}
