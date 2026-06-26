"use client";

import { forwardRef, useRef, type ReactNode } from "react";
import Image from "next/image";
import type {
  SpeakerIntroData,
  Speaker,
  ImagePlacement,
  ImageSlot,
} from "./types";
import { resolvePlacement } from "./types";

/**
 * SpeakerIntroCanvas — the data-driven mockup renderer.
 *
 * Takes a `SpeakerIntroData` object and renders the full Speaker Intro
 * mockup as a 3:2 landscape canvas. Every component is a separate
 * absolutely-positioned div bound to a field in `data`. Edit the JSON
 * in the parent editor and the canvas re-renders live.
 *
 * Canvas size: 1200×800 (3:2). The parent scales it down via CSS
 * transform for the on-screen preview; the underlying DOM stays at
 * 1200×800 so PNG export is print-quality.
 *
 * Editable mode (editable=true):
 *   - Image areas show a dashed blue outline + a "Replace" button.
 *   - Click the button → opens the image picker (onPickImage).
 *   - Drag the image → pans (updates focusX/focusY via onPlacementChange).
 *   - Wheel on the image → zooms (updates zoom).
 *   - Double-click → resets placement to default.
 */

const CANVAS_W = 1200;
const CANVAS_H = 800;

type Props = {
  data: SpeakerIntroData;
  className?: string;
  /** When true, image areas become interactive (drag/wheel/click). */
  editable?: boolean;
  /** Called when the user clicks "Replace" on an image slot. */
  onPickImage?: (slot: ImageSlot) => void;
  /** Called whenever an image is dragged / zoomed. */
  onPlacementChange?: (slot: ImageSlot, placement: ImagePlacement) => void;
  /** Called when the user drags a resize corner handle. */
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  /** The current scale of the preview (used to convert screen-drag to canvas-%). */
  previewScale?: number;
};

