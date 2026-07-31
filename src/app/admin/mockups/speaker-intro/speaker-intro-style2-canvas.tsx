"use client";

import { forwardRef, useState, useEffect, type ReactNode } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import type {
  SpeakerIntroData,
  Speaker,
  ImagePlacement,
  ImageSlot,
} from "./types";
import { resolvePlacement } from "./types";
import {
  GuideProvider,
  GuideOverlay,
  SectionBox,
  ObjectPropertiesPanel,
  type SectionId,
  type SectionPos,
  type SectionBoxSize,
  type SectionLayoutEntry,
} from "../shared/section-edit";

/**
 * SpeakerIntroStyle2Canvas — Style 2 layout for the Speaker Intro mockup.
 *
 * PER USER SPEC 2026-07-31 (TSK-0024):
 * The previous implementation (hero-fill-canvas + gradient shape overlay)
 * did NOT match the uploaded reference image "Speaker Intro Style 2.png".
 * This rewrite implements the actual reference layout:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ ◤ GRADIENT HEADER BAR (purple→magenta, full-width, ~80px) ◥ │
 *   │  AI Salon Tel Aviv · Marketing in the Age of AI    AI SALON │
 *   │  An evening with industry leaders · October 15, 2025        │
 *   ├────────────────────────────────────┬─────────────────────────┤
 *   │                                    │                         │
 *   │  LEFT PANEL (55%, white)           │  RIGHT PANEL (45%,      │
 *   │  ┌──────────┐  ┌──────────┐        │  dark purple gradient)  │
 *   │  │ ●  Name  │  │ ●  Name  │        │                         │
 *   │  │ OR Title │  │ EK Title │        │  📍 Sarona  📍 Yafo     │
 *   │  │ [topic]  │  │ [topic]  │        │                         │
 *   │  │ bio...   │  │ bio...   │        │  📍 Dizengoff           │
 *   │  │ ⏱ 18:30  │  │ ⏱ 19:00 │        │  📍 Neve Tzedek         │
 *   │  └──────────┘  └──────────┘        │                         │
 *   │  ┌──────────┐  ┌──────────┐        │      /\  /\  /\         │
 *   │  │ ●  Name  │  │ ●  Name  │        │     /  \/  \/  \        │
 *   │  │ BM Title │  │ MF Title │        │  🦫 meerkat             │
 *   │  │ [topic]  │  │ [topic]  │        │                         │
 *   │  │ bio...   │  │ bio...   │        │                         │
 *   │  │ ⏱ 19:45  │  │ ⏱ 20:30 │        │                         │
 *   │  └──────────┘  └──────────┘        │                         │
 *   ├────────────────────────────────────┴─────────────────────────┤
 *   │ ■ AI SALON · TEL AVIV   IN COLLAB WITH: [Amdocs][Google]    │
 *   │                          SPONSORED BY:  [Alison.ai]    [QR] │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Layout regions (canvas 1200×800):
 *   - Header bar:        top 0..80px, full-width (1200px), gradient bg
 *   - Main split:        80..720px (640px tall), split 55/45
 *     · Left panel:      x=0..660px, white bg, padded 2×2 speaker grid
 *     · Right panel:     x=660..1200px (540px wide), dark purple bg,
 *                         mountain silhouette bottom, 4 location pins,
 *                         meerkat mascot bottom-right
 *   - Footer bar:        720..800px (80px tall), full-width, dark
 *                         IN COLLAB WITH + sponsors + AI SALON logo + QR
 *
 * Both Style 2 and Style 3 use this component (Style 3 has a different
 * default QR position per types.ts comment, but the layout is shared).
 */

const CANVAS_W = 1200;
const CANVAS_H = 800;

// Layout constants (px)
const HEADER_H = 80;
const FOOTER_H = 80;
const MAIN_H = CANVAS_H - HEADER_H - FOOTER_H; // 640
const LEFT_W = 660; // 55% of 1200
const RIGHT_W = CANVAS_W - LEFT_W; // 540

// ============================================================================
// PER USER SPEC 2026-07-31 (TSK-0026):
// Default section layout values for Style 2. These are used when the user's
// data.sectionLayout doesn't have an explicit value for a given section.
// The user can still override by dragging or typing in the properties panel.
// ============================================================================
const STYLE2_DEFAULTS: Record<string, SectionLayoutEntry> = {
  header:       { pos: { x: 0, y: 0 }, boxSize: { width: 1200, height: 80 }, scale: 1, z: 50 },
  "hero-shape": { pos: { x: 55, y: 10 }, boxSize: { width: 540, height: 640 }, scale: 1, z: 40 },
  speakers:     { pos: { x: -8.7, y: 5 }, boxSize: { width: 891 }, scale: 0.76, z: 60 },
  // PER USER SPEC 2026-07-31 (TSK-0027): renamed section id "topic" →
  // "hero-image" so it stops colliding with Style 1's "topic" section
  // (which is the EVENT TOPIC text, not the hero image). Both styles now
  // use a hero-image section id to refer to the hero image element —
  // "Style 2 use the same section for the style 1 hero image."
  "hero-image":  { pos: { x: 31.9, y: 10.4 }, boxSize: { width: 951 }, scale: 1, z: 50 },
  sponsors:     { pos: { x: 0.3, y: 89.4 }, scale: 1, z: 50 },
};

