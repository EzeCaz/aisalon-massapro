import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canSeeAdminNav,
  isSuperAdminEmail,
  normalizeRole,
  ROLES,
} from "@/lib/permissions";
import { AdminTabsClient, ALL_TABS, type AdminTabDef } from "./admin-tabs-client";

/**
 * AdminTabs — server wrapper that filters the tab list by user role
 * before rendering the client component.
 *
 * Filtering rules:
 *
 *   - SUPER_ADMIN / ADMIN  → all tabs EXCEPT Event Prep (they use the
 *                            full event editor at /admin/events/[id]
 *                            instead of the read-only Event Prep view)
 *
 *   - CO_HOST              → event-scoped tabs only:
 *                            Speakers, Registrants, Door Check-in,
 *                            Event dashboard, Mockups, Event Prep
 *                            (server-side data filtering applies —
 *                            CO_HOSTs only see data for events they
 *                            co-host)
 *
 *   - SPEAKER              → Event Prep ONLY (read-only view of events
 *                            they are speaking at)
 *
 *   - MEMBER               → no tabs (the wrapper returns null)
 *
 * Usage (unchanged from before):
 *   import { AdminTabs } from "@/components/ais/admin-tabs";
 *   <AdminTabs />
 */
export async function AdminTabs() {
  const session = await getServerSession(authOptions);
  const user = session?.user?.email
    ? await db.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true, role: true },
      })
    : null;

  if (!user) return null;

  // Auto-sync SUPER_ADMIN role from email allowlist (same pattern as
  // other admin pages — guarantees the hard-coded email list is
  // authoritative regardless of DB state).
  let effectiveRole = user.role;
  if (isSuperAdminEmail(user.email) && user.role !== ROLES.SUPER_ADMIN) {
    effectiveRole = ROLES.SUPER_ADMIN;
  }

  const tabs = filterTabsByRole(effectiveRole);
  if (tabs.length === 0) return null;

  return <AdminTabsClient tabs={tabs} />;
}

/**
 * Pick which admin tabs a given role should see.
 *
 * The matching is intentionally explicit (a switch + Set lookup) so
 * adding a new tab requires a deliberate decision about who sees it.
 */
function filterTabsByRole(role: string): AdminTabDef[] {
  const r = normalizeRole(role);

  // MEMBER sees nothing — they shouldn't be in the admin area at all.
  if (!canSeeAdminNav(r)) return [];

  // SPEAKER sees only the Event Prep tab.
  if (r === ROLES.SPEAKER) {
    return ALL_TABS.filter((t) => t.href === "/admin/event-prep");
  }

  // CO_HOST sees the event-scoped tabs + Event Prep.
  if (r === ROLES.CO_HOST) {
    const allowed = new Set<string>([
      "/admin/speakers",
      "/admin/registrants",
      "/admin/check-in",
      "/admin/dashboard/event-dashboard",
      "/admin/mockups",
      "/admin/event-prep",
    ]);
    return ALL_TABS.filter((t) => allowed.has(t.href));
  }

  // SUPER_ADMIN + ADMIN see everything EXCEPT Event Prep (they use the
  // full event editor at /admin/events/[id] which has more capabilities).
  if (r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN) {
    return ALL_TABS.filter((t) => t.href !== "/admin/event-prep");
  }

  return [];
}
