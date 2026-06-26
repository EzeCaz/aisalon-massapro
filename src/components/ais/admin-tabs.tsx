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
} from "lucide-react";

/**
 * AdminTabs — sticky horizontal nav for the admin area.
 *
 * Renders the admin sub-pages as tabs, highlighting whichever one
 * is currently active (matched by path prefix). Used at the top of
 * every /admin/* page so the admin can jump between surfaces without
 * going back to /admin.
 *
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
const TABS = [
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
] as const;

export function AdminTabs() {
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
          {TABS.map(({ href, label, icon: Icon }) => {
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
