"use client";

import { forwardRef, useRef, useState, useEffect } from "react";
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
import {
  GuideProvider,
  GuideOverlay,
  SectionBox,
  ObjectPropertiesPanel,
  useCanvasScrollIsolation,
  useNonPassiveWheel,
  type SectionId,
  type SectionPos,
  type SectionBoxSize,
} from "../shared/section-edit";

/**
 * AgendaProfileCanvas — the data-driven Agenda Profile mockup renderer.
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
 */

const CANVAS_W = 1200;
const CANVAS_H = 1500;

type Props = {
  data: EventProfileData;
  className?: string;
  editable?: boolean;
  sectionsEditable?: boolean;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, placement: ImagePlacement) => void;
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  onSectionMove?: (id: SectionId, pos: SectionPos) => void;
  onSectionResize?: (id: SectionId, scale: number) => void;
  /** Called when a section is resized via a mid-edge handle — updates the
   *  box's explicit width/height in canvas px. */
  onSectionBoxResize?: (id: SectionId, size: SectionBoxSize) => void;
  onHeroZChange?: (z: number) => void;
  /** Called when the hero overlay X scale changes (slider). */
  onHeroScaleXChange?: (n: number) => void;
  /** Called when the hero overlay Y scale changes (slider). */
  onHeroScaleYChange?: (n: number) => void;
  /** Called when a section's z-index changes (Front/Back in ObjectPropertiesPanel). */
  onSectionZChange?: (id: SectionId, z: number) => void;
  previewScale?: number;
};

