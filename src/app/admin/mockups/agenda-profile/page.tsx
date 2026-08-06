import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  isSuperAdminEmail,
  ROLES,
  getEffectiveRole,
  getUserScope,
  scopeEventWhere,
  getCoHostedEventIds,
} from "@/lib/permissions";
import { buildScopeKey } from "@/lib/mockup-defaults-key";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { AgendaProfileEditor } from "./agenda-profile-editor";
import type { EventPickListItem } from "./types";

export const metadata = { title: "Agenda Profile Mockup — AI Salon" };

export const dynamic = "force-dynamic";

/**
 * /admin/mockups/event-profile
 *
 * Full agenda-page-style mockup. Pick an event from the dropdown to
 * auto-fill the hero, agenda (with breaks / networking auto-hidden),
 * and speakers grid. Toggle visibility per session / speaker. Edit
 * any field in the JSON. Download a print-quality PNG.
 *
 * Permission gate: ADMIN + SUPER_ADMIN (same as /admin/mockups).
 */

export default async function AgendaProfileMockupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/mockups/agenda-profile");
  }

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");


  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  if (!can(effectiveRole, "members.view") && !isSuperAdminEmail(me.email)) {
    redirect("/events");
  }

  // TSK-0075: scope the events dropdown by chapter/country.
  // TSK-0076: also derive a scopeKey for chapter-scoped localStorage defaults.
  const scope = await getUserScope(me.id);
  const scopeKey = buildScopeKey(scope);
  const scopedEventIds = await getCoHostedEventIds(me.id, me.role);
  const eventsWhere =
    scopedEventIds === null
      ? scopeEventWhere(scope)
      : { id: { in: scopedEventIds } };

  const eventsRaw = await db.event.findMany({
    where: eventsWhere,
    orderBy: { startsAt: "desc" },
    select: { id: true, slug: true, title: true, startsAt: true, venue: true },
  });
  const events: EventPickListItem[] = eventsRaw.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    venue: e.venue,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs role={effectiveRole} />

        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Mockup Builder · Template 3 of 4 (Agenda)
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Agenda Profile Mockup
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-3xl leading-relaxed">
            Full agenda-page-style mockup. Pick an event from the dropdown to
            auto-fill the hero, agenda (with <strong>breaks and networking
            sessions auto-hidden</strong>), and speakers grid (ordered by
            session time). Toggle visibility per session or speaker using the
            checkboxes. Edit any field in the JSON on the left, then download
            a print-quality PNG.
          </p>
        </div>

        <AgendaProfileEditor events={events} scopeKey={scopeKey} />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Global· Empowering AI Connections</span>
          <a href="https://massapro.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">Platform by MassaPro</a>
        </div>
      </footer>
    </div>
  );
}
