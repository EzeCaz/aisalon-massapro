/**
 * Shared TextStyleRow — extracted from meet-the-speaker-form-view.tsx
 * so all mockup form views (meet-the-speaker, speaker-intro,
 * event-profile, agenda-profile) can reuse the same UI for
 * "font size + color + align L/C/R" on each text section.
 *
 * Per user spec 2026-07-02:
 *   - "I should be able to select the font size and color of each
 *      specific text section".
 *   - "Add to all mockups and all text fields and sections the align
 *      left, center or right options, and also font size to each text
 *      field".
 */

import * as React from "react";

export type TextStyle = {
  /** Font size in px. When undefined, the canvas uses the section default. */
  fontSize?: number;
  /** Text color (any CSS color string). When undefined, the section default. */
  color?: string;
  /** Horizontal alignment: "left" | "center" | "right". When undefined, the
   *  section's default alignment is used. */
  align?: "left" | "center" | "right";
};

/**
 * Form row that lets the user edit font size + color + align L/C/R
 * for a single text section.
 *
 * When the inputs are empty, the canvas falls back to the default font
 * size + color + align for that section.
 */
export function TextStyleRow({
  label,
  fontSize,
  fontColor,
  align,
  defaultFontSize,
  onChange,
}: {
  label: string;
  fontSize?: number;
  fontColor?: string;
  align?: "left" | "center" | "right";
  defaultFontSize: number;
  onChange: (
    fontSize: number | undefined,
    fontColor: string | undefined,
    align: "left" | "center" | "right" | undefined,
  ) => void;
}) {
  return (
    <div className="rounded-md border border-black/10 bg-black/[0.02] p-2 space-y-1.5">
      <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80">
        {label}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <label className="inline-flex items-center gap-1.5">
          <span className="text-[0.6rem] font-semibold text-black/80 w-8">Size</span>
          <input
            type="number"
            step="1"
            min="1"
            placeholder={String(defaultFontSize)}
            value={fontSize ?? ""}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange(n, fontColor, align);
              else onChange(undefined, fontColor, align);
            }}
            className="form-input w-20"
            title={`Font size in px (default: ${defaultFontSize}px). Empty = use default.`}
          />
          <span className="text-[0.55rem] font-mono text-black/80">px</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <span className="text-[0.6rem] font-semibold text-black/80 w-8">Color</span>
          <input
            type="color"
            value={fontColor ?? "#000000"}
            onChange={(e) => onChange(fontSize, e.target.value, align)}
            className="h-7 w-9 rounded border border-black/15 cursor-pointer"
            title="Text color (click to pick). Default = black or theme color."
          />
          <button
            type="button"
            onClick={() => onChange(fontSize, undefined, align)}
            className="text-[0.55rem] text-black/50 hover:text-black underline"
            title="Reset color to default"
          >
            reset
          </button>
        </label>
      </div>
      {/* Align L / C / R — per user spec 2026-07-02. */}
      <div className="flex items-center gap-1">
        <span className="text-[0.6rem] font-semibold text-black/80 w-8">Align</span>
        {(["left", "center", "right"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() =>
              onChange(fontSize, fontColor, align === a ? undefined : a)
            }
            className={`px-2 py-0.5 text-[0.55rem] font-semibold rounded border transition ${
              (align ?? "left") === a
                ? "border-[#FF005A] bg-[#FF005A]/10 text-[#FF005A]"
                : "border-black/15 bg-white text-black/80 hover:bg-black/5"
            }`}
            title={`Align ${a}`}
          >
            {a === "left" ? "⟵ L" : a === "center" ? "↔ C" : "⟶ R"}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Helper for canvases: merge a section's TextStyle with its default
 * font size / color / align. Returns concrete values ready to apply
 * to inline CSS.
 */
export function resolveTextStyle(
  style: TextStyle | undefined,
  defaults: {
    fontSize: number;
    color: string;
    align: "left" | "center" | "right";
  },
): { fontSize: number; color: string; align: "left" | "center" | "right" } {
  return {
    fontSize: style?.fontSize ?? defaults.fontSize,
    color: style?.color ?? defaults.color,
    align: style?.align ?? defaults.align,
  };
}
