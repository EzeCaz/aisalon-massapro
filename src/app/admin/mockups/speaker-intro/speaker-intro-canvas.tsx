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
  type SectionLayoutEntry,
} from "../shared/section-edit";
import { HeroShape, type HeroShapeConfig } from "../shared/hero-shape";

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
  /**
   * Called when the hero image's boxSize W/H changes (from the new
   * "Hero Image Properties" floating panel — per user spec 2026-07-31
   * TSK-0032). Updates `data.heroOverlay.boxSize` (canvas px).
   */
  onHeroBoxResize?: (size: { width?: number; height?: number }) => void;
  /** Called when a section's z-index changes (Front/Back in ObjectPropertiesPanel). */
  onSectionZChange?: (id: SectionId, z: number) => void;
  /**
   * Called when the bottom-LEFT branding asset is dragged via its
   * "⠿ Move branding" handle. Updates `data.brandingAsset.pos` (free-form
   * position as % of canvas).
   */
  onBrandingAssetPosChange?: (pos: { x: number; y: number }) => void;
  /**
   * Called when the hero image is dragged via its "⠿ Move hero" grip
   * bar. Updates `data.heroOverlay.pos` (free-form {x, y} as % of canvas).
   *
   * Per user spec 2026-07-04: "make sure i am able to drag with my mouse
   * the hero image along the entire canvas and not only by using the
   * Photo position (X%, Y%)".
   */
  onHeroPosChange?: (pos: { x: number; y: number }) => void;
  /** PER USER SPEC 2026-08-02 (TSK-0049): Called when the user clicks the
   *  "Set as default" button (in the Object Properties Panel or the
   *  toolbar next to Style 3). Saves the ENTIRE current mockup state
   *  as the default for the current style. */
  onSetAsDefault?: () => void;
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
      onHeroBoxResize,
      onSectionZChange,
      onBrandingAssetPosChange,
      onHeroPosChange,
      onSetAsDefault,
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

    // PER USER SPEC 2026-07-31 (TSK-0034): Default hero overlay shape config,
    // computed based on `data.style` when `data.heroOverlayShapeConfig` is
    // undefined. This way:
    //   - Style 1 (default) → shape = "legacy-triangle" (the original
    //                          Style 1 right-pointing triangle SVG with
    //                          dual gradient layers — same visual as the
    //                          pre-TSK-0028 legacy `showTriangleOverlay`
    //                          rendering).
    //   - Style 3           → shape = "rectangle" (a clean rectangle
    //                          overlay, per user spec).
    //   - Style 2           → not applicable (Style 2 uses its own
    //                          `style2HeroGradient` + Style2Canvas).
    // When the user picks a different shape in the form view, their
    // selection is written to `data.heroOverlayShapeConfig` and overrides
    // this default. This default only applies on initial load + when the
    // user switches style and hasn't yet customized the shape.
    const heroShapeConfig: HeroShapeConfig = data.heroOverlayShapeConfig ?? (
      data.style === "style3"
        ? {
            shape: "rectangle",
            fillMode: "gradient",
            colors: data.heroOverlay.gradientColors ?? ["#8A2BE2", "#1E90FF", "#20B2AA"],
            direction: 135,
            opacity: data.heroOverlay.gradientOpacity ?? 0.55,
            rotation: 0,
          }
        : {
            // Style 1 (default) — legacy triangle with the user's gradient.
            shape: "legacy-triangle",
            fillMode: "gradient",
            colors: data.heroOverlay.gradientColors ?? ["#8A2BE2", "#1E90FF", "#20B2AA"],
            direction: 135,
            opacity: data.heroOverlay.gradientOpacity ?? 0.55,
            rotation: 0,
          }
    );

    // PER USER SPEC 2026-07-31 (TSK-0031): Default section layout values
    // for Style 1 (and Style 3, which is an exact duplicate of Style 1).
    // Used as fallbacks when `data.sectionLayout[id]` is missing — both
    // for the SectionBox (rendering position) and the ObjectPropertiesPanel
    // (the floating form that shows X/Y/W/H/Scale/z).
    //   - header: X=-1.1, Y=0.3, W=1100, H=auto, Scale=97%, z=50
    //             (PER USER SPEC 2026-07-31 TSK-0036 — was X=1.5, Y=0.2,
    //              W=1200, Scale=100% per TSK-0031)
    //   - topic:  X=-12.8, Y=21.9, W=864, H=45, Scale=65%, z=50
    //             (PER USER SPEC 2026-07-31 TSK-0036 — was X=-13, Y=14.4,
    //              W=951, H=auto per TSK-0031)
    //   - qr:     X=91.6, Y=2.5, W=auto, H=auto, Scale=124%, z=50
    //             (PER USER SPEC 2026-07-31 TSK-0034 — was X=91, Y=2.2,
    //              Scale=114% per TSK-0032)
    //   - sponsors: X=23.8, Y=82.6, W=auto, H=auto, Scale=100%, z=1
    //             (PER USER SPEC 2026-07-31 TSK-0032; z=1 also in sectionZFor)
    //   - hero-image: virtual section id for the hero overlay image —
    //             bound to data.heroOverlay.pos/imageScale/imageScaleY.
    //             Default pos used when data.heroOverlay.pos is undefined.
    //             (PER USER SPEC 2026-07-31 TSK-0032)
    //   - speakers: X=-8.5, Y=23.7, W=891, H=381, Scale=76%, z=60
    //             (PER USER SPEC 2026-07-31 TSK-0036 — was X=-7.9, Y=17.6,
    //              H=auto per TSK-0034)
    const STYLE1_DEFAULTS: Record<string, SectionLayoutEntry> = {
      // PER USER SPEC 2026-07-31 (TSK-0036): Style 1/3 header defaults
      // updated to X=-1.1, Y=0.3, W=1100, H=auto, Scale=97% (was
      // X=1.5, Y=0.2, W=1200, Scale=100% per TSK-0031).
      header:   { pos: { x: -1.1, y: 0.3 }, boxSize: { width: 1100 }, scale: 0.97, z: 50 },
      // PER USER SPEC 2026-07-31 (TSK-0036): Style 1/3 topic defaults
      // updated to X=-12.8, Y=21.9, W=864, H=45, Scale=65% (was
      // X=-13, Y=14.4, W=951, H=auto, Scale=65% per TSK-0031).
      topic:    { pos: { x: -12.8, y: 21.9 }, boxSize: { width: 864, height: 45 }, scale: 0.65, z: 50 },
      // PER USER SPEC 2026-08-02 (TSK-0047): Style 1/3 QR defaults
      // updated to X=91.6, Y=84.9, Scale=100% (was X=91.6, Y=2.5,
      // Scale=124% per TSK-0034). The QR code moves from the top-right
      // to the BOTTOM-right of the canvas, and the scale resets to 100%
      // (was 124% which made it overflow the canvas top edge).
      qr:       { pos: { x: 91.6, y: 84.9 }, scale: 1, z: 50 },
      sponsors: { pos: { x: 23.8, y: 82.6 }, scale: 1, z: 1 },
      "hero-image": { pos: { x: 42, y: 0 }, scale: 1, z: 2 },
      // PER USER SPEC 2026-07-31 (TSK-0036): Style 1/3 speakers Properties
      // defaults updated to Position X=-8.5 Y=23.7, Size W=891 H=381,
      // Scale=76% (was X=-7.9, Y=17.6, H=auto per TSK-0034).
      // z=60 keeps the speakers grid above other text sections (TEXT_Z=50)
      // and above the branding asset (52) — same z as the previous defaults
      // in sample-data + event-mapper, so existing user drag/resize edits
      // continue to layer correctly.
      speakers: { pos: { x: -8.5, y: 23.7 }, boxSize: { width: 891, height: 381 }, scale: 0.76, z: 60 },
    };

    // PER USER SPEC 2026-08-02 (TSK-0044): Style 3 now has its OWN defaults
    // (different from Style 1). Previously Style 3 was "an exact duplicate
    // of Style 1" and shared SECTION_DEFAULTS. The user has now specified
    // distinct values for 4 sections (speakers / qr / topic / header).
    // Style 1's defaults are UNCHANGED — only Style 3 gets new values.
    //   - header:  X=-0.6, Y=1.2,  W=1100, H=auto, Scale=97%,  z=50
    //   - topic:   X=-12.7, Y=15.7, W=864, H=45,   Scale=65%,  z=50
    //   - qr:      X=90.1, Y=80.2, W=auto, H=auto, Scale=100%, z=50
    //   - speakers: X=-6.1, Y=26.2, W=653, H=auto, Scale=76%,  z=50
    // (sponsors + hero-image keep the same defaults as Style 1 — the user
    //  didn't specify new values for those sections.)
    const STYLE3_DEFAULTS: Record<string, SectionLayoutEntry> = {
      header:   { pos: { x: -0.6, y: 1.2 }, boxSize: { width: 1100 }, scale: 0.97, z: 50 },
      topic:    { pos: { x: -12.7, y: 15.7 }, boxSize: { width: 864, height: 45 }, scale: 0.65, z: 50 },
      qr:       { pos: { x: 91.6, y: 84.9 }, scale: 1, z: 50 },
      sponsors: { pos: { x: 23.8, y: 82.6 }, scale: 1, z: 1 },
      "hero-image": { pos: { x: 42, y: 0 }, scale: 1, z: 2 },
      speakers: { pos: { x: -6.1, y: 26.2 }, boxSize: { width: 653 }, scale: 0.76, z: 50 },
    };

    // PER USER SPEC 2026-08-02 (TSK-0044): select defaults based on the
    // active style. Style 1 → STYLE1_DEFAULTS; Style 3 → STYLE3_DEFAULTS.
    // Style 2 has its own canvas (SpeakerIntroStyle2Canvas) and doesn't
    // use this code path, so we don't need a Style 2 case here.
    const SECTION_DEFAULTS = data.style === "style3" ? STYLE3_DEFAULTS : STYLE1_DEFAULTS;

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
     *  default based on the section id (text sections at TEXT_Z+).
     *
     *  PER USER SPEC 2026-07-31 (TSK-0030): Style 1/3 sponsors default
     *  z-index is 1 (not 50). */
    function sectionZFor(id: SectionId): number {
      const explicit = data.sectionLayout?.[id]?.z;
      if (typeof explicit === "number") return explicit;
      // Default z by section type
      if (id === "footer") return TEXT_Z + 1;
      if (id === "sponsors") return 1;
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
        {/* ===== 5. HERO VISUAL (right side, behind everything else on right) =====
            PER USER SPEC 2026-07-31 (TSK-0032): the hero image is now
            SELECTABLE in Edit Sections mode — clicking it (or its grip)
            sets selectedId="hero-image" and shows the ObjectPropertiesPanel
            with Position X/Y, Size W/H, Scale % just like other sections.
            The panel is wired to data.heroOverlay.pos / boxSize /
            imageScale via onHeroPosChange / onHeroBoxResize /
            onHeroScaleXChange. When boxSize is set, it overrides the
            legacy imageScale/imageScaleY multipliers. */}
        {(() => {
          // boxSize override (from the new Hero Image Properties panel).
          // When set, the hero container is sized in canvas px instead of
          // the legacy imageScale/imageScaleY multipliers.
          const heroBoxSize = data.heroOverlay.boxSize;
          const hasBoxW = !!(heroBoxSize?.width && heroBoxSize.width > 0);
          const hasBoxH = !!(heroBoxSize?.height && heroBoxSize.height > 0);
          // imageScale (X): 1 = default 58% width starting at 42% left.
          //   - scale < 1 shrinks the hero (anchored to the right edge).
          //   - scale > 1.72 grows the hero beyond the canvas width; the
          //     overflow is clipped by the canvas's `overflow-hidden`.
          //   - The ONLY limitation is the canvas border — no arbitrary
          //     min/max clamp is applied here. (User spec 2026-06-28.)
          const scale = Math.max(0.01, data.heroOverlay.imageScale ?? 1);
          // Width: explicit px (from boxSize) wins over legacy multiplier.
          // Convert px → % of canvas so DraggablePhotoContainer can still
          // use widthPct/heightPct.
          const heroWidth = hasBoxW
            ? ((heroBoxSize!.width as number) / CANVAS_W) * 100
            : 58 * scale; // % of canvas
          // Default anchor: top-right (clamped so the right edge stays
          // anchored to the canvas right border; the bleed goes off the
          // LEFT side and is clipped by overflow-hidden). When the user
          // has dragged the hero via the "⠿ Move hero" grip bar,
          // `data.heroOverlay.pos` overrides this default.
          const defaultHeroLeft = Math.max(0, 100 - heroWidth);
          const pos = data.heroOverlay.pos ?? SECTION_DEFAULTS["hero-image"].pos ?? { x: defaultHeroLeft, y: 0 };
          const heroLeft = pos.x ?? defaultHeroLeft;
          // imageScaleY: 1 = full canvas height. scale < 1 shrinks
          // vertically; scale > 1 bleeds off the bottom (clipped).
          const scaleY = Math.max(0.01, data.heroOverlay.imageScaleY ?? 1);
          // Height: explicit px (from boxSize) wins over legacy multiplier.
          const heroHeight = hasBoxH
            ? ((heroBoxSize!.height as number) / CANVAS_H) * 100
            : 100 * scaleY; // % of canvas
          const heroTop = pos.y ?? 0; // default: anchored to top
          // Selection state — when selectedId === "hero-image", show a
          // dashed outline so the user knows the Hero Image Properties
          // panel is bound to this element.
          const heroSelected = selectedId === "hero-image";
          return (
        <DraggablePhotoContainer
          leftPct={heroLeft}
          topPct={heroTop}
          widthPct={heroWidth}
          heightPct={heroHeight}
          zIndex={heroZ}
          rotation={0}
          editable={editable}
          previewScale={previewScale}
          onPosChange={onHeroPosChange}
          moveLabel="⠿ Move hero"
        >
          {/* Click-catcher for selecting the hero image in Edit Sections
              mode. Sits ABOVE the image but BELOW the EditableImage's
              own pan/zoom interactions (so it only intercepts clicks
              when sectionsEditable is on). */}
          {sectionsEditable && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId("hero-image");
              }}
              style={{
                position: "absolute",
                inset: 0,
                cursor: "pointer",
                zIndex: 999,
                outline: heroSelected
                  ? "2px dashed #0066FF"
                  : "1px dashed rgba(0, 102, 255, 0.4)",
                outlineOffset: "-2px",
                pointerEvents: "auto",
              }}
              title="Click to edit Hero Image properties"
            />
          )}
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
            objectFit={data.heroOverlay.fit === "contain" ? "contain" : "cover"}
          />
          </div>

          {/* 6. SHAPE OVERLAY — PER USER SPEC 2026-07-31 (TSK-0034):
              Unified shape system. The shape is computed in `heroShapeConfig`
              (defined above the JSX) — falls back to:
                - Style 1 (default) → "legacy-triangle" (the original Style 1
                  right-pointing triangle SVG with dual gradient layers)
                - Style 3           → "rectangle" (clean rectangle overlay)
              The user can pick any of 15 shapes (none / legacy-triangle /
              8×2D / 5×3D) via the form view's "Hero Overlay Shape" panel.

              The shape is rendered inside the hero container (sibling of
              the hero EditableImage), at zIndex = triangleZ (so the
              Front/Back layer buttons in the sidebar still control it).
              The hero image is rendered above the shape (its wrapper has
              zIndex = triangleZ + 1).

              PER USER SPEC 2026-07-31 (TSK-0034): When the shape's config
              has `pos` / `boxSize` / `scale` set, the shape is positioned
              ABSOLUTELY on the canvas (overriding the parent container's
              position). This is used by Style 3 to make the rectangle
              overlay a standalone, draggable section. */}
          {heroShapeConfig.shape !== "none" && (
            (() => {
              // Compute the shape wrapper style based on pos/boxSize/scale.
              const shapePos = heroShapeConfig.pos;
              const shapeBox = heroShapeConfig.boxSize;
              const shapeScale = heroShapeConfig.scale ?? 1;
              const hasPosOrBox = !!(shapePos || shapeBox);
              const wrapperStyle: React.CSSProperties = {
                zIndex: triangleZ,
                ...(shapePos
                  ? {
                      left: `${shapePos.x}%`,
                      top: `${shapePos.y}%`,
                    }
                  : { left: 0, top: 0 }),
                ...(shapeBox?.width
                  ? { width: `${shapeBox.width}px` }
                  : { width: "100%" }),
                ...(shapeBox?.height
                  ? { height: `${shapeBox.height}px` }
                  : { height: "100%" }),
                ...(shapeScale !== 1
                  ? {
                      transform: `scale(${shapeScale})`,
                      transformOrigin: "top left",
                    }
                  : {}),
              };
              return (
                <div
                  className={`absolute pointer-events-none ${hasPosOrBox ? "" : "inset-0"}`}
                  style={wrapperStyle}
                >
                  <HeroShape config={heroShapeConfig} />
                </div>
              );
            })()
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
                    fontSize: `${data.textStyles?.locationPinLabel?.fontSize ?? 11}px`,
                    letterSpacing: "0.12em",
                    color: data.textStyles?.locationPinLabel?.color,
                    textAlign: data.textStyles?.locationPinLabel?.align,
                  }}
                >
                  {pin.label}
                </span>
              </div>
            );
          })}
        </DraggablePhotoContainer>
          );
        })()}

        {/* ===== 1. EVENT HEADER (top-left) =====
            PER USER SPEC 2026-07-31 (TSK-0031): Default header Properties
            to X=1.5%, Y=0.2%, W=1200px, H=auto, Scale=100%, z=50.
            The default pos/boxSize/scale apply when the user has not
            dragged the section yet; once dragged, data.sectionLayout.header
            wins. */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "header"}
          onSelect={() => setSelectedId("header")}
          pos={data.sectionLayout?.header?.pos ?? SECTION_DEFAULTS.header.pos}
          scale={data.sectionLayout?.header?.scale ?? SECTION_DEFAULTS.header.scale}
          boxSize={data.sectionLayout?.header?.boxSize ?? SECTION_DEFAULTS.header.boxSize}
          onMove={(p) => onSectionMove?.("header", p)}
          onResize={(s) => onSectionResize?.("header", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("header", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute"
          style={{ left: 0, top: 0, zIndex: sectionZFor("header") }}
          accentColor="#FF005A"
          label="Header"
          guideId="header"
        >
          <h1
            className="font-extrabold text-black leading-none tracking-tight"
            style={{
              fontSize: `${data.textStyles?.eventName?.fontSize ?? (44 * (data.event.nameFontScale ?? 1))}px`,
              color: data.textStyles?.eventName?.color,
              textAlign: data.textStyles?.eventName?.align,
            }}
          >
            {data.event.name}
          </h1>
          <p
            className="mt-3 text-black/70 font-semibold"
            style={{
              fontSize: `${data.textStyles?.eventDate?.fontSize ?? 16}px`,
              color: data.textStyles?.eventDate?.color,
              textAlign: data.textStyles?.eventDate?.align,
            }}
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
            className="mt-1 text-black/80"
            style={{
              fontSize: `${data.textStyles?.eventVenue?.fontSize ?? 20}px`,
              color: data.textStyles?.eventVenue?.color,
              textAlign: data.textStyles?.eventVenue?.align,
            }}
          >
            {data.event.venue}
          </p>
        </SectionBox>

        {/* ===== 2. EVENT TOPIC (below header, with vertical accent bar) =====
            PER USER SPEC 2026-07-31 (TSK-0031): Default topic Properties
            to X=-13%, Y=14.4%, W=951px, H=auto, Scale=65%, z=50.
            The default pos/boxSize/scale apply when the user has not
            dragged the section yet; once dragged, data.sectionLayout.topic
            wins. */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "topic"}
          onSelect={() => setSelectedId("topic")}
          pos={data.sectionLayout?.topic?.pos ?? SECTION_DEFAULTS.topic.pos}
          scale={data.sectionLayout?.topic?.scale ?? SECTION_DEFAULTS.topic.scale}
          boxSize={data.sectionLayout?.topic?.boxSize ?? SECTION_DEFAULTS.topic.boxSize}
          onMove={(p) => onSectionMove?.("topic", p)}
          onResize={(s) => onSectionResize?.("topic", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("topic", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute flex items-start gap-3"
          style={{ left: 0, top: 0, zIndex: sectionZFor("topic") }}
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
            style={{
              fontSize: `${data.textStyles?.eventTopic?.fontSize ?? (26 * (data.event.topicFontScale ?? 1))}px`,
              color: data.textStyles?.eventTopic?.color,
              textAlign: data.textStyles?.eventTopic?.align,
            }}
          >
            {data.event.topic}
          </h2>
        </SectionBox>

        {/* ===== 3. QR CODE (top-right) =====
            PER USER SPEC 2026-07-31 (TSK-0032): Default qr Properties
            to X=91%, Y=2.2%, W=auto, H=auto, Scale=114%, z=50.
            Anchor switched from top-right to top-left (default) so X/Y
            match the Properties form. */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "qr"}
          onSelect={() => setSelectedId("qr")}
          pos={data.sectionLayout?.qr?.pos ?? SECTION_DEFAULTS.qr.pos}
          scale={data.sectionLayout?.qr?.scale ?? SECTION_DEFAULTS.qr.scale}
          boxSize={data.sectionLayout?.qr?.boxSize}
          onMove={(p) => onSectionMove?.("qr", p)}
          onResize={(s) => onSectionResize?.("qr", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("qr", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute flex flex-col items-center gap-1"
          style={{ left: 0, top: 0, zIndex: sectionZFor("qr") }}
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
            style={{
              fontSize: `${data.textStyles?.registerHere?.fontSize ?? 10}px`,
              letterSpacing: "0.15em",
              color: data.textStyles?.registerHere?.color,
              textAlign: data.textStyles?.registerHere?.align,
            }}
          >
            Register here
          </span>
        </SectionBox>

        {/* ===== 4. SPEAKERS LIST (left column / multi-column grid) =====
            PER USER SPEC 2026-07-31 (TSK-0033): Style 1/3 speakers
            Properties defaults: Position X=-8.8 Y=22.1, Size W=891 H=auto,
            Scale=76%, z=60. When the user has not dragged the speakers
            section yet, data.sectionLayout.speakers is undefined and the
            SECTION_DEFAULTS.speakers fallback below applies — the Properties
            panel shows the spec values on initial load. Once dragged, the
            user's data.sectionLayout.speakers.pos/scale/boxSize overrides. */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "speakers"}
          onSelect={() => setSelectedId("speakers")}
          pos={data.sectionLayout?.speakers?.pos ?? SECTION_DEFAULTS.speakers.pos}
          scale={data.sectionLayout?.speakers?.scale ?? SECTION_DEFAULTS.speakers.scale}
          boxSize={data.sectionLayout?.speakers?.boxSize ?? SECTION_DEFAULTS.speakers.boxSize}
          onMove={(p) => onSectionMove?.("speakers", p)}
          onResize={(s) => onSectionResize?.("speakers", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("speakers", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute flex flex-col gap-3"
          style={{ left: 0, top: 0, width: `${(() => {
            // Per user spec 2026-07-09 (item C): auto-compute columns from
            // visible speaker count when not explicitly set. The width
            // here is a fallback — when `sectionLayout.speakers.boxSize.width`
            // is set (default in event-mapper / sample-data), it overrides
            // this inline width. We still compute a sensible width for
            // the case where the user has cleared boxSize.
            //
            // Column width ~280px + 12px gap. Capped to ~96% of canvas (1152px).
            const visibleCount = data.speakers.filter(s => s.visible !== false).length;
            const autoCols = Math.min(6, Math.max(1, Math.ceil(visibleCount / 4)));
            const cols = data.speakersLayout?.columns ?? autoCols;
            return Math.min(1152, 280 * cols + 12 * (cols - 1));
          })()}px`, zIndex: sectionZFor("speakers") }}
          accentColor="#FF005A"
          label="Speakers"
          guideId="speakers"
        >
          {/* PER USER SPEC 2026-07-31 (TSK-0033): The speakersLabel row is
              a flex container with a gradient line + "Speakers" span.
              Previously, `textAlign` was set on the span itself, which had
              no visible effect — spans in a flex row shrink-to-fit content,
              so text-align can't push them left/center/right. The fix is
              to restructure the row based on `speakersLabel.align`:
                - "left"   / undefined (default): label on LEFT, gradient line on RIGHT
                - "center": gradient line on BOTH sides, label in the MIDDLE
                - "right":  gradient line on LEFT,  label on RIGHT
              PER USER SPEC 2026-07-31 (TSK-0036): default align changed
              from "right" to "left" — undefined now means label-left /
              line-right (was line-left / label-right). Default font size
              also changed from 12 to 16, color stays black (text-black
              Tailwind class applies when speakersLabel.color is unset).
              This way clicking the ⟵ L / ↔ C / ⟶ R buttons in the form
              view produces a visible change on the canvas. */}
          {(() => {
            const labelAlign = data.textStyles?.speakersLabel?.align;
            const showLineBefore = labelAlign === "right";
            const showLineAfter = !labelAlign || labelAlign === "left" || labelAlign === "center";
            const lineEl = (
              <div
                className="h-px flex-1"
                style={{
                  background: `linear-gradient(90deg, ${data.event.brandColors[1]}, transparent)`,
                }}
              />
            );
            return (
              <div className="flex items-center gap-2 mb-1">
                {showLineBefore && lineEl}
                <span
                  className="font-bold text-black uppercase tracking-widest"
                  style={{
                    fontSize: `${data.textStyles?.speakersLabel?.fontSize ?? 16}px`,
                    letterSpacing: "0.2em",
                    color: data.textStyles?.speakersLabel?.color,
                    textAlign: data.textStyles?.speakersLabel?.align,
                  }}
                >
                  Speakers
                </span>
                {showLineAfter && lineEl}
              </div>
            );
          })()}
          {(() => {
            // Sorted + filtered speakers (paired with their sort index).
            const sortedSpeakers = [...data.speakers]
              .sort((a, b) => a.order - b.order)
              .map((speaker, idx) => ({ speaker, idx }))
              .filter(({ speaker }) => speaker.visible !== false);

            const layout = data.speakersLayout ?? {};
            // Per user spec 2026-07-09 (item C): auto-compute columns from
            // visible speaker count when not explicitly set:
            //   1-4 speakers → 1 col, 5-8 → 2 cols, 9-12 → 3 cols, ...
            // Explicit `columns` in the JSON or form dropdown overrides this.
            const autoColumns = Math.min(
              6,
              Math.max(1, Math.ceil(sortedSpeakers.length / 4)),
            ) as 1 | 2 | 3 | 4 | 5 | 6;
            const columns = layout.columns ?? autoColumns;
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
                        textStyles={data.textStyles}
                        showSessionTime={data.speakersLayout?.showSessionTime !== false}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </SectionBox>

        {/* ===== 8. SPONSORS (bottom-right) =====
            PER USER SPEC 2026-07-31 (TSK-0030): Default sponsors Properties
            to X=37.9%, Y=85.5%, W=auto, H=auto, Scale=100%, z-index=1.
            PER USER SPEC 2026-07-31 (TSK-0030): Style 1/3 sponsors MUST
            NOT be linked to Style 2's footer — Style 2's footer now uses
            a separate section id "style2-footer" (see speaker-intro-style2-
            canvas.tsx). The "sponsors" key in sectionLayout is exclusively
            owned by Style 1/3's sponsors list.
            Anchor switched from top-right (right/bottom) to top-left
            (left/top) so the X/Y % match the Properties form. The default
            pos applies when the user has not dragged the section yet;
            once dragged, data.sectionLayout.sponsors.pos wins. */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "sponsors"}
          onSelect={() => setSelectedId("sponsors")}
          pos={data.sectionLayout?.sponsors?.pos ?? SECTION_DEFAULTS.sponsors.pos}
          scale={data.sectionLayout?.sponsors?.scale ?? SECTION_DEFAULTS.sponsors.scale}
          boxSize={data.sectionLayout?.sponsors?.boxSize}
          onMove={(p) => onSectionMove?.("sponsors", p)}
          onResize={(s) => onSectionResize?.("sponsors", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("sponsors", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute flex flex-col items-end gap-2"
          style={{ left: 0, top: 0, zIndex: sectionZFor("sponsors") }}
          accentColor="#FF005A"
          label="Sponsored by"
          guideId="sponsors"
        >
          {data.collaborators.length > 0 && (
            <div className="flex flex-col items-end gap-1.5">
              <span
                className="text-black/80 font-semibold uppercase tracking-wider"
                style={{
                  fontSize: `${data.textStyles?.collaboratorsLabel?.fontSize ?? 10}px`,
                  letterSpacing: "0.18em",
                  color: data.textStyles?.collaboratorsLabel?.color,
                  textAlign: data.textStyles?.collaboratorsLabel?.align,
                }}
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
                className="text-black/80 font-semibold uppercase tracking-wider"
                style={{
                  fontSize: `${data.textStyles?.sponsorsLabel?.fontSize ?? 10}px`,
                  letterSpacing: "0.18em",
                  color: data.textStyles?.sponsorsLabel?.color,
                  textAlign: data.textStyles?.sponsorsLabel?.align,
                }}
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

        {/* ===== 9. BRANDING (bottom-right corner) =====
            REMOVED per user spec 2026-07-02: "On the speaker intro mockup
            erase this: ...data-guide-id='branding'...". The bottom-LEFT
            branding asset (DraggablePhotoContainer below) remains as the
            only branding element on this mockup. */}

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
            style={{
              left: "48px",
              bottom: "32px",
              fontSize: `${data.textStyles?.footerCredit?.fontSize ?? 11}px`,
              zIndex: sectionZFor("footer"),
            }}
            accentColor="#FF005A"
            label="Footer"
            guideId="footer"
          >
            <span
              className="text-black/80"
              style={{
                color: data.textStyles?.footerCredit?.color,
                textAlign: data.textStyles?.footerCredit?.align,
                display: "block",
              }}
            >
              {data.footerCredit}
            </span>
          </SectionBox>
        )}

        {/* ===== BRANDING ASSET (bottom-LEFT corner by default, replaceable + draggable) =====
            Per user spec 2026-07-02: "On all mockups, the bottom left
            branding asset should be this as default, ...1782505047256-bpy1ln.png
            and replaceable". Renders the AI Salon brand image at the
            bottom-left corner, draggable to anywhere on the canvas.

            Placed AFTER the existing BRANDING (bottom-right) SectionBox so
            it renders on top. z=52 = above text sections (50) but below
            the ObjectPropertiesPanel. */}
        {(() => {
          const height = data.brandingAsset?.height ?? 48;
          const pos = data.brandingAsset?.pos;
          // Per user spec 2026-07-09 (item H): default bottom-left corner
          // position is X=3.1021447721179625%, Y=87.5656836461126%.
          const leftPct = pos ? pos.x : 3.1021447721179625;
          const topPct = pos ? pos.y : 87.5656836461126;
          return (
            <DraggablePhotoContainer
              leftPct={leftPct}
              topPct={topPct}
              widthPct={(height * 2) / 12}  // approx aspect-ratio based width
              heightPct={(height / 8)}       // height as % of 800px canvas
              zIndex={TEXT_Z + 2}
              rotation={0}
              editable={editable}
              previewScale={previewScale}
              onPosChange={onBrandingAssetPosChange}
              moveLabel="⠿ Move branding"
            >
              <EditableImage
                slot={{ kind: "branding-asset" }}
                src={
                  data.brandingAsset?.imageUrl ||
                  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785506059156-4chc96.png"
                }
                alt="Brand mark"
                placement={undefined}
                editable={editable}
                previewScale={previewScale}
                onPickImage={onPickImage}
                onPlacementChange={onPlacementChange}
                onSizeChange={onSizeChange}
                sizeMultiplier={(data.brandingAsset?.height ?? 48) / 48}
                sizeLabel="branding"
                containerClass="absolute inset-0"
                objectFit="contain"
              />
            </DraggablePhotoContainer>
          );
        })()}

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
        {/* PER USER SPEC 2026-07-31 (TSK-0032): when "hero-image" is
            selected, render a special Hero Image Properties panel that
            binds Position to data.heroOverlay.pos, Size W/H to
            data.heroOverlay.boxSize, and Scale % to data.heroOverlay.imageScale.
            For any other selected id, fall back to the standard section
            ObjectPropertiesPanel bound to data.sectionLayout[id]. */}
        {sectionsEditable && selectedId && selectedId === "hero-image" && (
          <ObjectPropertiesPanel
            label="Hero Image"
            pos={data.heroOverlay.pos ?? SECTION_DEFAULTS["hero-image"].pos}
            onPosChange={(p) => onHeroPosChange?.(p)}
            z={heroZ}
            onZChange={(z) => onHeroZChange?.(z)}
            peers={sectionPeerZs}
            onDeselect={() => setSelectedId(null)}
            showBoxSize
            boxSize={data.heroOverlay.boxSize}
            onBoxSizeChange={(sz) => onHeroBoxResize?.(sz)}
            scale={data.heroOverlay.imageScale ?? SECTION_DEFAULTS["hero-image"].scale ?? 1}
            onScaleChange={(s) => onHeroScaleXChange?.(s)}
            onSetAsDefault={onSetAsDefault}
          />
        )}
        {sectionsEditable && selectedId && selectedId !== "hero-image" && (
          <ObjectPropertiesPanel
            label={selectedId}
            pos={data.sectionLayout?.[selectedId]?.pos ?? SECTION_DEFAULTS[selectedId]?.pos}
            onPosChange={(p) => onSectionMove?.(selectedId, p)}
            z={sectionZFor(selectedId)}
            onZChange={(z) => onSectionZChange?.(selectedId, z)}
            peers={sectionPeerZs}
            onDeselect={() => setSelectedId(null)}
            showBoxSize
            boxSize={data.sectionLayout?.[selectedId]?.boxSize ?? SECTION_DEFAULTS[selectedId]?.boxSize}
            onBoxSizeChange={(sz) => onSectionBoxResize?.(selectedId, sz)}
            scale={data.sectionLayout?.[selectedId]?.scale ?? SECTION_DEFAULTS[selectedId]?.scale ?? 1}
            onScaleChange={(s) => onSectionResize?.(selectedId, s)}
            onSetAsDefault={onSetAsDefault}
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
export function EditableImage({
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
  minZoom = 0.01,
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
  /** PER USER SPEC 2026-08-02 (TSK-0043): minimum zoom floor for rendering
   *  AND the wheel handler. Default 0.01 preserves Style 1's behavior
   *  (zoom < 1 shrinks the image, showing empty space inside the container).
   *  Style 2 sets minZoom=1 so the image ALWAYS fills the container —
   *  scrolling down below 1× does nothing visually (no shrinking, no empty
   *  space), matching the deployed version's behavior. */
  minZoom?: number;
}) {
  const { focusX, focusY, zoom } = resolvePlacement(placement);
  // PER USER SPEC 2026-08-02 (TSK-0043): clamp the rendered zoom to
  // minZoom so the image never shrinks below this floor. With minZoom=1
  // (Style 2), the image always fills the container (object-fit: cover +
  // scale >= 1.005). The raw `zoom` from placement may still be < 1 (from
  // a previous session), but effectiveZoom clamps it for rendering, wheel
  // computation, and the on-screen readout so they all stay consistent.
  const effectiveZoom = Math.max(minZoom, zoom);
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
        // PER USER SPEC 2026-08-02 (TSK-0043): persist effectiveZoom (not
        // raw zoom) so panning doesn't accidentally save a sub-minZoom
        // value that would render as clamped on next load.
        zoom: effectiveZoom,
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
    // PER USER SPEC 2026-08-02 (TSK-0043): use effectiveZoom (clamped to
    // minZoom) as the base so scrolling down below minZoom does nothing
    // (no shrinking below the floor). Scrolling up still zooms in normally.
    const nextZoom = Math.max(minZoom, effectiveZoom + step);
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
          //
          // PER USER SPEC 2026-08-02 (TSK-0043): use effectiveZoom
          // (clamped to minZoom) so the image never shrinks below the
          // floor. With minZoom=1 (Style 2), scale is always >= 1.005,
          // so the image always fills the container — no empty space.
          transform: `scale(${effectiveZoom * 1.005})`,
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
          {Math.round(focusX)}/{Math.round(focusY)} · {effectiveZoom.toFixed(1)}×
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
  if (slot.kind === "branding-asset") return "branding-asset";
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
  textStyles,
  showSessionTime = true,
}: {
  speaker: Speaker;
  accentColor: string;
  editable?: boolean;
  slot: ImageSlot;
  previewScale: number;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, p: ImagePlacement) => void;
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  /** Per-section text style overrides (speakerName / speakerTitle /
   *  speakerBio / speakerSessionTime / speakerRole keys). Passed down
   *  from the parent canvas so all speaker cards share one visual
   *  treatment. */
  textStyles?: SpeakerIntroData["textStyles"];
  /** PER USER SPEC 2026-07-31 (TSK-0033): global toggle for the
   *  session-time pill on speaker cards. When `false`, the pill is
   *  hidden regardless of `speaker.sessionTime`. Default `true`. */
  showSessionTime?: boolean;
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
        {/* PER USER SPEC 2026-07-31 (TSK-0033): The name row is a flex
            container holding sessionTime + name + role spans. Previously,
            `textAlign` was set on each span individually, which had NO
            visible effect — spans in a flex row shrink-to-fit content, so
            text-align can't push them left/center/right. The fix is to
            apply `justifyContent` to the row based on speakerName.align
            (name is the primary element; sessionTime + role are pills
            that ride along). We also still set textAlign on each span
            for data-flow consistency, but the visible alignment comes
            from justifyContent below. */}
        <div
          className="flex items-center gap-2 flex-wrap"
          style={{
            justifyContent:
              textStyles?.speakerName?.align === "center"
                ? "center"
                : textStyles?.speakerName?.align === "right"
                ? "flex-end"
                : "flex-start",
          }}
        >
          {speaker.sessionTime && showSessionTime && (
            <span
              className="inline-block rounded-full px-1.5 py-0.5 text-white font-bold tracking-wider"
              style={{
                fontSize: `${textStyles?.speakerSessionTime?.fontSize ?? 9}px`,
                letterSpacing: "0.08em",
                background: "#004F98",
                color: textStyles?.speakerSessionTime?.color,
                textAlign: textStyles?.speakerSessionTime?.align,
              }}
            >
              {speaker.sessionTime}
            </span>
          )}
          <span
            className="font-bold text-black leading-tight"
            style={{
              fontSize: `${textStyles?.speakerName?.fontSize ?? 16}px`,
              color: textStyles?.speakerName?.color,
              textAlign: textStyles?.speakerName?.align,
            }}
          >
            {speaker.fullName}
          </span>
          {speaker.role === "Moderator" && (
            <span
              className="inline-block rounded-full px-1.5 py-0.5 text-white font-bold uppercase tracking-wider"
              style={{
                fontSize: `${textStyles?.speakerRole?.fontSize ?? 9}px`,
                letterSpacing: "0.1em",
                background: accentColor,
                color: textStyles?.speakerRole?.color,
                textAlign: textStyles?.speakerRole?.align,
              }}
            >
              {speaker.role}
            </span>
          )}
          {speaker.role === "Panelist" && (
            <span
              className="inline-block rounded-full px-1.5 py-0.5 text-white font-bold uppercase tracking-wider"
              style={{
                fontSize: `${textStyles?.speakerRole?.fontSize ?? 9}px`,
                letterSpacing: "0.1em",
                background: "#004F98",
                color: textStyles?.speakerRole?.color,
                textAlign: textStyles?.speakerRole?.align,
              }}
            >
              {speaker.role}
            </span>
          )}
        </div>
        <p
          className="text-black/70 leading-snug mt-0.5"
          style={{
            fontSize: `${textStyles?.speakerTitle?.fontSize ?? 12}px`,
            color: textStyles?.speakerTitle?.color,
            textAlign: textStyles?.speakerTitle?.align,
            // PER USER SPEC 2026-07-31 (TSK-0033): explicit width:100% so
            // textAlign left/center/right produces a visible change. Block
            // `<p>` already defaults to width:auto (fill parent), but
            // setting it explicitly avoids any edge case where the parent
            // flex item shrinks below content width.
            width: "100%",
          }}
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
            style={{
              fontSize: `${textStyles?.speakerBio?.fontSize ?? 11}px`,
              color: textStyles?.speakerBio?.color,
              textAlign: textStyles?.speakerBio?.align,
              // PER USER SPEC 2026-07-31 (TSK-0033): explicit width:100%
              // (see comment on title <p> above).
              width: "100%",
            }}
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
        className="rounded border border-black/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-black/80 hover:bg-black/5"
      >
        Reset
      </button>
    </div>
  );
}

/**
 * DraggablePhotoContainer — wraps the bottom-LEFT branding asset (or any
 * small image container that needs free-form positioning) and lets the
 * user drag the entire container anywhere on the canvas.
 *
 * Mirrors the same component in meet-the-speaker-canvas.tsx. The drag
 * handle is a small grip bar at the top-center of the container so it
 * doesn't conflict with the inner image's pan (which is triggered by
 * dragging the image itself).
 *
 * Per user spec 2026-07-02: "On all mockups, the bottom left branding
 * asset should be this as default, ...1782505047256-bpy1ln.png and
 * replaceable" + "Should be able to drag the [image] all around the
 * canvas without limitation".
 */
export function DraggablePhotoContainer({
  leftPct,
  topPct,
  widthPct,
  heightPct,
  zIndex,
  rotation,
  editable,
  previewScale,
  onPosChange,
  moveLabel = "⠿ Move",
  children,
}: {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  zIndex: number;
  rotation: number;
  editable?: boolean;
  previewScale: number;
  onPosChange?: (pos: { x: number; y: number }) => void;
  moveLabel?: string;
  children: React.ReactNode;
}) {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startLeftPct: number;
    startTopPct: number;
  } | null>(null);

  function handleGripMouseDown(e: React.MouseEvent) {
    if (!editable || !onPosChange) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeftPct: leftPct,
      startTopPct: topPct,
    };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      // Convert screen px → % of canvas. Canvas is CANVAS_W × CANVAS_H
      // at preview scale, so 1% = (CANVAS_W * previewScale) / 100 px
      // horizontally and (CANVAS_H * previewScale) / 100 vertically.
      const pctX = (dx / (CANVAS_W * previewScale)) * 100;
      const pctY = (dy / (CANVAS_H * previewScale)) * 100;
      // No clamp — user spec: "drag all around the canvas without
      // limitation". The canvas border (overflow-hidden) clips the
      // bleed naturally.
      onPosChange({ x: d.startLeftPct + pctX, y: d.startTopPct + pctY });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className="absolute"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        zIndex,
        ...(rotation ? { transform: `rotate(${rotation}deg)` } : {}),
        transformOrigin: "center center",
      }}
    >
      {children}
      {/* Drag handle — only shown in edit mode. A small grip bar at the
          top-center of the container. Dragging it moves the container. */}
      {editable && onPosChange && (
        <div
          onMouseDown={handleGripMouseDown}
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-1 rounded bg-[#0066FF] text-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-md cursor-move hover:bg-[#0052CC] opacity-100 transition"
          style={{ pointerEvents: "auto" }}
          title="Drag to move the container — can be placed anywhere on the canvas"
        >
          {moveLabel}
        </div>
      )}
    </div>
  );
}
