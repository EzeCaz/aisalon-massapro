"use client";

import { forwardRef, useRef, useState, useEffect } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import type {
  MeetTheSpeakerData,
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
 * MeetTheSpeakerCanvas — the data-driven mockup renderer.
 *
 * Canvas size: 1200×800 (3:2). Same export-quality approach as the
 * Speaker Intro canvas.
 *
 * Layout (matches the analyzed reference):
 *   - LEFT COLUMN (0–50% width): "Meet the speaker" header (pink) →
 *     speaker name (XL bold) → title → company → "Topic:" + topic →
 *     topic description → bio paragraph → expertise paragraph.
 *   - RIGHT COLUMN (50–100% width): Large speaker portrait with
 *     gradient triangle overlay behind it. Meerkat graphic in the
 *     bottom-right corner. QR code top-right. Event logo top-right.
 *   - BOTTOM-RIGHT: Event title → date+time → venue.
 *   - BRANDING: "ai salon" wordmark bottom-right corner.
 *
 * Editable mode (editable=true): speaker photo, graphic, and sponsor
 * logos become interactive (drag to pan, wheel to zoom, click to
 * replace).
 *
 * Sections-editable mode (sectionsEditable=true): text sections
 * (header, speaker-info, topic, bio, event-meta, sponsors, branding,
 * qr, footer) become draggable + 8-handle resizeable. Layout persists
 * in data.sectionLayout. Text always renders at zIndex >= 50.
 */

const CANVAS_W = 1200;
const CANVAS_H = 800;

type Props = {
  data: MeetTheSpeakerData;
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
  /** Called when any layer z-index changes (hero / photo / graphic). */
  onLayerZChange?: (layer: "hero" | "photo" | "graphic", z: number) => void;
  /** Called when the hero overlay X scale changes (slider). */
  onHeroScaleXChange?: (n: number) => void;
  /** Called when the hero overlay Y scale changes (slider). */
  onHeroScaleYChange?: (n: number) => void;
  /** Called when a section's z-index changes (Front/Back in ObjectPropertiesPanel). */
  onSectionZChange?: (id: SectionId, z: number) => void;
  /** Called when the speaker photo container is dragged to a new
   *  free-form position (user spec 2026-07-02: "drag the Photo URL
   *  image all around the canvas without limitation"). The pos is in
   *  % of canvas (0–100 for x and y). */
  onPhotoPosChange?: (pos: { x: number; y: number }) => void;
  /** Called when a Local Street pin (Style 2) is dragged to a new
   *  position on the canvas. The pos is in % of canvas (0–100). */
  onLocalStreetPinMove?: (index: number, pos: { x: number; y: number }) => void;
  /** Called when the Style 2 hero image container is dragged to a new
   *  free-form position (user spec 2026-07-02). */
  onHeroStyle2PosChange?: (pos: { x: number; y: number }) => void;
  /** Called when the brand graphic (meerkat) container is dragged to a
   *  new free-form position (user spec 2026-07-02: "Graphic (z=8) should
   *  be able to drag with my mousse all over the canvas without
   *  limitation"). */
  onGraphicPosChange?: (pos: { x: number; y: number }) => void;
  /** Called when the bottom-left branding asset is dragged. */
  onBrandingAssetPosChange?: (pos: { x: number; y: number }) => void;
  previewScale?: number;
};

export const MeetTheSpeakerCanvas = forwardRef<HTMLDivElement, Props>(
  function MeetTheSpeakerCanvas(
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
      onLayerZChange,
      onHeroScaleXChange,
      onHeroScaleYChange,
      onSectionZChange,
      onPhotoPosChange,
      onLocalStreetPinMove,
      onHeroStyle2PosChange,
      onGraphicPosChange,
      onBrandingAssetPosChange,
      previewScale = 1,
    },
    ref,
  ) {
    // Layer z-indices (defaults match the original hard-coded order).
    const heroZ = data.heroZ ?? 1;
    const photoZ = data.photoZ ?? 3;
    const graphicZ = data.graphicZ ?? 8;
    // Text sections always render at zIndex >= 50 so they stay above
    // images and overlays.
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
        {/* ===== RIGHT COLUMN BACKGROUND (hero overlay) =====
            Style 1 (default): Geometric gradient triangles via SVG.
              Applies X/Y scale multipliers from the HeroOverlayControl
              sliders. Default = 55% canvas width × 85% canvas height.
            Style 2: Pre-designed low-poly network graph image
              (heroStyle2Url) fills the right column, with 4 editable
              "Local Street" pin labels overlaid at the corners. The
              image's built-in "Placeholder 1–4" labels are visually
              covered by the editable pins (positioned to match).

              Per user spec 2026-07-02, Style 2 hero image is:
                B. Replaceable via a "Replace" button overlay (edit mode)
                C. Layer z-index + rotate (controlled from the form view)
                D. Draggable all around the canvas (free position)
                E. Resize corners + mouse wheel zoom (edit mode)
              Local Street pins are also draggable on the canvas (spec A). */}
        {data.heroStyle === 2 ? (
          <>
            <DraggableHeroStyle2Image
              data={data}
              heroZ={heroZ}
              editable={editable}
              previewScale={previewScale}
              onPickImage={onPickImage}
              onPlacementChange={onPlacementChange}
              onSizeChange={onSizeChange}
              onHeroStyle2PosChange={onHeroStyle2PosChange}
            />
            {/* "Local Street" pins — editable labels overlaid at the
                four corners of the hero image. Each pin is positioned
                via % of canvas (0–100) so it scales with the canvas.

                Per user spec 2026-07-02 (spec A): pins are draggable
                on the canvas (not just editable via X/Y inputs in the
                form view). Dragging the pin dot updates its (x, y). */}
            {(data.localStreetPins ?? []).map((pin, i) => (
              <DraggableLocalStreetPin
                key={`local-street-${i}`}
                pin={pin}
                index={i}
                brandColor={data.event.brandColors[0] || "#FF005C"}
                zIndex={heroZ + 1}
                editable={editable}
                previewScale={previewScale}
                onMove={onLocalStreetPinMove}
              />
            ))}
          </>
        ) : (
          (() => {
            const sx = Math.max(0.01, data.heroOverlay.imageScale ?? 1);
            const sy = Math.max(0.01, data.heroOverlay.imageScaleY ?? 1);
            const heroRot = data.heroOverlay.rotation ?? 0;
            return (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${45 - (sx - 1) * 22.5}%`,
            top: "0",
            width: `${55 * sx}%`,
            height: `${85 * sy}%`,
            zIndex: heroZ,
            ...(heroRot ? { transform: `rotate(${heroRot}deg)` } : {}),
            transformOrigin: "center center",
          }}
          aria-hidden
        >
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="mts-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                {data.heroOverlay.gradientColors.map((color, i, arr) => (
                  <stop
                    key={i}
                    offset={`${(i / Math.max(1, arr.length - 1)) * 100}%`}
                    stopColor={color}
                    stopOpacity={data.heroOverlay.gradientOpacity}
                  />
                ))}
              </linearGradient>
              <linearGradient id="mts-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
                {data.heroOverlay.gradientColors.map((color, i, arr) => (
                  <stop
                    key={i}
                    offset={`${(i / Math.max(1, arr.length - 1)) * 100}%`}
                    stopColor={color}
                    stopOpacity={data.heroOverlay.gradientOpacity * 0.6}
                  />
                ))}
              </linearGradient>
            </defs>
            {/* Large left-pointing triangle in the bottom-right */}
            <polygon points="100,0 100,100 30,100" fill="url(#mts-grad)" />
            {/* Smaller counter-triangle for geometric depth */}
            <polygon points="60,10 95,30 70,70" fill="url(#mts-grad-2)" opacity={0.7} />
          </svg>
        </div>
            );
          })()
        )}

        {/* ===== SPEAKER PHOTO (right side, large) =====
            Per user spec 2026-07-02: "Should be able to drag the Photo
            URL image all around the canvas without limitation". The
            photo container can be freely positioned via `photoPos`. A
            drag handle (top-center grip) lets the user move the
            container without conflicting with the inner-image pan
            (which is triggered by dragging the image itself). */}
        {(() => {
          // photoSize: 1 = 45% canvas width × 60% height (default).
          // Anchored to top-right, grows downward + leftward.
          const sizeMult = Math.max(0.01, data.speaker.photoSize ?? 1);
          const widthPct = 45 * sizeMult;
          const heightPct = 60 * sizeMult;
          // If photoPos is set, use it (free drag position). Otherwise
          // anchor top-right at 95% (5% margin from right); left shifts
          // as width grows.
          const photoPos = data.speaker.photoPos;
          const leftPct = photoPos ? photoPos.x : Math.max(35, 95 - widthPct);
          const topPct = photoPos ? photoPos.y : 5;
          const photoRot = data.speaker.photoRotation ?? 0;
          return (
            <DraggablePhotoContainer
              leftPct={leftPct}
              topPct={topPct}
              widthPct={widthPct}
              heightPct={heightPct}
              zIndex={photoZ}
              rotation={photoRot}
              editable={editable}
              previewScale={previewScale}
              onPosChange={onPhotoPosChange}
            >
              <EditableImage
                slot={{ kind: "speaker-photo" }}
                src={data.speaker.photoUrl}
                alt={data.speaker.fullName}
                placement={data.speaker.photoPlacement}
                editable={editable}
                previewScale={previewScale}
                onPickImage={onPickImage}
                onPlacementChange={onPlacementChange}
                onSizeChange={onSizeChange}
                sizeMultiplier={data.speaker.photoSize ?? 1}
                sizeLabel="photo"
                containerClass="absolute inset-0 rounded-lg overflow-hidden shadow-2xl"
                objectFit="cover"
              />
            </DraggablePhotoContainer>
          );
        })()}

        {/* ===== MEERKAT GRAPHIC (bottom-right corner by default, freely draggable) =====
            Per user spec 2026-07-02: "Graphic (z=8) should be able to drag
            with my mousse all over the canvas without limitation". The
            graphic container can be freely positioned via `graphic.pos`. */}
        {(() => {
          const sizeMult = Math.max(0.01, data.graphic.imageScale ?? 1);
          const widthPct = 18 * sizeMult;
          const heightPct = 30 * sizeMult;
          // Default anchor: bottom-right with 2% margin.
          const graphicPos = data.graphic.pos;
          const leftPct = graphicPos ? graphicPos.x : Math.max(40, 98 - widthPct);
          const topPct = graphicPos ? graphicPos.y : Math.max(20, 98 - heightPct);
          const graphicRot = data.graphic.rotation ?? 0;
          return (
            <DraggablePhotoContainer
              leftPct={leftPct}
              topPct={topPct}
              widthPct={widthPct}
              heightPct={heightPct}
              zIndex={graphicZ}
              rotation={graphicRot}
              editable={editable}
              previewScale={previewScale}
              onPosChange={onGraphicPosChange}
              moveLabel="⠿ Move graphic"
            >
              <EditableImage
                slot={{ kind: "graphic" }}
                src={data.graphic.imageUrl}
                alt="Brand graphic"
                placement={data.graphic.imagePlacement}
                editable={editable}
                previewScale={previewScale}
                onPickImage={onPickImage}
                onPlacementChange={onPlacementChange}
                onSizeChange={onSizeChange}
                sizeMultiplier={data.graphic.imageScale ?? 1}
                sizeLabel="graphic"
                containerClass="absolute inset-0"
                objectFit="contain"
              />
            </DraggablePhotoContainer>
          );
        })()}

        {/* ===== BRANDING ASSET (bottom-LEFT corner by default, replaceable + draggable) =====
            Per user spec 2026-07-02: "On all mockups, the bottom left
            branding asset should be this as default, ...1782505047256-bpy1ln.png
            and replaceable". Renders the AI Salon brand image at the
            bottom-left corner, draggable to anywhere on the canvas. */}
        {(() => {
          const height = data.brandingAsset?.height ?? 48;
          const pos = data.brandingAsset?.pos;
          // Default: bottom-left corner with 32px margin = ~2.7% left, ~94% top.
          const leftPct = pos ? pos.x : 2.7;
          const topPct = pos ? pos.y : 94;
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
                  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png"
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

        {/* ===== LEFT COLUMN: TEXT CONTENT ===== */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "speaker-info"}
          onSelect={() => setSelectedId("speaker-info")}
          pos={data.sectionLayout?.["speaker-info"]?.pos}
          scale={data.sectionLayout?.["speaker-info"]?.scale ?? 1}
          boxSize={data.sectionLayout?.["speaker-info"]?.boxSize}
          onMove={(p) => onSectionMove?.("speaker-info", p)}
          onResize={(s) => onSectionResize?.("speaker-info", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("speaker-info", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute"
          style={{ left: "60px", top: "40px", width: "45%", zIndex: sectionZFor("speaker-info") }}
          accentColor="#FF005A"
          label="Speaker info"
          guideId="speaker-info"
        >
          {/* Header — per-section font size + color + align overrides
              (user spec 2026-07-02). */}
          <h2
            className="font-extrabold leading-none tracking-tight"
            style={{
              fontSize: `${data.textStyles?.header?.fontSize ?? 32}px`,
              color: data.textStyles?.header?.color ?? data.header.color,
              textAlign: data.textStyles?.header?.align ?? "left",
              textTransform: "lowercase",
            }}
          >
            {data.header.text}
          </h2>

          {/* Speaker name — per-section font size + color + align overrides
              (user spec 2026-07-02: "select the font size and color of
              each specific text section"). */}
          <h1
            className="mt-4 font-extrabold text-black leading-tight tracking-tight"
            style={{
              fontSize: `${data.textStyles?.fullName?.fontSize ?? 56}px`,
              color: data.textStyles?.fullName?.color ?? "#000000",
              textAlign: data.textStyles?.fullName?.align ?? "left",
            }}
          >
            {data.speaker.fullName}
          </h1>

          {/* Speaker title */}
          {data.speaker.title && (
            <p
              className="mt-2 text-black/80 font-semibold leading-snug"
              style={{
                fontSize: `${data.textStyles?.title?.fontSize ?? 18}px`,
                color: data.textStyles?.title?.color ?? "rgba(0,0,0,0.8)",
                textAlign: data.textStyles?.title?.align ?? "left",
              }}
            >
              {data.speaker.title}
            </p>
          )}

          {/* Speaker company */}
          {data.speaker.company && (
            <p
              className="mt-0.5 text-black/80 font-medium leading-snug"
              style={{
                fontSize: `${data.textStyles?.company?.fontSize ?? 16}px`,
                color: data.textStyles?.company?.color ?? "rgba(0,0,0,0.6)",
                textAlign: data.textStyles?.company?.align ?? "left",
              }}
            >
              {data.speaker.company}
            </p>
          )}

          {/* Speaker role — newly rendered on the canvas per user spec
              2026-07-02 ("Full name, Title, Company, Role, Topic, …"
              listed as editable text sections). Previously the role was
              in the data but not displayed. Now shown as a small pill
              below the company, with the brand color. */}
          {data.speaker.role && (
            <p
              className="mt-1 inline-block font-bold uppercase tracking-wider"
              style={{
                fontSize: `${data.textStyles?.role?.fontSize ?? 11}px`,
                color: data.textStyles?.role?.color ?? data.header.color,
                letterSpacing: "0.16em",
                textAlign: data.textStyles?.role?.align ?? "left",
              }}
            >
              {data.speaker.role}
            </p>
          )}

          {/* Topic */}
          {data.speaker.topic && (
            <div className="mt-5">
              <div className="flex items-baseline gap-2" style={{ justifyContent: data.textStyles?.topic?.align === "center" ? "center" : data.textStyles?.topic?.align === "right" ? "flex-end" : "flex-start" }}>
                <span
                  className="font-bold uppercase tracking-wider"
                  style={{
                    fontSize: "11px",
                    letterSpacing: "0.18em",
                    color: data.header.color,
                  }}
                >
                  Topic:
                </span>
                <span
                  className="font-bold leading-snug"
                  style={{
                    fontSize: `${data.textStyles?.topic?.fontSize ?? 20}px`,
                    color: data.textStyles?.topic?.color ?? "#000000",
                    textAlign: data.textStyles?.topic?.align ?? "left",
                  }}
                >
                  {data.speaker.topic}
                </span>
              </div>
              {data.speaker.topicDescription && (
                <p
                  className="mt-1 text-black/70 leading-snug"
                  style={{
                    fontSize: `${data.textStyles?.topicDescription?.fontSize ?? 15}px`,
                    color: data.textStyles?.topicDescription?.color ?? "rgba(0,0,0,0.7)",
                    textAlign: data.textStyles?.topicDescription?.align ?? "left",
                  }}
                >
                  {data.speaker.topicDescription}
                </p>
              )}
            </div>
          )}

          {/* Bio paragraph */}
          {data.speaker.bio && (
            <p
              className="mt-5 text-black/75 leading-relaxed"
              style={{
                fontSize: `${data.textStyles?.bio?.fontSize ?? 13}px`,
                color: data.textStyles?.bio?.color ?? "rgba(0,0,0,0.75)",
                textAlign: data.textStyles?.bio?.align ?? "left",
              }}
            >
              {data.speaker.bio}
            </p>
          )}

          {/* Expertise paragraph (optional) */}
          {data.speaker.expertise && (
            <p
              className="mt-3 text-black/65 leading-relaxed"
              style={{
                fontSize: `${data.textStyles?.expertise?.fontSize ?? 12}px`,
                color: data.textStyles?.expertise?.color ?? "rgba(0,0,0,0.65)",
                textAlign: data.textStyles?.expertise?.align ?? "left",
              }}
            >
              {data.speaker.expertise}
            </p>
          )}
        </SectionBox>

        {/* ===== QR CODE (top-right corner) ===== */}
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
          style={{ right: "32px", top: "40px", zIndex: sectionZFor("qr") }}
          anchor="top-right"
          accentColor="#FF005A"
          label="QR"
          guideId="qr"
        >
          <div
            className="rounded-md bg-white p-2 shadow-md"
            style={{ width: "80px", height: "80px" }}
          >
            <QrCode url={data.qrCodeUrl} size={64} />
          </div>
          <span
            className="text-black font-semibold uppercase tracking-wider"
            style={{ fontSize: "9px", letterSpacing: "0.15em" }}
          >
            Register here
          </span>
        </SectionBox>

        {/* ===== EVENT DETAILS (bottom-right, below speaker photo) ===== */}
        <SectionBox
          active={sectionsEditable}
          selected={selectedId === "event-meta"}
          onSelect={() => setSelectedId("event-meta")}
          pos={data.sectionLayout?.["event-meta"]?.pos}
          scale={data.sectionLayout?.["event-meta"]?.scale ?? 1}
          boxSize={data.sectionLayout?.["event-meta"]?.boxSize}
          onMove={(p) => onSectionMove?.("event-meta", p)}
          onResize={(s) => onSectionResize?.("event-meta", s)}
          onBoxResize={(sz) => onSectionBoxResize?.("event-meta", sz)}
          previewScale={previewScale}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
          className="absolute"
          style={{
            right: "32px",
            bottom: "100px",
            maxWidth: "45%",
            textAlign: "right",
            zIndex: sectionZFor("event-meta"),
          }}
          anchor="top-right"
          accentColor="#FF005A"
          label="Event details"
          guideId="event-meta"
        >
          <h3
            className="font-extrabold text-black leading-tight"
            style={{
              fontSize: `${data.textStyles?.eventName?.fontSize ?? 22}px`,
              color: data.textStyles?.eventName?.color ?? "#000000",
              textAlign: data.textStyles?.eventName?.align ?? "right",
            }}
          >
            {data.event.name}
          </h3>
          <p
            className="mt-1.5 text-black/70 font-semibold"
            style={{
              fontSize: `${data.textStyles?.eventDate?.fontSize ?? 14}px`,
              color: data.textStyles?.eventDate?.color ?? undefined,
              textAlign: data.textStyles?.eventDate?.align ?? "right",
            }}
          >
            <span style={{ color: data.textStyles?.eventDate?.color ?? undefined }}>
              {data.event.date}
            </span>
            {data.event.time && (
              <>
                <span className="mx-2 text-black/30">·</span>
                <span
                  style={{
                    fontSize: data.textStyles?.eventTime?.fontSize
                      ? `${data.textStyles.eventTime.fontSize}px`
                      : undefined,
                    color: data.textStyles?.eventTime?.color ?? undefined,
                  }}
                >
                  {data.event.time}
                </span>
              </>
            )}
          </p>
          <p
            className="mt-0.5 text-black/55"
            style={{
              fontSize: `${data.textStyles?.venue?.fontSize ?? 13}px`,
              color: data.textStyles?.venue?.color ?? undefined,
              textAlign: data.textStyles?.venue?.align ?? "right",
            }}
          >
            {data.event.venue}
          </p>
        </SectionBox>

        {/* ===== SPONSORS (bottom-left) ===== */}
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
          className="absolute flex flex-col items-start gap-2"
          style={{ left: "60px", bottom: "70px", zIndex: sectionZFor("sponsors") }}
          accentColor="#FF005A"
          label="Sponsored by"
          guideId="sponsors"
        >
          {data.collaborators.length > 0 && (
            <div className="flex flex-col items-start gap-1.5">
              <span
                className="text-black/80 font-semibold uppercase tracking-wider"
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
            <div className="flex flex-col items-start gap-1.5">
              <span
                className="text-black/80 font-semibold uppercase tracking-wider"
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

        {/* ===== BRANDING (bottom-right corner) =====
            REMOVED per user spec 2026-07-02: "On the meet the speaker mockup
            delete this section: ...ai salon...". The bottom-LEFT branding
            asset (DraggablePhotoContainer below) remains as the only branding
            element on this mockup. */}

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
              left: "60px",
              bottom: "24px",
              fontSize: `${data.textStyles?.footer?.fontSize ?? 10}px`,
              zIndex: sectionZFor("footer"),
            }}
            accentColor="#FF005A"
            label="Footer"
            guideId="footer"
          >
            <span
              style={{
                color: data.textStyles?.footer?.color ?? undefined,
                textAlign: data.textStyles?.footer?.align ?? undefined,
                display: "block",
              }}
            >
              {data.footerCredit}
            </span>
          </SectionBox>
        )}

        {/* ===== OBJECT PROPERTIES PANEL (Section 1) =====
            Floating panel (top-right of canvas) shown when a section is
            selected. Contains X/Y coordinate inputs + Front/Back layer
            toggles + box size W/H inputs. Layer (Hero/Photo/Graphic)
            Front/Back controls live in the Left Sidebar (form-view). */}
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
// Sub-components
// ---------------------------------------------------------------------------

/**
 * DraggablePhotoContainer — wraps the speaker photo (or any large image
 * container) and lets the user drag the entire container to a free-form
 * position on the canvas. The drag handle is a small grip bar at the
 * top-center of the container so it doesn't conflict with the inner
 * image's pan (which is triggered by dragging the image itself).
 *
 * Per user spec 2026-07-02: "Should be able to drag the Photo URL
 * image all around the canvas without limitation".
 */
function DraggablePhotoContainer({
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

/**
 * DraggableHeroStyle2Image — the Style 2 hero image (low-poly network
 * graph) wrapped in a draggable + resizeable + zoomable container.
 *
 * Per user spec 2026-07-02:
 *   B. The hero image should be able to replace when clicking on the
 *      edit image and then selecting the replace button over it
 *   D. Should be able to drag the image all around the canvas without
 *      any limitations
 *   E. Should be able to shrink or enlarge it using the corners, or
 *      the mouse scroll
 *
 * The container is positioned via `data.heroStyle2Pos` (free-form %).
 * The inner image uses `data.heroStyle2Placement` (focusX/focusY/zoom)
 * for pan/zoom, and `data.heroStyle2Scale` for the container's size
 * multiplier (corner drag).
 *
 * Layer z-index + rotation are controlled from the form view (the
 * existing Layer z-index section now applies to BOTH styles, not just
 * Style 1).
 */
function DraggableHeroStyle2Image({
  data,
  heroZ,
  editable,
  previewScale,
  onPickImage,
  onPlacementChange,
  onSizeChange,
  onHeroStyle2PosChange,
}: {
  data: MeetTheSpeakerData;
  heroZ: number;
  editable?: boolean;
  previewScale: number;
  onPickImage?: (slot: ImageSlot) => void;
  onPlacementChange?: (slot: ImageSlot, p: ImagePlacement) => void;
  onSizeChange?: (slot: ImageSlot, n: number) => void;
  onHeroStyle2PosChange?: (pos: { x: number; y: number }) => void;
}) {
  // Default: 55% canvas width × 85% canvas height, anchored at 45% left, 0% top.
  const sizeMult = Math.max(0.01, data.heroStyle2Scale ?? 1);
  const widthPct = 55 * sizeMult;
  const heightPct = 85 * sizeMult;
  const pos = data.heroStyle2Pos;
  const leftPct = pos ? pos.x : 45;
  const topPct = pos ? pos.y : 0;

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startLeftPct: number;
    startTopPct: number;
  } | null>(null);

  function handleGripMouseDown(e: React.MouseEvent) {
    if (!editable || !onHeroStyle2PosChange) return;
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
      const pctX = (dx / (CANVAS_W * previewScale)) * 100;
      const pctY = (dy / (CANVAS_H * previewScale)) * 100;
      onHeroStyle2PosChange({ x: d.startLeftPct + pctX, y: d.startTopPct + pctY });
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
      className="absolute group"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        zIndex: heroZ,
        cursor: editable ? "move" : "default",
        outline: editable ? "2px dashed rgba(0, 102, 255, 0.7)" : undefined,
        outlineOffset: editable ? "-2px" : undefined,
        ...(data.heroStyle2Rotation ? { transform: `rotate(${data.heroStyle2Rotation}deg)` } : {}),
        transformOrigin: "center center",
      }}
    >
      <EditableImage
        slot={{ kind: "hero-style2" }}
        src={data.heroStyle2Url || "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782940769382-r2twkn.png"}
        alt="Hero background"
        placement={data.heroStyle2Placement}
        editable={editable}
        previewScale={previewScale}
        onPickImage={onPickImage}
        onPlacementChange={onPlacementChange}
        onSizeChange={onSizeChange}
        sizeMultiplier={data.heroStyle2Scale ?? 1}
        sizeLabel="hero"
        containerClass="absolute inset-0 overflow-hidden"
        objectFit="cover"
      />
      {/* Drag handle bar — only in edit mode. Dragging it moves the
          whole hero image container anywhere on the canvas. */}
      {editable && onHeroStyle2PosChange && (
        <div
          onMouseDown={handleGripMouseDown}
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-1 rounded bg-[#0066FF] text-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-md cursor-move hover:bg-[#0052CC] opacity-100 transition"
          style={{ pointerEvents: "auto" }}
          title="Drag to move the hero image — it can be placed anywhere on the canvas"
        >
          ⠿ Move hero
        </div>
      )}
    </div>
  );
}

/**
 * DraggableLocalStreetPin — a single "Local Street" pin (dot + label)
 * overlaid on the Style 2 hero image. Per user spec 2026-07-02 (spec A):
 * pins should be draggable on the canvas (not just editable via X/Y
 * inputs in the form view). Dragging the pin dot updates its (x, y).
 *
 * The pin's (x, y) is stored as % of canvas (0–100). The drag converts
 * screen-px deltas to canvas-% using the preview scale.
 */
function DraggableLocalStreetPin({
  pin,
  index,
  brandColor,
  zIndex,
  editable,
  previewScale,
  onMove,
}: {
  pin: { x: number; y: number; label: string };
  index: number;
  brandColor: string;
  zIndex: number;
  editable?: boolean;
  previewScale: number;
  onMove?: (index: number, pos: { x: number; y: number }) => void;
}) {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPinX: number;
    startPinY: number;
  } | null>(null);

  function handleMouseDown(e: React.MouseEvent) {
    if (!editable || !onMove) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPinX: pin.x,
      startPinY: pin.y,
    };
    const onMove2 = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      const pctX = (dx / (CANVAS_W * previewScale)) * 100;
      const pctY = (dy / (CANVAS_H * previewScale)) * 100;
      // No clamp — let the pin move anywhere; canvas border clips naturally.
      onMove(index, { x: d.startPinX + pctX, y: d.startPinY + pctY });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove2);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove2);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`absolute flex flex-col items-center ${editable ? "pointer-events-auto cursor-move" : "pointer-events-none"}`}
      style={{
        left: `${pin.x}%`,
        top: `${pin.y}%`,
        transform: "translate(-50%, -50%)",
        zIndex,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Pin dot — small circle marker. */}
      <div
        className="rounded-full bg-white shadow-md border-2 flex items-center justify-center"
        style={{
          width: "28px",
          height: "28px",
          borderColor: brandColor,
          color: brandColor,
          fontSize: "13px",
          fontWeight: 800,
        }}
      >
        {index + 1}
      </div>
      {/* Pin label — user-editable text under the dot. */}
      <div
        className="mt-1 px-2 py-0.5 rounded bg-white/90 shadow-sm text-black"
        style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.02em" }}
      >
        {pin.label}
      </div>
      {editable && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-[#FF005A] text-white px-1.5 py-0.5 text-[8px] font-mono whitespace-nowrap opacity-100 pointer-events-none">
          drag to move
        </div>
      )}
    </div>
  );
}

/**
 * EditableImage — same pattern as the Speaker Intro canvas.
 * Wraps a next/image with placement (object-position + scale) and
 * (optionally) edit-mode interactions: click-to-replace, drag-to-pan,
 * wheel-to-zoom, double-click-to-reset.
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
  onSizeChange?: (slot: ImageSlot, newMultiplier: number) => void;
  sizeMultiplier?: number;
  sizeLabel?: string;
  containerClass: string;
  objectFit: "cover" | "contain";
}) {
  const { focusX, focusY, zoom } = resolvePlacement(placement);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startFocusX: number;
    startFocusY: number;
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
      const el = document.getElementById(`mts-img-${slotKey(slot)}`);
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
      id={`mts-img-${slotKey(slot)}`}
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
        sizes="600px"
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
  if (slot.kind === "speaker-photo") return "speaker-photo";
  if (slot.kind === "graphic") return "graphic";
  if (slot.kind === "hero-style2") return "hero-style2";
  if (slot.kind === "branding-asset") return "branding-asset";
  return `sponsor-${slot.group}-${slot.index}`;
}

/**
 * SponsorLogo — same as the Speaker Intro version, honors logoSize.
 */
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

/**
 * QrCode — same as the Speaker Intro version.
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
