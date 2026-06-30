"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
} from "lucide-react";

/**
 * AdminTabs — sticky horizontal nav for the admin area.
 *
 * Renders the admin sub-pages as tabs, highlighting whichever one
 * is currently active (matched by path prefix). Used at the top of
 * every /admin/* page so the admin can jump between surfaces without
 * going back to /admin.
 *
 * Role filtering (V5.15 RBAC):
 *   - SUPER_ADMIN / ADMIN  → all 12 tabs
 *   - CO_HOST              → event-scoped tabs only (Speakers, Registrants,
 *                            Door Check-in, Event dashboard, Mockups)
 *   - SPEAKER / MEMBER     → no tabs (Speakers access Event Prep via the
 *                            🎯 tab on /events/[slug], not via /admin)
 *
 * NOTE (V5.15.1 regression fix): the previous version of this file was
 * a server component that did getServerSession() + db.user.findUnique().
 * That worked locally but on Vercel the server component silently
 * returned null for some users, making the entire admin nav disappear.
 * This client-component version uses useSession() (JWT-only, no DB
 * lookup) which is reliable in all deployment environments.
 *
 * Routes covered:
 *   /admin                                → Members (the community table)
 *   /admin/speakers                       → Speakers
 *   /admin/registrants                    → Registrants (RSVPs across events)
 *   /admin/events                         → Events (list + edit existing + co-hosts)
 *   /admin/events/new                     → New event
 *   /admin/check-in                       → Door Check-in (cross-event code lookup kiosk)
 *   /admin/dashboard                      → Member Dashboard
 *   /admin/dashboard/event-dashboard      → Event Dashboard (per-event analytics)
 *   /admin/email                          → Email campaigns
 *   /admin/images                         → Brand Images (hidden .images/ folder)
 *   /admin/knowledge-base                 → Knowledge Base (curated chapter resources)
 *   /admin/mockups                        → Mockups (brand assets + templates + system prompt)
 */
type AdminTabDef = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: string;
};

const ALL_TABS: AdminTabDef[] = [
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
];

/**
 * Pick which admin tabs a given role should see.
 * The matching is intentionally explicit so adding a new tab requires
 * a deliberate decision about who sees it.
 */
function filterTabsByRole(role: string | null | undefined): AdminTabDef[] {
  const r = (role || "").toUpperCase();

  // CO_HOST sees the event-scoped tabs only.
  if (r === "CO_HOST") {
    const allowed = new Set<string>([
      "/admin/speakers",
      "/admin/registrants",
      "/admin/check-in",
      "/admin/dashboard/event-dashboard",
      "/admin/mockups",
    ]);
    return ALL_TABS.filter((t) => allowed.has(t.href));
  }

  // SUPER_ADMIN + ADMIN see everything.
  if (r === "SUPER_ADMIN" || r === "ADMIN") {
    return ALL_TABS;
  }

  // SPEAKER + MEMBER + unknown → no tabs.
  return [];
}

export function AdminTabs() {
  const pathname = usePathname() || "/admin";
  const { data: session } = useSession();

  // session.user is augmented with `role` in the JWT/session callback
  // (see src/lib/auth.ts). The next-auth types don't know about it, so
  // cast through unknown.
  const role = (session?.user as unknown as { role?: string } | undefined)?.role;
  const tabs = filterTabsByRole(role);
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
