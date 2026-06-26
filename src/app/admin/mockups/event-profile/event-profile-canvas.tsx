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
 */

const CANVAS_W = 1200;
const CANVAS_H = 1500;

type Props = {
  data: EventProfileData;
  className?: string;
  editable?: boolean;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, placement: ImagePlacement) => void;
  previewScale?: number;
};

export const EventProfileCanvas = forwardRef<HTMLDivElement, Props>(
  function EventProfileCanvas(
    { data, className, editable, onPickImage, onPlacementChange, previewScale = 1 },
    ref,
  ) {
    const visibleSessions = data.sessions.filter((s) => s.visible !== false);
    const visibleSpeakers = data.speakers.filter((s) => s.visible !== false);

    return (
      <div
        ref={ref}
        className={`relative bg-white overflow-hidden ${className ?? ""}`}
        style={{
          width: `${CANVAS_W}px`,
          height: `${CANVAS_H}px`,
          fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
        }}
      >
        {/* ===== HERO BLOCK (top 0-450) ===== */}
        <div className="absolute" style={{ left: 0, top: 0, width: "100%", height: "450px" }}>
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
          <div className="absolute" style={{ left: "48px", top: "60px", right: "48px" }}>
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
          </div>
          {/* Topic + description at bottom of hero */}
          <div className="absolute" style={{ left: "48px", bottom: "36px", right: "48px" }}>
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
          </div>
        </div>

        {/* ===== AGENDA BLOCK (450-1000, but auto-sizes) ===== */}
        <div className="absolute" style={{ left: "48px", top: "490px", right: "48px" }}>
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
        </div>

        {/* ===== SPEAKERS BLOCK ===== */}
        <div className="absolute" style={{ left: "48px", top: "1020px", right: "48px" }}>
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
              />
            ))}
          </div>
        </div>

        {/* ===== QR + SPONSORS + BRANDING (bottom) ===== */}
        <div
          className="absolute flex items-center justify-between"
          style={{ left: "48px", right: "48px", bottom: "36px" }}
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
        </div>

        {/* Optional footer credit */}
        {data.footerCredit && (
          <span
            className="absolute text-black/40"
            style={{ left: "48px", bottom: "12px", fontSize: "10px" }}
          >
            {data.footerCredit}
          </span>
        )}
      </div>
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
}: {
  speaker: Speaker;
  accentColor: string;
  editable?: boolean;
  slot: ImageSlot;
  previewScale: number;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, p: ImagePlacement) => void;
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
  containerClass: string;
  objectFit: "cover" | "contain";
}) {
  const { focusX, focusY, zoom } = resolvePlacement(placement);
  const dragRef = useRef<{
    startX: number; startY: number;
    startFocusX: number; startFocusY: number;
  } | null>(null);

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

  function handleWheel(e: React.WheelEvent) {
    if (!editable || !onPlacementChange) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.1 : -0.1;
    const nextZoom = Math.max(1, Math.min(4, zoom + step));
    onPlacementChange(slot, { focusX, focusY, zoom: nextZoom });
  }

  function handleDoubleClick() {
    if (!editable || !onPlacementChange) return;
    onPlacementChange(slot, { focusX: 50, focusY: 50, zoom: 1 });
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
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
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
          transform: `scale(${zoom})`,
          transformOrigin: "center center",
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
