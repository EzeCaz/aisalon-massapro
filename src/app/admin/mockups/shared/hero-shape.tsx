"use client";

/**
 * HeroShape — shared SVG component that renders a geometric shape with
 * either a solid color fill or a multi-stop linear gradient fill.
 *
 * Used by:
 *   - Speaker Intro Style 1 (replaces the legacy "Show triangle overlay"
 *     — the overlay now supports all 13 shape types + solid/gradient fill
 *     mode + gradient direction control). PER USER SPEC 2026-07-31 (TSK-0028).
 *   - Speaker Intro Style 2 (the hero-shape section behind the hero image).
 *   - Speaker Intro Style 3 (identical to Style 1, including the shape
 *     overlay system).
 *
 * Supported shapes (PER USER SPEC 2026-07-31):
 *   2D: rectangle, square, circle, oval/ellipse, triangle, pentagon,
 *       hexagon, octagon
 *   3D: sphere (radial gradient), cube (3 faces), cone (triangle +
 *       ellipse base), cylinder (rect + 2 ellipses), pyramid (2 faces)
 *
 * The component is fully self-contained — it generates unique gradient
 * IDs per instance so multiple HeroShape instances can coexist on the
 * same canvas without gradient ID collisions.
 */

import type { CSSProperties } from "react";

// ---------------------------------------------------------------------------
// Types — exported so callers (types.ts, form views, canvases) can reuse.
// ---------------------------------------------------------------------------

export type HeroShapeType =
  | "none"
  | "legacy-triangle"
  | "rectangle"
  | "circle"
  | "oval"
  | "triangle"
  | "square"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "sphere"
  | "cube"
  | "cone"
  | "cylinder"
  | "pyramid";

export type HeroShapeFillMode = "solid" | "gradient";

/**
 * Unified shape config — used by both Style 1 (heroOverlay.shapeConfig)
 * and Style 2 (style2HeroGradient). When `fillMode` is "solid", only
 * `solidColor` is used; when "gradient", `colors` (2-5 stops) and
 * `direction` are used.
 */
