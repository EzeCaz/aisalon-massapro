import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { EventProfileEditor } from "./event-profile-editor";
import type { EventPickListItem } from "./types";

export const metadata = { title: "Event Profile Mockup — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

/**
 * /admin/mockups/event-profile
 *
 * Full event-page-style mockup. Pick an event from the dropdown to
 * auto-fill the hero, agenda (with breaks / networking auto-hidden),
 * and speakers grid. Toggle visibility per session / speaker. Edit
 * any field in the JSON. Download a print-quality PNG.
 *
 * Permission gate: ADMIN + SUPER_ADMIN (same as /admin/mockups).
 */

export default async function EventProfileMockupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/mockups/event-profile");
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

  if (!can(me.role, "members.view") && !isSuperAdminEmail(me.email)) {
    redirect("/events");
  }

  const eventsRaw = await db.event.findMany({
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
            Mockup Builder · Template 3 of 4
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Event Profile Mockup
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-3xl leading-relaxed">
            Visual-first, minimal-text promotional overview — deconstructs
            the canonical Event Profile reference image: full-canvas TLV
            hero with triangle gradient overlay, 4 location pins (Sarona,
            Dizengoff, Neve Tzedek, Yafo), bold event title top-left, and
            sponsor logos bottom-right. <strong>Agenda + speakers grid
            have moved to <code className="rounded bg-black/5 px-1 py-0.5 font-mono">/admin/mockups/agenda-profile</code>.</strong>
            Edit any field in the JSON on the left, then download a
            print-quality PNG.
          </p>
        </div>

        <EventProfileEditor events={events} />
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
