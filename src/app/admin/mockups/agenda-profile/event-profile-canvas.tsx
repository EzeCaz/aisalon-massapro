"use client";

import { forwardRef, useRef } from "react";
import Image from "next/image";
import type {
  EventProfileData,
  Session,
  SessionType,
  Speaker,
  ImagePlacement,
  ImageSlot,
} from "./types";
import {
  resolvePlacement,
  sessionTypeLabel,
} from "./types";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import {
  ResizeHandle8,
  makeHandleResizeMouseDown8,
  makeHeroHandleMouseDown,
  type Handle8,
  type ResizeDragState,
  type HeroDragState,
} from "../shared/editable-image-helpers";
import {
  DragResizeBox,
  GuidesProvider,
  GuidesOverlay,
} from "../shared/qr-section-edit-helpers";

/**
 * EventProfileCanvas — the data-driven Event Profile mockup renderer.
 *
 * Layout (1200×1500 portrait poster):
 *   ┌────────────────────────────────────┐
 *   │  Hero image with gradient overlay  │  top 0-450
 *   │  + event name + date + venue       │
 *   │  + topic + description             │
 *   ├────────────────────────────────────┤
 *   │  AGENDA — sessions list            │  450-1000
 *   │  (breaks / networking auto-hidden) │
 *   ├────────────────────────────────────┤
 *   │  SPEAKERS — grid of cards          │  1000-1400
 *   ├────────────────────────────────────┤
 *   │  QR + sponsors + branding          │  1400-1500
 *   └────────────────────────────────────┘
 *
 * Editable mode (editable=true): the hero image, speaker photos, and
 * sponsor logos become interactive (drag/wheel/click to pan, zoom, swap).
 *
 * Sections edit mode (sectionsEditable=true): text sections (header,
 * topic, agenda, speakers, sponsors, branding, footer credit) + the QR
 * code each become draggable + resizable via DragResizeBox. Layout
 * overrides persist to `data.sectionLayout`, `data.qrPos`, and
 * `data.qrScale`. Text sections get high z-index (60+) so they always
 * render on top of the hero image and all sponsor logos.
 */

const CANVAS_W = 1200;
const CANVAS_H = 1500;

type Props = {
  data: EventProfileData;
  className?: string;
  editable?: boolean;
  /**
   * When true, text sections (header, topic, agenda, speakers, sponsors,
   * branding, footer credit) + the QR code become interactive (drag body
   * to move, 8 handles to resize). Independent from `editable` (image
   * edit) so the two modes can be toggled separately.
   */
  sectionsEditable?: boolean;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, placement: ImagePlacement) => void;
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  /** 2D resize callback for hero. */
  onHeroResize?: (newScaleX: number, newScaleY: number) => void;
  /** Hero container move callback. */
  onHeroMove?: (newPosX: number, newPosY: number) => void;
  /** QR body drag — updates qrPos (x, y) in % of canvas. */
  onQrMove?: (pos: { x: number; y: number }) => void;
  /** QR corner-handle drag — updates qrScale (0.01–6). */
  onQrResize?: (newScale: number) => void;
  /** Section body drag — updates sectionLayout[id].pos. */
  onSectionMove?: (sectionId: string, pos: { x: number; y: number }) => void;
  /** Section corner-handle drag — updates sectionLayout[id].scale (proportional). */
  onSectionResize?: (sectionId: string, newScale: number) => void;
  /** Section edge-handle drag — updates sectionLayout[id].scaleX / scaleY (axis-specific). */
  onSectionResize2D?: (
    sectionId: string,
    newScaleX: number,
    newScaleY: number,
  ) => void;
  previewScale?: number;
  /** Live brand-image URLs — used to resolve slots with taggedImageKey. */
  brandSettings?: {
    favicon: string;
    loginHero: string;
    loginBanner: string;
  };
};

