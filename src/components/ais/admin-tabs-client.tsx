"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Mic2,
  ClipboardList,
  CalendarDays,
  CalendarPlus,
  BarChart3,
  Mail,
  QrCode,
  CalendarRange,
  Images,
  BookOpen,
  LayoutTemplate,
  ClipboardCheck,
} from "lucide-react";

/**
 * AdminTabsClient — sticky horizontal nav for the admin area.
 *
 * This is the client-side renderer. The server-side wrapper
 * (admin-tabs.tsx) fetches the current user, filters the TABS list by
 * role, and passes only the visible tabs down to this component.
 *
 * Role filtering rules (enforced server-side):
 *   - SUPER_ADMIN / ADMIN  → all tabs EXCEPT Event Prep (they use the
 *                            full event editor at /admin/events/[id])
 *   - CO_HOST              → Speakers, Registrants, Door Check-in,
 *                            Event dashboard, Mockups, Event Prep
 *                            (event-scoped data only — server filters)
 *   - SPEAKER              → Event Prep ONLY (read-only view of events
 *                            they are speaking at)
 *   - MEMBER               → no tabs (shouldn't see admin nav at all)
 */
export type AdminTabDef = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: string;
};

export function AdminTabsClient({ tabs }: { tabs: AdminTabDef[] }) {
  const pathname = usePathname() || "/admin";

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

  if (tabs.length === 0) return null;

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

/**
 * The full master list of admin tabs. The server wrapper picks which
 * ones to show based on the user's role.
 *
 * IMPORTANT: When adding a new tab, also update the role-filtering
 * logic in admin-tabs.tsx (the server wrapper).
 */
export const ALL_TABS: AdminTabDef[] = [
  { href: "/admin", label: "Members", icon: Users, match: "/admin" },
  { href: "/admin/speakers", label: "Speakers", icon: Mic2, match: "/admin/speakers" },
  { href: "/admin/registrants", label: "Registrants", icon: ClipboardList, match: "/admin/registrants" },
  { href: "/admin/events", label: "Events", icon: CalendarDays, match: "/admin/events" },
  { href: "/admin/events/new", label: "New event", icon: CalendarPlus, match: "/admin/events/new" },
  { href: "/admin/check-in", label: "Door Check-in", icon: QrCode, match: "/admin/check-in" },
  { href: "/admin/dashboard", label: "Dashboard", icon: BarChart3, match: "/admin/dashboard" },
  { href: "/admin/dashboard/event-dashboard", label: "Event dashboard", icon: CalendarRange, match: "/admin/dashboard/event-dashboard" },
  { href: "/admin/email", label: "Email", icon: Mail, match: "/admin/email" },
  { href: "/admin/images", label: "Images", icon: Images, match: "/admin/images" },
  { href: "/admin/knowledge-base", label: "Knowledge Base", icon: BookOpen, match: "/admin/knowledge-base" },
  { href: "/admin/mockups", label: "Mockups", icon: LayoutTemplate, match: "/admin/mockups" },
  { href: "/admin/event-prep", label: "Event Prep", icon: ClipboardCheck, match: "/admin/event-prep" },
];