export type HeroShapeConfig = {
  shape?: HeroShapeType;
  fillMode?: HeroShapeFillMode;
  /** Solid fill color (used when fillMode = "solid"). Default "#311B92". */
  solidColor?: string;
  /** Gradient color stops (used when fillMode = "gradient"). 2-5 stops. */
  colors?: string[];
  /** Gradient direction in degrees (0-360). 0 = left→right, 90 = top→bottom. Default 135. */
  direction?: number;
  /** Shape opacity (0-1). Default 0.9. */
  opacity?: number;
  /** Shape rotation in degrees (0-360). Default 0. */
  rotation?: number;
  /**
   * PER USER SPEC 2026-07-31 (TSK-0034): Position of the shape on the
   * canvas, as % from left/top. When undefined, the shape fills its
   * parent container (default behavior — shape is rendered inside the
   * hero container and inherits its position).
   *
   * When set, the shape is positioned ABSOLUTELY on the canvas (overriding
   * the parent container's position) — useful for Style 3 where the hero
   * overlay shape is a standalone rectangle that should be draggable
   * independently of the hero image.
   */
  pos?: { x: number; y: number };
  /**
   * PER USER SPEC 2026-07-31 (TSK-0034): Size of the shape's bounding
   * box, in canvas px. When undefined, the shape fills its parent
   * container. When set, the shape is sized to these dimensions.
   */
  boxSize?: { width?: number; height?: number };
  /**
   * PER USER SPEC 2026-07-31 (TSK-0034): Uniform scale multiplier
   * (1 = 100%). Applied via CSS transform on the shape wrapper, so it
   * scales BOTH the shape AND its content. Default 1.
   */
  scale?: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_HERO_SHAPES: {
  value: HeroShapeType;
  label: string;
  group: string;
}[] = [
  // PER USER SPEC 2026-07-31 (TSK-0034): "none" + "legacy-triangle" added
  // to the shape selector so the user can:
  //   - "none"             → render NO shape (clean hero image, no overlay)
  //   - "legacy-triangle"  → render the original Style 1 right-pointing
  //                          triangle SVG with the dual gradient layers
  //                          (tri-grad + tri-grad-2). This is the default
  //                          for Style 1.
  { value: "none", label: "None (no shape)", group: "Special" },
  { value: "legacy-triangle", label: "Triangle (default — legacy SVG)", group: "Special" },
  { value: "rectangle", label: "Rectangle", group: "2D" },
  { value: "square", label: "Square", group: "2D" },
  { value: "circle", label: "Circle", group: "2D" },
  { value: "oval", label: "Oval / Ellipse", group: "2D" },
  { value: "triangle", label: "Triangle (HeroShape polygon)", group: "2D" },
  { value: "pentagon", label: "Pentagon", group: "2D" },
  { value: "hexagon", label: "Hexagon", group: "2D" },
  { value: "octagon", label: "Octagon", group: "2D" },
  { value: "sphere", label: "Sphere", group: "3D" },
  { value: "cube", label: "Cube", group: "3D" },
  { value: "cone", label: "Cone", group: "3D" },
  { value: "cylinder", label: "Cylinder", group: "3D" },
  { value: "pyramid", label: "Pyramid", group: "3D" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Darken a hex color by a factor (0..1). Returns an rgb() string. */
function darkenHex(hex: string, factor: number): string {
  try {
    const h = hex.replace("#", "");
    const r = Math.round(parseInt(h.slice(0, 2), 16) * factor);
    const g = Math.round(parseInt(h.slice(2, 4), 16) * factor);
    const b = Math.round(parseInt(h.slice(4, 6), 16) * factor);
    return `rgb(${r},${g},${b})`;
  } catch {
    return hex;
  }
}

// Counter for unique gradient IDs (in case multiple HeroShape instances
// are rendered on the same page — each needs its own gradient def).
let heroShapeIdCounter = 0;
function nextHeroShapeId(): string {
  heroShapeIdCounter = (heroShapeIdCounter + 1) % 1000000;
  return `hero-shape-${heroShapeIdCounter}`;
}

// ---------------------------------------------------------------------------
// HeroShape component
// ---------------------------------------------------------------------------

/**
 * Renders a geometric shape with solid or gradient fill.
 *
 * The SVG fills its parent container (width: 100%, height: 100%). For
 * best results, the parent should have an explicit width/height.
 *
 * For "rectangle" and "oval" shapes, the SVG uses `preserveAspectRatio="none"`
 * so the shape stretches to fill the container. For all other shapes, it
 * uses "xMidYMid meet" so the shape stays proportional and centered.
 */
export function HeroShape({
  config,
  /** Override the config's individual fields if needed (rarely used). */
  shape: shapeOverride,
  colors: colorsOverride,
  direction: directionOverride,
  opacity: opacityOverride,
  rotation: rotationOverride,
  fillMode: fillModeOverride,
  solidColor: solidColorOverride,
}: {
  config?: HeroShapeConfig;
  shape?: HeroShapeType;
  colors?: string[];
  direction?: number;
  opacity?: number;
  rotation?: number;
  fillMode?: HeroShapeFillMode;
  solidColor?: string;
}) {
  const cfg = config ?? {};
  const shape: HeroShapeType = shapeOverride ?? cfg.shape ?? "rectangle";
  const fillMode: HeroShapeFillMode = fillModeOverride ?? cfg.fillMode ?? "gradient";
  const solidColor: string = solidColorOverride ?? cfg.solidColor ?? "#311B92";
  const colors: string[] = colorsOverride ?? cfg.colors ?? ["#311B92", "#0B0B2E"];
  const direction: number = directionOverride ?? cfg.direction ?? 135;
  const opacity: number = opacityOverride ?? cfg.opacity ?? 0.9;
  const rotation: number = rotationOverride ?? cfg.rotation ?? 0;

  // Unique IDs for this instance's gradients (avoid collisions when
  // multiple HeroShape SVGs are on the same page).
  const instanceId = nextHeroShapeId();
  const gradId = `${instanceId}-grad`;
  const radialId = `${instanceId}-radial`;

  // For solid fill mode, we use a single-stop "gradient" so all the shape
  // renderers can stay the same. Simpler than threading a fillMode check
  // through every shape case.
  const effectiveColors: string[] =
    fillMode === "solid" ? [solidColor, solidColor] : colors.length >= 2 ? colors : [colors[0] ?? solidColor, colors[0] ?? solidColor];

  const stops = effectiveColors.map((c, i) => ({
    offset: `${(i / Math.max(1, effectiveColors.length - 1)) * 100}%`,
    color: c,
  }));

  const wrapperStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    opacity,
    transform: `rotate(${rotation}deg)`,
    transformOrigin: "center center",
  };

  const commonDefs = (
    <defs>
      <linearGradient
        id={gradId}
        gradientTransform={`rotate(${direction} 0.5 0.5)`}
        x1="0"
        y1="0"
        x2="1"
        y2="0"
      >
        {stops.map((s, i) => (
          <stop key={`l${i}`} offset={s.offset} stopColor={s.color} />
        ))}
      </linearGradient>
      <radialGradient id={radialId} cx="0.35" cy="0.3" r="0.75">
        <stop offset="0%" stopColor={effectiveColors[0]} />
        <stop
          offset="60%"
          stopColor={effectiveColors[Math.min(1, effectiveColors.length - 1)]}
        />
        <stop offset="100%" stopColor={effectiveColors[effectiveColors.length - 1]} />
      </radialGradient>
    </defs>
  );

  // The fill URL — always uses gradId for 2D shapes (solid becomes a
  // 2-stop identical-color gradient, which visually equals a solid fill).
  // For 3D sphere, we use radialId.
  const fill = fillMode === "solid" ? solidColor : `url(#${gradId})`;

  switch (shape) {
    // ---- Special shapes (PER USER SPEC 2026-07-31 TSK-0034) ----
    case "none":
      // Render nothing — clean hero image, no overlay shape.
      return null;
    case "legacy-triangle": {
      // The original Style 1 right-pointing triangle SVG with the dual
      // gradient layers (tri-grad main + tri-grad-2 counter-triangle).
      // Identical to the legacy `data.heroOverlay.showTriangleOverlay`
      // rendering that was inline in speaker-intro-canvas.tsx before
      // TSK-0034 consolidated it into the HeroShape component.
      const grad1Id = `${instanceId}-tri-grad`;
      const grad2Id = `${instanceId}-tri-grad-2`;
      return (
        <svg
          style={wrapperStyle}
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id={grad1Id} x1="0%" y1="0%" x2="100%" y2="100%">
              {effectiveColors.map((c, i, arr) => (
                <stop
                  key={`g1-${i}`}
                  offset={`${(i / Math.max(1, arr.length - 1)) * 100}%`}
                  stopColor={c}
                  stopOpacity={opacity}
                />
              ))}
            </linearGradient>
            <linearGradient id={grad2Id} x1="100%" y1="0%" x2="0%" y2="100%">
              {effectiveColors.map((c, i, arr) => (
                <stop
                  key={`g2-${i}`}
                  offset={`${(i / Math.max(1, arr.length - 1)) * 100}%`}
                  stopColor={c}
                  stopOpacity={opacity * 0.7}
                />
              ))}
            </linearGradient>
          </defs>
          {/* Right-pointing large triangle covering ~60% of hero */}
          <polygon points="0,0 100,50 0,100" fill={`url(#${grad1Id})`} />
          {/* Smaller counter-triangle for geometric depth */}
          <polygon points="40,15 95,35 50,75" fill={`url(#${grad2Id})`} opacity={0.6} />
        </svg>
      );
    }
    // ---- 2D shapes ----
    case "rectangle":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="none">
          {commonDefs}
          <rect x="0" y="0" width="100" height="100" fill={fill} />
        </svg>
      );
    case "square":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <rect x="15" y="15" width="70" height="70" fill={fill} />
        </svg>
      );
    case "circle":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <circle cx="50" cy="50" r="50" fill={fill} />
        </svg>
      );
    case "oval":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="none">
          {commonDefs}
          <ellipse cx="50" cy="50" rx="50" ry="35" fill={fill} />
        </svg>
      );
    case "triangle":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <polygon points="50,2 98,98 2,98" fill={fill} />
        </svg>
      );
    case "pentagon":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <polygon points="50,2 98,38 80,98 20,98 2,38" fill={fill} />
        </svg>
      );
    case "hexagon":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <polygon points="25,2 75,2 98,50 75,98 25,98 2,50" fill={fill} />
        </svg>
      );
    case "octagon":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <polygon points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30" fill={fill} />
        </svg>
      );
    // ---- 3D shapes ----
    case "sphere":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <circle
            cx="50"
            cy="50"
            r="48"
            fill={fillMode === "solid" ? solidColor : `url(#${radialId})`}
          />
          <ellipse cx="38" cy="35" rx="12" ry="8" fill="rgba(255,255,255,0.18)" />
        </svg>
      );
    case "cube": {
      const c1 = effectiveColors[0];
      const c2 = effectiveColors[Math.min(1, effectiveColors.length - 1)];
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          {/* Top face */}
          <polygon points="50,5 90,25 50,45 10,25" fill={c1} />
          {/* Left face (darker) */}
          <polygon points="10,25 50,45 50,95 10,75" fill={darkenHex(c2, 0.7)} />
          {/* Right face */}
          <polygon points="90,25 50,45 50,95 90,75" fill={darkenHex(c2, 0.5)} />
        </svg>
      );
    }
    case "cone": {
      const c1 = effectiveColors[0];
      const c2 = effectiveColors[Math.min(1, effectiveColors.length - 1)];
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          {/* Cone body */}
          <polygon points="50,2 90,85 10,85" fill={fill} />
          {/* Base ellipse (darker) */}
          <ellipse cx="50" cy="85" rx="40" ry="10" fill={darkenHex(c2, 0.6)} />
          {/* Shading on left side */}
          <polygon points="50,2 10,85 30,85" fill={darkenHex(c1, 0.6)} opacity="0.5" />
        </svg>
      );
    }
    case "cylinder": {
      const c1 = effectiveColors[0];
      const c2 = effectiveColors[Math.min(1, effectiveColors.length - 1)];
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          {/* Body */}
          <rect x="20" y="15" width="60" height="70" fill={fill} />
          {/* Bottom ellipse (darker) */}
          <ellipse cx="50" cy="85" rx="30" ry="8" fill={darkenHex(c2, 0.6)} />
          {/* Top ellipse (lighter) */}
          <ellipse cx="50" cy="15" rx="30" ry="8" fill={c1} />
        </svg>
      );
    }
    case "pyramid": {
      const c1 = effectiveColors[0];
      const c2 = effectiveColors[Math.min(1, effectiveColors.length - 1)];
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          {/* Left face (lighter) */}
          <polygon points="50,5 50,95 5,95" fill={c1} />
          {/* Right face (darker) */}
          <polygon points="50,5 50,95 95,95" fill={darkenHex(c2, 0.6)} />
        </svg>
      );
    }
    default:
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="none">
          {commonDefs}
          <rect x="0" y="0" width="100" height="100" fill={fill} />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// HeroShapePanelFields — reusable form fields for editing a HeroShapeConfig.