export const EventProfileCanvas = forwardRef<HTMLDivElement, Props>(
  function EventProfileCanvas(
    {
      data,
      className,
      editable,
      sectionsEditable,
      onPickImage,
      onPlacementChange,
      onSizeChange,
      onHeroResize,
      onHeroMove,
      onQrMove,
      onQrResize,
      onSectionMove,
      onSectionResize,
      onSectionResize2D,
      previewScale = 1,
      brandSettings,
    },
    ref,
  ) {
    // Resolve tagged-image URL for the hero slot.
    const heroImageUrl = data.heroOverlay.taggedImageKey && brandSettings
      ? (data.heroOverlay.taggedImageKey === "favicon" ? brandSettings.favicon
         : data.heroOverlay.taggedImageKey === "loginHero" ? brandSettings.loginHero
         : brandSettings.loginBanner)
      : data.heroOverlay.imageUrl;
    const visibleSessions = data.sessions.filter((s) => s.visible !== false);
    const visibleSpeakers = data.speakers.filter((s) => s.visible !== false);

    // Internal canvas ref — used by GuidesProvider to convert screen
    // coordinates to canvas-% for alignment guide computation. We merge
    // it with the forwarded ref so the parent's PNG-export ref still works.
    const internalCanvasRef = useRef<HTMLDivElement | null>(null);
    const mergedRefCallback = (el: HTMLDivElement | null) => {
      internalCanvasRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    };

    // Helper to read a section's layout override safely.
    const layoutFor = (id: string) => data.sectionLayout?.[id];

    return (
      <GuidesProvider
        canvasRef={internalCanvasRef}
        enabled={!!(editable || sectionsEditable)}
      >
      <div
        ref={mergedRefCallback}
        className={`relative bg-white overflow-hidden ${className ?? ""}`}
        style={{
          width: `${CANVAS_W}px`,
          height: `${CANVAS_H}px`,
          fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
        }}
      >
        {/* ===== HERO BLOCK (top 0-450 by default, scales with imageScaleY) ===== */}
        {(() => {
          // imageScale (X): 1 = full canvas width (100%). Range 0.01–6.
          const scaleX = Math.max(0.01, Math.min(6, data.heroOverlay.imageScale ?? 1));
          const heroWidth = 100 * scaleX; // % of canvas
          // imageScaleY: 1 = 450px hero height (default). Range 0.01–6.
          const scaleY = Math.max(0.01, Math.min(6, data.heroOverlay.imageScaleY ?? 1));
          const heroHeight = 450 * scaleY; // px
          // Default position: centered horizontally (X), top-aligned (Y=0).
          // When imagePos is set, use the stored position.
          const defaultLeft = (100 - heroWidth) / 2;
          const heroLeft = data.heroOverlay.imagePos?.x ?? defaultLeft;
          const heroTop = data.heroOverlay.imagePos?.y ?? 0;
          return (
        <div
          className="absolute"
          style={{
            left: `${heroLeft}%`,
            top: `${heroTop}%`,
            width: `${heroWidth}%`,
            height: `${heroHeight}px`,
          }}
        >
          {/* Background hero image */}
          <EditableImage
            slot={{ kind: "hero" }}
            src={heroImageUrl}
            alt="Event hero"
            placement={data.heroOverlay.imagePlacement}
            editable={editable}
            previewScale={previewScale}
            onPickImage={onPickImage}
            onPlacementChange={onPlacementChange}
            onSizeChange={onSizeChange}
            onHeroResize={onHeroResize}
            onHeroMove={onHeroMove}
            heroScaleX={data.heroOverlay.imageScale ?? 1}
            heroScaleY={data.heroOverlay.imageScaleY ?? 1}
            heroPos={data.heroOverlay.imagePos}
            sizeMultiplier={data.heroOverlay.imageScale ?? 1}
            sizeLabel="hero scale"
            containerClass="absolute inset-0"
            objectFit="cover"
          />
          {/* Gradient overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(180deg,
                ${data.heroOverlay.gradientColors[0]}${alpha(data.heroOverlay.gradientOpacity)} 0%,
                ${data.heroOverlay.gradientColors[1] ?? data.heroOverlay.gradientColors[0]}${alpha(data.heroOverlay.gradientOpacity * 0.7)} 50%,
                rgba(0,0,0,0.85) 100%)`,
            }}
            aria-hidden
          />
        </div>
          );
        })()}

        {/* ===== HEADER — "AI Salon Tel Aviv Presents" + event name + date/time/venue =====
            Extracted from the hero block so it's independently draggable +
            resizable in section-edit mode. High z-index (60) so text always
            renders on top of the hero image and gradient. */}
        <DragResizeBox
          active={sectionsEditable}
          pos={layoutFor("header")?.pos}
          scale={layoutFor("header")?.scale}
          scaleX={layoutFor("header")?.scaleX}
          scaleY={layoutFor("header")?.scaleY}
          onMove={(p) => onSectionMove?.("header", p)}
          onResize={(s) => onSectionResize?.("header", s)}
          onResize2D={(sx, sy) => onSectionResize2D?.("header", sx, sy)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute"
          style={{ left: "48px", top: "60px", right: "48px" }}
          accentColor="#FF005A"
          label="Header"
          guideId="header"
          zIndex={60}
        >
          <p
            className="font-bold uppercase tracking-widest text-white/90 mb-3"
            style={{ fontSize: "12px", letterSpacing: "0.25em" }}
          >
            AI Salon Tel Aviv Presents
          </p>
          <h1
            className="font-extrabold text-white leading-[1.05] tracking-tight"
            style={{ fontSize: "56px", maxWidth: "900px" }}
          >
            {data.event.name}
          </h1>
          <div
            className="flex items-center gap-3 mt-5 text-white/95 font-semibold"
            style={{ fontSize: "18px" }}
          >
            <span>{data.event.date}</span>
            <span className="text-white/40">·</span>
            <span>{data.event.time}</span>
            <span className="text-white/40">·</span>
            <span className="text-white/85">{data.event.venue}</span>
          </div>
        </DragResizeBox>

        {/* ===== TOPIC + DESCRIPTION (bottom of hero, accent bar) =====
            Extracted from the hero block. z-index 61. */}
        <DragResizeBox
          active={sectionsEditable}
          pos={layoutFor("topic")?.pos}
          scale={layoutFor("topic")?.scale}
          scaleX={layoutFor("topic")?.scaleX}
          scaleY={layoutFor("topic")?.scaleY}
          onMove={(p) => onSectionMove?.("topic", p)}
          onResize={(s) => onSectionResize?.("topic", s)}
          onResize2D={(sx, sy) => onSectionResize2D?.("topic", sx, sy)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute flex items-start gap-3"
          style={{ left: "48px", top: "330px", right: "48px" }}
          accentColor="#FF005A"
          label="Topic"
          guideId="topic"
          zIndex={61}
        >
          <div
            className="shrink-0 self-stretch rounded-sm"
            style={{
              width: "6px",
              background: `linear-gradient(180deg, ${data.event.brandColors[0]}, ${data.event.brandColors[1]})`,
            }}
            aria-hidden
          />
          <div>
            <h2
              className="font-extrabold text-white leading-tight"
              style={{ fontSize: "28px" }}
            >
              {data.event.topic}
            </h2>
            {data.event.description && (
              <p
                className="text-white/85 leading-relaxed mt-2"
                style={{ fontSize: "14px", maxWidth: "780px" }}
              >
                {data.event.description}
              </p>
            )}
          </div>
        </DragResizeBox>

        {/* ===== AGENDA BLOCK (450-1000, but auto-sizes) =====
            Wrapped in DragResizeBox so the user can drag + resize the
            whole agenda list in section-edit mode. z-index 62. */}
        <DragResizeBox
          active={sectionsEditable}
          pos={layoutFor("agenda")?.pos}
          scale={layoutFor("agenda")?.scale}
          scaleX={layoutFor("agenda")?.scaleX}
          scaleY={layoutFor("agenda")?.scaleY}
          onMove={(p) => onSectionMove?.("agenda", p)}
          onResize={(s) => onSectionResize?.("agenda", s)}
          onResize2D={(sx, sy) => onSectionResize2D?.("agenda", sx, sy)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute"
          style={{ left: "48px", top: "490px", right: "48px" }}
          accentColor="#FF005A"
          label="Agenda"
          guideId="agenda"
          zIndex={62}
        >
          <div className="flex items-center gap-3 mb-5">
            <h2
              className="font-extrabold text-black uppercase tracking-wider"
              style={{ fontSize: "22px", letterSpacing: "0.15em" }}
            >
              Agenda
            </h2>
            <div
              className="h-px flex-1"
              style={{
                background: `linear-gradient(90deg, ${data.event.brandColors[1]}, transparent)`,
              }}
            />
            <span className="text-xs text-black/80">
              {visibleSessions.length} of {data.sessions.length} sessions shown
            </span>
          </div>
          <div className="flex flex-col">
            {visibleSessions.length === 0 ? (
              <p className="text-black/80 text-sm italic">
                No sessions to show — toggle some back on in the sidebar.
              </p>
            ) : (
              visibleSessions.map((session) => (
                <AgendaRow
                  key={`session-${session.order}`}
                  session={session}
                  accentColor={data.event.brandColors[0]}
                />
              ))
            )}
          </div>
        </DragResizeBox>

        {/* ===== SPEAKERS BLOCK =====
            Wrapped in DragResizeBox. z-index 63. */}
        <DragResizeBox
          active={sectionsEditable}
          pos={layoutFor("speakers")?.pos}
          scale={layoutFor("speakers")?.scale}
          scaleX={layoutFor("speakers")?.scaleX}
          scaleY={layoutFor("speakers")?.scaleY}
          onMove={(p) => onSectionMove?.("speakers", p)}
          onResize={(s) => onSectionResize?.("speakers", s)}
          onResize2D={(sx, sy) => onSectionResize2D?.("speakers", sx, sy)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute"
          style={{ left: "48px", top: "1020px", right: "48px" }}
          accentColor="#FF005A"
          label="Speakers"
          guideId="speakers"
          zIndex={63}
        >
          <div className="flex items-center gap-3 mb-5">
            <h2
              className="font-extrabold text-black uppercase tracking-wider"
              style={{ fontSize: "22px", letterSpacing: "0.15em" }}
            >
              Speakers
            </h2>
            <div
              className="h-px flex-1"
              style={{
                background: `linear-gradient(90deg, ${data.event.brandColors[1]}, transparent)`,
              }}
            />
            <span className="text-xs text-black/80">
              {visibleSpeakers.length} of {data.speakers.length} shown
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {visibleSpeakers.map((speaker, idx) => (
              <SpeakerCard
                key={`speaker-${speaker.order}-${speaker.fullName}`}
                speaker={speaker}
                accentColor={data.event.brandColors[0]}
                editable={editable}
                slot={{ kind: "speaker", index: idx }}
                previewScale={previewScale}
                onPickImage={onPickImage}
                onPlacementChange={onPlacementChange}
                onSizeChange={onSizeChange}
              />
            ))}
          </div>
        </DragResizeBox>

        {/* ===== SPONSORS + COLLABORATORS (above QR/branding, ON TOP) =====
            Wrapped in a single DragResizeBox (collaborators + sponsors
            together). anchor="top-right" so scaling doesn't shift the
            right-anchored box. z-index 70 (high — above all other
            sections per user spec). */}
        {(data.collaborators.length > 0 || data.sponsors.length > 0) && (
          <DragResizeBox
            active={sectionsEditable}
            pos={layoutFor("sponsors")?.pos}
            scale={layoutFor("sponsors")?.scale}
            scaleX={layoutFor("sponsors")?.scaleX}
            scaleY={layoutFor("sponsors")?.scaleY}
            onMove={(p) => onSectionMove?.("sponsors", p)}
            onResize={(s) => onSectionResize?.("sponsors", s)}
            onResize2D={(sx, sy) => onSectionResize2D?.("sponsors", sx, sy)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            className="absolute flex flex-col items-end gap-2"
            style={{ left: "48px", right: "48px", bottom: "130px" }}
            anchor="top-right"
            accentColor="#FF005A"
            label="Sponsors"
            guideId="sponsors"
            zIndex={70}
          >
            {data.collaborators.length > 0 && (
              <div className="flex flex-col items-end gap-1.5">
                <span
                  className="text-black/80 font-semibold uppercase tracking-wider"
                  style={{ fontSize: "10px", letterSpacing: "0.18em" }}
                >
                  In partnership with
                </span>
                <div className="flex items-center gap-3">
                  {data.collaborators.map((s, i) => (
                    <SponsorLogo
                      key={`collab-${i}-${s.name}`}
                      sponsor={s}
                      editable={editable}
                      slot={{ kind: "sponsor", group: "collaborators", index: i }}
                      onPickImage={onPickImage}
                      onSizeChange={onSizeChange}
                      previewScale={previewScale}
                    />
                  ))}
                </div>
              </div>
            )}
            {data.sponsors.length > 0 && (
              <div className="flex flex-col items-end gap-1.5">
                <span
                  className="text-black/80 font-semibold uppercase tracking-wider"
                  style={{ fontSize: "10px", letterSpacing: "0.18em" }}
                >
                  Sponsored by
                </span>
                <div className="flex items-center gap-3">
                  {data.sponsors.map((s, i) => (
                    <SponsorLogo
                      key={`sponsor-${i}-${s.name}`}
                      sponsor={s}
                      editable={editable}
                      slot={{ kind: "sponsor", group: "sponsors", index: i }}
                      onPickImage={onPickImage}
                      onSizeChange={onSizeChange}
                      previewScale={previewScale}
                    />
                  ))}
                </div>
              </div>
            )}
          </DragResizeBox>
        )}

        {/* ===== QR CODE (bottom-left) =====
            Active when EITHER image-edit OR section-edit mode is on
            (QR is treated as both an image-like element AND a section).
            anchor="top-left" since the QR is at the left side of the
            canvas (default left: 48px, bottom: 36px). z-index 65. */}
        <DragResizeBox
          active={editable || sectionsEditable}
          pos={data.qrPos}
          scale={data.qrScale}
          onMove={onQrMove}
          onResize={onQrResize}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute flex items-center gap-3"
          style={{ left: "48px", bottom: "36px" }}
          label="QR Code"
          guideId="qr"
          zIndex={65}
        >
          <div
            className="rounded-md bg-white p-2 shadow-md"
            style={{ width: "84px", height: "84px" }}
          >
            <QrCode url={data.qrCodeUrl} size={68} />
          </div>
          <div>
            <p
              className="font-bold text-black uppercase tracking-wider"
              style={{ fontSize: "11px", letterSpacing: "0.18em" }}
            >
              Register here
            </p>
            <p className="text-black/50 text-[0.7rem] mt-0.5">
              Scan to RSVP on the event page
            </p>
          </div>
        </DragResizeBox>

        {/* ===== BRANDING (bottom-right corner) =====
            anchor="top-right" so scaling doesn't shift the right-anchored
            box. z-index 71 (above sponsors per spec). */}
        <DragResizeBox
          active={sectionsEditable}
          pos={layoutFor("branding")?.pos}
          scale={layoutFor("branding")?.scale}
          scaleX={layoutFor("branding")?.scaleX}
          scaleY={layoutFor("branding")?.scaleY}
          onMove={(p) => onSectionMove?.("branding", p)}
          onResize={(s) => onSectionResize?.("branding", s)}
          onResize2D={(sx, sy) => onSectionResize2D?.("branding", sx, sy)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute"
          style={{ right: "48px", bottom: "36px" }}
          anchor="top-right"
          accentColor="#FF005A"
          label="Branding"
          guideId="branding"
          zIndex={71}
        >
          <span
            className="inline-flex items-center text-black"
            style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.02em" }}
          >
            <span
              className="inline-block w-5 h-5 mr-1.5 rounded-sm"
              style={{
                background: `linear-gradient(135deg, ${data.event.brandColors[0]}, ${data.event.brandColors[1]})`,
              }}
              aria-hidden
            />
            <span className="lowercase">ai salon</span>
          </span>
        </DragResizeBox>

        {/* ===== FOOTER CREDIT (bottom-left, optional) =====
            z-index 72 (above branding). Only rendered when data.footerCredit
            is set. */}
        {data.footerCredit && (
          <DragResizeBox
            active={sectionsEditable}
            pos={layoutFor("footerCredit")?.pos}
            scale={layoutFor("footerCredit")?.scale}
            scaleX={layoutFor("footerCredit")?.scaleX}
            scaleY={layoutFor("footerCredit")?.scaleY}
            onMove={(p) => onSectionMove?.("footerCredit", p)}
            onResize={(s) => onSectionResize?.("footerCredit", s)}
            onResize2D={(sx, sy) => onSectionResize2D?.("footerCredit", sx, sy)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            className="absolute"
            style={{ left: "48px", bottom: "12px" }}
            accentColor="#FF005A"
            label="Footer credit"
            guideId="footerCredit"
            zIndex={72}
          >
            <span
              className="text-black/80"
              style={{ fontSize: "10px" }}
            >
              {data.footerCredit}
            </span>
          </DragResizeBox>
        )}

        {/* Alignment guide lines overlay — rendered last so it sits on
            top of all sections. Pointer-events: none so it doesn't
            interfere with drag operations. */}
        <GuidesOverlay />
      </div>
      </GuidesProvider>
    );
  },
);

/** Convert a 0-1 opacity to a 2-digit hex alpha suffix. */
function alpha(opacity: number): string {
  const v = Math.max(0, Math.min(1, opacity));
  const hex = Math.round(v * 255).toString(16);
  return hex.length === 1 ? "0" + hex : hex;
}

// ---------------------------------------------------------------------------
// AgendaRow — one session in the agenda list.
// ---------------------------------------------------------------------------

function AgendaRow({
  session,
  accentColor,
}: {
  session: Session;
  accentColor: string;
}) {
  const typeLabel = sessionTypeLabel(session.type);
  const typeColor = typeColorFor(session.type, accentColor);
  return (
    <div
      className="flex items-stretch gap-4 py-3 border-b border-black/10 last:border-b-0"
    >
      {/* Time block */}
      <div className="shrink-0 w-20 text-right">
        <p
          className="font-bold text-black font-mono"
          style={{ fontSize: "14px" }}
        >
          {session.startTime ?? "--:--"}
        </p>
        {session.endTime && (
          <p className="text-black/80 font-mono" style={{ fontSize: "11px" }}>
            {session.endTime}
          </p>
        )}
      </div>
      {/* Type pill */}
      <div className="shrink-0 flex items-start pt-0.5">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-white font-bold uppercase tracking-wider"
          style={{
            fontSize: "9px",
            letterSpacing: "0.1em",
            background: typeColor,
          }}
        >
          {typeLabel}
        </span>
      </div>
      {/* Title + speaker */}
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold text-black leading-snug"
          style={{ fontSize: "15px" }}
        >
          {session.title}
        </p>
        {session.speakerName && (
          <p className="text-black/55 mt-0.5" style={{ fontSize: "12px" }}>
            {session.speakerName}
          </p>
        )}
        {session.description && (
          <p className="text-black/45 mt-1 leading-snug" style={{ fontSize: "11px" }}>
            {session.description}
          </p>
        )}
      </div>
    </div>
  );
}

/** Color for the type pill, varies by session type. */
function typeColorFor(t: SessionType, accent: string): string {
  switch (t) {
    case "WELCOME": return "#004F98";
    case "TALK": return accent;
    case "PANEL": return "#820A7D";
    case "FAST_PITCH": return "#FF005A";
    case "BREAK": return "#9ca3af";
    case "NETWORKING": return "#007E72";
    case "CHECKIN": return "#9ca3af";
    case "OTHER":
    default: return "#004F98";
  }
}

// ---------------------------------------------------------------------------
// SpeakerCard — one speaker in the grid.
// ---------------------------------------------------------------------------

function SpeakerCard({
  speaker,
  accentColor,
  editable,
  slot,
  previewScale,
  onPickImage,
  onPlacementChange,
  onSizeChange,
}: {
  speaker: Speaker;
  accentColor: string;
  editable?: boolean;
  slot: ImageSlot;
  previewScale: number;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, p: ImagePlacement) => void;
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
}) {
  const photoSize = Math.max(0.25, Math.min(4, speaker.photoSize ?? 1));
  const photoPx = Math.round(96 * photoSize);
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg bg-white border border-black/10 p-3 shadow-sm">
      <div
        className="relative rounded-md overflow-hidden border-2"
        style={{
          width: `${photoPx}px`,
          height: `${photoPx}px`,
          borderColor: accentColor,
        }}
      >
        <EditableImage
          slot={slot}
          src={speaker.photoUrl}
          alt={speaker.fullName}
          placement={speaker.photoPlacement}
          editable={editable}
          previewScale={previewScale}
          onPickImage={onPickImage}
          onPlacementChange={onPlacementChange}
          onSizeChange={onSizeChange}
          sizeMultiplier={speaker.photoSize ?? 1}
          sizeLabel="photo"
          containerClass="absolute inset-0"
          objectFit="cover"
        />
      </div>
      <div className="min-w-0 w-full">
        <div className="flex items-center gap-1.5 flex-wrap">
          {speaker.sessionTime && (
            <span
              className="inline-block rounded-full px-1.5 py-0.5 text-white font-bold tracking-wider font-mono"
              style={{
                fontSize: "9px",
                background: "#004F98",
              }}
            >
              {speaker.sessionTime}
            </span>
          )}
          {speaker.role && speaker.role !== "Speaker" && (
            <span
              className="inline-block rounded-full px-1.5 py-0.5 text-white font-bold uppercase tracking-wider"
              style={{
                fontSize: "8px",
                letterSpacing: "0.1em",
                background: accentColor,
              }}
            >
              {speaker.role}
            </span>
          )}
        </div>
        <p className="font-bold text-black leading-tight mt-1" style={{ fontSize: "14px" }}>
          {speaker.fullName}
        </p>
        <p className="text-black/65 leading-snug mt-0.5" style={{ fontSize: "11px" }}>
          {speaker.title}
          {speaker.title && speaker.company ? ", " : ""}
          <span className="font-semibold">{speaker.company}</span>
        </p>
        {speaker.sessionTitle && (
          <p className="text-black/45 leading-snug mt-1 italic" style={{ fontSize: "10px" }}>
            “{speaker.sessionTitle}”
          </p>
        )}
        {speaker.bio && (
          <p className="text-black/50 leading-snug mt-1.5" style={{ fontSize: "10px" }}>
            {speaker.bio}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditableImage — same as in speaker-intro-canvas. Drag/wheel/double-click.
// ---------------------------------------------------------------------------

function EditableImage({
  slot,
  src,
  alt,
  placement,
  editable,
  previewScale,
  onPickImage,
  onPlacementChange,
  onSizeChange,
  onHeroResize,
  onHeroMove,
  heroScaleX,
  heroScaleY,
  heroPos,
  sizeMultiplier,
  sizeLabel,
  containerClass,
  objectFit,
}: {
  slot: ImageSlot;
  src: string;
  alt: string;
  placement?: ImagePlacement;
  editable?: boolean;
  previewScale: number;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, p: ImagePlacement) => void;
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  /** 2D resize callback (hero only). */
  onHeroResize?: (newScaleX: number, newScaleY: number) => void;
  /** Container move callback (hero only). */
  onHeroMove?: (newPosX: number, newPosY: number) => void;
  heroScaleX?: number;
  heroScaleY?: number;
  heroPos?: { x?: number; y?: number };
  sizeMultiplier?: number;
  sizeLabel?: string;
  containerClass: string;
  objectFit: "cover" | "contain";
}) {
  const { focusX, focusY, zoom } = resolvePlacement(placement);
  const dragRef = useRef<HeroDragState | null>(null);
  const resizeRef = useRef<ResizeDragState | null>(null);

  // Guard: if src is missing/empty, render a placeholder instead of <Image>.
  // Next.js throws "Image is missing required src" if src is empty string.
  const hasSrc = typeof src === "string" && src.trim().length > 0;

  // Hero slot: 2D resize + drag-to-move.
  // Speaker/sponsor slot: pan-within-container + 4-corner single-axis resize.
  const isHero = slot.kind === "hero";

  // Build the handlers using the shared utilities.
  const handleResizeMouseDown8 = makeHandleResizeMouseDown8({
    isHero,
    editable,
    previewScale,
    sizeMultiplier,
    heroScaleX,
    heroScaleY,
    heroPos: heroPos as { x: number; y: number } | undefined,
    onHeroResize,
    onSizeChange,
    slot,
    resizeRef,
  });

  const handleHeroMouseDown = makeHeroHandleMouseDown({
    editable: editable && isHero,
    previewScale,
    focusX,
    focusY,
    zoom,
    heroPos: heroPos as { x: number; y: number } | undefined,
    onHeroMove,
    onPlacementChange,
    slot,
    dragRef,
  });

  // Whether to render the 8-handle set (hero) or 4-handle set (speaker/sponsor).
  const showHeroHandles = editable && isHero && onHeroResize;
  const showSponsorHandles = editable && !isHero && onSizeChange;

  // For non-hero (speaker/sponsor): keep the legacy 4-corner resize handler.
  function handleResizeMouseDownSponsor(
    e: React.MouseEvent,
    corner: "nw" | "ne" | "se" | "sw",
  ) {
    if (!editable || !onSizeChange) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startSize = sizeMultiplier ?? 1;
    const handleAs8: Handle8 = corner;
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startSize,
      startScaleX: heroScaleX ?? 1,
      startScaleY: heroScaleY ?? 1,
      startPosX: heroPos?.x ?? 0,
      startPosY: heroPos?.y ?? 0,
      handle: handleAs8,
    };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      // Corrected corner formulas: dragging a corner AWAY from center grows
      // the image; dragging it TOWARD the opposite corner shrinks it.
      let signedDiag: number;
      switch (r.handle) {
        case "se": signedDiag = dx + dy; break;
        case "nw": signedDiag = -(dx + dy); break;
        case "ne": signedDiag = dx - dy; break;
        case "sw": signedDiag = -dx + dy; break;
        default: signedDiag = dx + dy;
      }
      const sensitivity = 100 * previewScale;
      const delta = signedDiag / sensitivity;
      const next = Math.max(0.01, Math.min(6, r.startSize + delta));
      onSizeChange(slot, next);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleMouseDownForNonHero(e: React.MouseEvent) {
    if (!editable || !onPlacementChange) return;
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startFocusX: focusX,
      startFocusY: focusY,
      startPosX: 0,
      startPosY: 0,
      isShift: false,
    };
    (e.currentTarget as HTMLElement).style.cursor = "grabbing";

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      const sensitivity = 6 * previewScale;
      const nextFocusX = Math.max(0, Math.min(100, d.startFocusX - dx / sensitivity));
      const nextFocusY = Math.max(0, Math.min(100, d.startFocusY - dy / sensitivity));
      onPlacementChange(slot, {
        focusX: nextFocusX,
        focusY: nextFocusY,
        zoom,
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const el = document.getElementById(`ep-editable-img-${slotKey(slot)}`);
      if (el) el.style.cursor = "grab";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleWheel(e: React.WheelEvent) {
    if (!editable || !onPlacementChange) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.1 : -0.1;
    const nextZoom = Math.max(1, Math.min(4, zoom + step));
    onPlacementChange(slot, { focusX, focusY, zoom: nextZoom });
  }

  function handleDoubleClick() {
    if (!editable) return;
    // For hero: reset position + scales + placement.
    if (isHero) {
      if (onHeroMove) onHeroMove(0, 0);
      if (onHeroResize) onHeroResize(1, 1);
      if (onPlacementChange) onPlacementChange(slot, { focusX: 50, focusY: 50, zoom: 1 });
      return;
    }
    if (onPlacementChange) {
      onPlacementChange(slot, { focusX: 50, focusY: 50, zoom: 1 });
    }
  }

  return (
    <div
      id={`ep-editable-img-${slotKey(slot)}`}
      className={`${containerClass} group`}
      style={{
        cursor: editable ? "grab" : "default",
        outline: editable ? "2px dashed rgba(0, 102, 255, 0.7)" : undefined,
        outlineOffset: editable ? "-2px" : undefined,
      }}
      onMouseDown={isHero ? handleHeroMouseDown : handleMouseDownForNonHero}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    >
      {hasSrc ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          className={objectFit === "cover" ? "object-cover" : "object-contain"}
          sizes="700px"
          style={{
            objectPosition: `${focusX}% ${focusY}%`,
            // Tiny overscan (1.005x) to eliminate subpixel white gap at the
            // container edge — see speaker-intro-canvas.tsx for the full
            // explanation.
            transform: `scale(${zoom * 1.005})`,
            transformOrigin: "center center",
            willChange: "transform",
            backfaceVisibility: "hidden",
            transition: dragRef.current ? "none" : "transform 80ms ease-out",
          }}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/5 text-black/80 text-[11px] font-mono pointer-events-none">
          [no image]
        </div>
      )}
      {editable && onPickImage && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPickImage(slot); }}
          className="absolute top-1 left-1 z-10 inline-flex items-center gap-1 rounded bg-[#0066FF] text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider shadow-md hover:bg-[#0052CC] opacity-100 transition"
          style={{ pointerEvents: "auto" }}
        >
          Replace
        </button>
      )}
      {editable && (
        <div className="absolute bottom-1 right-1 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-white opacity-100 transition pointer-events-none">
          {isHero && heroPos
            ? `x:${(heroPos.x ?? 0).toFixed(0)} y:${(heroPos.y ?? 0).toFixed(0)} · ${(heroScaleX ?? 1).toFixed(2)}×${(heroScaleY ?? 1).toFixed(2)} · z${zoom.toFixed(1)}`
            : `${Math.round(focusX)}/${Math.round(focusY)} · ${zoom.toFixed(1)}×`}
        </div>
      )}
      {/* Edit-mode hint badge (top-center) */}
      {editable && (
        <div
          className="absolute top-1 left-1/2 -translate-x-1/2 z-20 rounded bg-[#FF005A] px-2 py-0.5 text-[9px] font-mono text-white opacity-100 transition pointer-events-none whitespace-nowrap"
        >
          {isHero
            ? `${sizeLabel ?? "hero"}: ${(heroScaleX ?? 1).toFixed(2)}× / ${(heroScaleY ?? 1).toFixed(2)}× (drag body to move)`
            : `${sizeLabel ?? "size"}: ${(sizeMultiplier ?? 1).toFixed(2)}×`}
        </div>
      )}
      {/* 8 resize handles (hero only) */}
      {showHeroHandles && (
        <>
          <ResizeHandle8 handle="nw" onMouseDown={handleResizeMouseDown8} />
          <ResizeHandle8 handle="n"  onMouseDown={handleResizeMouseDown8} />
          <ResizeHandle8 handle="ne" onMouseDown={handleResizeMouseDown8} />
          <ResizeHandle8 handle="e"  onMouseDown={handleResizeMouseDown8} />
          <ResizeHandle8 handle="se" onMouseDown={handleResizeMouseDown8} />
          <ResizeHandle8 handle="s"  onMouseDown={handleResizeMouseDown8} />
          <ResizeHandle8 handle="sw" onMouseDown={handleResizeMouseDown8} />
          <ResizeHandle8 handle="w"  onMouseDown={handleResizeMouseDown8} />
        </>
      )}
      {/* 4 corner handles (speaker/sponsor only) */}
      {showSponsorHandles && (
        <>
          <div
            onMouseDown={(e) => handleResizeMouseDownSponsor(e, "nw")}
            className="absolute top-0 left-0 cursor-nwse-resize z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDownSponsor(e, "ne")}
            className="absolute top-0 right-0 cursor-nesw-resize z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDownSponsor(e, "se")}
            className="absolute bottom-0 right-0 cursor-nwse-resize z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDownSponsor(e, "sw")}
            className="absolute bottom-0 left-0 cursor-nesw-resize z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
        </>
      )}
    </div>
  );
}

function slotKey(slot: ImageSlot): string {
  if (slot.kind === "hero") return "hero";
  if (slot.kind === "speaker") return `speaker-${slot.index}`;
  return `sponsor-${slot.group}-${slot.index}`;
}

// ---------------------------------------------------------------------------
// QrCode — same as in speaker-intro-canvas.
// ---------------------------------------------------------------------------

function QrCode({ url, size }: { url: string; size: number }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: size,
      margin: 0,
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    })
      .then((d) => { if (!cancelled) setDataUrl(d); })
      .catch((err) => console.error("QR generation failed:", err));
    return () => { cancelled = true; };
  }, [url, size]);
  if (!dataUrl) {
    return (
      <div className="bg-black/5 animate-pulse" style={{ width: size, height: size }} />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt="QR code" width={size} height={size} />;
}

// ---------------------------------------------------------------------------
// SponsorLogo — one logo in the "In collaboration with" / "Sponsored by" row.
// Logos use object-contain (no crop), so they don't take a placement.
// logoSize: 1 = 32px height (default), 2 = 64px, 0.5 = 16px.
// ---------------------------------------------------------------------------

function SponsorLogo({
  sponsor,
  editable,
  slot,
  onPickImage,
  onSizeChange,
  previewScale = 1,
}: {
  sponsor: { name: string; logoUrl: string; logoSize?: number };
  editable?: boolean;
  slot: ImageSlot;
  onPickImage?: (slot: ImageSlot) => void;
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  previewScale?: number;
}) {
  const sizeMult = Math.max(0.25, Math.min(6, sponsor.logoSize ?? 1));
  const heightPx = Math.round(32 * sizeMult);
  const minWidthPx = Math.round(80 * sizeMult);

  const resizeRef = useRef<{
    startX: number; startY: number;
    startSize: number;
    corner: "nw" | "ne" | "se" | "sw";
  } | null>(null);

  function handleResizeMouseDown(
    e: React.MouseEvent,
    corner: "nw" | "ne" | "se" | "sw",
  ) {
    if (!editable || !onSizeChange) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startSize = sponsor.logoSize ?? 1;
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startSize, corner };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      // Corrected corner formulas: see comment above.
      let signedDiag: number;
      switch (r.corner) {
        case "se": signedDiag = dx + dy; break;
        case "nw": signedDiag = -(dx + dy); break;
        case "ne": signedDiag = dx - dy; break;
        case "sw": signedDiag = -dx + dy; break;
      }
      const sensitivity = 100 * previewScale;
      const delta = signedDiag / sensitivity;
      const next = Math.max(0.25, Math.min(6, r.startSize + delta));
      onSizeChange(slot, next);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`relative flex items-center justify-center bg-white rounded px-2 py-1 border group ${
        editable ? "border-[#0066FF]/70" : "border-black/10"
      }`}
      style={{ height: `${heightPx}px`, minWidth: `${minWidthPx}px` }}
    >
      <div className="relative w-full h-full">
        {sponsor.logoUrl && sponsor.logoUrl.trim() ? (
          <Image
            src={sponsor.logoUrl}
            alt={sponsor.name}
            fill
            unoptimized
            className="object-contain"
            sizes="80px"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-black/30 text-[9px] font-mono">
            [logo]
          </div>
        )}
      </div>
      {editable && onPickImage && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPickImage(slot);
          }}
          className="absolute -top-1.5 -right-1.5 z-10 rounded-full bg-[#0066FF] text-white px-1.5 py-0.5 text-[9px] font-bold uppercase shadow hover:bg-[#0052CC]"
        >
          ↻
        </button>
      )}
      {editable && onSizeChange && (
        <>
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 rounded bg-[#FF005A] px-1.5 py-0.5 text-[8px] font-mono text-white opacity-100 transition pointer-events-none whitespace-nowrap">
            logo: {sizeMult.toFixed(2)}×
          </div>
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "nw")}
            className="absolute top-0 left-0 cursor-nwse-resize z-30 w-2.5 h-2.5 bg-white border-2 border-[#FF005A] rounded-sm shadow opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "ne")}
            className="absolute top-0 right-0 cursor-nesw-resize z-30 w-2.5 h-2.5 bg-white border-2 border-[#FF005A] rounded-sm shadow opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "se")}
            className="absolute bottom-0 right-0 cursor-nwse-resize z-30 w-2.5 h-2.5 bg-white border-2 border-[#FF005A] rounded-sm shadow opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "sw")}
            className="absolute bottom-0 left-0 cursor-nesw-resize z-30 w-2.5 h-2.5 bg-white border-2 border-[#FF005A] rounded-sm shadow opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
        </>
      )}
    </div>
  );
}
