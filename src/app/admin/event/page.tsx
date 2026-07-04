import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdminEmail, ROLES, roleLabel } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { AdminEventManager } from "./admin-event-manager";

export const metadata = { title: "Event management — Admin — AI Salon Tel Aviv" };

/**
 * /admin/event — top-level "Event" tab in the admin panel.
 *
 * Two inner sub-tabs (rendered client-side):
 *   1. Manage event  — searchable list of all events → inline panel with
 *                      sections for Details, Sessions/Agenda, Speakers,
 *                      Presentations, Co-hosts.
 *   2. Add new event — reuses the existing <NewEventForm /> component.
 *
 * Visible to SUPER_ADMIN + ADMIN only (CO_HOST + MEMBER are redirected
 * to /events). CO_HOSTs still see the "Manage agenda" tab on individual
 * event pages they co-host — that path is unchanged.
 */
export default async function AdminEventPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/event");

  let me = await db.user.findUnique({
    where: { email: session.user.email },
    include: { tags: true },
  });
  if (!me) redirect("/login");

  // Auto-sync the super admin role if the email is in the allowlist but
  // the DB row hasn't been upgraded yet. Same pattern as /admin/page.tsx.
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Permission gate: only SUPER_ADMIN + ADMIN see this tab.
  if (!can(me.role, "events.edit") && !isSuperAdminEmail(me.email)) {
    redirect("/events");
  }

  // Load all events with counts + main image for the searchable list.
  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      _count: { select: { images: true, speakers: true, agenda: true, coHosts: true, rsvps: true } },
      mainImage: { select: { id: true, fileUrl: true } },
      coHosts: {
        select: {
          id: true,
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      },
    },
  });

  // All platform members — used by the Co-hosts picker inside the
  // management panel. We deliberately exclude SUPER_ADMIN from the
  // picker (they already have access to every event) and exclude the
  // current user (no point in adding yourself).
  const members = await db.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      photoUrl: true,
      image: true,
      company: true,
    },
  });

  // Serialize (Date → ISO string) so the client component types match.
  const eventsJson = JSON.parse(JSON.stringify(events));
  const membersJson = JSON.parse(
    JSON.stringify(members.filter((m) => m.role !== "SUPER_ADMIN"))
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <AdminTabs />

        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Admin Panel · Events
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Event management
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            You are signed in as <strong className="font-mono">{me.email}</strong> with the{" "}
            <span className="inline-flex items-center gap-1 font-semibold text-[#FF005A]">
              {roleLabel(me.role)}
            </span>{" "}
            role. Pick an event to manage its details, agenda, speakers,
            presentations, and co-hosts — or create a new one. Co-hosts you
            assign will immediately see the &ldquo;Manage Agenda&rdquo; tab on the
            event page.
          </p>
        </div>

        <AdminEventManager events={eventsJson} members={membersJson} />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/40 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/60 underline-offset-4 hover:underline"
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