export const AgendaProfileCanvas = forwardRef<HTMLDivElement, Props>(
  function AgendaProfileCanvas(
    {
      data,
      className,
      editable,
      sectionsEditable,
      onPickImage,
      onPlacementChange,
      onSizeChange,
      onSectionMove,
      onSectionResize,
      onSectionBoxResize,
      onHeroZChange,
      onHeroScaleXChange,
      onHeroScaleYChange,
      onSectionZChange,
      previewScale = 1,
    },
    ref,
  ) {
    const visibleSessions = data.sessions.filter((s) => s.visible !== false);
    const visibleSpeakers = data.speakers.filter((s) => s.visible !== false);
    // Layer z-indices. Hero defaults to 1 (behind text). Text always
    // renders at zIndex >= 50.
    const heroZ = data.heroZ ?? 1;
    const TEXT_Z = 50;

    // --- Section 4: Scroll Isolation ---
    useCanvasScrollIsolation(
      ref as React.RefObject<HTMLDivElement | null>,
      !!(editable || sectionsEditable),
    );

    // --- Section 1: ObjectPropertiesPanel selection state ---
    const [selectedId, setSelectedId] = useState<string | null>(null);
    useEffect(() => {
      if (!sectionsEditable) setSelectedId(null);
    }, [sectionsEditable]);

    function sectionZFor(id: SectionId): number {
      const explicit = data.sectionLayout?.[id]?.z;
      if (typeof explicit === "number") return explicit;
      if (id === "footer") return TEXT_Z + 1;
      return TEXT_Z;
    }
    const sectionPeerZs: number[] = Object.keys(data.sectionLayout ?? {}).map(
      (id) => sectionZFor(id),
    );

    return (
      <GuideProvider canvasRef={ref as React.RefObject<HTMLDivElement | null>} enabled={!!(editable || sectionsEditable)}>
        <div
          ref={ref}
          className={`relative bg-white overflow-hidden ${className ?? ""}`}
          style={{
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
          }}
        >
        {/* ===== HERO BLOCK (top 0-450) =====
            Applies X/Y scale multipliers from the HeroOverlayControl
            sliders. Default = 100% width × 450px height. <1 = shrinks
            within the canvas, >1 = overflows (clipped by canvas
            overflow:hidden). The ONLY limitation is the canvas border —
            no arbitrary 0.25–3 clamp. (User spec 2026-06-28.) */}
        <div className="absolute" style={{ left: 0, top: 0, width: `${100 * Math.max(0.01, data.heroOverlay.imageScale ?? 1)}%`, height: `${450 * Math.max(0.01, data.heroOverlay.imageScaleY ?? 1)}px`, zIndex: heroZ }}>
          {/* Background hero image */}
          <EditableImage
            slot={{ kind: "hero" }}
            src={data.heroOverlay.imageUrl}
            alt="Event hero"
            placement={data.heroOverlay.imagePlacement}
            editable={editable}
            previewScale={previewScale}
            onPickImage={onPickImage}
            onPlacementChange={onPlacementChange}
            onSizeChange={onSizeChange}
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
          {/* Event title + meta on top of hero */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "header"}
            onSelect={() => setSelectedId("header")}
            pos={data.sectionLayout?.header?.pos}
            scale={data.sectionLayout?.header?.scale ?? 1}
            boxSize={data.sectionLayout?.header?.boxSize}
            onMove={(p) => onSectionMove?.("header", p)}
            onResize={(s) => onSectionResize?.("header", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("header", sz)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            className="absolute"
            style={{ left: "48px", top: "60px", right: "48px", zIndex: sectionZFor("header") }}
            accentColor="#FF005A"
            label="Header"
            guideId="header"
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
          </SectionBox>
          {/* Topic + description at bottom of hero */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "topic"}
            onSelect={() => setSelectedId("topic")}
            pos={data.sectionLayout?.topic?.pos}
            scale={data.sectionLayout?.topic?.scale ?? 1}
            boxSize={data.sectionLayout?.topic?.boxSize}
            onMove={(p) => onSectionMove?.("topic", p)}
            onResize={(s) => onSectionResize?.("topic", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("topic", sz)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            className="absolute"
            style={{ left: "48px", bottom: "36px", right: "48px", zIndex: sectionZFor("topic") }}
            accentColor="#FF005A"
            label="Topic"
            guideId="topic"
          >
            <div className="flex items-start gap-3">
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
            </div>
          </SectionBox>
        </div>

        {/* ===== AGENDA BLOCK (450-1000, but auto-sizes) ===== */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "agenda"}
          onSelect={() => setSelectedId("agenda")}
          pos={data.sectionLayout?.agenda?.pos}
          scale={data.sectionLayout?.agenda?.scale ?? 1}
          boxSize={data.sectionLayout?.agenda?.boxSize}
          onMove={(p) => onSectionMove?.("agenda", p)}
          onResize={(s) => onSectionResize?.("agenda", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("agenda", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute"
          style={{ left: "48px", top: "490px", right: "48px", zIndex: sectionZFor("agenda") }}
          accentColor="#FF005A"
          label="Agenda"
          guideId="agenda"
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
            <span className="text-xs text-black/40">
              {visibleSessions.length} of {data.sessions.length} sessions shown
            </span>
          </div>
          <div className="flex flex-col">
            {visibleSessions.length === 0 ? (
              <p className="text-black/40 text-sm italic">
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
        </SectionBox>

        {/* ===== SPEAKERS BLOCK ===== */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "speakers"}
          onSelect={() => setSelectedId("speakers")}
          pos={data.sectionLayout?.speakers?.pos}
          scale={data.sectionLayout?.speakers?.scale ?? 1}
          boxSize={data.sectionLayout?.speakers?.boxSize}
          onMove={(p) => onSectionMove?.("speakers", p)}
          onResize={(s) => onSectionResize?.("speakers", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("speakers", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute"
          style={{ left: "48px", top: "1020px", right: "48px", zIndex: sectionZFor("speakers") }}
          accentColor="#FF005A"
          label="Speakers"
          guideId="speakers"
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
            <span className="text-xs text-black/40">
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
        </SectionBox>

        {/* ===== SPONSORS + COLLABORATORS (above QR/branding) ===== */}
        {(data.collaborators.length > 0 || data.sponsors.length > 0) && (
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "sponsors"}
            onSelect={() => setSelectedId("sponsors")}
            pos={data.sectionLayout?.sponsors?.pos}
            scale={data.sectionLayout?.sponsors?.scale ?? 1}
            boxSize={data.sectionLayout?.sponsors?.boxSize}
            onMove={(p) => onSectionMove?.("sponsors", p)}
            onResize={(s) => onSectionResize?.("sponsors", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("sponsors", sz)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            className="absolute flex flex-col items-end gap-2"
            style={{ left: "48px", right: "48px", bottom: "130px", zIndex: sectionZFor("sponsors") }}
            anchor="top-right"
            accentColor="#FF005A"
            label="Sponsored by"
            guideId="sponsors"
          >
            {data.collaborators.length > 0 && (
              <div className="flex flex-col items-end gap-1.5">
                <span
                  className="text-black/60 font-semibold uppercase tracking-wider"
                  style={{ fontSize: "10px", letterSpacing: "0.18em" }}
                >
                  In collaboration with
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
                  className="text-black/60 font-semibold uppercase tracking-wider"
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
          </SectionBox>
        )}

        {/* ===== QR + BRANDING (bottom) ===== */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "qr-branding"}
          onSelect={() => setSelectedId("qr-branding")}
          pos={data.sectionLayout?.["qr-branding"]?.pos}
          scale={data.sectionLayout?.["qr-branding"]?.scale ?? 1}
          boxSize={data.sectionLayout?.["qr-branding"]?.boxSize}
          onMove={(p) => onSectionMove?.("qr-branding", p)}
          onResize={(s) => onSectionResize?.("qr-branding", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("qr-branding", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute flex items-center justify-between"
          style={{ left: "48px", right: "48px", bottom: "36px", zIndex: sectionZFor("qr-branding") }}
          accentColor="#FF005A"
          label="QR + Branding"
          guideId="qr-branding"
        >
          {/* QR code (bottom-left) */}
          <div className="flex items-center gap-3">
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
          </div>

          {/* Branding (bottom-right) */}
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
        </SectionBox>

        {/* Optional footer credit */}
        {data.footerCredit && (
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "footer"}
            onSelect={() => setSelectedId("footer")}
            pos={data.sectionLayout?.footer?.pos}
            scale={data.sectionLayout?.footer?.scale ?? 1}
            boxSize={data.sectionLayout?.footer?.boxSize}
            onMove={(p) => onSectionMove?.("footer", p)}
            onResize={(s) => onSectionResize?.("footer", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("footer", sz)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            className="absolute"
            style={{ left: "48px", bottom: "12px", fontSize: "10px", zIndex: sectionZFor("footer") }}
            accentColor="#FF005A"
            label="Footer"
            guideId="footer"
          >
            <span className="text-black/40">
              {data.footerCredit}
            </span>
          </SectionBox>
        )}

        {/* ===== OBJECT PROPERTIES PANEL (Section 1) =====
            Floating panel (top-right of canvas) shown when a section is
            selected. Contains X/Y coordinate inputs + Front/Back layer
            toggles + box size W/H inputs. Hero X/Y scale + Hero z-index
            controls live in the Left Sidebar (form-view). */}
        {sectionsEditable && selectedId && (
          <ObjectPropertiesPanel
            label={selectedId}
            pos={data.sectionLayout?.[selectedId]?.pos}
            onPosChange={(p) => onSectionMove?.(selectedId, p)}
            z={sectionZFor(selectedId)}
            onZChange={(z) => onSectionZChange?.(selectedId, z)}
            peers={sectionPeerZs}
            onDeselect={() => setSelectedId(null)}
            showBoxSize
            boxSize={data.sectionLayout?.[selectedId]?.boxSize}
            onBoxSizeChange={(sz) => onSectionBoxResize?.(selectedId, sz)}
            scale={data.sectionLayout?.[selectedId]?.scale ?? 1}
            onScaleChange={(s) => onSectionResize?.(selectedId, s)}
          />
        )}

        {/* Alignment guides overlay. */}
        <GuideOverlay />
      </div>
    </GuideProvider>
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
          <p className="text-black/40 font-mono" style={{ fontSize: "11px" }}>
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
  const photoSize = Math.max(0.01, speaker.photoSize ?? 1);
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
  sizeMultiplier?: number;
  sizeLabel?: string;
  containerClass: string;
  objectFit: "cover" | "contain";
}) {
  const { focusX, focusY, zoom } = resolvePlacement(placement);
  const dragRef = useRef<{
    startX: number; startY: number;
    startFocusX: number; startFocusY: number;
  } | null>(null);
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
    const startSize = sizeMultiplier ?? 1;
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startSize, corner };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      let signedDiag: number;
      switch (r.corner) {
        case "se": signedDiag = dx + dy; break;
        case "nw": signedDiag = -(dx + dy); break;
        case "ne": signedDiag = dx - dy; break;     // up-right grows (dx>0 grows, dy<0 grows)
        case "sw": signedDiag = -dx + dy; break;    // down-left grows (dx<0 grows, dy>0 grows)
      }
      const sensitivity = 100 * previewScale;
      const delta = signedDiag / sensitivity;
      const next = Math.max(0.01, r.startSize + delta);
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

  function handleMouseDown(e: React.MouseEvent) {
    if (!editable || !onPlacementChange) return;
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startFocusX: focusX, startFocusY: focusY,
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
      onPlacementChange(slot, { focusX: nextFocusX, focusY: nextFocusY, zoom });
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

  const containerRef = useRef<HTMLDivElement>(null);
    // Attach a NON-PASSIVE wheel listener so preventDefault
    // actually stops the parent workspace from scrolling.
    // React's onWheel is passive by default → preventDefault
    // is a no-op there + logs a console warning.
    useNonPassiveWheel(containerRef, handleWheel, !!editable);

    function handleWheel(e: WheelEvent) {
    if (!editable || !onPlacementChange) return;
    // preventDefault + stopPropagation are already called by the
    // useNonPassiveWheel hook (non-passive native listener), so
    // the parent workspace does not scroll while the user spins
    // the wheel over a hovered image.
const step = e.deltaY < 0 ? 0.1 : -0.1;
    const nextZoom = Math.max(0.01, zoom + step);
    onPlacementChange(slot, { focusX, focusY, zoom: nextZoom });
  }

  function handleDoubleClick() {
    if (!editable || !onPlacementChange) return;
    onPlacementChange(slot, { focusX: 50, focusY: 50, zoom: 1 });
  }

  return (
    <div
      ref={containerRef}
      id={`ep-editable-img-${slotKey(slot)}`}
      className={`${containerClass} group`}
      style={{
        cursor: editable ? "grab" : "default",
        outline: editable ? "2px dashed rgba(0, 102, 255, 0.7)" : undefined,
        outlineOffset: editable ? "-2px" : undefined,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
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
      {editable && onPickImage && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPickImage(slot); }}
          className="absolute top-1 left-1 z-10 inline-flex items-center gap-1 rounded bg-[#0066FF] text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider shadow-md hover:bg-[#0052CC] opacity-0 group-hover:opacity-100 transition"
          style={{ pointerEvents: "auto" }}
        >
          Replace
        </button>
      )}
      {editable && (
        <div className="absolute bottom-1 right-1 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-white opacity-0 group-hover:opacity-100 transition pointer-events-none">
          {Math.round(focusX)}/{Math.round(focusY)} · {zoom.toFixed(1)}×
        </div>
      )}
      {/* Resize corner handles (only when size-control is enabled) */}
      {editable && onSizeChange && (
        <>
          <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 rounded bg-[#FF005A] px-2 py-0.5 text-[9px] font-mono text-white opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
            {sizeLabel ?? "size"}: {(sizeMultiplier ?? 1).toFixed(2)}×
          </div>
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "nw")}
            className="absolute top-0 left-0 cursor-nwse-resize z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-0 group-hover:opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "ne")}
            className="absolute top-0 right-0 cursor-nesw-resize z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-0 group-hover:opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "se")}
            className="absolute bottom-0 right-0 cursor-nwse-resize z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-0 group-hover:opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "sw")}
            className="absolute bottom-0 left-0 cursor-nesw-resize z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-0 group-hover:opacity-100 transition"
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
  const sizeMult = Math.max(0.01, sponsor.logoSize ?? 1);
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
      let signedDiag: number;
      switch (r.corner) {
        case "se": signedDiag = dx + dy; break;
        case "nw": signedDiag = -(dx + dy); break;
        case "ne": signedDiag = dx - dy; break;     // up-right grows (dx>0 grows, dy<0 grows)
        case "sw": signedDiag = -dx + dy; break;    // down-left grows (dx<0 grows, dy>0 grows)
      }
      const sensitivity = 100 * previewScale;
      const delta = signedDiag / sensitivity;
      const next = Math.max(0.01, r.startSize + delta);
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
        <Image
          src={sponsor.logoUrl}
          alt={sponsor.name}
          fill
          unoptimized
          className="object-contain"
          sizes="80px"
          draggable={false}
        />
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
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 rounded bg-[#FF005A] px-1.5 py-0.5 text-[8px] font-mono text-white opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
            logo: {sizeMult.toFixed(2)}×
          </div>
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "nw")}
            className="absolute top-0 left-0 cursor-nwse-resize z-30 w-2.5 h-2.5 bg-white border-2 border-[#FF005A] rounded-sm shadow opacity-0 group-hover:opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "ne")}
            className="absolute top-0 right-0 cursor-nesw-resize z-30 w-2.5 h-2.5 bg-white border-2 border-[#FF005A] rounded-sm shadow opacity-0 group-hover:opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "se")}
            className="absolute bottom-0 right-0 cursor-nwse-resize z-30 w-2.5 h-2.5 bg-white border-2 border-[#FF005A] rounded-sm shadow opacity-0 group-hover:opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, "sw")}
            className="absolute bottom-0 left-0 cursor-nesw-resize z-30 w-2.5 h-2.5 bg-white border-2 border-[#FF005A] rounded-sm shadow opacity-0 group-hover:opacity-100 transition"
            style={{ pointerEvents: "auto" }}
          />
        </>
      )}
    </div>
  );
}
