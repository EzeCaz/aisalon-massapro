import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, roleLabel } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { AdminMembersTable } from "./admin-members-table";
import { AdminEventsList } from "./admin-events-list";
import Link from "next/link";
import { BarChart3, ArrowRight, Mail } from "lucide-react";

export const metadata = { title: "Admin — AI Salon Tel Aviv" };

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    include: { tags: true },
  });
  if (!me) redirect("/login");
  // New permission gate: any role with members.view (SUPER_ADMIN + ADMIN)
  // can access this page. CO_HOST + MEMBER are redirected to /events.
  if (!can(me.role, "members.view")) redirect("/events");

  const members = await db.user.findMany({
    orderBy: [{ importSource: "desc" }, { createdAt: "desc" }],
    include: {
      tags: true,
      _count: { select: { images: true } },
      speakers: {
        select: {
          id: true,
          name: true,
          topic: true,
          event: { select: { id: true, title: true, slug: true } },
        },
      },
      secondaryEmails: { select: { id: true, email: true, label: true, createdAt: true } },
    },
  });

  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { images: true, speakers: true } } },
  });

  // All speakers across all events — for the "Link user to speaker" picker
  const allSpeakers = await db.speaker.findMany({
    orderBy: [{ event: { startsAt: "desc" } }, { order: "asc" }],
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true } },
    },
  });

  // Serialize to plain JSON (Date -> ISO string) so the client component
  // types match what Prisma returns at runtime.
  const membersJson = JSON.parse(JSON.stringify(members));
  const eventsJson = JSON.parse(JSON.stringify(events));
  const allSpeakersJson = JSON.parse(JSON.stringify(allSpeakers));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
              Admin Panel
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
              Manage community & events
            </h1>
            <p className="mt-2 text-sm text-black/60 max-w-2xl">
              You are signed in as <strong className="font-mono">{me.email}</strong> with the{" "}
              <span className="inline-flex items-center gap-1 font-semibold text-[#FF005A]">
                {roleLabel(me.role)}
              </span>{" "}
              role. Super Admins can delete members and change roles; Admins can manage everything else.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/email"
              className="inline-flex items-center gap-2 rounded-md bg-[#820A7D] text-white font-semibold px-4 py-2.5 text-sm hover:bg-[#820A7D]/90 ais-lift whitespace-nowrap"
            >
              <Mail className="h-4 w-4" />
              Email campaigns
            </Link>
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2.5 text-sm hover:bg-black/90 ais-lift whitespace-nowrap"
            >
              <BarChart3 className="h-4 w-4" />
              Member dashboard
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <StatCard label="Members" value={members.length} accent="#FF005A" />
          <StatCard label="Imported" value={members.filter((m) => m.importSource).length} accent="#00E6FF" />
          <StatCard label="Events" value={events.length} accent="#007E72" />
          <StatCard label="Linked to speaker" value={members.filter((m) => m.speakers.length > 0).length} accent="#820A7D" />
        </div>

        {/* Members section */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-black mb-1">Community members</h2>
          <p className="text-sm text-black/60 mb-4">
            Assign tags to members — speakers, builders, investors, founders, etc. Tags appear on
            their profile and the user menu.
          </p>
          <AdminMembersTable
            members={membersJson}
            events={eventsJson}
            allSpeakers={allSpeakersJson}
            currentUserEmail={me.email}
            currentUserRole={me.role}
          />
        </section>

        {/* Events section */}
        <section>
          <h2 className="text-lg font-bold text-black mb-1">Events</h2>
          <p className="text-sm text-black/60 mb-4">
            All events in the platform. New events are added via the database / API.
          </p>
          <AdminEventsList events={events} />
        </section>
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

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="border border-black/10 rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 text-3xl font-extrabold text-black">{value}</div>
    </div>
  );
}