export const SpeakerIntroCanvas = forwardRef<HTMLDivElement, Props>(
  function SpeakerIntroCanvas(
    { data, className, editable, onPickImage, onPlacementChange, onSizeChange, previewScale = 1 },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={`relative bg-white overflow-hidden ${className ?? ""}`}
        style={{
          width: `${CANVAS_W}px`,
          height: `${CANVAS_H}px`,
          fontFamily:
            "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
        }}
      >
        {/* ===== 5. HERO VISUAL (right side, behind everything else on right) ===== */}
        {(() => {
          // imageScale (X): 1 = default 58% width starting at 42% left.
          // 1.5 = 87% width starting at 13% left (bleeds further left).
          // 2 = 116% width starting at -16% left (overflows — usually
          // unwanted). Min is clamped at 1 so the hero always covers at
          // least the default area (no white gap on the right).
          const scale = Math.max(1, Math.min(3, data.heroOverlay.imageScale ?? 1));
          const heroWidth = 58 * scale; // % of canvas
          const heroLeft = Math.max(0, 100 - heroWidth); // anchor to right edge
          // imageScaleY: 1 = full canvas height. Min is clamped at 1 so
          // the hero always covers the full canvas height vertically
          // (no white gap at the bottom).
          const scaleY = Math.max(1, Math.min(3, data.heroOverlay.imageScaleY ?? 1));
          const heroHeight = 100 * scaleY; // % of canvas
          const heroTop = 0; // anchored to top
          return (
        <div
          className="absolute"
          style={{
            left: `${heroLeft}%`,
            top: `${heroTop}%`,
            width: `${heroWidth}%`,
            height: `${heroHeight}%`,
          }}
        >
          {/* Background image (Tel Aviv skyline + beach) */}
          <EditableImage
            slot={{ kind: "hero" }}
            src={data.heroOverlay.imageUrl}
            alt="Tel Aviv skyline"
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

          {/* 6. TRIANGLE GRADIENT OVERLAY — hidden when user picks a new hero image */}
          {data.heroOverlay.showTriangleOverlay !== false && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <linearGradient
                  id="tri-grad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  {data.heroOverlay.gradientColors.map((color, i, arr) => (
                    <stop
                      key={i}
                      offset={`${(i / (arr.length - 1)) * 100}%`}
                      stopColor={color}
                      stopOpacity={data.heroOverlay.gradientOpacity}
                    />
                  ))}
                </linearGradient>
                <linearGradient
                  id="tri-grad-2"
                  x1="100%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  {data.heroOverlay.gradientColors.map((color, i, arr) => (
                    <stop
                      key={i}
                      offset={`${(i / (arr.length - 1)) * 100}%`}
                      stopColor={color}
                      stopOpacity={data.heroOverlay.gradientOpacity * 0.7}
                    />
                  ))}
                </linearGradient>
              </defs>
              {/* Right-pointing large triangle covering ~60% of hero */}
              <polygon points="0,0 100,50 0,100" fill="url(#tri-grad)" />
              {/* Smaller counter-triangle for geometric depth */}
              <polygon points="40,15 95,35 50,75" fill="url(#tri-grad-2)" opacity={0.6} />
            </svg>
          )}

          {/* 7. LOCATION PINS — overlay with connector lines */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {/* Connector lines from center to each pin */}
            {data.locationPins.map((pin, i) => (
              <line
                key={`line-${i}`}
                x1="50"
                y1="50"
                x2={pin.x}
                y2={pin.y}
                stroke="white"
                strokeWidth="0.25"
                strokeOpacity="0.6"
                strokeDasharray="0.5 0.5"
              />
            ))}
            {/* Pin dots */}
            {data.locationPins.map((pin, i) => (
              <circle
                key={`dot-${i}`}
                cx={pin.x}
                cy={pin.y}
                r="0.8"
                fill={data.event.brandColors[0]}
                stroke="white"
                strokeWidth="0.3"
              />
            ))}
          </svg>
          {/* Pin labels (HTML so they can wrap properly) */}
          {data.locationPins.map((pin, i) => (
            <span
              key={`label-${i}`}
              className="absolute text-white font-semibold uppercase tracking-wider drop-shadow pointer-events-none"
              style={{
                left: `${pin.x}%`,
                top: `${pin.y}%`,
                transform: "translate(-50%, -120%)",
                fontSize: "11px",
                letterSpacing: "0.12em",
              }}
            >
              {pin.label}
            </span>
          ))}
        </div>
          );
        })()}

        {/* ===== 1. EVENT HEADER (top-left) ===== */}
        <div
          className="absolute"
          style={{ left: "48px", top: "40px", maxWidth: "640px" }}
        >
          <h1
            className="font-extrabold text-black leading-none tracking-tight"
            style={{ fontSize: `${44 * (data.event.nameFontScale ?? 1)}px` }}
          >
            {data.event.name}
          </h1>
          <p
            className="mt-3 text-black/70 font-semibold"
            style={{ fontSize: "16px" }}
          >
            {data.event.date}
            {data.event.time && (
              <>
                <span className="mx-2 text-black/30">·</span>
                {data.event.time}
              </>
            )}
          </p>
          <p
            className="mt-1 text-black/60"
            style={{ fontSize: "14px" }}
          >
            {data.event.venue}
          </p>
        </div>

        {/* ===== 2. EVENT TOPIC (below header, with vertical accent bar) ===== */}
        <div
          className="absolute flex items-start gap-3"
          style={{ left: "48px", top: "160px", maxWidth: "440px" }}
        >
          <div
            className="shrink-0 self-stretch rounded-sm"
            style={{
              width: "6px",
              background: `linear-gradient(180deg, ${data.event.brandColors[0]}, ${data.event.brandColors[1]})`,
            }}
            aria-hidden
          />
          <h2
            className="font-extrabold text-black leading-tight"
            style={{ fontSize: `${24 * (data.event.topicFontScale ?? 1)}px` }}
          >
            {data.event.topic}
          </h2>
        </div>

        {/* ===== 3. QR CODE (top-right) ===== */}
        <div
          className="absolute flex flex-col items-center gap-1"
          style={{ right: "48px", top: "40px" }}
        >
          <div
            className="rounded-md bg-white p-2 shadow-md"
            style={{ width: "96px", height: "96px" }}
          >
            <QrCode url={data.qrCodeUrl} size={80} />
          </div>
          <span
            className="text-black font-semibold uppercase tracking-wider"
            style={{ fontSize: "10px", letterSpacing: "0.15em" }}
          >
            Register here
          </span>
        </div>

        {/* ===== 4. SPEAKERS LIST (left column) ===== */}
        <div
          className="absolute flex flex-col gap-3"
          style={{ left: "48px", top: "260px", width: "400px" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              className="h-px flex-1"
              style={{
                background: `linear-gradient(90deg, ${data.event.brandColors[1]}, transparent)`,
              }}
            />
            <span
              className="font-bold text-black uppercase tracking-widest"
              style={{ fontSize: "12px", letterSpacing: "0.2em" }}
            >
              Speakers
            </span>
          </div>
          {[...data.speakers]
            .sort((a, b) => a.order - b.order)
            // Pair each speaker with its index in the SORTED array (so
            // slot.index matches what the editor's applyImagePick expects,
            // which looks up `next.speakers.sort(...)[slot.index]`).
            .map((speaker, idx) => ({ speaker, idx }))
            // Then hide invisible speakers (visible defaults to true).
            .filter(({ speaker }) => speaker.visible !== false)
            .map(({ speaker, idx }) => (
              <SpeakerCard
                key={`${speaker.order}-${speaker.fullName}`}
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

        {/* ===== 8. SPONSORS (bottom-right) ===== */}
        <div
          className="absolute flex flex-col items-end gap-2"
          style={{ right: "48px", bottom: "100px" }}
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
                    key={`collab-${s.name}`}
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
                    key={`sponsor-${s.name}`}
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
        </div>

        {/* ===== 9. BRANDING (bottom-right corner) ===== */}
        {/* Replaced the text "ai salon" wordmark with the meerkat brand image
            per user request (Task ID: mockup-editor-v2). */}
        <div
          className="absolute flex items-center gap-2"
          style={{ right: "48px", bottom: "32px" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.branding?.imageUrl ?? "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png"}
            alt="ai salon"
            style={{
              height: `${(data.branding?.height ?? 48)}px`,
              width: "auto",
              objectFit: "contain",
            }}
          />
        </div>

        {/* Optional footer credit (bottom-left) */}
        {data.footerCredit && (
          <span
            className="absolute text-black/40"
            style={{ left: "48px", bottom: "32px", fontSize: "11px" }}
          >
            {data.footerCredit}
          </span>
        )}
      </div>
    );
  },
);

/**
 * EditableImage — wraps a next/image with placement (object-position + scale)
 * and (optionally) edit-mode interactions: click-to-replace, drag-to-pan,
 * wheel-to-zoom, double-click-to-reset.
 *
 * Used for the hero background and the speaker headshots.
 */
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
  /** Called when the user drags a resize corner handle. Receives the new
   *  size multiplier (e.g. 1.5 = 150% of default). */
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  /** Current size multiplier (read from data). Used to seed the resize
   *  drag delta. Defaults to 1. */
  sizeMultiplier?: number;
  /** Small label shown next to the resize readout (e.g. "photo", "logo"). */
  sizeLabel?: string;
  containerClass: string;
  objectFit: "cover" | "contain";
}) {
  const { focusX, focusY, zoom } = resolvePlacement(placement);
  // We track drag state on a ref so we don't re-render on every mousemove.
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startFocusX: number;
    startFocusY: number;
  } | null>(null);
  // Resize drag state — separate from pan drag so they don't conflict.
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startSize: number;
    /** Which corner is being dragged. The corner determines whether
     *  moving the mouse up-left grows or shrinks the image. */
    corner: "nw" | "ne" | "se" | "sw";
  } | null>(null);

  function handleMouseDown(e: React.MouseEvent) {
    if (!editable || !onPlacementChange) return;
    // Only start a drag on left-click outside the Replace button.
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startFocusX: focusX,
      startFocusY: focusY,
    };
    // Switch to grabbing cursor.
    (e.currentTarget as HTMLElement).style.cursor = "grabbing";

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      // Convert screen-pixel delta to % of container.
      // The container's pixel width at screen-scale is:
      //   containerWidthPx (canvas) * previewScale.
      // We don't know containerWidthPx here without measuring it; use a
      // reasonable approximation: 1% per (previewScale * 6) px, which gives
      // ~6 px of drag = 1% on the canvas at scale=1.
      const sensitivity = 6 * previewScale;
      const nextFocusX = Math.max(
        0,
        Math.min(100, d.startFocusX - dx / sensitivity),
      );
      const nextFocusY = Math.max(
        0,
        Math.min(100, d.startFocusY - dy / sensitivity),
      );
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
      // Restore cursor.
      const el = document.getElementById(`editable-img-${slotKey(slot)}`);
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
    onPlacementChange(slot, {
      focusX,
      focusY,
      zoom: nextZoom,
    });
  }

  function handleDoubleClick() {
    if (!editable || !onPlacementChange) return;
    onPlacementChange(slot, { focusX: 50, focusY: 50, zoom: 1 });
  }

  /**
   * handleResizeMouseDown — starts a resize drag from one of the 4 corner
   * handles. The corner determines the direction:
   *   - SE (bottom-right): drag down-right = grow, up-left = shrink
   *   - NW (top-left):     drag up-left   = grow, down-right = shrink
   *   - NE (top-right):    drag up-right  = grow, down-left = shrink
   *   - SW (bottom-left):  drag down-left = grow, up-right = shrink
   *
   * We use the diagonal distance (dx + dy with appropriate sign) so the
   * resize feels natural regardless of which corner is grabbed.
   */
  function handleResizeMouseDown(
    e: React.MouseEvent,
    corner: "nw" | "ne" | "se" | "sw",
  ) {
    if (!editable || !onSizeChange) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // don't trigger pan-drag
    const startSize = sizeMultiplier ?? 1;
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startSize, corner };

    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      // For each corner, compute the signed diagonal distance so that
      // moving "outward" (away from the image center) increases the size.
      let signedDiag: number;
      switch (r.corner) {
        case "se": signedDiag = dx + dy; break;            // down-right grows
        case "nw": signedDiag = -(dx + dy); break;          // up-left grows
        case "ne": signedDiag = -dx + dy; break;            // up-right grows
        case "sw": signedDiag = dx - dy; break;             // down-left grows
      }
      // 100px of drag = 1.0× size change (so dragging 50px = +0.5×).
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
      id={`editable-img-${slotKey(slot)}`}
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
          // Apply a tiny overscan (1.005x) on top of the user's zoom to
          // eliminate the 1px white gap that appears at the container
          // edge due to subpixel rendering. This is the well-known
          // "CSS transform scale(1) shows hairline gap" bug — adding a
          // 0.5% overscan forces the image to spill 1-2px past each
          // edge, which the parent's overflow:hidden then clips cleanly.
          transform: `scale(${zoom * 1.005})`,
          transformOrigin: "center center",
          // Force GPU compositing so the transform is applied on a
          // separate layer — eliminates the闪烁 / shimmer that can
          // happen during drag-pan on Chrome.
          willChange: "transform",
          backfaceVisibility: "hidden",
          transition: dragRef.current ? "none" : "transform 80ms ease-out",
        }}
        draggable={false}
      />
      {/* Replace button (only in edit mode) */}
      {editable && onPickImage && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPickImage(slot);
          }}
          className="absolute top-1 left-1 z-10 inline-flex items-center gap-1 rounded bg-[#0066FF] text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider shadow-md hover:bg-[#0052CC] opacity-0 group-hover:opacity-100 transition"
          style={{ pointerEvents: "auto" }}
        >
          Replace
        </button>
      )}
      {/* Placement readout (only in edit mode) */}
      {editable && (
        <div className="absolute bottom-1 right-1 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-white opacity-0 group-hover:opacity-100 transition pointer-events-none">
          {Math.round(focusX)}/{Math.round(focusY)} · {zoom.toFixed(1)}×
        </div>
      )}
      {/* Resize corner handles (only when size-control is enabled) */}
      {editable && onSizeChange && (
        <>
          {/* Size readout (top-center pill) */}
          <div
            className="absolute top-1 left-1/2 -translate-x-1/2 z-20 rounded bg-[#FF005A] px-2 py-0.5 text-[9px] font-mono text-white opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap"
          >
            {sizeLabel ?? "size"}: {(sizeMultiplier ?? 1).toFixed(2)}×
          </div>
          {/* NW corner */}
          <ResizeHandle corner="nw" onMouseDown={handleResizeMouseDown} />
          {/* NE corner */}
          <ResizeHandle corner="ne" onMouseDown={handleResizeMouseDown} />
          {/* SE corner */}
          <ResizeHandle corner="se" onMouseDown={handleResizeMouseDown} />
          {/* SW corner */}
          <ResizeHandle corner="sw" onMouseDown={handleResizeMouseDown} />
        </>
      )}
    </div>
  );
}

