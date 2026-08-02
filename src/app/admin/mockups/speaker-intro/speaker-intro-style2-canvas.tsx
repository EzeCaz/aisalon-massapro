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
 * Style 2 layout (per user spec 2026-07-30):
 *   - Hero image fills the ENTIRE canvas (background)
 *   - A configurable gradient SHAPE sits on top of the hero image
 *     (13 options: 8 2D shapes + 5 3D shapes), maintaining the gradient
 *     + color fill. Shape can be rotated 0–360°.
 *   - Text sections (header / topic / speakers / qr / sponsors) are
 *     overlaid on top of the hero+shape as draggable SectionBoxes.
 *   - Speaker section uses a NEW card-based design with a white panel
 *     background (panelBg) — gradient-line "SPEAKERS" header, 2-col grid,
 *     white rounded cards with shadow, 56×56 avatars with rgb(255,0,86)
 *     borders, "Moderator" badge.
 *   - Layer ordering is configurable via style2LayerZ (defaults:
 *     bg=1, hero=2, qr=3, speakers=4 — speakers always on top).
 *
 * Canvas size: 1200×800 (3:2), same as Style 1.
 */

const CANVAS_W = 1200;
const CANVAS_H = 800;

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

// ─── Default layer z-indices (style2LayerZ) ─────────────────────────
function layerZ(data: SpeakerIntroData, key: "background" | "hero" | "qr" | "speakers"): number {
  const z = data.style2LayerZ;
  const defaults = { background: 1, hero: 2, qr: 3, speakers: 4 };
  return z?.[key] ?? defaults[key];
}

function sectionZFor(data: SpeakerIntroData, id: SectionId): number {
  const explicit = data.sectionLayout?.[id]?.z;
  if (typeof explicit === "number") return explicit;
  return 50;
}

// ============================================================================
// GradientShape — renders the 13 supported shapes with gradient + rotation.
// ============================================================================
type GradientShapeProps = {
  shape: NonNullable<NonNullable<SpeakerIntroData["style2HeroGradient"]>["shape"]>;
  colors: string[];
  direction: number;
  opacity: number;
  rotation: number;
};

function GradientShape({ shape, colors, direction, opacity, rotation }: GradientShapeProps) {
  const gradientId = `style2-grad-${Math.random().toString(36).slice(2, 9)}`;
  const gradStops = colors.length > 0 ? colors : ["#ff0056", "#8f0080"];
  const dir = typeof direction === "number" ? direction : 135;
  const op = typeof opacity === "number" ? opacity : 0.85;
  const rot = typeof rotation === "number" ? rotation : 0;

  const rad = (dir * Math.PI) / 180;
  const x1 = 50 - Math.cos(rad) * 50;
  const y1 = 50 - Math.sin(rad) * 50;
  const x2 = 50 + Math.cos(rad) * 50;
  const y2 = 50 + Math.sin(rad) * 50;

  if (shape === "rectangle") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: op,
          background: `linear-gradient(${dir}deg, ${gradStops.join(", ")})`,
          transform: `rotate(${rot}deg)`,
          transformOrigin: "center center",
        }}
      />
    );
  }

  if (["circle", "oval", "triangle", "square", "pentagon", "hexagon", "octagon"].includes(shape)) {
    const size = shape === "square" || shape === "circle" ? 600 : 800;
    const clipPath = (() => {
      switch (shape) {
        case "circle":
        case "square":
          return "circle(50% at 50% 50%)";
        case "oval":
          return "ellipse(50% 35% at 50% 50%)";
        case "triangle":
          return "polygon(50% 0%, 100% 100%, 0% 100%)";
        case "pentagon":
          return "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)";
        case "hexagon":
          return "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
        case "octagon":
          return "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";
        default:
          return "none";
      }
    })();

    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: `${size}px`,
          height: `${size}px`,
          marginLeft: `-${size / 2}px`,
          marginTop: `-${size / 2}px`,
          opacity: op,
          background: `linear-gradient(${dir}deg, ${gradStops.join(", ")})`,
          clipPath,
          WebkitClipPath: clipPath,
          transform: `rotate(${rot}deg)`,
          transformOrigin: "center center",
        }}
      />
    );
  }

  // 3D shapes — SVG with gradient + shading overlay
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: "700px",
        height: "700px",
        marginLeft: "-350px",
        marginTop: "-350px",
        opacity: op,
        transform: `rotate(${rot}deg)`,
        transformOrigin: "center center",
      }}
    >
      <defs>
        <linearGradient id={gradientId} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}>
          {gradStops.map((c, i) => (
            <stop key={i} offset={`${(i / Math.max(1, gradStops.length - 1)) * 100}%`} stopColor={c} />
          ))}
        </linearGradient>
        <radialGradient id={`${gradientId}-shade`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
        </radialGradient>
      </defs>
      <g>
        {render3DShape(shape, gradientId, `${gradientId}-shade`)}
      </g>
    </svg>
  );
}

