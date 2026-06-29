"use client";

import { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * AI Salon brand book palette — the only colors shown by default in the
 * gradient picker. Per user spec 2026-06-30: "show the color patch window
 * to select, with a filter on showing only brand book color palette called
 * AI Salon Colors, if and another small option as a checkbox to show all
 * colors not only AI Salon colors".
 *
 * Sourced from src/app/globals.css → --color-ais-* tokens.
 */
export const AI_SALON_COLORS: { hex: string; name: string }[] = [
  { hex: "#000000", name: "AIS Black" },
  { hex: "#FFFFFF", name: "AIS White" },
  { hex: "#FF005A", name: "AIS Red" },
  { hex: "#00E6FF", name: "AIS Cyan" },
  { hex: "#FFAC30", name: "AIS Accent 1 (Orange)" },
  { hex: "#007E72", name: "AIS Accent 2 (Teal)" },
  { hex: "#004F98", name: "AIS Accent 3 (Blue)" },
  { hex: "#820A7D", name: "AIS Accent 4 (Purple)" },
];

type Props = {
  /** Current gradient colors (e.g. ["#6A5ACD", "#FF005C"]). */
  colors: string[];
  /** Called with the new array whenever the user adds / removes / reorders. */
  onChange: (next: string[]) => void;
};

/**
 * GradientColorPicker — palette-driven color picker for the hero overlay
 * gradient on every mockup editor.
 *
 * Renders three rows:
 *   1. The existing comma-separated text input (power-user escape hatch).
 *   2. A "Current colors" chip row — each chip is a removable swatch.
 *   3. The AI Salon Colors palette grid. Clicking a swatch APPENDS it.
 *   4. A checkbox "Show all colors". When checked, a native
 *      `<input type="color">` appears, letting the user append any
 *      arbitrary hex.
 *
 * Used by meet-the-speaker / speaker-intro / event-profile form views
 * (the three editors that have a `heroOverlay.gradientColors` field).
 */
export function GradientColorPicker({ colors, onChange }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [customColor, setCustomColor] = useState("#6A5ACD");

  const append = useCallback(
    (hex: string) => {
      const normalized = hex.trim().toUpperCase();
      if (!normalized) return;
      onChange([...colors, normalized]);
    },
    [colors, onChange],
  );

  const removeAt = useCallback(
    (idx: number) => {
      const next = colors.slice();
      next.splice(idx, 1);
      onChange(next);
    },
    [colors, onChange],
  );

  const updateAt = useCallback(
    (idx: number, hex: string) => {
      const next = colors.slice();
      next[idx] = hex;
      onChange(next);
    },
    [colors, onChange],
  );

  // Sync the comma-separated text input. Editing it replaces the whole
  // array (matches the original behavior — keeps the power-user flow).
  const textValue = colors.join(", ");

  return (
    <div className="space-y-2">
      {/* Comma-separated text input (original control, kept for power users) */}
      <input
        type="text"
        value={textValue}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        className="form-input"
        placeholder="#FF005A, #00E6FF"
      />

      {/* Current colors — chip row with per-chip remove + native picker */}
      {colors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {colors.map((c, idx) => (
            <div
              key={`cur-${idx}-${c}`}
              className="group relative flex items-center gap-1 rounded border border-black/15 bg-white pl-0.5 pr-1.5 py-0.5"
              title={c}
            >
              <input
                type="color"
                value={c}
                onChange={(e) => updateAt(idx, e.target.value.toUpperCase())}
                className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                title="Click to change this color"
              />
              <span className="text-[0.6rem] font-mono text-black/70">{c.toUpperCase()}</span>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="ml-0.5 rounded p-0.5 text-black/40 hover:bg-red-50 hover:text-red-500"
                title="Remove this color"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* AI Salon Colors palette */}
      <div className="rounded-md border border-black/10 bg-black/[0.02] p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-black/55">
            AI Salon Colors
          </div>
          <label className="flex items-center gap-1 text-[0.6rem] text-black/60 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="h-2.5 w-2.5 cursor-pointer"
            />
            Show all colors
          </label>
        </div>
        <div className="grid grid-cols-8 gap-1">
          {AI_SALON_COLORS.map((sw) => (
            <button
              key={sw.hex}
              type="button"
              onClick={() => append(sw.hex)}
              title={`${sw.name} — click to append`}
              className="aspect-square rounded border border-black/15 hover:scale-110 hover:z-10 hover:shadow-md transition-transform"
              style={{ backgroundColor: sw.hex }}
              aria-label={`Append ${sw.name}`}
            />
          ))}
          {showAll && (
            <label
              title="Pick any custom color"
              className="aspect-square rounded border border-dashed border-black/30 bg-white hover:bg-black/5 cursor-pointer flex items-center justify-center"
            >
              <Plus className="h-3 w-3 text-black/50" />
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value.toUpperCase());
                }}
                // Append on change of the native picker
                onBlur={() => {
                  if (customColor && !colors.includes(customColor)) {
                    append(customColor);
                  }
                }}
                className="absolute opacity-0 w-0 h-0"
              />
            </label>
          )}
        </div>
        {showAll && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value.toUpperCase())}
              className="h-5 w-7 cursor-pointer rounded border border-black/15"
            />
            <span className="text-[0.6rem] font-mono text-black/60">{customColor}</span>
            <button
              type="button"
              onClick={() => append(customColor)}
              className="ml-auto rounded border border-black/15 bg-white px-1.5 py-0.5 text-[0.6rem] font-semibold text-black hover:bg-black/5"
              title="Append this custom color"
            >
              + Add
            </button>
          </div>
        )}
        <p className="text-[0.55rem] text-black/40 leading-tight">
          Click a swatch to append. Use the chips above to edit or remove.
        </p>
      </div>
    </div>
  );
}
