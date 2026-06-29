"use client";

import { forwardRef, useRef, useState, useEffect } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import type {
  EventProfileData,
  ImagePlacement,
  ImageSlot,
  Sponsor,
} from "./types";
import { resolvePlacement } from "./types";
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
 * EventProfileCanvas — the data-driven Event Profile mockup renderer.
 *
 * This is the "real" Event Profile mockup (Template 4 of 4): a
 * VISUAL-FIRST, minimal-text promotional overview. It deconstructs the
 * reference image at:
 *   https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782398263781-ias5la.png
 *
 * Layout (1200×1200 square — high-impact social format):
 *   ┌────────────────────────────────────────────┐
 *   │  Hero image — full canvas                  │
 *   │  Triangle gradient overlay (right side)    │
 *   │  Location pins with connector lines        │
 *   │                                            │
 *   │  TOP-LEFT: "ai salon Tel Aviv-Yafo Israel" │
 *   │  (large, bold — the dominant text)         │
 *   │                                            │
 *   │  BOTTOM-RIGHT:                             │
 *   │    "In collaboration with:" logos          │
 *   │    "Sponsored by:" logos                   │
 *   │    ai salon branding wordmark              │
 *   └────────────────────────────────────────────┘
 *
 * Per the spec, this mockup is intentionally minimal — NO agenda list,
 * NO speakers grid, NO QR code. The /admin/mockups/agenda-profile route
 * hosts the agenda+speakers grid version (formerly at this URL).
 *
 * Layer management (per layer-management spec v3):
 *   - Hero defaults to z=2 (above triangle).
 *   - Triangle defaults to z=1 (BEHIND hero, per the user's spec:
 *     "The 'Show Triangle Overlay' must strictly remain behind the
 *     'Hero Image' component whenever the visibility toggle is set
 *     to 'Yes.'").
 *   - Text sections (header, sponsors, branding) always render at
 *     zIndex >= 50 so they stay above overlays.
 *   - Front/Back buttons at the bottom-left of the canvas let the user
 *     manually reorder hero / triangle layers.
 */

const CANVAS_W = 1200;
const CANVAS_H = 1200;

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
  /** Called when the hero overlay z-index changes (Front/Back button). */
  onHeroZChange?: (z: number) => void;
  /** Called when the triangle overlay z-index changes (Front/Back button). */
  onTriangleZChange?: (z: number) => void;
  /** Called when the hero overlay X scale changes (slider). */
  onHeroScaleXChange?: (n: number) => void;
  /** Called when the hero overlay Y scale changes (slider). */
  onHeroScaleYChange?: (n: number) => void;
  /** Called when a section's z-index changes (Front/Back in ObjectPropertiesPanel). */
  onSectionZChange?: (id: SectionId, z: number) => void;
  previewScale?: number;
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
      onSectionMove,
      onSectionResize,
      onSectionBoxResize,
      onHeroZChange,
      onTriangleZChange,
      onHeroScaleXChange,
      onHeroScaleYChange,
      onSectionZChange,
      previewScale = 1,
    },
    ref,
  ) {
    // Layer z-indices. Per spec: triangle BEHIND hero by default.
    // Text always renders at zIndex >= 50.
    const heroZ = data.heroZ ?? 2;
    const triangleZ = data.triangleZ ?? 1;
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
      <GuideProvider
        canvasRef={ref as React.RefObject<HTMLDivElement | null>}
        enabled={!!(editable || sectionsEditable)}
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
          {/* ===== HERO IMAGE (full canvas, behind everything) =====
              Applies X/Y scale multipliers from the HeroOverlayControl
              sliders. 1× = full canvas (default). <1 = shrinks within
              the canvas, >1 = overflows (clipped by canvas overflow:hidden).
              The ONLY limitation is the canvas border — no arbitrary
              0.25–3 clamp. (User spec 2026-06-28.) */}
          {(() => {
            const scaleX = Math.max(0.01, data.heroOverlay.imageScale ?? 1);
            const scaleY = Math.max(0.01, data.heroOverlay.imageScaleY ?? 1);
            return (
          <div
            className="absolute"
            style={{
              left: 0,
              top: 0,
              width: `${100 * scaleX}%`,
              height: `${100 * scaleY}%`,
              zIndex: heroZ,
            }}
          >
            {/* Hero image wrapped with explicit z-index = triangleZ + 1 so the
                image always renders IN FRONT of the triangle overlay by default
                (per Section 3 of user spec 2026-06-28). The Front/Back controls
                in the sidebar can override this dynamically. */}
            <div
              className="absolute inset-0"
              style={{ zIndex: triangleZ + 1 }}
            >
            <EditableImage
              slot={{ kind: "hero" }}
              src={data.heroOverlay.imageUrl}
              alt="Event hero — Tel Aviv skyline + meerkat"
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
            </div>

            {/* ===== TRIANGLE GRADIENT OVERLAY (right side) =====
                Per layer-management spec: triangle strictly BEHIND hero
                when visibility toggle is "Yes". The default z-order
                (triangleZ=1, hero img z=triangleZ+1=2) enforces this;
                the Front/Back buttons in the sidebar let the user override. */}
            {data.heroOverlay.showTriangleOverlay !== false && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: triangleZ }}
              >
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <defs>
                    <linearGradient
                      id="ep-tri-grad"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      {data.heroOverlay.gradientColors.map((color, i, arr) => (
                        <stop
                          key={i}
                          offset={`${(i / Math.max(1, arr.length - 1)) * 100}%`}
                          stopColor={color}
                          stopOpacity={data.heroOverlay.gradientOpacity}
                        />
                      ))}
                    </linearGradient>
                    <linearGradient
                      id="ep-tri-grad-2"
                      x1="100%"
                      y1="0%"
                      x2="0%"
                      y2="100%"
                    >
                      {data.heroOverlay.gradientColors.map((color, i, arr) => (
                        <stop
                          key={i}
                          offset={`${(i / Math.max(1, arr.length - 1)) * 100}%`}
                          stopColor={color}
                          stopOpacity={data.heroOverlay.gradientOpacity * 0.7}
                        />
                      ))}
                    </linearGradient>
                  </defs>
                  {/* Large right-pointing triangle covering ~60% of canvas */}
                  <polygon points="0,0 100,50 0,100" fill="url(#ep-tri-grad)" />
                  {/* Smaller counter-triangle for geometric depth */}
                  <polygon
                    points="40,15 95,35 50,75"
                    fill="url(#ep-tri-grad-2)"
                    opacity={0.6}
                  />
                </svg>
              </div>
            )}

            {/* ===== LOCATION PINS with connector lines ===== */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              {/* Connector lines from center to each pin */}
              {[
                { x: 50, y: 50, label: "Center" }, // implicit center
                ...[],
              ].map((pin, i) => null)}
              {/* Use the data.locationPins if present, otherwise defaults */}
              {(data.locationPins ?? []).map((pin, i) => (
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
              {(data.locationPins ?? []).map((pin, i) => (
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
            {/* Pin labels (HTML for proper text wrapping) */}
            {(data.locationPins ?? []).map((pin, i) => (
              <span
                key={`label-${i}`}
                className="absolute text-white font-semibold uppercase tracking-wider drop-shadow pointer-events-none"
                style={{
                  left: `${pin.x}%`,
                  top: `${pin.y}%`,
                  transform: "translate(-50%, -120%)",
                  fontSize: "13px",
                  letterSpacing: "0.12em",
                }}
              >
                {pin.label}
              </span>
            ))}
          </div>
            );
          })()}

          {/* ===== HEADER — "ai salon Tel Aviv-Yafo Israel" (top-left) ===== */}
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
            style={{ left: "56px", top: "60px", maxWidth: "720px", zIndex: sectionZFor("header") }}
            accentColor="#FF005A"
            label="Header"
            guideId="header"
          >
            <p
              className="font-bold uppercase tracking-[0.18em] text-white/95 drop-shadow"
              style={{ fontSize: "13px", letterSpacing: "0.25em" }}
            >
              {data.event.date} · {data.event.venue}
            </p>
            <h1
              className="mt-3 font-extrabold text-white leading-[1.0] tracking-tight drop-shadow-lg"
              style={{ fontSize: "72px" }}
            >
              {data.event.name}
            </h1>
            <p
              className="mt-3 font-bold text-white/90 leading-tight drop-shadow"
              style={{ fontSize: "22px", letterSpacing: "-0.01em" }}
            >
              {data.event.topic}
            </p>
          </SectionBox>

          {/* ===== SPONSORS + COLLABORATORS (bottom-right) ===== */}
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
              style={{ right: "56px", bottom: "120px", zIndex: sectionZFor("sponsors") }}
              anchor="top-right"
              accentColor="#FF005A"
              label="Sponsored by"
              guideId="sponsors"
            >
              {data.collaborators.length > 0 && (
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className="text-white/85 font-semibold uppercase tracking-wider drop-shadow"
                    style={{ fontSize: "11px", letterSpacing: "0.18em" }}
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
                    className="text-white/85 font-semibold uppercase tracking-wider drop-shadow"
                    style={{ fontSize: "11px", letterSpacing: "0.18em" }}
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

          {/* ===== BRANDING (bottom-right corner) ===== */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "qr-branding"}
            onSelect={() => setSelectedId("qr-branding")}
            pos={data.sectionLayout?.["qr-branding"]?.pos ?? data.sectionLayout?.branding?.pos}
            scale={data.sectionLayout?.["qr-branding"]?.scale ?? data.sectionLayout?.branding?.scale ?? 1}
            boxSize={data.sectionLayout?.["qr-branding"]?.boxSize ?? data.sectionLayout?.branding?.boxSize}
            onMove={(p) => onSectionMove?.("qr-branding", p)}
            onResize={(s) => onSectionResize?.("qr-branding", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("qr-branding", sz)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            className="absolute flex items-center gap-2"
            style={{ right: "56px", bottom: "40px", zIndex: sectionZFor("qr-branding") }}
            anchor="top-right"
            accentColor="#FF005A"
            label="Branding"
            guideId="qr-branding"
          >
            <span
              className="inline-flex items-center text-white drop-shadow"
              style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.02em" }}
            >
              <span
                className="inline-block w-6 h-6 mr-2 rounded-sm"
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
              style={{ left: "56px", bottom: "32px", fontSize: "11px", zIndex: sectionZFor("footer") }}
              accentColor="#FF005A"
              label="Footer"
              guideId="footer"
            >
              <span className="text-white/60 drop-shadow">{data.footerCredit}</span>
            </SectionBox>
          )}

          {/* ===== OBJECT PROPERTIES PANEL (Section 1) =====
              Floating panel (top-right of canvas) shown when a section is
              selected. Contains X/Y coordinate inputs + Front/Back layer
              toggles + box size W/H inputs. Hero/Triangle layer z-index
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

// ---------------------------------------------------------------------------
// EditableImage — same pattern as the Speaker Intro canvas.
// Wraps a next/image with placement (object-position + scale) and
// (optionally) edit-mode interactions: click-to-replace, drag-to-pan,
// wheel-to-zoom (non-passive), double-click-to-reset.
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
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseDown(e: React.MouseEvent) {
    if (!editable || !onPlacementChange) return;
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startFocusX: focusX,
      startFocusY: focusY,
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

  function handleWheel(e: WheelEvent) {
    if (!editable || !onPlacementChange) return;
    // preventDefault + stopPropagation already called by useNonPassiveWheel.
    const step = e.deltaY < 0 ? 0.1 : -0.1;
    const nextZoom = Math.max(0.01, zoom + step);
    onPlacementChange(slot, { focusX, focusY, zoom: nextZoom });
  }

  // Attach a NON-PASSIVE wheel listener so preventDefault actually
  // stops the parent workspace from scrolling.
  useNonPassiveWheel(containerRef, handleWheel, !!editable);

  function handleDoubleClick() {
    if (!editable || !onPlacementChange) return;
    onPlacementChange(slot, { focusX: 50, focusY: 50, zoom: 1 });
  }

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
      // CORNER SIGN NORMALIZATION (per layer-management spec):
      //   SE: down-right grows  →  dx + dy
      //   NW: up-left grows     →  -(dx + dy)
      //   NE: up-right grows    →  dx - dy
      //   SW: down-left grows   →  -dx + dy
      let signedDiag: number;
      switch (r.corner) {
        case "se": signedDiag = dx + dy; break;
        case "nw": signedDiag = -(dx + dy); break;
        case "ne": signedDiag = dx - dy; break;
        case "sw": signedDiag = -dx + dy; break;
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
      {editable && (
        <div className="absolute bottom-1 right-1 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-white opacity-0 group-hover:opacity-100 transition pointer-events-none">
          {Math.round(focusX)}/{Math.round(focusY)} · {zoom.toFixed(1)}×
        </div>
      )}
      {editable && onSizeChange && (
        <>
          <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 rounded bg-[#FF005A] px-2 py-0.5 text-[9px] font-mono text-white opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
            {sizeLabel ?? "size"}: {(sizeMultiplier ?? 1).toFixed(2)}×
          </div>
          <ResizeHandle corner="nw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle corner="ne" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle corner="se" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle corner="sw" onMouseDown={handleResizeMouseDown} />
        </>
      )}
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// SponsorLogo — same as the Speaker Intro version, honors logoSize.
// ---------------------------------------------------------------------------

function SponsorLogo({
  sponsor,
  editable,
  slot,
  onPickImage,
  onSizeChange,
  previewScale = 1,
}: {
  sponsor: Sponsor;
  editable?: boolean;
  slot: ImageSlot;
  onPickImage?: (slot: ImageSlot) => void;
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  previewScale?: number;
}) {
  const sizeMult = Math.max(0.01, sponsor.logoSize ?? 1);
  const heightPx = Math.round(36 * sizeMult);
  const minWidthPx = Math.round(90 * sizeMult);

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
        case "ne": signedDiag = dx - dy; break;
        case "sw": signedDiag = -dx + dy; break;
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
          sizes="90px"
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

/**
 * QrCode — kept for compatibility (not rendered in the visual-first
 * Event Profile layout, but the editor still imports it for the form
 * view). Generates a QR code from a URL using the `qrcode` library.
 */
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