// Used by:
//   - Style 1 / 3 speaker-intro form view (triangle overlay → shape editor)
//   - Style 2 hero-shape SectionBox properties panel
//   - Any future mockup that needs an editable geometric shape background
//
// The parent component is responsible for storing the config and calling
// onChange with patches. This component is purely presentational.
// ---------------------------------------------------------------------------

export function HeroShapePanelFields({
  config,
  onChange,
  compact = false,
}: {
  config: HeroShapeConfig;
  onChange: (patch: Partial<HeroShapeConfig>) => void;
  /** Compact mode = smaller fonts for the floating panel use case. */
  compact?: boolean;
}) {
  const shape = config.shape ?? "rectangle";
  const fillMode = config.fillMode ?? "gradient";
  const solidColor = config.solidColor ?? "#311B92";
  const colors = config.colors ?? ["#311B92", "#0B0B2E"];
  const direction = config.direction ?? 135;
  const opacityVal = config.opacity ?? 0.85;
  const rotation = config.rotation ?? 0;

  const labelClass = compact
    ? "text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1"
    : "text-xs font-bold uppercase tracking-wider text-black/80 mb-1";
  const inputClass = compact
    ? "w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-1 bg-white"
    : "w-full text-xs font-mono border border-black/15 rounded px-2 py-1.5 bg-white";
  const hexInputClass = compact
    ? "flex-1 text-[0.6rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
    : "flex-1 text-xs font-mono border border-black/15 rounded px-2 py-1 bg-white";

  const updateColor = (index: number, value: string) => {
    const next = [...colors];
    next[index] = value;
    onChange({ colors: next });
  };
  const addColor = () => onChange({ colors: [...colors, "#FFFFFF"] });
  const removeColor = (index: number) => {
    if (colors.length <= 2) return;
    onChange({ colors: colors.filter((_, i) => i !== index) });
  };

  return (
    <>
      {/* Shape type dropdown */}
      <div>
        <div className={labelClass}>Shape</div>
        <select
          value={shape}
          onChange={(e) => onChange({ shape: e.target.value as HeroShapeType })}
          className={inputClass}
          title="Select the background shape (Special / 2D / 3D)"
        >
          <optgroup label="Special">
            {ALL_HERO_SHAPES.filter((s) => s.group === "Special").map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="2D Shapes">
            {ALL_HERO_SHAPES.filter((s) => s.group === "2D").map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="3D Shapes">
            {ALL_HERO_SHAPES.filter((s) => s.group === "3D").map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Fill mode toggle: Solid vs Gradient */}
      <div>
        <div className={labelClass}>Fill Mode</div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange({ fillMode: "solid" })}
            className={`flex-1 rounded px-2 py-1 ${
              compact ? "text-[0.6rem]" : "text-xs"
            } font-semibold ${
              fillMode === "solid"
                ? "bg-[#FF005A] text-white"
                : "bg-black/5 text-black hover:bg-black/10"
            }`}
          >
            Solid
          </button>
          <button
            type="button"
            onClick={() => onChange({ fillMode: "gradient" })}
            className={`flex-1 rounded px-2 py-1 ${
              compact ? "text-[0.6rem]" : "text-xs"
            } font-semibold ${
              fillMode === "gradient"
                ? "bg-[#FF005A] text-white"
                : "bg-black/5 text-black hover:bg-black/10"
            }`}
          >
            Gradient
          </button>
        </div>
      </div>

      {/* Color picker(s) — single color for solid, multi-stop for gradient */}
      {fillMode === "solid" ? (
        <div>
          <div className={labelClass}>Solid Color</div>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={solidColor}
              onChange={(e) => onChange({ solidColor: e.target.value })}
              className={compact ? "w-7 h-7 rounded border border-black/15 cursor-pointer" : "w-10 h-10 rounded border border-black/15 cursor-pointer"}
              title={`Solid color: ${solidColor}`}
            />
            <input
              type="text"
              value={solidColor}
              onChange={(e) => onChange({ solidColor: e.target.value })}
              className={hexInputClass}
              title="Hex color value"
            />
          </div>
        </div>
      ) : (
        <div>
          <div className={labelClass}>Gradient Colors</div>
          <div className="flex flex-col gap-1">
            {colors.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={c}
                  onChange={(e) => updateColor(i, e.target.value)}
                  className={compact ? "w-7 h-7 rounded border border-black/15 cursor-pointer" : "w-10 h-10 rounded border border-black/15 cursor-pointer"}
                  title={`Color ${i + 1}: ${c}`}
                />
                <input
                  type="text"
                  value={c}
                  onChange={(e) => updateColor(i, e.target.value)}
                  className={hexInputClass}
                  title="Hex color value"
                />
                {colors.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeColor(i)}
                    className="text-black/40 hover:text-[#FF005A] text-[0.8rem] leading-none px-1"
                    title="Remove this color stop"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {colors.length < 5 && (
            <button
              type="button"
              onClick={addColor}
              className={`mt-1 ${compact ? "text-[0.55rem]" : "text-xs"} font-semibold text-[#FF005A] hover:underline`}
            >
              + Add color stop
            </button>
          )}
        </div>
      )}

      {/* Direction (gradient angle) — only shown in gradient mode */}
      {fillMode === "gradient" && (
        <div>
          <div className={labelClass}>
            Gradient Direction: {direction}°
          </div>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            value={direction}
            onChange={(e) => onChange({ direction: parseFloat(e.target.value) })}
            className="w-full h-1 accent-[#FF005A]"
            title="Gradient angle in degrees (0 = left→right, 90 = top→bottom)"
          />
        </div>
      )}

      {/* Opacity */}
      <div>
        <div className={labelClass}>
          Opacity: {Math.round(opacityVal * 100)}%
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={opacityVal}
          onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
          className="w-full h-1 accent-[#FF005A]"
          title="Shape opacity (0 = transparent, 1 = fully opaque)"
        />
      </div>

      {/* Rotation */}
      <div>
        <div className={labelClass}>
          Shape Rotation: {rotation}°
        </div>
        <input
          type="range"
          min="0"
          max="360"
          step="1"
          value={rotation}
          onChange={(e) => onChange({ rotation: parseFloat(e.target.value) })}
          className="w-full h-1 accent-[#FF005A]"
          title="Shape rotation in degrees"
        />
      </div>

      {/* PER USER SPEC 2026-07-31 (TSK-0034): Position / Size / Scale
          section — appears BELOW the rotation scroller. Lets the user
          position + size + scale the shape on the canvas independently
          of its parent container. Particularly useful for Style 3 where
          the hero overlay shape is a standalone rectangle that should
          be draggable + resizable like the other sections. */}
      <div
        className={`mt-2 pt-2 border-t border-black/10 ${
          compact ? "space-y-1.5" : "space-y-2"
        }`}
      >
        <div className={labelClass}>Position &amp; Size</div>
        {/* Position X / Y (% of canvas) */}
        <div className="grid grid-cols-2 gap-2">
          <label className="inline-flex items-center gap-1">
            <span className={`${compact ? "text-[0.55rem]" : "text-[0.6rem]"} font-semibold text-black/70 w-3`}>
              X
            </span>
            <input
              type="number"
              step="0.1"
              value={config.pos?.x ?? ""}
              placeholder="auto"
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                onChange({
                  pos: {
                    x: Number.isFinite(n) ? n : 0,
                    y: config.pos?.y ?? 0,
                  },
                });
              }}
              className={inputClass}
              title="Position X (% of canvas). Empty = inherit parent container position."
            />
            <span className={`${compact ? "text-[0.5rem]" : "text-[0.55rem]"} font-mono text-black/50`}>
              %
            </span>
          </label>
          <label className="inline-flex items-center gap-1">
            <span className={`${compact ? "text-[0.55rem]" : "text-[0.6rem]"} font-semibold text-black/70 w-3`}>
              Y
            </span>
            <input
              type="number"
              step="0.1"
              value={config.pos?.y ?? ""}
              placeholder="auto"
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                onChange({
                  pos: {
                    x: config.pos?.x ?? 0,
                    y: Number.isFinite(n) ? n : 0,
                  },
                });
              }}
              className={inputClass}
              title="Position Y (% of canvas). Empty = inherit parent container position."
            />
            <span className={`${compact ? "text-[0.5rem]" : "text-[0.55rem]"} font-mono text-black/50`}>
              %
            </span>
          </label>
        </div>
        {/* Size W / H (canvas px) */}
        <div className="grid grid-cols-2 gap-2">
          <label className="inline-flex items-center gap-1">
            <span className={`${compact ? "text-[0.55rem]" : "text-[0.6rem]"} font-semibold text-black/70 w-3`}>
              W
            </span>
            <input
              type="number"
              step="1"
              value={config.boxSize?.width ?? ""}
              placeholder="auto"
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                onChange({
                  boxSize: {
                    width: Number.isFinite(n) ? n : undefined,
                    height: config.boxSize?.height,
                  },
                });
              }}
              className={inputClass}
              title="Width in canvas px. Empty = inherit parent container width."
            />
            <span className={`${compact ? "text-[0.5rem]" : "text-[0.55rem]"} font-mono text-black/50`}>
              px
            </span>
          </label>
          <label className="inline-flex items-center gap-1">
            <span className={`${compact ? "text-[0.55rem]" : "text-[0.6rem]"} font-semibold text-black/70 w-3`}>
              H
            </span>
            <input
              type="number"
              step="1"
              value={config.boxSize?.height ?? ""}
              placeholder="auto"
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                onChange({
                  boxSize: {
                    width: config.boxSize?.width,
                    height: Number.isFinite(n) ? n : undefined,
                  },
                });
              }}
              className={inputClass}
              title="Height in canvas px. Empty = inherit parent container height."
            />
            <span className={`${compact ? "text-[0.5rem]" : "text-[0.55rem]"} font-mono text-black/50`}>
              px
            </span>
          </label>
        </div>
        {/* Scale % */}
        <label className="inline-flex items-center gap-2">
          <span className={`${compact ? "text-[0.55rem]" : "text-[0.6rem]"} font-semibold text-black/70 w-12`}>
            Scale
          </span>
          <input
            type="number"
            step="1"
            min="1"
            value={config.scale ? Math.round(config.scale * 100) : ""}
            placeholder="100"
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              onChange({ scale: Number.isFinite(n) ? n / 100 : 1 });
            }}
            className={inputClass}
            title="Uniform scale % (1 = 100%). Applied via CSS transform on the shape wrapper."
          />
          <span className={`${compact ? "text-[0.5rem]" : "text-[0.55rem]"} font-mono text-black/50`}>
            %
          </span>
        </label>
        {/* Clear pos / boxSize / scale button */}
        <button
          type="button"
          onClick={() => onChange({ pos: undefined, boxSize: undefined, scale: undefined })}
          className={`${compact ? "text-[0.5rem]" : "text-[0.6rem]"} font-semibold text-black/50 hover:text-[#FF005A] underline mt-1`}
          title="Clear Position/Size/Scale (shape will inherit parent container)"
        >
          Reset position &amp; size
        </button>
      </div>
    </>
  );
}
