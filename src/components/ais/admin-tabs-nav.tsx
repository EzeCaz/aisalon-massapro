"use client";

import Link from "next/link";
import {
  BarChart3,
  CalendarPlus,
  ClipboardList,
  Mail,
  Mic,
  Users,
} from "lucide-react";

/**
 * AdminTabsNav — pure presentational client component that renders the
 * persistent admin tab bar. Split out from AdminTabs (server) so that
 * client-side admin views (e.g. the email composer / stats sub-views
 * inside EmailDashboardClient) can also render the tab bar without
 * needing to call the database.
 *
 * The Members tab carries a count badge when `membersCount` is provided.
 */

export type AdminTabKey =
  | "members"
  | "speakers"
  | "registrants"
  | "create-event"
  | "dashboard"
  | "email";

type TabDef = {
  key: AdminTabKey;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  highlight?: boolean;
};

const TABS: TabDef[] = [
  { key: "members", href: "/admin", icon: Users, label: "Members" },
  { key: "speakers", href: "/admin/speakers", icon: Mic, label: "Speakers" },
  { key: "registrants", href: "/admin/registrants", icon: ClipboardList, label: "Registrants" },
  { key: "create-event", href: "/admin/events/new", icon: CalendarPlus, label: "Create event", highlight: true },
  { key: "dashboard", href: "/admin/dashboard", icon: BarChart3, label: "Dashboard" },
  { key: "email", href: "/admin/email", icon: Mail, label: "Email campaigns" },
];

export function AdminTabsNav({
  active,
  membersCount,
}: {
  active: AdminTabKey;
  membersCount?: number;
}) {
  return (
    <nav
      aria-label="Admin sections"
      className="mb-8 flex flex-wrap gap-2 border-b border-black/10 pb-3 sticky top-0 z-30 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              isActive
                ? "bg-black text-white"
                : tab.highlight
                  ? "bg-[#FF005A]/10 text-[#FF005A] hover:bg-[#FF005A]/20"
                  : "text-black/80 hover:text-black hover:bg-black/5"
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
            {tab.key === "members" && typeof membersCount === "number" && (
              <span
                className={`ml-1 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-white/20 text-white" : "bg-black/10 text-black/80"
                }`}
              >
                {membersCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
