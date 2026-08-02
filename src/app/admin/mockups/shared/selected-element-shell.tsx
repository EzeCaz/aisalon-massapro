"use client";

/**
 * SelectedElementShell — the sleek chrome (header bar + collapse + close +
 * LIVE indicator) for the "Selected Element" panel that appears at the top
 * of the left form column when the user clicks a specific asset / section
 * on the canvas.
 *
 * PER USER SPEC 2026-08-02:
 *   "make sure the entire form is compressed, and when clicking the specific
 *    asset we want to edit, generate a new tab on the left of the mockup,
 *    above the entire form editor, only the specific edit details of the
 *    object/asset i am editing, make it interactive, fast, and looking with
 *    a sleek design but on the same style as the current editor"
 *
 * This file contains the SHARED shell + the compact field primitives that
 * every mockup's per-asset panel reuses. Each mockup has its own panel file
 * (e.g. `meet-the-speaker-selected-panel.tsx`) that renders this shell with
 * content-specific body content per selectedId.
 *
 * The shell:
 *   - Pink gradient header bar (matching the editor's #FF005A accent).
 *   - LIVE indicator (green pulse dot) showing the panel updates live as
 *     the user clicks different elements.
 *   - Click header to collapse / expand the body.
 *   - X button to deselect (close the panel).
 *   - Body container with max-height + vertical scroll so the form below
 *     is never fully obscured even for long field blocks.
 *   - Slide-down animation when the panel first appears.
 *
 * The mini primitives (MiniField / MiniInput / MiniSelect / MiniTextarea /
 * ReplaceButton / ImagePreview) are compact, denser versions of the
 * form-view's Section / Field / SubCard helpers — smaller padding, tighter
 * typography — so they fit in the narrow 420px left column without
 * overwhelming the canvas.
 */

import { useCallback, useState, type ReactNode } from "react";
import { ChevronDown, X, ImageIcon, MousePointerClick } from "lucide-react";

// ----------------------------------------------------------------------------
// Shell
// ----------------------------------------------------------------------------
type ShellProps = {
  /** Human-readable label for the selected element (e.g. "Header", "QR Code"). */
  label: string;
  /** Called when the user clicks the X button — should clear selectedId. */
  onDeselect: () => void;
  /** Body content — the content-specific field blocks for this element. */
  children: ReactNode;
};

export function SelectedElementShell({ label, onDeselect, children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="rounded-lg overflow-hidden border-2 border-[#FF005A] bg-white shadow-[0_8px_24px_rgba(255,0,90,0.18)]"
      style={{ animation: "selectedPanelIn 180ms ease-out" }}
    >
      <style>{`@keyframes selectedPanelIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Header bar — pink gradient, click to collapse/expand */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        style={{
          background: "linear-gradient(90deg, #FF005A 0%, #CC0048 100%)",
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MousePointerClick className="h-3.5 w-3.5 text-white shrink-0" />
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-white truncate">
            Selected: {label}
          </span>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.55rem] font-bold uppercase tracking-wider"
            style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
            title="This panel updates live as you click different elements on the canvas"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#27C93F] animate-pulse" />
            LIVE
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ChevronDown
            className={`h-3.5 w-3.5 text-white transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeselect();
            }}
            className="ml-1 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-white/20 text-white"
            title="Deselect (close this panel)"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Body — content-specific fields */}
      {!collapsed && (
        <div className="p-3 bg-white max-h-[480px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Compact field primitives — denser than the form-view's helpers so they fit
// in the narrow 420px left column.
// ----------------------------------------------------------------------------

export function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[0.62rem] font-bold uppercase tracking-wider text-black/70 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

export function MiniInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.78rem] text-black outline-none focus:border-[#FF005A] focus:ring-1 focus:ring-[#FF005A]/30 ${props.className ?? ""}`}
    />
  );
}

export function MiniSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.78rem] text-black outline-none focus:border-[#FF005A] focus:ring-1 focus:ring-[#FF005A]/30 ${props.className ?? ""}`}
    />
  );
}

export function MiniTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.78rem] text-black outline-none focus:border-[#FF005A] focus:ring-1 focus:ring-[#FF005A]/30 resize-y ${props.className ?? ""}`}
    />
  );
}

/** Compact "Replace from library" button — opens the image picker modal. */
export function ReplaceButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded bg-[#0066FF] text-white px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wider hover:bg-[#0052CC]"
    >
      <ImageIcon className="h-3 w-3" />
      {label ?? "Replace"}
    </button>
  );
}

/** Small image preview box — shows the current image so the user can see
 *  what they're editing. */
export function ImagePreview({ src, alt }: { src: string; alt: string }) {
  if (!src) return null;
  return (
    <div className="relative w-full h-16 rounded border border-black/15 overflow-hidden bg-black/[0.04]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}

/** Helper hook: stable update function that clones data, applies a recipe,
 *  and calls onChange. Avoids re-renders by depending only on data + onChange. */
export function useUpdate<TData>(data: TData, onChange: (next: TData) => void) {
  return useCallback(
    (recipe: (draft: TData) => void) => {
      const next: TData = JSON.parse(JSON.stringify(data));
      recipe(next);
      onChange(next);
    },
    [data, onChange],
  );
}

/** Generic "no fields" placeholder shown when a panel doesn't have any
 *  content-specific fields for the selectedId. */
export function NoFieldsHint({ selectedId }: { selectedId: string }) {
  return (
    <div className="text-[0.7rem] text-black/60 italic">
      No content fields available for &ldquo;{selectedId}&rdquo;. Use the
      full form below to edit this section.
    </div>
  );
}