// Human-readable labels shown in the Object Properties Panel header.
const SECTION_LABELS: Record<string, string> = {
  header: "Header",
  speakers: "Speakers",
  "hero-image": "Hero Image",
  "hero-shape": "Hero Shape",
  sponsors: "Footer",
};

type HeroGradientConfig = NonNullable<SpeakerIntroData["style2HeroGradient"]>;
type HeroShapeType = NonNullable<HeroGradientConfig["shape"]>;

const ALL_SHAPES: { value: HeroShapeType; label: string; group: string }[] = [
  { value: "rectangle", label: "Rectangle", group: "2D" },
  { value: "square", label: "Square", group: "2D" },
  { value: "circle", label: "Circle", group: "2D" },
  { value: "oval", label: "Oval / Ellipse", group: "2D" },
  { value: "triangle", label: "Triangle", group: "2D" },
  { value: "pentagon", label: "Pentagon", group: "2D" },
  { value: "hexagon", label: "Hexagon", group: "2D" },
  { value: "octagon", label: "Octagon", group: "2D" },
  { value: "sphere", label: "Sphere", group: "3D" },
  { value: "cube", label: "Cube", group: "3D" },
  { value: "cone", label: "Cone", group: "3D" },
  { value: "cylinder", label: "Cylinder", group: "3D" },
  { value: "pyramid", label: "Pyramid", group: "3D" },
];

type Props = {
  data: SpeakerIntroData;
  className?: string;
  sectionsEditable?: boolean;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, placement: ImagePlacement) => void;
  onSectionMove?: (id: SectionId, pos: SectionPos) => void;
  onSectionResize?: (id: SectionId, scale: number) => void;
  onSectionBoxResize?: (id: SectionId, size: SectionBoxSize) => void;
  onSectionZChange?: (id: SectionId, z: number) => void;
  /** Called when the user edits the hero gradient shape / colors / direction / opacity / rotation. */
  onHeroShapeChange?: (patch: Partial<HeroGradientConfig>) => void;
  previewScale?: number;
};

