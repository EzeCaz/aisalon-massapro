"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  canSeeAdminNav,
  normalizeRole,
} from "@/lib/permissions";
import { ALL_TABS, filterTabsByRole, type AdminTabDef } from "./admin-tabs-def";

// Re-export for backward compatibility — any callers that imported
// ALL_TABS or AdminTabDef from admin-tabs-client will still work.
export { ALL_TABS, type AdminTabDef };

/**
 * AdminTabsClient — sticky horizontal nav for the admin area.
 *
 * The server wrapper passes only the user's role (a plain string)
 * across the RSC boundary; this client component imports `ALL_TABS`
 * and `filterTabsByRole` directly and applies the filter on the
 * client. This avoids serializing React component refs (lucide
 * icons) across the server/client boundary.
 *
 * Role filtering rules (enforced here via filterTabsByRole):
 *   - SUPER_ADMIN / ADMIN  → all tabs EXCEPT Event Prep (they use the
 *                            full event editor at /admin/events/[id])
 *   - CO_HOST              → Speakers, Registrants, Door Check-in,
 *                            Event dashboard, Mockups, Event Prep
 *                            (event-scoped data only — server filters)
 *   - SPEAKER              → Event Prep ONLY (read-only view of events
 *                            they are speaking at)
 *   - MEMBER               → no tabs (shouldn't see admin nav at all)
 */
export function AdminTabsClient({ role }: { role: string }) {
  const pathname = usePathname() || "/admin";

  const tabs = filterTabsByRole(role, { canSeeAdminNav, normalizeRole });
  if (tabs.length === 0) return null;

  const isActive = (match: string) => {
    if (match === "/admin") {
      // Members tab is active only on /admin exactly — deeper admin
      // paths override it.
      return pathname === "/admin";
    }
    if (match === "/admin/events") {
      // Events tab is active on /admin/events and /admin/events/<id>,
      // but NOT on /admin/events/new (that has its own tab).
      if (pathname === "/admin/events") return true;
      if (pathname.startsWith("/admin/events/") && !pathname.startsWith("/admin/events/new")) {
        return true;
      }
      return false;
    }
    if (match === "/admin/dashboard") {
      // Dashboard tab is active on /admin/dashboard exactly — but NOT on
      // /admin/dashboard/event-dashboard (that has its own tab).
      return pathname === "/admin/dashboard";
    }
    if (match === "/admin/event-prep") {
      // Event Prep tab is active on /admin/event-prep and
      // /admin/event-prep/<id>.
      return (
        pathname === "/admin/event-prep" ||
        pathname.startsWith("/admin/event-prep/")
      );
    }
    return pathname === match || pathname.startsWith(match + "/");
  };

  return (
    <nav
      aria-label="Admin sections"
      className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mb-8 border-b border-black/10 bg-white/95 backdrop-blur"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* 2-row layout: tabs flow onto a second row instead of horizontal scroll */}
        <ul className="flex flex-wrap items-center gap-1 py-2 text-sm">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-colors ${
                    active
                      ? "bg-[#FF005A] text-white"
                      : "text-black/60 hover:bg-black/5 hover:text-black"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
