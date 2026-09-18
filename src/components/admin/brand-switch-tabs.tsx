"use client";

import * as React from "react";

/**
 * BrandSwitchTabs — the Coma / AI Salon switcher used across the admin
 * sections that must be SEPARATED per brand (user spec 2026-09-19):
 * Knowledge Base, Images, Email Templates, and Mockups.
 *
 * Controlled component — the page owns the active brand state and reacts
 * to onChange (refetch, navigation, or re-render with brand-scoped data).
 */

export type AdminBrandSlug = "coma" | "aisalon";

export const ADMIN_BRANDS: Array<{
  slug: AdminBrandSlug;
  label: string;
  /** Small color dot identifying the brand. */
  dot: string;
}> = [
  { slug: "coma", label: "Coma", dot: "#F5A623" },
  { slug: "aisalon", label: "AI Salon", dot: "#FF005A" },
];

export function BrandSwitchTabs({
  active,
  onChange,
  /** Optional extra note rendered next to the tabs (e.g. "legacy" hint). */
  hint,
}: {
  active: AdminBrandSlug;
  onChange: (brand: AdminBrandSlug) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div
        role="tablist"
        aria-label="Brand"
        className="inline-flex rounded-lg border border-black/15 bg-white p-1"
      >
        {ADMIN_BRANDS.map((b) => {
          const isActive = b.slug === active;
          return (
            <button
              key={b.slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(b.slug)}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-black text-white"
                  : "text-black/70 hover:text-black hover:bg-black/5"
              }`}
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: b.dot }}
              />
              {b.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-xs text-black/50">{hint}</p>}
    </div>
  );
}