// ============================================================================
// Helper: derive speaker initials from fullName when not provided.
// ============================================================================
function deriveInitials(fullName: string, fallback?: string): string {
  if (fallback && fallback.trim().length > 0) return fallback.trim().slice(0, 3).toUpperCase();
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// (sectionZFor removed — replaced by effectiveLayout() inside the component
// which merges STYLE2_DEFAULTS with user data for z-index resolution.)

// ============================================================================
// Style2SpeakerCard — the per-speaker card in the 2×2 grid.
// ============================================================================
function Style2SpeakerCard({ speaker }: { speaker: Speaker }) {
  const initials = deriveInitials(speaker.fullName, speaker.initials);
  const placement = resolvePlacement(speaker.photoPlacement);
  const titleCompany = [speaker.title, speaker.company].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "12px",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minHeight: "180px",
      }}
    >
      {/* Top row: avatar + name + title */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #ff0056 0%, #8f0080 100%)",
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "15px",
            fontWeight: 800,
            letterSpacing: "0.04em",
            flexShrink: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {speaker.photoUrl ? (
            <Image
              src={speaker.photoUrl}
              alt={speaker.fullName}
              fill
              style={{
                objectFit: "cover",
                objectPosition: `${placement.focusX}% ${placement.focusY}%`,
                transform: `scale(${placement.zoom})`,
              }}
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "#0F172A",
              lineHeight: 1.15,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {speaker.fullName}
          </div>
          {titleCompany && (
            <div
              style={{
                fontSize: "11.5px",
                color: "#64748B",
                marginTop: "2px",
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {titleCompany}
            </div>
          )}
        </div>
      </div>

      {/* Topic pill */}
      {speaker.topic && (
        <div>
          <span
            style={{
              display: "inline-block",
              fontSize: "11px",
              fontWeight: 600,
              color: "#FF0056",
              background: "rgba(255, 0, 86, 0.08)",
              padding: "3px 9px",
              borderRadius: "999px",
              lineHeight: 1.2,
            }}
          >
            {speaker.topic}
          </span>
        </div>
      )}

      {/* Bio */}
      {speaker.bio && (
        <div
          style={{
            fontSize: "11.5px",
            color: "#64748B",
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {speaker.bio}
        </div>
      )}

      {/* Time + session type (teal) */}
      {(speaker.sessionTime || speaker.sessionTitle) && (
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11.5px",
            fontWeight: 600,
            color: "#0D9488",
          }}
        >
          {speaker.sessionTime && (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{speaker.sessionTime}</span>
            </>
          )}
          {speaker.sessionTime && speaker.sessionTitle && (
            <span style={{ color: "#94A3B8", fontWeight: 400 }}>·</span>
          )}
          {speaker.sessionTitle && <span>{speaker.sessionTitle}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Style2QrCode — local QR generator (renders to data URL).
// ============================================================================
function Style2QrCode({ url, size }: { url: string; size: number }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: size * 2,
      margin: 1,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [url, size]);

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt="QR code" />
  ) : (
    <div style={{ width: size, height: size, background: "#F1F5F9" }} />
  );
}

// ============================================================================
// Mountain silhouette (SVG path) — used as the bottom decoration on the
// right hero panel.
// ============================================================================
function MountainSilhouette() {
  return (
    <svg
      viewBox="0 0 540 200"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: "180px",
        pointerEvents: "none",
      }}
    >
      <defs>
        <linearGradient id="mountain-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0B0B2E" />
          <stop offset="100%" stopColor="#020210" />
        </linearGradient>
      </defs>
      {/* Far range */}
      <path
        d="M0,200 L0,120 L40,90 L80,110 L120,70 L170,100 L210,60 L260,95 L310,75 L360,105 L410,80 L460,100 L510,85 L540,95 L540,200 Z"
        fill="#0B0B2E"
        opacity="0.6"
      />
      {/* Near range (darker) */}
      <path
        d="M0,200 L0,160 L50,130 L110,150 L160,120 L220,140 L280,115 L340,145 L400,125 L460,140 L510,130 L540,145 L540,200 Z"
        fill="url(#mountain-grad)"
      />
    </svg>
  );
}

// ============================================================================
// LocationPin — pill/tag with a small pin icon, positioned absolutely.
// ============================================================================
function Style2LocationPin({
  label,
  x,
  y,
  variant,
}: {
  label: string;
  x: number;
  y: number;
  variant: "white" | "teal" | "magenta";
}) {
  const palette = {
    white: { bg: "#FFFFFF", color: "#FF0056", icon: "#FF0056" },
    teal: { bg: "#0D9488", color: "#FFFFFF", icon: "#FFFFFF" },
    magenta: { bg: "#FF0056", color: "#FFFFFF", icon: "#FFFFFF" },
  }[variant];

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        background: palette.bg,
        color: palette.color,
        padding: "5px 11px 5px 9px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: "5px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill={palette.icon}
        stroke="none"
      >
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

// ============================================================================
// Style2HeroShape — renders the gradient background shape behind the hero
// image. Supports 13 shape types (8 × 2D + 5 × 3D) with a linear or radial
// gradient fill, opacity, and rotation.
//
// PER USER SPEC 2026-07-31 (TSK-0026):
//   "Now separate the hero image from the background colors gradient and set
//    to shapes with gradient colors that you can edit on the form."
//
// The shape is rendered as an SVG that fills its parent container. 2D shapes
// use a linear gradient; 3D shapes (sphere, cube, cone, cylinder, pyramid)
// simulate depth with multiple faces / radial gradients.
// ============================================================================
function Style2HeroShape({
  shape,
  colors,
  direction,
  opacity,
  rotation,
}: {
  shape: HeroShapeType;
  colors: string[];
  direction: number;
  opacity: number;
  rotation: number;
}) {
  const gradId = "style2-hero-grad";
  const radialId = "style2-hero-radial";
  const safeColors =
    colors.length >= 2 ? colors : ["#311B92", "#0B0B2E"];
  const stops = safeColors.map((c, i) => ({
    offset: `${(i / Math.max(1, safeColors.length - 1)) * 100}%`,
    color: c,
  }));

  const wrapperStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    opacity,
    transform: `rotate(${rotation}deg)`,
    transformOrigin: "center center",
  };

  const commonDefs = (
    <defs>
      <linearGradient id={gradId} gradientTransform={`rotate(${direction} 0.5 0.5)`} x1="0" y1="0" x2="1" y2="0">
        {stops.map((s, i) => (
          <stop key={`l${i}`} offset={s.offset} stopColor={s.color} />
        ))}
      </linearGradient>
      <radialGradient id={radialId} cx="0.35" cy="0.3" r="0.75">
        <stop offset="0%" stopColor={safeColors[0]} />
        <stop offset="60%" stopColor={safeColors[Math.min(1, safeColors.length - 1)]} />
        <stop offset="100%" stopColor={safeColors[safeColors.length - 1]} />
      </radialGradient>
    </defs>
  );

  // Helper to darken a hex color by a factor (0..1)
  const darken = (hex: string, factor: number): string => {
    try {
      const h = hex.replace("#", "");
      const r = Math.round(parseInt(h.slice(0, 2), 16) * factor);
      const g = Math.round(parseInt(h.slice(2, 4), 16) * factor);
      const b = Math.round(parseInt(h.slice(4, 6), 16) * factor);
      return `rgb(${r},${g},${b})`;
    } catch {
      return hex;
    }
  };

  switch (shape) {
    // ---- 2D shapes ----
    case "rectangle":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="none">
          {commonDefs}
          <rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
        </svg>
      );
    case "square":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <rect x="15" y="15" width="70" height="70" fill={`url(#${gradId})`} />
        </svg>
      );
    case "circle":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <circle cx="50" cy="50" r="50" fill={`url(#${gradId})`} />
        </svg>
      );
    case "oval":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="none">
          {commonDefs}
          <ellipse cx="50" cy="50" rx="50" ry="35" fill={`url(#${gradId})`} />
        </svg>
      );
    case "triangle":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <polygon points="50,2 98,98 2,98" fill={`url(#${gradId})`} />
        </svg>
      );
    case "pentagon":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <polygon points="50,2 98,38 80,98 20,98 2,38" fill={`url(#${gradId})`} />
        </svg>
      );
    case "hexagon":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <polygon points="25,2 75,2 98,50 75,98 25,98 2,50" fill={`url(#${gradId})`} />
        </svg>
      );
    case "octagon":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <polygon points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30" fill={`url(#${gradId})`} />
        </svg>
      );
    // ---- 3D shapes ----
    case "sphere":
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          <circle cx="50" cy="50" r="48" fill={`url(#${radialId})`} />
          <ellipse cx="38" cy="35" rx="12" ry="8" fill="rgba(255,255,255,0.18)" />
        </svg>
      );
    case "cube": {
      const c1 = safeColors[0];
      const c2 = safeColors[Math.min(1, safeColors.length - 1)];
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          {/* Top face */}
          <polygon points="50,5 90,25 50,45 10,25" fill={c1} />
          {/* Left face (darker) */}
          <polygon points="10,25 50,45 50,95 10,75" fill={darken(c2, 0.7)} />
          {/* Right face */}
          <polygon points="90,25 50,45 50,95 90,75" fill={darken(c2, 0.5)} />
        </svg>
      );
    }
    case "cone": {
      const c1 = safeColors[0];
      const c2 = safeColors[Math.min(1, safeColors.length - 1)];
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          {/* Cone body */}
          <polygon points="50,2 90,85 10,85" fill={`url(#${gradId})`} />
          {/* Base ellipse (darker) */}
          <ellipse cx="50" cy="85" rx="40" ry="10" fill={darken(c2, 0.6)} />
          {/* Shading on left side */}
          <polygon points="50,2 10,85 30,85" fill={darken(c1, 0.6)} opacity="0.5" />
        </svg>
      );
    }
    case "cylinder": {
      const c1 = safeColors[0];
      const c2 = safeColors[Math.min(1, safeColors.length - 1)];
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          {/* Body */}
          <rect x="20" y="15" width="60" height="70" fill={`url(#${gradId})`} />
          {/* Bottom ellipse (darker) */}
          <ellipse cx="50" cy="85" rx="30" ry="8" fill={darken(c2, 0.6)} />
          {/* Top ellipse (lighter) */}
          <ellipse cx="50" cy="15" rx="30" ry="8" fill={c1} />
        </svg>
      );
    }
    case "pyramid": {
      const c1 = safeColors[0];
      const c2 = safeColors[Math.min(1, safeColors.length - 1)];
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {commonDefs}
          {/* Left face (lighter) */}
          <polygon points="50,5 50,95 5,95" fill={c1} />
          {/* Right face (darker) */}
          <polygon points="50,5 50,95 95,95" fill={darken(c2, 0.6)} />
        </svg>
      );
    }
    default:
      return (
        <svg style={wrapperStyle} viewBox="0 0 100 100" preserveAspectRatio="none">
          {commonDefs}
          <rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
        </svg>
      );
  }
}

