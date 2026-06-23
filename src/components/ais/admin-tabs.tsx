"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Mic2,
  ClipboardList,
  CalendarPlus,
  BarChart3,
  Mail,
} from "lucide-react";

/**
 * AdminTabs — sticky horizontal nav for the admin area.
 *
 * Renders the 6 admin sub-pages as tabs, highlighting whichever one
 * is currently active (matched by path prefix). Used at the top of
 * every /admin/* page so the admin can jump between surfaces without
 * going back to /admin.
 *
 *   /admin              → Members (the community table)
 *   /admin/speakers     → Speakers
 *   /admin/registrants  → Registrants (RSVPs across events)
 *   /admin/events/new   → New event
 *   /admin/dashboard    → Dashboard
 *   /admin/email        → Email campaigns
 */
const TABS = [
  { href: "/admin", label: "Members", icon: Users, match: "/admin" },
  { href: "/admin/speakers", label: "Speakers", icon: Mic2, match: "/admin/speakers" },
  { href: "/admin/registrants", label: "Registrants", icon: ClipboardList, match: "/admin/registrants" },
  { href: "/admin/events/new", label: "New event", icon: CalendarPlus, match: "/admin/events/new" },
  { href: "/admin/dashboard", label: "Dashboard", icon: BarChart3, match: "/admin/dashboard" },
  { href: "/admin/email", label: "Email", icon: Mail, match: "/admin/email" },
] as const;

export function AdminTabs() {
  const pathname = usePathname() || "/admin";

  const isActive = (match: string) => {
    if (match === "/admin") {
      // Members tab is active only on /admin exactly — deeper admin
      // paths override it.
      return pathname === "/admin";
    }
    return pathname === match || pathname.startsWith(match + "/");
  };

  return (
    <nav
      aria-label="Admin sections"
      className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mb-8 border-b border-black/10 bg-white/95 backdrop-blur"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="flex items-center gap-1 overflow-x-auto py-2 text-sm">
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
