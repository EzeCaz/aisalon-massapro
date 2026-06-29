"use client";

import { forwardRef, useRef, useState, useEffect, type ReactNode } from "react";
import Image from "next/image";
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
  useCanvasScrollIsolation,
  useNonPassiveWheel,
  type SectionId,
  type SectionPos,
  type SectionBoxSize,
} from "../shared/section-edit";

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
 *
 * Sections-editable mode (sectionsEditable=true):
 *   - Text sections (header, topic, speakers, sponsors, collaborators,
 *     branding, qr, footer) get wrapped in <SectionBox> which makes
 *     them draggable + 8-handle resizeable.
 *   - Layout persists in `data.sectionLayout[id] = { pos, scale }`.
 *   - Alignment guides appear when dragging (cyan lines at canvas edges,
 *     centers, and peer box edges).
 *   - Text sections always render at zIndex >= 50 so they stay above
 *     images and overlays.
 */

const CANVAS_W = 1200;
const CANVAS_H = 800;

type Props = {
  data: SpeakerIntroData;
  className?: string;
  /** When true, image areas become interactive (drag/wheel/click). */
  editable?: boolean;
  /** When true, text sections become draggable + resizeable. */
  sectionsEditable?: boolean;
  /** Called when the user clicks "Replace" on an image slot. */
  onPickImage?: (slot: ImageSlot) => void;
  /** Called whenever an image is dragged / zoomed. */
  onPlacementChange?: (slot: ImageSlot, placement: ImagePlacement) => void;
  /** Called when the user drags a resize corner handle on an image. */
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  /** Called when a section is dragged to a new position. */
  onSectionMove?: (id: SectionId, pos: SectionPos) => void;
  /** Called when a section is resized via a corner/edge handle. */
  onSectionResize?: (id: SectionId, scale: number) => void;
  /** Called when a section is resized via a mid-edge handle — updates the
   *  box's explicit width/height in canvas px. */
  onSectionBoxResize?: (id: SectionId, size: SectionBoxSize) => void;
  /** Called when the hero overlay z-index changes (front/back button). */
  onHeroZChange?: (z: number) => void;
  /** Called when the triangle overlay z-index changes (front/back button). */
  onTriangleZChange?: (z: number) => void;
  /** Called when the hero overlay X scale changes (slider). */
  onHeroScaleXChange?: (n: number) => void;
  /** Called when the hero overlay Y scale changes (slider). */
  onHeroScaleYChange?: (n: number) => void;
  /** Called when a section's z-index changes (Front/Back in ObjectPropertiesPanel). */
  onSectionZChange?: (id: SectionId, z: number) => void;
  /** The current scale of the preview (used to convert screen-drag to canvas-%). */
  previewScale?: number;
};

