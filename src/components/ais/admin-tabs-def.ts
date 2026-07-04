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
import { ROLES } from "@/lib/permissions";

/**
 * admin-tabs-def — shared, framework-agnostic definition of the admin
 * tab list AND the role-filtering logic.
 *
 * WHY THIS FILE EXISTS:
 * Previously `ALL_TABS` lived in `admin-tabs-client.tsx` ("use client")
 * and was imported by `admin-tabs.tsx` (server component) for
 * role-filtering. Two problems:
 *
 *   1. Turbopack RSC boundary: named exports (other than React
 *      components) from "use client" modules are stubbed on the
 *      server, so `ALL_TABS` was `undefined` on the server and
 *      `ALL_TABS.filter(...)` threw "ALL_TABS.filter is not a function".
 *
 *   2. Even if we moved `ALL_TABS` to a plain .ts file (no "use
 *      client"), the server would then try to pass the filtered
 *      `tabs` array — which contains React component refs (lucide
 *      `forwardRef` icons) — as a prop to the client component.
 *      React cannot serialize functions/components across the RSC
 *      boundary, so it threw "Functions cannot be passed directly to
 *      Client Components".
 *
 * Fix: keep `ALL_TABS` and `filterTabsByRole` in this plain .ts
 * module. Both server and client can import it. The SERVER component
 * passes only the `role` string (serializable) to the CLIENT
 * component, which calls `filterTabsByRole(role)` itself and renders
 * the tabs.
 */
export type AdminTabDef = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: string;
};

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

/**
 * Pick which admin tabs a given role should see.
 *
 * The matching is intentionally explicit (a switch + Set lookup) so
 * adding a new tab requires a deliberate decision about who sees it.
 */
export function filterTabsByRole(
  role: string,
  deps: {
    canSeeAdminNav: (r: string) => boolean;
    normalizeRole: (r: string) => string;
  }
): AdminTabDef[] {
  const r = deps.normalizeRole(role);

  // MEMBER sees nothing — they shouldn't be in the admin area at all.
  if (!deps.canSeeAdminNav(r)) return [];

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
