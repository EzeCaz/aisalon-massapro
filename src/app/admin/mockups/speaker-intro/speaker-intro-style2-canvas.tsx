"use client";

import { forwardRef, useState, useEffect, useRef, type ReactNode } from "react";
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
import { HeroShape, HeroShapePanelFields, type HeroShapeConfig } from "../shared/hero-shape";
// PER USER SPEC 2026-07-31 (TSK-0030): Style 2 hero image gets the SAME
// image-content capabilities (zoom, pan, replace) as Style 1's hero via
// `EditableImage`. PER USER SPEC 2026-08-01 (TSK-0037): the hero image
// CONTAINER is now a SectionBox (not DraggablePhotoContainer), giving it
// independent 8-direction resize arrows that don't affect the hero shape.
import {
  EditableImage,
} from "./speaker-intro-canvas";

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
  // PER USER SPEC 2026-08-02 (TSK-0048): header z lowered from 50 → 30 so
  // the hero-image (z=50) is on top of ALL other sections. Position/size
  // values (X=-1.5, Y=0.3, W=1247, H=auto, Scale=97%) unchanged from
  // TSK-0036.
  header:       { pos: { x: -1.5, y: 0.3 }, boxSize: { width: 1247 }, scale: 0.97, z: 30 },
  // PER USER SPEC 2026-08-02 (TSK-0048): hero-shape defaults updated to
  // X=37, Y=10.4, W=754, H=663, Scale=100%, z=40 (was X=42.3, Y=12.8,
  // W=632, H=663, Scale=121%, z=40 per TSK-0045). The user-specified
  // gradient config (rectangle / gradient / colors #311B92 #1A237E
  // #0B0B2E / direction 180° / opacity 90% / rotation 0°) is handled
  // separately by `heroGradientConfig` below — these are the section
  // layout values from the Position & Size block of the Hero Shape
  // Properties panel. z=40 keeps the hero-shape BEHIND the hero-image
  // (z=50).
  "hero-shape": { pos: { x: 37, y: 10.4 }, boxSize: { width: 754, height: 663 }, scale: 1.0, z: 40 },
  // PER USER SPEC 2026-08-02 (TSK-0048): hero-image defaults updated to
  // X=26.6, Y=-2.8, W=1012, H=875, Scale=74%, z=50 (was X=39.5, Y=8.9,
  // W=697, H=auto, Scale=108%, z=50 per TSK-0046). The hero image is
  // explicitly the TOPMOST section (z=50 > header 30 / speakers 30 /
  // style2-footer 30 / hero-shape 40). Location pins are rendered AFTER
  // the image inside the hero-image SectionBox (DOM order), so they
  // naturally render on top of the image within this section.
  "hero-image":  { pos: { x: 26.6, y: -2.8 }, boxSize: { width: 1012, height: 875 }, scale: 0.74, z: 50 },
  // PER USER SPEC 2026-08-02 (TSK-0048): speakers z lowered from 60 → 30
  // so the hero-image (z=50) is on top of ALL other sections.
  // Position/size values (X=-7.7, Y=-2.8, W=658, H=auto, Scale=67%)
  // unchanged from TSK-0045.
  speakers:     { pos: { x: -7.7, y: -2.8 }, boxSize: { width: 658 }, scale: 0.67, z: 30 },
  // PER USER SPEC 2026-08-02 (TSK-0048): style2-footer z lowered from
  // 50 → 30 so the hero-image (z=50) is on top of ALL other sections.
  // Position/size values (X=-0.1, Y=92.5, W=auto, H=auto, Scale=100%)
  // unchanged from TSK-0030.
  "style2-footer": { pos: { x: -0.1, y: 92.5 }, scale: 1, z: 30 },
};

// Human-readable labels shown in the Object Properties Panel header.
const SECTION_LABELS: Record<string, string> = {
  header: "Header",
  speakers: "Speakers",
  "hero-image": "Hero Image",
  "hero-shape": "Hero Shape",
  "style2-footer": "Footer",
};

