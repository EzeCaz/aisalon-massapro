"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  BarChart3,
  Mic2,
  MessageSquareHeart,
  CalendarCheck,
} from "lucide-react";

/**
 * Persistent admin navigation — renders a horizontal strip of "cards"
 * linking to every admin section. Shown on EVERY admin page so the
 * admin never has to click "Back to admin" just to switch sections.
 *
 * The card matching the current route is visually highlighted as active.
 *
 * Cards (in display order):
 *   1. Community & events (Main)  → /admin
 *   2. Member dashboard           → /admin/dashboard
 *   3. Manage speakers            → /admin/speakers
 *   4. Testimonials               → /admin/testimonials
 *   5. Registrations              → /admin/registrations
 */
const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  sublabel?: string;
  icon: typeof LayoutGrid;
}> = [
  {
    href: "/admin",
    label: "Community & events",
    sublabel: "Main",
    icon: LayoutGrid,
  },
  {
    href: "/admin/dashboard",
    label: "Member dashboard",
    icon: BarChart3,
  },
  {
    href: "/admin/speakers",
    label: "Manage speakers",
    icon: Mic2,
  },
  {
    href: "/admin/testimonials",
    label: "Testimonials",
    icon: MessageSquareHeart,
  },
  {
    href: "/admin/registrations",
    label: "Registrations",
    icon: CalendarCheck,
  },
];

export function AdminNavCards() {
  const pathname = usePathname() ?? "";

  // Active when pathname is exactly the href, OR (for non-root hrefs)
  // pathname starts with the href.
  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Admin sections"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-8"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "group relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ais-lift",
              active
                ? "border-[#FF005A] bg-[#FF005A]/[0.06] text-black"
                : "border-black/10 bg-white text-black hover:border-black/25 hover:bg-black/[0.02]",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                active
                  ? "bg-[#FF005A] text-white"
                  : "bg-black/[0.04] text-black/60 group-hover:bg-black/[0.08]",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex flex-col">
              <span className="text-[0.8rem] font-semibold leading-tight truncate">
                {item.label}
              </span>
              {item.sublabel ? (
                <span className="text-[0.65rem] font-medium uppercase tracking-widest text-black/40">
                  {item.sublabel}
                </span>
              ) : null}
            </span>
            {active ? (
              <span
                aria-hidden
                className="absolute -top-px -right-px h-2 w-2 rounded-full bg-[#FF005A]"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
