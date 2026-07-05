"use client";

/**
 * EmailAdminNav — shared top-level navigation for the email admin pages.
 *
 * Used by both:
 *   - /admin/email        (Campaigns active)
 *   - /admin/email/flows  (Flows active → reveals Flows/Audiences/Templates submenu)
 *
 * Top-level tabs:
 *   Campaigns   → /admin/email
 *   Orchestrator (with "New" badge) → /admin/email?tab=orchestrator
 *   Flows        (with "New" badge) → /admin/email/flows
 *
 * When active = "flows", a secondary submenu renders with:
 *   Flows · Audiences · Templates
 * (these are local tabs on the flows page — the caller passes an onSubmenu
 *  callback so the page can switch its own local tab state).
 */

import * as React from "react";
import Link from "next/link";
import { Mail, Workflow, Users, FileText, Sparkles } from "lucide-react";

export type EmailAdminTab = "campaigns" | "orchestrator" | "flows";
export type FlowSubtab = "flows" | "audiences" | "templates";

type Props = {
  /** Currently-active top-level tab. */
  active: EmailAdminTab;
  /** When active === "flows", which submenu item is highlighted. */
  flowSubtab?: FlowSubtab;
  /** Callback when the user clicks a Flows submenu item.
   *  If omitted, the nav manages subtab state internally and dispatches
   *  a window event ("flow-subtab-change") that other components can
   *  listen for. This lets the nav be used from a server component. */
  onFlowSubtabChange?: (sub: FlowSubtab) => void;
  /** Optional right-side actions (e.g. "New flow" button). */
  rightSlot?: React.ReactNode;
};

export function EmailAdminNav({
  active,
  flowSubtab: flowSubtabProp,
  onFlowSubtabChange,
  rightSlot,
}: Props) {
  const [internalSubtab, setInternalSubtab] = React.useState<FlowSubtab>("flows");
  const flowSubtab = flowSubtabProp ?? internalSubtab;

  const handleSubtabChange = (sub: FlowSubtab) => {
    setInternalSubtab(sub);
    onFlowSubtabChange?.(sub);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("flow-subtab-change", { detail: sub }));
    }
  };

  return (
    <div className="mb-6">
      {/* Top-level nav row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-200 pb-3">
        <nav className="flex flex-wrap items-center gap-1">
          <TopTab
            as="link"
            href="/admin/email"
            active={active === "campaigns"}
            icon={<Mail className="h-3.5 w-3.5" />}
            label="Campaigns"
          />
          <TopTab
            as="link"
            href="/admin/email?tab=orchestrator"
            active={active === "orchestrator"}
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Orchestrator"
            badge="New"
            badgeColor="bg-[#FF005A] text-white"
          />
          <TopTab
            as="link"
            href="/admin/email/flows"
            active={active === "flows"}
            icon={<Workflow className="h-3.5 w-3.5" />}
            label="Flows"
            badge="New"
            badgeColor="bg-[#00E6FF] text-black"
          />
        </nav>

        {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
      </div>

      {/* Submenu — only shown when Flows is the active top tab.
          Renders whether or not onFlowSubtabChange is provided. When the
          callback is omitted, the nav manages state internally + dispatches
          a window event so other client components can react. */}
      {active === "flows" && (
        <div className="mt-3 flex gap-1">
          <SubTabButton
            active={flowSubtab === "flows"}
            onClick={() => handleSubtabChange("flows")}
            icon={<Workflow className="h-3.5 w-3.5" />}
            label="Flows"
          />
          <SubTabButton
            active={flowSubtab === "audiences"}
            onClick={() => handleSubtabChange("audiences")}
            icon={<Users className="h-3.5 w-3.5" />}
            label="Audiences"
          />
          <SubTabButton
            active={flowSubtab === "templates"}
            onClick={() => handleSubtabChange("templates")}
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Templates"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TopTab({
  as,
  href,
  active,
  icon,
  label,
  badge,
  badgeColor,
}: {
  as: "link";
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeColor?: string;
}) {
  const cls = `inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors rounded-t-md ${
    active
      ? "border-b-2 border-[#FF005A] text-[#FF005A] bg-[#FF005A]/5"
      : "border-b-2 border-transparent text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
  }`;
  return (
    <Link href={href} className={cls}>
      {icon}
      {label}
      {badge && (
        <span
          className={`ml-1.5 h-4 px-1 text-[0.55rem] font-bold uppercase tracking-wider border-0 rounded ${badgeColor || "bg-[#FF005A] text-white"}`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-b-2 border-[#FF005A] text-[#FF005A]"
          : "border-b-2 border-transparent text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