export const SpeakerIntroCanvas = forwardRef<HTMLDivElement, Props>(
  function SpeakerIntroCanvas(
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
    // Default z-index for hero / triangle / text layers.
    //
    // User spec (Section 3 — Layering & Rendering Logic, 2026-06-28):
    //   "Z-Index consistency: 'Show Triangle Overlay' must always render
    //    BEHIND 'Hero Image' when visible."
    //
    // Implementation note: the triangle is INSIDE the hero div (as a
    // sibling of the hero EditableImage). Both layers live in the hero
    // div's stacking context. The hero EditableImage is wrapped in a
    // div with explicit zIndex = triangleZ + 1, so the image always
    // renders IN FRONT of the triangle by default. The Front/Back
    // buttons in the left sidebar can override this dynamically.
    //
    // Text always sits at zIndex >= 50 so it's always on top of overlays
    // and images (unless the user manually brings a layer above 50 with
    // the Front button — at which point they're explicitly opting in).
    const heroZ = data.heroZ ?? 2;
    const triangleZ = data.triangleZ ?? 1;
    const TEXT_Z = 50; // base text layer z; specific sections override above this

    // --- Section 4: Scroll Isolation ---
    // Disable parent/window scrolling when the user hovers over the canvas
    // or actively edits a component. The canvas itself doesn't scroll (it's
    // a fixed mockup preview), so there's no reason to let wheel events
    // bubble to the parent workspace.
    useCanvasScrollIsolation(
      ref as React.RefObject<HTMLDivElement | null>,
      !!(editable || sectionsEditable),
    );

    // --- Section 1: ObjectPropertiesPanel selection state ---
    // Tracks which SectionBox is currently selected. When set, the
    // ObjectPropertiesPanel is rendered at the top-right of the canvas
    // with X/Y coordinate inputs + Front/Back layer toggles.
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Reset selection when sections-edit mode is turned off.
    useEffect(() => {
      if (!sectionsEditable) setSelectedId(null);
    }, [sectionsEditable]);

    /** Compute the z-index for a given section. Falls back to a sensible
     *  default based on the section id (text sections at TEXT_Z+). */
    function sectionZFor(id: SectionId): number {
      const explicit = data.sectionLayout?.[id]?.z;
      if (typeof explicit === "number") return explicit;
      // Default z by section type
      if (id === "footer") return TEXT_Z + 1;
      return TEXT_Z;
    }

    /** All peer z-indices in the same stacking context (used by
     *  ObjectPropertiesPanel's Front/Back to compute max/min). */
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
            fontFamily:
              "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
          }}
        >
        {/* ===== 5. HERO VISUAL (right side, behind everything else on right) ===== */}
        {(() => {
          // imageScale (X): 1 = default 58% width starting at 42% left.
          //   - scale < 1 shrinks the hero (anchored to the right edge).
          //   - scale > 1.72 grows the hero beyond the canvas width; the
          //     overflow is clipped by the canvas's `overflow-hidden`.
          //   - The ONLY limitation is the canvas border — no arbitrary
          //     min/max clamp is applied here. (User spec 2026-06-28.)
          const scale = Math.max(0.01, data.heroOverlay.imageScale ?? 1);
          const heroWidth = 58 * scale; // % of canvas
          // Anchor to the right edge: as scale grows past 100/58 ≈ 1.72,
          // heroLeft would go negative; we clamp to 0 so the right edge
          // stays anchored to the canvas right border and the bleed goes
          // off the LEFT side (clipped by overflow-hidden).
          const heroLeft = Math.max(0, 100 - heroWidth);
          // imageScaleY: 1 = full canvas height. scale < 1 shrinks
          // vertically; scale > 1 bleeds off the bottom (clipped).
          const scaleY = Math.max(0.01, data.heroOverlay.imageScaleY ?? 1);
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
            zIndex: heroZ,
          }}
        >
          {/* Background image (Tel Aviv skyline + beach).
              Wrapped in a div with explicit zIndex = triangleZ + 1 so the
              hero image always renders IN FRONT of the triangle overlay
              (per Section 3 of user spec 2026-06-28). The Front/Back
              controls in the sidebar can override this dynamically. */}
          <div
            className="absolute inset-0"
            style={{ zIndex: triangleZ + 1 }}
          >
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
          </div>

          {/* 6. TRIANGLE GRADIENT OVERLAY — hidden when user picks a new hero image */}
          {data.heroOverlay.showTriangleOverlay !== false && (
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: triangleZ }}>
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
            </div>
          )}

          {/* 7. LOCATION PINS — per-pin connector line + dot + label
              Per user spec 2026-06-30: each pin gets its own z-index
              (Front/Back capability). When the user clicks Front on a
              pin, BOTH the pin (dot + label) AND its connector line must
              come forward together. So each pin renders as a single
              full-canvas wrapper div containing:
                - its own SVG with the single connector line (50,50 → pin.x,pin.y)
                - the dot (CSS circle at pin position)
                - the label (text at pin position)
              All three siblings share the same wrapper z-index. */}
          {data.locationPins.map((pin, i) => {
            const pinZ = pin.z ?? 50;
            const dotColor = data.event.brandColors[0] ?? "#FF005A";
            return (
              <div
                key={`pin-${i}`}
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: pinZ }}
              >
                {/* Connector line — full-canvas SVG with this pin's
                    single line from canvas center (50,50) to (pin.x, pin.y).
                    viewBox 0 0 100 100 + preserveAspectRatio none means the
                    SVG coords are percentage-of-canvas, matching pin.x/y. */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <line
                    x1="50"
                    y1="50"
                    x2={pin.x}
                    y2={pin.y}
                    stroke="white"
                    strokeWidth="0.25"
                    strokeOpacity="0.6"
                    strokeDasharray="0.5 0.5"
                  />
                </svg>
                {/* Dot — small circle, centered on the pin's (x,y) */}
                <div
                  className="absolute rounded-full border-2 border-white shadow"
                  style={{
                    left: `${pin.x}%`,
                    top: `${pin.y}%`,
                    width: "10px",
                    height: "10px",
                    backgroundColor: dotColor,
                    transform: "translate(-50%, -50%)",
                  }}
                  aria-hidden
                />
                {/* Label — positioned above the dot */}
                <span
                  className="absolute text-white font-semibold uppercase tracking-wider drop-shadow whitespace-nowrap"
                  style={{
                    left: `${pin.x}%`,
                    top: `${pin.y}%`,
                    transform: "translate(-50%, -180%)",
                    fontSize: "11px",
                    letterSpacing: "0.12em",
                  }}
                >
                  {pin.label}
                </span>
              </div>
            );
          })}
        </div>
          );
        })()}

        {/* ===== 1. EVENT HEADER (top-left) ===== */}
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
          style={{ left: "48px", top: "40px", maxWidth: "640px", zIndex: sectionZFor("header") }}
          accentColor="#FF005A"
          label="Header"
          guideId="header"
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
        </SectionBox>

        {/* ===== 2. EVENT TOPIC (below header, with vertical accent bar) ===== */}
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
          className="absolute flex items-start gap-3"
          style={{ left: "48px", top: "160px", maxWidth: "440px", zIndex: sectionZFor("topic") }}
          accentColor="#FF005A"
          label="Topic"
          guideId="topic"
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
        </SectionBox>

        {/* ===== 3. QR CODE (top-right) ===== */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "qr"}
          onSelect={() => setSelectedId("qr")}
          pos={data.sectionLayout?.qr?.pos}
          scale={data.sectionLayout?.qr?.scale ?? 1}
          boxSize={data.sectionLayout?.qr?.boxSize}
          onMove={(p) => onSectionMove?.("qr", p)}
          onResize={(s) => onSectionResize?.("qr", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("qr", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute flex flex-col items-center gap-1"
          style={{ right: "48px", top: "40px", zIndex: sectionZFor("qr") }}
          anchor="top-right"
          accentColor="#FF005A"
          label="QR"
          guideId="qr"
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
        </SectionBox>

        {/* ===== 4. SPEAKERS LIST (left column / multi-column grid) ===== */}
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
          className="absolute flex flex-col gap-3"
          style={{ left: "48px", top: "260px", width: `${(data.speakersLayout?.columns ?? 1) === 1 ? 400 : (data.speakersLayout?.columns ?? 1) === 2 ? 700 : 1000}px`, zIndex: sectionZFor("speakers") }}
          accentColor="#FF005A"
          label="Speakers"
          guideId="speakers"
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
          {(() => {
            // Sorted + filtered speakers (paired with their sort index).
            const sortedSpeakers = [...data.speakers]
              .sort((a, b) => a.order - b.order)
              .map((speaker, idx) => ({ speaker, idx }))
              .filter(({ speaker }) => speaker.visible !== false);

            const layout = data.speakersLayout ?? {};
            const columns = layout.columns ?? 1;
            const flow = layout.flowDirection ?? "row";
            const lastRowAlign = layout.lastRowAlign ?? "spread";
            const rowsPerColumn = layout.rowsPerColumn ?? [];

            // Build the position map for each speaker.
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
                  display: "grid",
                  gridTemplateColumns: `repeat(${columns}, 1fr)`,
                  gap: "12px",
                }}
              >
                {sortedSpeakers.map(({ speaker, idx }, i) => {
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
                      key={`${speaker.order}-${speaker.fullName}`}
                      style={{
                        gridColumnStart,
                        gridRowStart: pos.row + 1,
                      }}
                    >
                      <SpeakerCard
                        speaker={speaker}
                        accentColor={data.event.brandColors[0]}
                        editable={editable}
                        slot={{ kind: "speaker", index: idx }}
                        previewScale={previewScale}
                        onPickImage={onPickImage}
                        onPlacementChange={onPlacementChange}
                        onSizeChange={onSizeChange}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </SectionBox>

        {/* ===== 8. SPONSORS (bottom-right) ===== */}
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
          style={{ right: "48px", bottom: "100px", zIndex: sectionZFor("sponsors") }}
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
        </SectionBox>

        {/* ===== 9. BRANDING (bottom-right corner) ===== */}
        {/* Replaced the text "ai salon" wordmark with the meerkat brand image
            per user request (Task ID: mockup-editor-v2). */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "branding"}
          onSelect={() => setSelectedId("branding")}
          pos={data.sectionLayout?.branding?.pos}
          scale={data.sectionLayout?.branding?.scale ?? 1}
          boxSize={data.sectionLayout?.branding?.boxSize}
          onMove={(p) => onSectionMove?.("branding", p)}
          onResize={(s) => onSectionResize?.("branding", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("branding", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute flex items-center gap-2"
          style={{ right: "48px", bottom: "32px", zIndex: sectionZFor("branding") }}
          anchor="top-right"
          accentColor="#FF005A"
          label="Branding"
          guideId="branding"
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
        </SectionBox>

        {/* Optional footer credit (bottom-left) */}
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
            style={{ left: "48px", bottom: "32px", fontSize: "11px", zIndex: sectionZFor("footer") }}
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
            Floating panel (top-right of canvas, only when a section is
            selected) with X/Y coordinate inputs + Front/Back layer
            toggles + box size W/H inputs (for mid-edge-resized boxes).
            Per user spec 2026-06-28:
              "Every selected element (image or section) must display an
               active properties panel (or floating tooltip) containing:
                 - Positioning: X and Y coordinate inputs for precise
                   placement.
                 - Layering: Front and Back toggles to reorder the
                   z-index of the currently selected element." */}
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

        {/* Alignment guides overlay (rendered last so it sits on top of
            all canvas content but below the SectionBox handles). */}
        <GuideOverlay />
      </div>
    </GuideProvider>
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
      // moving "outward" (away from the image center) increases the size
      // and moving "toward the center" decreases it. The SW and NE
      // formulas were previously inverted — fixed per user spec.
      let signedDiag: number;
      switch (r.corner) {
        case "se": signedDiag = dx + dy; break;            // down-right grows
        case "nw": signedDiag = -(dx + dy); break;          // up-left grows
        case "ne": signedDiag = dx - dy; break;             // up-right grows (dx>0 grows, dy<0 grows)
        case "sw": signedDiag = -dx + dy; break;            // down-left grows (dx<0 grows, dy>0 grows)
      }
      // 100px of drag = 1.0× size change (so dragging 50px = +0.5×).
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
      ref={containerRef} id={`editable-img-${slotKey(slot)}`}
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
  const photoSize = Math.max(0.01, speaker.photoSize ?? 1);
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
  const sizeMult = Math.max(0.01, sponsor.logoSize ?? 1);
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
// `useState` and `useEffect` are imported at the top of this file (line 3)
// — no need to re-import here.

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