function render3DShape(shape: string, fillId: string, shadeId: string): ReactNode {
  switch (shape) {
    case "sphere":
      return (
        <>
          <circle cx="50" cy="50" r="45" fill={`url(#${fillId})`} />
          <circle cx="50" cy="50" r="45" fill={`url(#${shadeId})`} />
        </>
      );
    case "cube":
      return (
        <>
          <polygon points="50,8 88,28 50,48 12,28" fill={`url(#${fillId})`} opacity="0.95" />
          <polygon points="12,28 50,48 50,88 12,68" fill={`url(#${fillId})`} opacity="0.7" />
          <polygon points="88,28 50,48 50,88 88,68" fill={`url(#${fillId})`} opacity="0.85" />
          <polygon points="50,8 88,28 50,48 12,28 12,68 50,88 88,68 88,28" fill={`url(#${shadeId})`} opacity="0.4" />
        </>
      );
    case "cone":
      return (
        <>
          <polygon points="50,8 88,82 12,82" fill={`url(#${fillId})`} />
          <ellipse cx="50" cy="82" rx="38" ry="8" fill={`url(#${fillId})`} opacity="0.7" />
          <polygon points="50,8 88,82 12,82" fill={`url(#${shadeId})`} opacity="0.5" />
        </>
      );
    case "cylinder":
      return (
        <>
          <rect x="14" y="20" width="72" height="60" fill={`url(#${fillId})`} />
          <ellipse cx="50" cy="20" rx="36" ry="8" fill={`url(#${fillId})`} opacity="0.95" />
          <ellipse cx="50" cy="80" rx="36" ry="8" fill={`url(#${fillId})`} opacity="0.7" />
          <rect x="14" y="20" width="72" height="60" fill={`url(#${shadeId})`} opacity="0.5" />
        </>
      );
    case "pyramid":
      return (
        <>
          <polygon points="50,8 88,82 50,82" fill={`url(#${fillId})`} opacity="0.9" />
          <polygon points="50,8 12,82 50,82" fill={`url(#${fillId})`} opacity="0.7" />
          <polygon points="50,8 88,82 50,82 12,82" fill={`url(#${shadeId})`} opacity="0.5" />
        </>
      );
    default:
      return null;
  }
}