/**
 * ResizeHandle — a small square handle at one of the 4 corners of an
 * editable image. Dragging it resizes the image via onSizeChange.
 *
 * The handle is a 12×12 white square with a 2px pink border, positioned
 * absolutely at the corner. The cursor changes based on the corner
 * (nwse or nesw resize cursor).
 *
 * Visible only in edit mode (the parent conditionally renders it).
 */
function ResizeHandle({
  corner,
  onMouseDown,
}: {
  corner: "nw" | "ne" | "se" | "sw";
  onMouseDown: (e: React.MouseEvent, corner: "nw" | "ne" | "se" | "sw") => void;
}) {
  const positionClass =
    corner === "nw" ? "top-0 left-0" :
    corner === "ne" ? "top-0 right-0" :
    corner === "se" ? "bottom-0 right-0" :
    "bottom-0 left-0";
  const cursorClass =
    corner === "nw" || corner === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize";
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, corner)}
      className={`absolute ${positionClass} ${cursorClass} z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-0 group-hover:opacity-100 transition`}
      style={{ pointerEvents: "auto" }}
      aria-label={`Resize ${corner} corner`}
    />
  );
}

function slotKey(slot: ImageSlot): string {
  if (slot.kind === "hero") return "hero";
  if (slot.kind === "speaker") return `speaker-${slot.index}`;
  return `sponsor-${slot.group}-${slot.index}`;
}