// ============================================================================
// HeroShapePanel — floating properties panel for the "hero-shape" section.
// Shows shape type dropdown, gradient color pickers, direction, opacity,
// rotation — PLUS the standard position / size / scale / layer controls.
//
// PER USER SPEC 2026-07-31 (TSK-0026): "set to shapes with gradient colors
// that you can edit on the form".
// ============================================================================
function HeroShapePanel({
  config,
  onChange,
  pos,
  onPosChange,
  boxSize,
  onBoxSizeChange,
  scale,
  onScaleChange,
  z,
  onZChange,
  peers,
  onDeselect,
}: {
  config: HeroGradientConfig;
  onChange: (patch: Partial<HeroGradientConfig>) => void;
  pos?: SectionPos;
  onPosChange?: (pos: SectionPos) => void;
  boxSize?: SectionBoxSize;
  onBoxSizeChange?: (size: SectionBoxSize) => void;
  scale?: number;
  onScaleChange?: (scale: number) => void;
  z?: number;
  onZChange?: (z: number) => void;
  peers?: number[];
  onDeselect?: () => void;
}) {
  const shape = config.shape ?? "rectangle";
  const colors = config.colors ?? ["#311B92", "#0B0B2E"];
  const direction = config.direction ?? 135;
  const opacityVal = config.opacity ?? 0.85;
  const rotation = config.rotation ?? 0;

  const px = pos?.x ?? 0;
  const py = pos?.y ?? 0;
  const bw = boxSize?.width ?? 0;
  const bh = boxSize?.height ?? 0;
  const sc = scale ?? 1;

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

  const bringToFront = () => {
    if (!onZChange) return;
    if (peers && peers.length > 0) {
      const max = Math.max(...peers, 0);
      if ((z ?? 0) <= max) onZChange(max + 1);
    } else {
      onZChange((z ?? 0) + 1);
    }
  };
  const sendToBack = () => {
    if (!onZChange) return;
    if (peers && peers.length > 0) {
      const min = Math.min(...peers, 0);
      if ((z ?? 0) >= min) onZChange(min - 1);
    } else {
      onZChange((z ?? 0) - 1);
    }
  };

  return (
    <div
      className="absolute rounded-md border-2 border-[#FF005A] bg-white shadow-xl"
      style={{ right: "12px", top: "12px", zIndex: 9998, minWidth: "240px", maxHeight: "90%", overflowY: "auto" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-[#FF005A] text-white px-2 py-1 rounded-t-md sticky top-0">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider">
          Hero Shape Properties
        </span>
        {onDeselect && (
          <button
            type="button"
            onClick={onDeselect}
            className="text-white/80 hover:text-white text-[0.8rem] leading-none ml-2"
            title="Deselect"
          >
            ×
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-2 py-2 flex flex-col gap-2.5">
        {/* Shape type dropdown */}
        <div>
          <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
            Shape
          </div>
          <select
            value={shape}
            onChange={(e) => onChange({ shape: e.target.value as HeroShapeType })}
            className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-1 bg-white"
            title="Select the background shape (2D or 3D)"
          >
            <optgroup label="2D Shapes">
              {ALL_SHAPES.filter((s) => s.group === "2D").map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </optgroup>
            <optgroup label="3D Shapes">
              {ALL_SHAPES.filter((s) => s.group === "3D").map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Gradient colors */}
        <div>
          <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
            Gradient Colors
          </div>
          <div className="flex flex-col gap-1">
            {colors.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={c}
                  onChange={(e) => updateColor(i, e.target.value)}
                  className="w-7 h-7 rounded border border-black/15 cursor-pointer"
                  title={`Color ${i + 1}: ${c}`}
                />
                <input
                  type="text"
                  value={c}
                  onChange={(e) => updateColor(i, e.target.value)}
                  className="flex-1 text-[0.6rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
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
              className="mt-1 text-[0.55rem] font-semibold text-[#FF005A] hover:underline"
            >
              + Add color stop
            </button>
          )}
        </div>

        {/* Direction (gradient angle) */}
        <div>
          <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
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
            title="Gradient angle in degrees"
          />
        </div>

        {/* Opacity */}
        <div>
          <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
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
          <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
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

        <div className="border-t border-black/10 pt-2 flex flex-col gap-2">
          {/* Position */}
          {onPosChange && (
            <div>
              <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
                Position (% of canvas)
              </div>
              <div className="flex items-center gap-1.5">
                <label className="inline-flex items-center gap-1 flex-1">
                  <span className="text-[0.6rem] font-semibold text-black/80 w-3">X</span>
                  <input
                    type="number"
                    step="0.1"
                    value={Number(px.toFixed(1))}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n)) onPosChange({ x: n, y: py });
                    }}
                    className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                  />
                </label>
                <label className="inline-flex items-center gap-1 flex-1">
                  <span className="text-[0.6rem] font-semibold text-black/80 w-3">Y</span>
                  <input
                    type="number"
                    step="0.1"
                    value={Number(py.toFixed(1))}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n)) onPosChange({ x: px, y: n });
                    }}
                    className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Size */}
          {onBoxSizeChange && (
            <div>
              <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
                Size (canvas px)
              </div>
              <div className="flex items-center gap-1.5">
                <label className="inline-flex items-center gap-1 flex-1">
                  <span className="text-[0.6rem] font-semibold text-black/80 w-3">W</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="auto"
                    value={bw > 0 ? Math.round(bw) : ""}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n) && n >= 0) onBoxSizeChange({ ...boxSize, width: n });
                    }}
                    className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                  />
                </label>
                <label className="inline-flex items-center gap-1 flex-1">
                  <span className="text-[0.6rem] font-semibold text-black/80 w-3">H</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="auto"
                    value={bh > 0 ? Math.round(bh) : ""}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n) && n >= 0) onBoxSizeChange({ ...boxSize, height: n });
                    }}
                    className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Scale */}
          {onScaleChange && (
            <div>
              <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
                Scale % (box + text together)
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={Math.round(sc * 100)}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (Number.isFinite(n) && n > 0) onScaleChange(n / 100);
                  }}
                  className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                />
                <span className="text-[0.6rem] font-semibold text-black/80">%</span>
                <button
                  type="button"
                  onClick={() => onScaleChange(1)}
                  className="rounded border border-black/15 bg-white px-1.5 py-0.5 text-[0.55rem] font-semibold text-black hover:bg-black/5"
                >
                  100%
                </button>
              </div>
            </div>
          )}

          {/* Layer */}
          {onZChange && (
            <div>
              <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
                Layer (z-index: {z ?? 0})
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={bringToFront}
                  className="flex-1 rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
                >
                  ↑ Front
                </button>
                <button
                  type="button"
                  onClick={sendToBack}
                  className="flex-1 rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
                >
                  ↓ Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Style 2 canvas component
// ============================================================================
export const SpeakerIntroStyle2Canvas = forwardRef<HTMLDivElement, Props>(
  function SpeakerIntroStyle2Canvas(
    {
      data,
      className,
      sectionsEditable = false,
      onSectionMove,
      onSectionResize,
      onSectionBoxResize,
      onSectionZChange,
      onHeroShapeChange,
      previewScale = 1,
    },
    ref,
  ) {
    const brandColors = data.event.brandColors ?? ["#ff0056", "#8f0080"];
    const headerGradient = `linear-gradient(90deg, ${brandColors[1] ?? "#8f0080"} 0%, ${brandColors[0] ?? "#ff0056"} 100%)`;

    const visibleSpeakers = data.speakers.filter((s) => s.visible !== false);
    const collaborators = data.collaborators ?? [];
    const sponsors = data.sponsors ?? [];
    const locationPins = data.locationPins ?? [];
    const pinVariants: Array<"white" | "teal" | "magenta"> = ["white", "teal", "magenta", "white"];

    // Compose event title line: "Event Name · Topic" or just "Event Name"
    const eventTitle = data.event.topic
      ? `${data.event.name} · ${data.event.topic}`
      : data.event.name;
    const eventSubtitle = [data.event.date, data.event.time, data.event.venue]
      .filter(Boolean)
      .join(" · ");

    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
      if (!sectionsEditable) setSelectedId(null);
    }, [sectionsEditable]);

    // ---- effectiveLayout: merge STYLE2_DEFAULTS with user data ----
    // User data (data.sectionLayout[id]) takes priority; when a field is
    // missing, we fall back to the default. This ensures new mockups
    // start with the user-specified default positions/sizes/scales/z.
    const effectiveLayout = (id: SectionId): SectionLayoutEntry => {
      const user = data.sectionLayout?.[id];
      const def = STYLE2_DEFAULTS[id];
      if (!user && !def) return {};
      if (!user) return def ?? {};
      if (!def) return user;
      return {
        pos: user.pos ?? def.pos,
        boxSize: user.boxSize ?? def.boxSize,
        scale: user.scale ?? def.scale,
        z: user.z ?? def.z,
      };
    };

    // Build the peer z-index list from ALL known sections (defaults + user
    // overrides + any custom sections the user added). This ensures the
    // Front/Back buttons in the properties panel can compute correct max/min.
    const allSectionIds = Array.from(
      new Set([
        ...Object.keys(STYLE2_DEFAULTS),
        ...Object.keys(data.sectionLayout ?? {}),
      ]),
    );
    const sectionPeerZs: number[] = allSectionIds.map((id) =>
      effectiveLayout(id as SectionId).z ?? 50,
    );

    const selectedLayout = selectedId ? effectiveLayout(selectedId as SectionId) : undefined;

    // Hero gradient config (with defaults)
    const heroGradientConfig: HeroGradientConfig = {
      shape: data.style2HeroGradient?.shape ?? "rectangle",
      colors: data.style2HeroGradient?.colors ?? ["#311B92", "#1A237E", "#0B0B2E"],
      direction: data.style2HeroGradient?.direction ?? 180,
      opacity: data.style2HeroGradient?.opacity ?? 0.9,
      rotation: data.style2HeroGradient?.rotation ?? 0,
    };

    return (
      <GuideProvider
        canvasRef={ref as React.RefObject<HTMLDivElement | null>}
        enabled={sectionsEditable}
      >
        <div
          ref={ref}
          className={`relative bg-white overflow-hidden ${className ?? ""}`}
          style={{
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
          }}
        >
          {/* ============================================================
              Layer 1: HEADER BAR (gradient, full-width, 80px tall)
              ============================================================ */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "header"}
            pos={effectiveLayout("header").pos}
            boxSize={effectiveLayout("header").boxSize}
            scale={effectiveLayout("header").scale}
            onMove={(p) => onSectionMove?.("header", p)}
            onResize={(s) => onSectionResize?.("header", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("header", sz)}
            onSelect={() => setSelectedId("header")}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={effectiveLayout("header").z ?? 50}
            anchor="top-left"
            guideId="header"
            label="Header"
            style={{ position: "absolute", left: 0, top: 0, width: `${CANVAS_W}px`, height: `${HEADER_H}px` }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: headerGradient,
                padding: "14px 32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "24px",
              }}
            >
              <div style={{ flex: 1, minWidth: 0, color: "#FFFFFF" }}>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 800,
                    lineHeight: 1.15,
                    letterSpacing: "-0.01em",
                    textShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {eventTitle}
                </div>
                {eventSubtitle && (
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      opacity: 0.92,
                      marginTop: "3px",
                      lineHeight: 1.2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {eventSubtitle}
                  </div>
                )}
              </div>
              <div
                style={{
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  flexShrink: 0,
                  opacity: 0.95,
                }}
              >
                AI SALON
              </div>
            </div>
          </SectionBox>

          {/* ============================================================
              Layer 2: LEFT PANEL — white background, speaker card grid
              ============================================================ */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "speakers"}
            pos={effectiveLayout("speakers").pos}
            boxSize={effectiveLayout("speakers").boxSize}
            scale={effectiveLayout("speakers").scale}
            onMove={(p) => onSectionMove?.("speakers", p)}
            onResize={(s) => onSectionResize?.("speakers", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("speakers", sz)}
            onSelect={() => setSelectedId("speakers")}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={effectiveLayout("speakers").z ?? 60}
            anchor="top-left"
            guideId="speakers"
            label="Speakers"
            style={{ position: "absolute", left: 0, top: `${HEADER_H}px`, width: `${LEFT_W}px`, height: "auto" }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "#FFFFFF",
                padding: "28px 32px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {/* Section label */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#FF0056",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  Speakers
                </span>
                <div
                  style={{
                    flex: 1,
                    height: "2px",
                    background: "linear-gradient(90deg, #FF0056, transparent)",
                    borderRadius: "1px",
                  }}
                />
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#94A3B8",
                  }}
                >
                  {visibleSpeakers.length} {visibleSpeakers.length === 1 ? "speaker" : "speakers"}
                </span>
              </div>

              {/* Speaker card grid — auto columns based on count */}
              <div
                style={{
                  flex: 1,
                  display: "grid",
                  gap: "14px",
                  gridTemplateColumns:
                    visibleSpeakers.length <= 1
                      ? "1fr"
                      : visibleSpeakers.length <= 4
                      ? "1fr 1fr"
                      : visibleSpeakers.length <= 9
                      ? "1fr 1fr 1fr"
                      : "1fr 1fr 1fr 1fr",
                  gridAutoRows: "1fr",
                  alignContent: "stretch",
                }}
              >
                {visibleSpeakers.map((s) => (
                  <Style2SpeakerCard key={`${s.order}-${s.fullName}`} speaker={s} />
                ))}
              </div>
            </div>
          </SectionBox>

          {/* ============================================================
              Layer 3a: HERO SHAPE — editable gradient shape BEHIND the
              hero image. PER USER SPEC 2026-07-31 (TSK-0026):
              "separate the hero image from the background colors gradient
              and set to shapes with gradient colors that you can edit."
              This section renders ONLY the gradient shape (SVG). The hero
              image + pins + mountain + mascot are in the "hero-image" section
              below, which sits on top (higher z-index).
              ============================================================ */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "hero-shape"}
            pos={effectiveLayout("hero-shape").pos}
            boxSize={effectiveLayout("hero-shape").boxSize}
            scale={effectiveLayout("hero-shape").scale}
            onMove={(p) => onSectionMove?.("hero-shape", p)}
            onResize={(s) => onSectionResize?.("hero-shape", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("hero-shape", sz)}
            onSelect={() => setSelectedId("hero-shape")}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={effectiveLayout("hero-shape").z ?? 40}
            anchor="top-left"
            guideId="hero-shape"
            label="Hero Shape"
            style={{ position: "absolute", left: `${LEFT_W}px`, top: `${HEADER_H}px`, width: `${RIGHT_W}px`, height: `${MAIN_H}px` }}
          >
            <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
              <Style2HeroShape
                shape={heroGradientConfig.shape ?? "rectangle"}
                colors={heroGradientConfig.colors ?? ["#311B92", "#0B0B2E"]}
                direction={heroGradientConfig.direction ?? 180}
                opacity={heroGradientConfig.opacity ?? 0.9}
                rotation={heroGradientConfig.rotation ?? 0}
              />
            </div>
          </SectionBox>

          {/* ============================================================
              Layer 3b: HERO IMAGE — the hero image overlay + location pins
              + mountain silhouette + meerkat mascot. Sits ON TOP of the
              hero-shape gradient (higher z-index). PER USER SPEC 2026-07-31
              (TSK-0026): "Change the name topic Properties to Hero Image
              Properties" — label changed from "Hero (right panel)" to
              "Hero Image". The gradient background is now separate (hero-shape).
              PER USER SPEC 2026-07-31 (TSK-0027): section id renamed from
              "topic" → "hero-image" to stop colliding with Style 1's "topic"
              section (which is the EVENT TOPIC text). Both styles now use
              "hero-image" as the section id for the hero image element.
              ============================================================ */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "hero-image"}
            pos={effectiveLayout("hero-image").pos}
            boxSize={effectiveLayout("hero-image").boxSize}
            scale={effectiveLayout("hero-image").scale}
            onMove={(p) => onSectionMove?.("hero-image", p)}
            onResize={(s) => onSectionResize?.("hero-image", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("hero-image", sz)}
            onSelect={() => setSelectedId("hero-image")}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={effectiveLayout("hero-image").z ?? 50}
            anchor="top-left"
            guideId="hero-image"
            label="Hero Image"
            style={{ position: "absolute", left: `${LEFT_W}px`, top: `${HEADER_H}px`, width: `${RIGHT_W}px`, height: "auto" }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                minHeight: `${MAIN_H}px`,
                overflow: "hidden",
              }}
            >
              {/* Hero image overlay (no gradient background — that's now
                  in the separate hero-shape section) */}
              {data.heroOverlay?.imageUrl && (
                <Image
                  src={data.heroOverlay.imageUrl}
                  alt="Hero"
                  fill
                  style={{
                    objectFit: "cover",
                    objectPosition: `${resolvePlacement(data.heroOverlay.imagePlacement).focusX}% ${resolvePlacement(data.heroOverlay.imagePlacement).focusY}%`,
                    transform: `scale(${resolvePlacement(data.heroOverlay.imagePlacement).zoom})`,
                    opacity: 0.35,
                    mixBlendMode: "luminosity",
                  }}
                />
              )}

              {/* Location pins (4 — cycled through white/teal/magenta variants) */}
              {locationPins.slice(0, 4).map((pin, i) => (
                <Style2LocationPin
                  key={`pin-${i}-${pin.label}`}
                  label={pin.label}
                  x={pin.x}
                  y={pin.y}
                  variant={pinVariants[i % pinVariants.length]}
                />
              ))}

              {/* Mountain silhouette bottom decoration */}
              <MountainSilhouette />

              {/* Meerkat / mascot bottom-right */}
              {data.branding?.imageUrl && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "12px",
                    right: "16px",
                    height: `${data.branding?.height ?? 80}px`,
                    width: "auto",
                    pointerEvents: "none",
                    filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
                  }}
                >
                  <Image
                    src={data.branding.imageUrl}
                    alt="Mascot"
                    width={data.branding?.height ?? 80}
                    height={data.branding?.height ?? 80}
                    style={{ height: "100%", width: "auto", objectFit: "contain" }}
                  />
                </div>
              )}
            </div>
          </SectionBox>

          {/* ============================================================
              Layer 4: FOOTER BAR — dark charcoal, full-width, 80px tall
              Left: AI SALON logo (or brandingAsset image) + label
              Middle: IN COLLAB WITH + SPONSORED BY text pills
              Right: QR code
              ============================================================ */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "sponsors"}
            pos={effectiveLayout("sponsors").pos}
            boxSize={effectiveLayout("sponsors").boxSize}
            scale={effectiveLayout("sponsors").scale}
            onMove={(p) => onSectionMove?.("sponsors", p)}
            onResize={(s) => onSectionResize?.("sponsors", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("sponsors", sz)}
            onSelect={() => setSelectedId("sponsors")}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={effectiveLayout("sponsors").z ?? 50}
            anchor="top-left"
            guideId="sponsors"
            label="Footer"
            style={{ position: "absolute", left: 0, top: `${HEADER_H + MAIN_H}px`, width: `${CANVAS_W}px`, height: "auto" }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "#0F0F1A",
                padding: "0 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "20px",
                color: "#FFFFFF",
              }}
            >
              {/* Left: AI SALON logo + label */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                {data.brandingAsset?.imageUrl ? (
                  <Image
                    src={data.brandingAsset.imageUrl}
                    alt="AI Salon"
                    height={36}
                    width={36}
                    style={{ height: "36px", width: "auto", objectFit: "contain" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      background: "#FF0056",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 800,
                      color: "#FFFFFF",
                    }}
                  >
                    AI
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
                  <span style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em" }}>
                    AI SALON
                  </span>
                  <span style={{ fontSize: "9px", fontWeight: 500, opacity: 0.6, letterSpacing: "0.1em" }}>
                    TEL AVIV
                  </span>
                </div>
              </div>

              {/* Middle: collaborator + sponsor pills */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "28px",
                  flexWrap: "wrap",
                  minWidth: 0,
                }}
              >
                {collaborators.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.5)",
                      }}
                    >
                      In collab with
                    </span>
                    {collaborators.map((c, i) => (
                      <span
                        key={`collab-${i}`}
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#FFFFFF",
                          background: "rgba(255,255,255,0.08)",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                )}
                {sponsors.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "#0D9488",
                      }}
                    >
                      Sponsored by
                    </span>
                    {sponsors.map((s, i) => (
                      <span
                        key={`sponsor-${i}`}
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#FFFFFF",
                          background: "rgba(255,255,255,0.08)",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: QR code (plain div, not a SectionBox — the entire
                  footer is draggable via the "sponsors" SectionBox above) */}
              <div
                style={{
                  background: "#FFFFFF",
                  padding: "4px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Style2QrCode url={data.qrCodeUrl} size={52} />
              </div>
            </div>
          </SectionBox>

          {/* ============================================================
              Object Properties Panel (Edit Sections mode)
              — Uses SECTION_LABELS for human-readable titles.
              — When "hero-shape" is selected, renders the HeroShapePanel
                instead (which includes shape type, gradient colors,
                direction, opacity, rotation + standard pos/size/scale/z).
              ============================================================ */}
          {sectionsEditable && selectedId && selectedLayout && selectedId !== "hero-shape" && (
            <ObjectPropertiesPanel
              label={SECTION_LABELS[selectedId] ?? selectedId}
              pos={selectedLayout.pos}
              onPosChange={(p) => onSectionMove?.(selectedId as SectionId, p)}
              z={selectedLayout.z}
              onZChange={(z) => onSectionZChange?.(selectedId as SectionId, z)}
              peers={sectionPeerZs}
              onDeselect={() => setSelectedId(null)}
              boxSize={selectedLayout.boxSize}
              onBoxSizeChange={(sz) => onSectionBoxResize?.(selectedId as SectionId, sz)}
              scale={selectedLayout.scale}
              onScaleChange={(s) => onSectionResize?.(selectedId as SectionId, s)}
            />
          )}

          {sectionsEditable && selectedId === "hero-shape" && selectedLayout && (
            <HeroShapePanel
              config={heroGradientConfig}
              onChange={(patch) => onHeroShapeChange?.(patch)}
              pos={selectedLayout.pos}
              onPosChange={(p) => onSectionMove?.("hero-shape", p)}
              boxSize={selectedLayout.boxSize}
              onBoxSizeChange={(sz) => onSectionBoxResize?.("hero-shape", sz)}
              scale={selectedLayout.scale}
              onScaleChange={(s) => onSectionResize?.("hero-shape", s)}
              z={selectedLayout.z}
              onZChange={(z) => onSectionZChange?.("hero-shape", z)}
              peers={sectionPeerZs}
              onDeselect={() => setSelectedId(null)}
            />
          )}

          <GuideOverlay />
        </div>
      </GuideProvider>
    );
  },
);

// Re-export ReactNode type for backward compatibility (was used by old
// render3DShape helper which has been removed in the TSK-0024 rewrite).
export type _ReactNode = ReactNode;