// ============================================================================
// SpeakerStyle2Card — the new card-based speaker design.
// ============================================================================
function SpeakerStyle2Card({ speaker }: { speaker: Speaker }) {
  const placement = resolvePlacement(speaker.photoPlacement);
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        padding: "12px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          border: "2px solid rgb(255, 0, 86)",
          overflow: "hidden",
          flexShrink: 0,
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
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "#0F172A",
              lineHeight: 1.2,
            }}
          >
            {speaker.fullName}
          </span>
          {speaker.role === "Moderator" && (
            <span
              style={{
                fontSize: "9px",
                fontWeight: 700,
                color: "#FFFFFF",
                background: "rgb(255, 0, 86)",
                padding: "2px 6px",
                borderRadius: "4px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Moderator
            </span>
          )}
        </div>
        <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>
          {[speaker.title, speaker.company].filter(Boolean).join(" · ")}
        </div>
        {speaker.bio ? (
          <div
            style={{
              fontSize: "11px",
              color: "#64748B",
              marginTop: "4px",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {speaker.bio}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================================
// Style2QrCode — local QR generator
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
    const heroGradient = data.style2HeroGradient ?? {};
    const shape = heroGradient.shape ?? "rectangle";
    const colors = heroGradient.colors ?? data.event.brandColors ?? ["#ff0056", "#8f0080"];
    const direction = heroGradient.direction ?? 135;
    const opacity = heroGradient.opacity ?? 0.85;
    const rotation = heroGradient.rotation ?? 0;

    const panelBg = data.speakersLayout?.panelBg ?? "#FFFFFF";
    const visibleSpeakers = data.speakers.filter((s) => s.visible !== false);

    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
      if (!sectionsEditable) setSelectedId(null);
    }, [sectionsEditable]);

    const sectionPeerZs: number[] = Object.keys(data.sectionLayout ?? {}).map((id) =>
      sectionZFor(data, id),
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
          {/* ===== Layer 1: Hero image (fills entire canvas) ===== */}
          <div className="absolute inset-0" style={{ zIndex: layerZ(data, "hero") }}>
            <Image
              src={data.heroOverlay.imageUrl}
              alt="Hero"
              fill
              style={{
                objectFit: "cover",
                objectPosition: `${resolvePlacement(data.heroOverlay.imagePlacement).focusX}% ${resolvePlacement(data.heroOverlay.imagePlacement).focusY}%`,
                transform: `scale(${resolvePlacement(data.heroOverlay.imagePlacement).zoom})`,
              }}
            />
          </div>

          {/* ===== Layer 2: Gradient shape (on top of hero) ===== */}
          <div className="absolute inset-0" style={{ zIndex: layerZ(data, "background") }}>
            <GradientShape
              shape={shape}
              colors={colors}
              direction={direction}
              opacity={opacity}
              rotation={rotation}
            />
          </div>

          {/* ===== Layer 3: Header (event name + date + venue) ===== */}
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
            onZChange={(z) => onSectionZChange?.("header", z)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={sectionZFor(data, "header")}
            anchor="top-left"
            guideId="header"
            label="Header"
            style={{ left: "1.7%", top: "0.5%", width: "100%" }}
          >
            <div style={{ padding: "16px 24px" }}>
              <div
                style={{
                  fontSize: "32px",
                  fontWeight: 800,
                  color: "#FFFFFF",
                  lineHeight: 1.1,
                  textShadow: "0 2px 8px rgba(0,0,0,0.4)",
                }}
              >
                {data.event.name}
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "#FFFFFF",
                  opacity: 0.9,
                  marginTop: "6px",
                  textShadow: "0 1px 4px rgba(0,0,0,0.4)",
                }}
              >
                {data.event.date} · {data.event.time}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#FFFFFF",
                  opacity: 0.85,
                  marginTop: "4px",
                  textShadow: "0 1px 4px rgba(0,0,0,0.4)",
                }}
              >
                {data.event.venue}
              </div>
            </div>
          </SectionBox>

          {/* ===== Layer 4: Topic ===== */}
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
            onZChange={(z) => onSectionZChange?.("topic", z)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={sectionZFor(data, "topic")}
            anchor="top-left"
            guideId="topic"
            label="Topic"
            style={{ left: "-12.4%", top: "20.9%", width: "951px" }}
          >
            <div style={{ display: "flex", alignItems: "stretch", gap: "12px", padding: "8px 0" }}>
              <div
                style={{
                  width: "4px",
                  background: "rgb(255, 0, 86)",
                  borderRadius: "2px",
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "#FFFFFF",
                  lineHeight: 1.3,
                  textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}
              >
                {data.event.topic}
              </div>
            </div>
          </SectionBox>

          {/* ===== Layer 5: Speakers (white panel + card grid) ===== */}
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
            onZChange={(z) => onSectionZChange?.("speakers", z)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={sectionZFor(data, "speakers")}
            anchor="top-left"
            guideId="speakers"
            label="Speakers"
            style={{ left: "-7.5%", top: "25.1%", width: "891px" }}
          >
            <div
              style={{
                background: panelBg,
                borderRadius: "16px",
                padding: "24px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "rgb(255, 0, 86)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Speakers
                </span>
                <div
                  style={{
                    flex: 1,
                    height: "2px",
                    background: `linear-gradient(90deg, rgb(255, 0, 86), transparent)`,
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {visibleSpeakers.map((s) => (
                  <SpeakerStyle2Card key={s.order} speaker={s} />
                ))}
              </div>
            </div>
          </SectionBox>

          {/* ===== Layer 6: QR code ===== */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "qr"}
            pos={data.sectionLayout?.qr?.pos}
            scale={data.sectionLayout?.qr?.scale}
            onMove={(p) => onSectionMove?.("qr", p)}
            onResize={(s) => onSectionResize?.("qr", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("qr", sz)}
            onSelect={() => setSelectedId("qr")}
            onZChange={(z) => onSectionZChange?.("qr", z)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            zIndex={sectionZFor(data, "qr")}
            anchor="top-left"
            guideId="qr"
            label="QR"
            style={{ left: "46.7%", top: "3.8%" }}
          >
            <div
              style={{
                background: "#FFFFFF",
                padding: "8px",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <Style2QrCode url={data.qrCodeUrl} size={120} />
            </div>
          </SectionBox>

          {/* ===== Layer 7: Sponsors ===== */}
          {data.sponsors.length > 0 && (
            <SectionBox
              active={sectionsEditable}
              selected={selectedId === "sponsors"}
              pos={data.sectionLayout?.sponsors?.pos}
              scale={data.sectionLayout?.sponsors?.scale}
              onMove={(p) => onSectionMove?.("sponsors", p)}
              onResize={(s) => onSectionResize?.("sponsors", s)}
              onBoxResize={(sz) => onSectionBoxResize?.("sponsors", sz)}
              onSelect={() => setSelectedId("sponsors")}
              onZChange={(z) => onSectionZChange?.("sponsors", z)}
              previewScale={previewScale}
              canvasW={CANVAS_W}
              canvasH={CANVAS_H}
              zIndex={sectionZFor(data, "sponsors")}
              anchor="top-left"
              guideId="sponsors"
              label="Sponsors"
              style={{ left: "85.5%", top: "84.6%" }}
            >
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {data.sponsors.map((sp, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#FFFFFF",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#475569",
                    }}
                  >
                    {sp.name}
                  </div>
                ))}
              </div>
            </SectionBox>
          )}

          {/* ===== Object Properties Panel (Edit Sections mode) ===== */}
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