/**
 * SpeakerCard — one entry in the vertical speakers list.
 * Circular photo + name + title/company + optional role badge + optional bio.
 */
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
  // photoSize: 1 = 56px (default), 2 = 112px, 0.5 = 28px, etc.
  const photoSize = Math.max(0.25, Math.min(4, speaker.photoSize ?? 1));
  const photoPx = Math.round(56 * photoSize);
  return (
    <div className="flex items-start gap-3 rounded-lg bg-white/95 backdrop-blur-sm border border-black/10 p-2.5 shadow-sm">
      {/* Circular photo */}
      <div
        className="relative shrink-0 rounded-full overflow-hidden border-2"
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
      {/* Text block */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {speaker.sessionTime && (
            <span
              className="inline-block rounded-full px-1.5 py-0.5 text-white font-bold tracking-wider"
              style={{
                fontSize: "9px",
                letterSpacing: "0.08em",
                background: "#004F98",
              }}
            >
              {speaker.sessionTime}
            </span>
          )}
          <span
            className="font-bold text-black leading-tight"
            style={{ fontSize: "16px" }}
          >
            {speaker.fullName}
          </span>
          {speaker.role === "Moderator" && (
            <span
              className="inline-block rounded-full px-1.5 py-0.5 text-white font-bold uppercase tracking-wider"
              style={{
                fontSize: "9px",
                letterSpacing: "0.1em",
                background: accentColor,
              }}
            >
              {speaker.role}
            </span>
          )}
          {speaker.role === "Panelist" && (
            <span
              className="inline-block rounded-full px-1.5 py-0.5 text-white font-bold uppercase tracking-wider"
              style={{
                fontSize: "9px",
                letterSpacing: "0.1em",
                background: "#004F98",
              }}
            >
              {speaker.role}
            </span>
          )}
        </div>
        <p
          className="text-black/70 leading-snug mt-0.5"
          style={{ fontSize: "12px" }}
        >
          {speaker.title}
          {speaker.company && (
            <>
              <span className="mx-1 text-black/30">·</span>
              <span className="font-semibold">{speaker.company}</span>
            </>
          )}
        </p>
        {speaker.bio && (
          <p
            className="text-black/50 leading-snug mt-1"
            style={{ fontSize: "11px" }}
          >
            {speaker.bio}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * SponsorLogo — one logo in the "In collaboration with" / "Sponsored by" row.
 * Logos use object-contain (no crop), so they don't take a placement.
 * logoSize: 1 = 32px height (default), 2 = 64px, 0.5 = 16px.
 */
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

  // Resize drag state — same pattern as EditableImage but inline since
  // SponsorLogo doesn't use EditableImage (logos use object-contain, no
  // placement control).
  const resizeRef = useRef<{
    startX: number;
    startY: number;
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
        case "ne": signedDiag = -dx + dy; break;
        case "sw": signedDiag = dx - dy; break;
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
      {/* Resize corner handles (only when size-control is enabled) */}
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

/**
 * QrCode — generates a QR code from a URL using the `qrcode` library.
 * Renders to a <canvas> so it's high-DPI ready.
 */
import QRCode from "qrcode";
import { useEffect, useState } from "react";

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
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch((err) => {
        console.error("QR generation failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!dataUrl) {
    return (
      <div
        className="bg-black/5 animate-pulse"
        style={{ width: size, height: size }}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={dataUrl}
      alt="QR code"
      width={size}
      height={size}
      className="block"
    />
  );
}

/** Re-exported for the editor to use in placement sliders. */
export function PlacementControls({
  placement,
  onChange,
  onReset,
}: {
  placement?: ImagePlacement;
  onChange: (p: ImagePlacement) => void;
  onReset: () => void;
}): ReactNode {
  const { focusX, focusY, zoom } = resolvePlacement(placement);
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="flex items-center gap-1 text-black/70">
        <span className="font-mono w-7">X</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={focusX}
          onChange={(e) => onChange({ focusX: Number(e.target.value), focusY, zoom })}
          className="w-20"
        />
        <span className="font-mono text-[0.65rem] w-7 text-right">{focusX}%</span>
      </label>
      <label className="flex items-center gap-1 text-black/70">
        <span className="font-mono w-7">Y</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={focusY}
          onChange={(e) => onChange({ focusX, focusY: Number(e.target.value), zoom })}
          className="w-20"
        />
        <span className="font-mono text-[0.65rem] w-7 text-right">{focusY}%</span>
      </label>
      <label className="flex items-center gap-1 text-black/70">
        <span className="font-mono w-7">Z</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.1}
          value={zoom}
          onChange={(e) => onChange({ focusX, focusY, zoom: Number(e.target.value) })}
          className="w-20"
        />
        <span className="font-mono text-[0.65rem] w-7 text-right">{zoom.toFixed(1)}×</span>
      </label>
      <button
        type="button"
        onClick={onReset}
        className="rounded border border-black/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-black/60 hover:bg-black/5"
      >
        Reset
      </button>
    </div>
  );
}
