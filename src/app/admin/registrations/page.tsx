import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  getEffectiveRole,
  getUserScope,
  scopeEventWhere,
  isSuperAdminEmail,
  ROLES,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminNavCards } from "@/components/ais/admin-nav-cards";
import { AdminRegistrations } from "./admin-registrations";
import { CalendarCheck } from "lucide-react";

export const metadata = { title: "Event Registrations — Admin — AI Salon Tel Aviv" };

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/registrations");

  let me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) redirect("/login");

  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  // Auto-sync SUPER_ADMIN role from email allowlist
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Phase 4 (2026-10-02): allow BRAND_ADMIN + SUPER_ADMIN + ADMIN to view
  // the registrations page (was ADMIN-only — excluded BRAND_ADMIN entirely).
  if (!can(effectiveRole, "members.view")) redirect("/events");

  const sp = await searchParams;
  const preselectedEventId = sp.event;

  // BRAND-SCOPE GUARD (2026-10-02): scope events to the user's brand/country/
  // chapter so BRAND_ADMIN only sees their own brand's events + registrations.
  const scope = await getUserScope(me.id);
  const eventScopeWhere = scopeEventWhere(scope);

  const events = await db.event.findMany({
    where: eventScopeWhere,
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      venue: true,
      _count: {
        select: {
          registrations: true,
          nonMemberRegistrations: true,
        },
      },
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Persistent admin section navigation — visible on every admin page */}
        <AdminNavCards />

        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2 inline-flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5" />
              Admin Panel
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
              Event Registrations
            </h1>
            <p className="mt-2 text-sm text-black/80 max-w-2xl">
              Upload an event&apos;s RSVP spreadsheet to cross-reference registrants against existing members.
              Matching emails get added to the member&apos;s event registration list; new emails become non-member
              leads; suspected duplicates (same name, different email) are flagged for review.
            </p>
          </div>
        </div>

        <AdminRegistrations events={JSON.parse(JSON.stringify(events))} preselectedEventId={preselectedEventId} />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/80 underline-offset-4 hover:underline"
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
