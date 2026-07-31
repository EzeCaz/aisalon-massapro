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

function sectionZFor(data: SpeakerIntroData, id: SectionId): number {
  const explicit = data.sectionLayout?.[id]?.z;
  if (typeof explicit === "number") return explicit;
  return 50;
}

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

    const sectionPeerZs: number[] = Object.keys(data.sectionLayout ?? {}).map((id) =>
      sectionZFor(data, id as SectionId),
    );

    const selectedLayout = selectedId ? data.sectionLayout?.[selectedId as SectionId] : undefined;

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
            pos={data.sectionLayout?.header?.pos}
            boxSize={data.sectionLayout?.header?.boxSize}
            scale={data.sectionLayout?.header?.scale}
            onMove={(p) => onSectionMove?.("header", p)}
            onResize={(s) => onSectionResize?.("header", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("header", sz)}
            onSelect={() => setSelectedId("header")}
            // onZChange is on ObjectPropertiesPanel, not SectionBox — see ObjectPropertiesPanel usage below.
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={sectionZFor(data, "header")}
            anchor="top-left"
            guideId="header"
            label="Header"
            style={{ left: 0, top: 0, width: `${CANVAS_W}px`, height: `${HEADER_H}px` }}
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
            pos={data.sectionLayout?.speakers?.pos}
            boxSize={data.sectionLayout?.speakers?.boxSize}
            scale={data.sectionLayout?.speakers?.scale}
            onMove={(p) => onSectionMove?.("speakers", p)}
            onResize={(s) => onSectionResize?.("speakers", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("speakers", sz)}
            onSelect={() => setSelectedId("speakers")}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={sectionZFor(data, "speakers")}
            anchor="top-left"
            guideId="speakers"
            label="Speakers"
            style={{ left: 0, top: `${HEADER_H}px`, width: `${LEFT_W}px`, height: `${MAIN_H}px` }}
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
              Layer 3: RIGHT PANEL — dark purple gradient hero with
              mountain silhouette, 4 location pins, meerkat mascot
              ============================================================ */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "topic"}
            pos={data.sectionLayout?.topic?.pos}
            boxSize={data.sectionLayout?.topic?.boxSize}
            scale={data.sectionLayout?.topic?.scale}
            onMove={(p) => onSectionMove?.("topic", p)}
            onResize={(s) => onSectionResize?.("topic", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("topic", sz)}
            onSelect={() => setSelectedId("topic")}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={sectionZFor(data, "topic")}
            anchor="top-left"
            guideId="topic"
            label="Hero (right panel)"
            style={{ left: `${LEFT_W}px`, top: `${HEADER_H}px`, width: `${RIGHT_W}px`, height: `${MAIN_H}px` }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                background:
                  "linear-gradient(180deg, #311B92 0%, #1A237E 55%, #0B0B2E 100%)",
                overflow: "hidden",
              }}
            >
              {/* Optional hero image overlay (low opacity, blends with gradient) */}
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
            pos={data.sectionLayout?.sponsors?.pos}
            boxSize={data.sectionLayout?.sponsors?.boxSize}
            scale={data.sectionLayout?.sponsors?.scale}
            onMove={(p) => onSectionMove?.("sponsors", p)}
            onResize={(s) => onSectionResize?.("sponsors", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("sponsors", sz)}
            onSelect={() => setSelectedId("sponsors")}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={sectionZFor(data, "sponsors")}
            anchor="top-left"
            guideId="sponsors"
            label="Footer"
            style={{ left: 0, top: `${HEADER_H + MAIN_H}px`, width: `${CANVAS_W}px`, height: `${FOOTER_H}px` }}
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
              ============================================================ */}
          {sectionsEditable && selectedId && selectedLayout && (
            <ObjectPropertiesPanel
              label={selectedId}
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

          <GuideOverlay />
        </div>
      </GuideProvider>
    );
  },
);

// Re-export ReactNode type for backward compatibility (was used by old
// render3DShape helper which has been removed in the TSK-0024 rewrite).
export type _ReactNode = ReactNode;