type HeroGradientConfig = NonNullable<SpeakerIntroData["style2HeroGradient"]>;
// HeroShapeType + ALL_SHAPES were removed in TSK-0028 — the shape dropdown
// now uses the shared HeroShapePanelFields component (imported above), which
// has its own ALL_HERO_SHAPES constant.

type Props = {
  data: SpeakerIntroData;
  className?: string;
  sectionsEditable?: boolean;
  /** Whether the canvas is in image-edit mode (pan/zoom/replace images). */
  editable?: boolean;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, placement: ImagePlacement) => void;
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  onSectionMove?: (id: SectionId, pos: SectionPos) => void;
  onSectionResize?: (id: SectionId, scale: number) => void;
  onSectionBoxResize?: (id: SectionId, size: SectionBoxSize) => void;
  onSectionZChange?: (id: SectionId, z: number) => void;
  /** Called when the user edits the hero gradient shape / colors / direction / opacity / rotation / fillMode. */
  onHeroShapeChange?: (patch: Partial<HeroGradientConfig>) => void;
  /** Called when the user drags the hero image via its "⠿ Move hero" grip
   *  bar. Updates `data.heroOverlay.pos` (free-form {x, y} as % of canvas).
   *  PER USER SPEC 2026-07-31 (TSK-0028): the hero image should be treated
   *  as an image (not a section), but still support free-form dragging. */
  onHeroPosChange?: (pos: { x: number; y: number }) => void;
  /** PER USER SPEC 2026-08-02 (TSK-0049): Called when the user clicks the
   *  "Set as default" button (in the Object Properties Panel, the
   *  HeroShapePanel, or the toolbar next to Style 3). Saves the ENTIRE
   *  current mockup state as the default for the current style. */
  onSetAsDefault?: () => void;
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
function Style2SpeakerCard({
  speaker,
  showSessionTime = true,
}: {
  speaker: Speaker;
  /** PER USER SPEC 2026-07-31 (TSK-0033): global toggle for the
   *  session-time pill on Style 2 speaker cards. When `false`, the
   *  time/session-title row is hidden entirely. Default `true`. */
  showSessionTime?: boolean;
}) {
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

      {/* Time + session type (teal)
          PER USER SPEC 2026-07-31 (TSK-0033): hidden entirely when
          `showSessionTime` is false. The underlying speaker.sessionTime
          + speaker.sessionTitle data are preserved — only the visual
          rendering is suppressed. */}
      {showSessionTime && (speaker.sessionTime || speaker.sessionTitle) && (
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
// Style2HeroShape — DELETED in TSK-0028.
// The Style 2 hero-shape background now uses the shared `HeroShape` component
// from `../shared/hero-shape` (imported above). The shared component supports
// the same 13 shape types PLUS a new `fillMode` ("solid" | "gradient") and
// `solidColor` field, per user spec 2026-07-31 (TSK-0028):
//   "the background its a section with the entire section covered with a fill
//    or gradient, also enable to select the direction of the gradient"
//
// The shared component also handles unique gradient IDs per instance (so
// multiple HeroShape SVGs on the same canvas don't collide), which the
// previous local implementation did not.
//
// Call sites that previously used <Style2HeroShape ... /> now use:
//   <HeroShape config={heroGradientConfig as HeroShapeConfig} />
// (The style2HeroGradient type now includes fillMode + solidColor fields,
// so the cast is safe.)
// ============================================================================

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
  onSetAsDefault,
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
  /** PER USER SPEC 2026-08-02 (TSK-0049): saves the entire current style
   *  + all properties as the default for the current style. */
  onSetAsDefault?: () => void;
}) {
  const px = pos?.x ?? 0;
  const py = pos?.y ?? 0;
  const bw = boxSize?.width ?? 0;
  const bh = boxSize?.height ?? 0;
  const sc = scale ?? 1;

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
      className="absolute rounded-r-lg rounded-bl-lg bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden animate-[panelSlideIn_180ms_ease-out]"
      style={{ left: "12px", top: "12px", zIndex: 9998, minWidth: "240px", maxHeight: "90%", overflowY: "auto" }}
    >
      <style>{`
        @keyframes panelSlideIn {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {/* Header — sleek gradient style matching ObjectPropertiesPanel (TSK-0050) */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-[#FF005A] to-[#CC0048] text-white sticky top-0 z-10">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider truncate">
            Hero Shape Properties
          </span>
          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider">
            <span className="h-1 w-1 rounded-full bg-[#27C93F] animate-pulse" />
            LIVE
          </span>
        </div>
        {onDeselect && (
          <button
            type="button"
            onClick={onDeselect}
            className="text-white/80 hover:text-white hover:bg-white/15 rounded p-0.5 ml-2 transition"
            title="Deselect"
            aria-label="Deselect"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 flex flex-col gap-2.5">
        {/* Shape + fill mode + colors + direction + opacity + rotation —
            PER USER SPEC 2026-07-31 (TSK-0028): unified with the Style 1
            hero overlay shape system. The shared HeroShapePanelFields
            component renders all of these in compact mode, including the
            new fillMode (solid | gradient) toggle and the gradient
            direction slider. */}
        <HeroShapePanelFields
          config={config as HeroShapeConfig}
          onChange={(patch) => {
            // PER USER SPEC 2026-07-31 (TSK-0034): HeroShapePanelFields
            // now emits pos/boxSize/scale patches (for Style 1's standalone
            // hero overlay shape). Style 2 manages position/size/scale via
            // the hero-shape SectionBox separately, so we strip those keys
            // before forwarding the patch to Style 2's onChange (which is
            // typed as Partial<HeroGradientConfig> — no pos/boxSize/scale).
            const { pos: _pos, boxSize: _boxSize, scale: _scale, ...rest } = patch;
            onChange(rest);
          }}
          compact
        />

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

          {/* PER USER SPEC 2026-08-02 (TSK-0049): "Set as default" button —
              same as the one in ObjectPropertiesPanel. Saves the ENTIRE
              current mockup state as the default for the current style. */}
          {onSetAsDefault && (
            <button
              type="button"
              onClick={onSetAsDefault}
              title="Save the entire current style + all section properties as the default for this style. Click Reset to restore."
              className="w-full rounded border border-[#FF005A] bg-[#FF005A]/5 px-2 py-1.5 text-[0.6rem] font-bold text-[#FF005A] hover:bg-[#FF005A]/10"
            >
              ★ Set as default
            </button>
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
      editable = false,
      onPickImage,
      onPlacementChange,
      onSizeChange,
      onSectionMove,
      onSectionResize,
      onSectionBoxResize,
      onSectionZChange,
      onHeroShapeChange,
      onHeroPosChange,
      onSetAsDefault,
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
                // PER USER SPEC 2026-07-31 (TSK-0036): speakers section
                // background changed from #FFFFFF to transparent. The
                // individual speaker cards (rendered below) keep their
                // white background — only the outer container is transparent
                // so the canvas/hero shows through between cards.
                background: "transparent",
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

              {/* Speaker card grid — PER USER SPEC 2026-08-01 (TSK-0039):
                  Connect the "Speaker grid layout" form control to the
                  real speakers section. Previously this grid hard-coded
                  the column count from `visibleSpeakers.length` and
                  IGNORED `data.speakersLayout.columns` — so changing the
                  "Columns" dropdown in the form had no effect on Style 2.
                  Now we mirror Style 1's logic: explicit `columns` wins,
                  otherwise auto-compute from visible speaker count
                  (1-4 → 1 col, 5-8 → 2 cols, 9-12 → 3 cols, ...).
                  Also respects `flowDirection` (row/col) and
                  `lastRowAlign` (left/center/spread) for incomplete rows. */}
              {(() => {
                const layout = data.speakersLayout ?? {};
                const autoColumns = Math.min(
                  6,
                  Math.max(1, Math.ceil(visibleSpeakers.length / 4)),
                ) as 1 | 2 | 3 | 4 | 5 | 6;
                const columns = layout.columns ?? autoColumns;
                const flow = layout.flowDirection ?? "row";
                const lastRowAlign = layout.lastRowAlign ?? "spread";
                const rowsPerColumn = layout.rowsPerColumn ?? [];

                // Sort speakers by order for consistent placement.
                const sortedSpeakers = [...visibleSpeakers]
                  .sort((a, b) => a.order - b.order);

                // Build the (row, col) position for each speaker.
                let positions: Array<{ row: number; col: number }> = [];
                if (flow === "row") {
                  positions = sortedSpeakers.map((_, i) => ({
                    row: Math.floor(i / columns),
                    col: i % columns,
                  }));
                } else {
                  if (rowsPerColumn.length >= columns) {
                    const colOffsets: number[] = [0];
                    for (let c = 1; c < columns; c++) {
                      colOffsets.push(colOffsets[c - 1] + rowsPerColumn[c - 1]);
                    }
                    positions = sortedSpeakers.map((_, i) => {
                      let col = 0;
                      let row = i;
                      for (let c = 0; c < columns; c++) {
                        if (i < colOffsets[c] + rowsPerColumn[c]) {
                          col = c;
                          row = i - colOffsets[c];
                          break;
                        }
                      }
                      return { row, col };
                    });
                  } else {
                    const rowsPerCol = Math.ceil(sortedSpeakers.length / columns);
                    positions = sortedSpeakers.map((_, i) => ({
                      col: Math.floor(i / rowsPerCol),
                      row: i % rowsPerCol,
                    }));
                  }
                }

                const maxRow = positions.reduce((m, p) => Math.max(m, p.row), 0);
                const lastRowCount = positions.filter((p) => p.row === maxRow).length;
                const isLastRowIncomplete = lastRowCount < columns;

                return (
                  <div
                    style={{
                      flex: 1,
                      display: "grid",
                      gap: "14px",
                      gridTemplateColumns: `repeat(${columns}, 1fr)`,
                      gridAutoRows: "1fr",
                      alignContent: "stretch",
                    }}
                  >
                    {sortedSpeakers.map((s, i) => {
                      const pos = positions[i];
                      let gridColumnStart = pos.col + 1;
                      if (isLastRowIncomplete && pos.row === maxRow) {
                        if (lastRowAlign === "spread") {
                          const lastRowSpeakersBefore = positions.filter(
                            (p) => p.row === maxRow && p.col < pos.col,
                          ).length;
                          gridColumnStart =
                            Math.round(
                              (lastRowSpeakersBefore * columns) / lastRowCount,
                            ) + 1;
                        } else if (lastRowAlign === "center") {
                          const empty = columns - lastRowCount;
                          gridColumnStart = pos.col + Math.floor(empty / 2) + 1;
                        }
                      }
                      return (
                        <div
                          key={`${s.order}-${s.fullName}`}
                          style={{
                            gridColumnStart,
                            gridRowStart: pos.row + 1,
                          }}
                        >
                          <Style2SpeakerCard
                            speaker={s}
                            showSessionTime={data.speakersLayout?.showSessionTime !== false}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </SectionBox>

          {/* ============================================================
              Layer 3a: HERO SHAPE — editable gradient shape BEHIND the
              hero image. PER USER SPEC 2026-07-31 (TSK-0026):
              "separate the hero image from the background colors gradient
              and set to shapes with gradient colors that you can edit."
              This section renders ONLY the gradient shape (SVG). The hero
              image + pins + mountain are in the hero image
              element below, which sits on top (higher z-index).
              (Mascot was removed per TSK-0038.)

              PER USER SPEC 2026-07-31 (TSK-0028): the shape now uses the
              shared `HeroShape` component (supports fillMode solid |
              gradient, direction, opacity, rotation) instead of the old
              local Style2HeroShape.
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
              <HeroShape config={heroGradientConfig as HeroShapeConfig} />
            </div>
          </SectionBox>

          {/* ============================================================
              Layer 3b: HERO IMAGE — PER USER SPEC 2026-08-01 (TSK-0037):
              "Hero image resize arrows not working, make sure i can drag
              the arrow and enlarge or shrink the hero image alone, not
              with the hero shape."

              The hero image is now wrapped in its OWN SectionBox
              (independent of the hero-shape SectionBox above). This gives
              it 8-direction resize arrows + click-to-select + the standard
              Object Properties Panel (Position X/Y, Size W/H, Scale %,
              Layer z-index). Resizing the hero image does NOT affect the
              hero shape (and vice versa) — the two sections are fully
              independent.

              The image content retains all Style 1 capabilities
              (pan / zoom / replace) via EditableImage when `editable`
              is true. When `sectionsEditable` is true, the SectionBox's
              drag/resize interactions take precedence (the EditableImage
              pan/zoom is gated on `editable`).
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
            style={{ position: "absolute", left: `${LEFT_W}px`, top: `${HEADER_H}px`, width: `${RIGHT_W}px`, height: `${MAIN_H}px` }}
          >
            {/* Hero image — full capabilities via EditableImage.
                PER USER SPEC 2026-08-01 (TSK-0038):
                The image is the BACKGROUND of the right panel — the
                gradient shape (hero-shape section) sits BEHIND it, and
                location pins + mountain sit ON TOP of it.
                The mascot (falafel-meerkat) has been REMOVED per user
                request ("Delete this image").
                The `overflow-hidden` wrapper has been REMOVED so the
                image behaves like Style 1 — when the user scrolls to
                zoom IN, the image bleeds BEYOND the section border and
                is only clipped by the canvas border (1200×800). This
                matches Style 1's scroll/zoom effect exactly. */}
            {/* EditableImage renders its own `absolute inset-0` container
                that fills the SectionBox content area. The image inside
                uses `transform: scale(zoom)` from `center center` — when
                zoom > 1, it overflows and is clipped by the CANVAS border
                (since this SectionBox has no overflow-hidden), exactly
                like Style 1's DraggablePhotoContainer. */}
            {/* PER USER SPEC 2026-08-02 (TSK-0043): wrap the EditableImage
                in an `overflow-hidden` div so that when zoom > 1 (scroll to
                zoom in), the image bleeds BEYOND the section border and is
                clipped AT the section border (not the canvas border). This
                matches the deployed version (origin/main) which uses
                `DraggablePhotoContainer > div.overflow-hidden > EditableImage`.

                PER USER SPEC 2026-08-02 (TSK-0046): REVERTED the
                `minZoom={1}` constraint that TSK-0043 added. The user now
                wants Style 2's hero image to have the SAME scroll
                capabilities as Style 1 — including the ability to scroll
                BELOW 1× to shrink the image without any limit. With the
                default minZoom=0.01 (same as Style 1), scrolling down
                shrinks the image; the overflow-hidden wrapper above
                clips the resulting empty space at the section border.

                PER USER SPEC 2026-08-02 (TSK-0046): default imagePlacement
                is { focusX: 51, focusY: 34, zoom: 1 } (matches the
                "51/34-1.0x" readout the user specified). When the user
                hasn't panned/zoomed yet, this default is used. After
                the user pans/zooms, data.heroOverlay.imagePlacement is
                set and overrides this fallback.

                PER USER SPEC 2026-08-02 (TSK-0048): default imagePlacement
                updated to { focusX: 33, focusY: 62, zoom: 1 } (matches
                the "33/62-1.0x" readout the user specified). */}
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              {data.heroOverlay?.imageUrl ? (
                <EditableImage
                  slot={{ kind: "hero" }}
                  src={data.heroOverlay.imageUrl}
                  alt="Hero"
                  placement={data.heroOverlay.imagePlacement ?? { focusX: 33, focusY: 62, zoom: 1 }}
                  editable={editable}
                  previewScale={previewScale}
                  onPickImage={onPickImage}
                  onPlacementChange={onPlacementChange}
                  onSizeChange={onSizeChange}
                  sizeMultiplier={data.heroOverlay.imageScale ?? 1}
                  sizeLabel="hero scale"
                  containerClass="absolute inset-0"
                  objectFit={data.heroOverlay.fit === "contain" ? "contain" : "cover"}
                />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(255,255,255,0.04)",
                  }}
                />
              )}
            </div>

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
          </SectionBox>

          {/* ============================================================
              Layer 4: FOOTER BAR — dark charcoal, full-width, 80px tall
              Left: AI SALON logo (or brandingAsset image) + label
              Middle: IN COLLAB WITH + SPONSORED BY text pills
              Right: QR code
              ============================================================ */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "style2-footer"}
            pos={effectiveLayout("style2-footer").pos}
            boxSize={effectiveLayout("style2-footer").boxSize}
            scale={effectiveLayout("style2-footer").scale}
            onMove={(p) => onSectionMove?.("style2-footer", p)}
            onResize={(s) => onSectionResize?.("style2-footer", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("style2-footer", sz)}
            onSelect={() => setSelectedId("style2-footer")}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={effectiveLayout("style2-footer").z ?? 50}
            anchor="top-left"
            guideId="style2-footer"
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
                    {/* PER USER SPEC 2026-08-01 (TSK-0038): show the LOGO
                        URL (not the name) for each collaborator. Logos
                        render on a white pill (so dark logos are visible
                        against the dark footer) using object-contain so
                        the full logo is always shown without cropping. */}
                    {collaborators.map((c, i) => {
                      const sizeMult = Math.max(0.01, c.logoSize ?? 1);
                      const logoH = Math.round(24 * sizeMult);
                      const logoMinW = Math.round(60 * sizeMult);
                      return (
                        <div
                          key={`collab-${i}`}
                          style={{
                            height: `${logoH + 8}px`,
                            minWidth: `${logoMinW}px`,
                            background: "#FFFFFF",
                            borderRadius: "6px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            padding: "4px 8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          {c.logoUrl ? (
                            <Image
                              src={c.logoUrl}
                              alt={c.name}
                              fill
                              unoptimized
                              className="object-contain"
                              sizes="80px"
                              draggable={false}
                              style={{ padding: "2px 4px" }}
                            />
                          ) : (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "#0F172A",
                              }}
                            >
                              {c.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
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
                    {/* PER USER SPEC 2026-08-01 (TSK-0038): show the LOGO
                        URL (not the name) for each sponsor. Same white-pill
                        treatment as collaborators above. */}
                    {sponsors.map((s, i) => {
                      const sizeMult = Math.max(0.01, s.logoSize ?? 1);
                      const logoH = Math.round(24 * sizeMult);
                      const logoMinW = Math.round(60 * sizeMult);
                      return (
                        <div
                          key={`sponsor-${i}`}
                          style={{
                            height: `${logoH + 8}px`,
                            minWidth: `${logoMinW}px`,
                            background: "#FFFFFF",
                            borderRadius: "6px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            padding: "4px 8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          {s.logoUrl ? (
                            <Image
                              src={s.logoUrl}
                              alt={s.name}
                              fill
                              unoptimized
                              className="object-contain"
                              sizes="80px"
                              draggable={false}
                              style={{ padding: "2px 4px" }}
                            />
                          ) : (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "#0F172A",
                              }}
                            >
                              {s.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right: QR code (plain div, not a SectionBox — the entire
                  footer is draggable via the "style2-footer" SectionBox above) */}
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
              onSetAsDefault={onSetAsDefault}
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
              onSetAsDefault={onSetAsDefault}
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
