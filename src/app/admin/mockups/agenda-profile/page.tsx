import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny, getCoHostedEventIds, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { AgendaProfileEditor } from "./agenda-profile-editor";
import type { EventPickListItem } from "./types";

export const metadata = { title: "Agenda Profile Mockup — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

/**
 * /admin/mockups/event-profile
 *
 * Full agenda-page-style mockup. Pick an event from the dropdown to
 * auto-fill the hero, agenda (with breaks / networking auto-hidden),
 * and speakers grid. Toggle visibility per session / speaker. Edit
 * any field in the JSON. Download a print-quality PNG.
 *
 * Permission gate: ADMIN + SUPER_ADMIN (members.view) OR CO_HOST
 * (eventdata.viewCoHosted). CO_HOSTs see only their co-hosted events
 * in the dropdown.
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

  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  if (
    !canAny(me.role, ["members.view", "eventdata.viewCoHosted"]) &&
    !isSuperAdminEmail(me.email)
  ) {
    redirect("/events");
  }

  // Determine event-scoping. For ADMIN+ this is null (all events).
  // For CO_HOST, this is the list of event IDs they co-host.
  const scopedEventIds = await getCoHostedEventIds(me.id, me.role);

  const eventsRaw = await db.event.findMany({
    where: scopedEventIds === null ? undefined : { id: { in: scopedEventIds } },
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
        <AdminTabs />

        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Mockup Builder · Template 3 of 4 (Agenda)
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Agenda Profile Mockup
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-3xl leading-relaxed">
            Full agenda-page-style mockup. Pick an event from the dropdown to
            auto-fill the hero, agenda (with <strong>breaks and networking
            sessions auto-hidden</strong>), and speakers grid (ordered by
            session time). Toggle visibility per session or speaker using the
            checkboxes. Edit any field in the JSON on the left, then download
            a print-quality PNG.
          </p>
        </div>

        <AgendaProfileEditor events={events} />
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
