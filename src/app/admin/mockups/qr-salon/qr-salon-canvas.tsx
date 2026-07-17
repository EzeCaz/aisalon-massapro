"use client";

import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";
import type { QrSalonData } from "./types";
import { DEFAULT_BRANDING_ASSET_URL } from "./types";
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
 * QrSalonCanvas — the data-driven QR-only mockup renderer.
 *
 * Uses the same shared `SectionBox` system as the other mockups
 * (speaker-intro, meet-the-speaker, event-profile, agenda-profile)
 * so that every on-canvas element — QR code, caption, brand mark —
 * supports drag-to-move + 8-handle resize + alignment guides +
 * Object Properties Panel when `sectionsEditable` is true.
 *
 * Canvas size: 1200×800 (3:2). PNG export is 2× pixelRatio = 2400×1600.
 *
 * Two edit modes (mutually compatible, used independently):
 *   - `editable` (Edit images): the brand mark becomes click-to-replace
 *     from the brand library. (Pointer/wheel interactions on the brand
 *     mark are owned by SectionBox when sectionsEditable is true; the
 *     Edit-images "click to replace" only fires when NOT in sections mode.)
 *   - `sectionsEditable` (Edit sections): all three elements get
 *     drag handles + 8-direction resize + Object Properties Panel.
 */
const CANVAS_W = 1200;
const CANVAS_H = 800;

type Props = {
  data: QrSalonData;
  className?: string;
  /** Edit-images mode: brand mark shows hover/replace affordances. */
  editable?: boolean;
  /** Edit-sections mode: drag/resize handles on every section. */
  sectionsEditable?: boolean;
  /** Called when the user clicks the brand mark to replace it (Edit-images mode). */
  onPickBranding?: () => void;
  /** SectionBox drag callback (Edit-sections mode). */
  onSectionMove?: (id: SectionId, pos: SectionPos) => void;
  /** SectionBox corner-resize callback (uniform scale). */
  onSectionResize?: (id: SectionId, scale: number) => void;
  /** SectionBox mid-edge resize callback (explicit width/height). */
  onSectionBoxResize?: (id: SectionId, size: SectionBoxSize) => void;
  /** SectionBox z-index change (Front/Back in ObjectPropertiesPanel). */
  onSectionZChange?: (id: SectionId, z: number) => void;
  /** Render scale of the canvas in the editor (1 = full size). */
  previewScale?: number;
};

export const QrSalonCanvas = forwardRef<HTMLDivElement, Props>(
  function QrSalonCanvas(
    {
      data,
      className,
      editable = false,
      sectionsEditable = false,
      onPickBranding,
      onSectionMove,
      onSectionResize,
      onSectionBoxResize,
      onSectionZChange,
      previewScale = 1,
    },
    ref,
  ) {
    const qrSize = data.qrSize ?? 360;
    const qrMargin = data.qrMargin ?? 2;
    const qrDark = data.qrDarkColor ?? "#000000";
    const qrLight = data.qrLightColor ?? "#FFFFFF";

    // ─── Default positions (canvas px) ────────────────────────────
    // Layout per user spec 2026-07-17 (third revision):
    //   - Caption text ABOVE the QR code (centered horizontally)
    //   - QR code CENTERED (horizontally + vertically)
    //   - Brand mark BELOW the QR code, centered horizontally
    //
    // Vertical math (canvas 1200×800, QR 360×360):
    //   composition = caption(~36px) + gap(40) + QR(360) + gap(40) + logo(48)
    //              = 524px total
    //   top inset to vertically center the composition = (800 - 524) / 2 ≈ 138
    //   → caption top ≈ 140
    //   → QR top ≈ 220  (140 + 36 + 44 gap)
    //   → logo top ≈ 620 (220 + 360 + 40 gap)
    const qrDefaultLeftPx = (CANVAS_W - qrSize) / 2;
    const qrDefaultTopPx = 220;
    const captionWidthPct = data.captionWidthPct ?? 80;
    const captionWidthPx = (captionWidthPct / 100) * CANVAS_W;
    const captionDefaultLeftPx = (CANVAS_W - captionWidthPx) / 2;
    const captionDefaultTopPx = 140; // above the QR
    const brandingHeight = data.brandingAsset?.height ?? 48;
    const brandingDefaultTopPx = 620; // below the QR
    const brandingSrc =
      data.brandingAsset?.imageUrl || DEFAULT_BRANDING_ASSET_URL;

    // ─── Brand mark horizontal centering ───────────────────────────
    // The brand mark's width is `auto` (driven by the image's natural
    // aspect ratio). To truly center it horizontally, we preload the
    // image to learn its natural dimensions, then compute:
    //   renderedWidth = brandingHeight × (naturalW / naturalH)
    //   centeredLeftPx = (CANVAS_W - renderedWidth) / 2
    //
    // If the user has explicitly set brandingAsset.pos, that overrides
    // the centered default. If the preload hasn't finished yet, fall
    // back to a 3:1 aspect ratio estimate (typical horizontal logo).
    const [brandingNaturalSize, setBrandingNaturalSize] = useState<
      { w: number; h: number } | null
    >(null);
    useEffect(() => {
      if (!brandingSrc) {
        setBrandingNaturalSize(null);
        return;
      }
      const img = new Image();
      img.onload = () =>
        setBrandingNaturalSize({
          w: img.naturalWidth,
          h: img.naturalHeight,
        });
      img.onerror = () => setBrandingNaturalSize(null);
      img.src = brandingSrc;
    }, [brandingSrc]);

    const brandingRenderedWidth = brandingNaturalSize
      ? (brandingHeight / brandingNaturalSize.h) * brandingNaturalSize.w
      : brandingHeight * 3; // fallback: assume 3:1 horizontal logo
    const brandingDefaultLeftPx = (CANVAS_W - brandingRenderedWidth) / 2;

    // If the user explicitly set brandingAsset.pos in the data, honor it
    // (convert % to px). Otherwise use the computed centered default.
    const brandingPosExplicit = data.brandingAsset?.pos;
    const brandingLeftPx = brandingPosExplicit
      ? (brandingPosExplicit.x / 100) * CANVAS_W
      : brandingDefaultLeftPx;
    const brandingTopPx = brandingPosExplicit
      ? (brandingPosExplicit.y / 100) * CANVAS_H
      : brandingDefaultTopPx;

    // ─── Caption text style ────────────────────────────────────────
    const captionStyle = data.caption.style ?? {};
    const captionFontSize = captionStyle.fontSize ?? 28;
    const captionColor = captionStyle.color ?? "#000000";
    const captionAlign = captionStyle.align ?? "center";
    const captionWeight = captionStyle.fontWeight ?? "700";
    const captionLines = (data.caption.text || "").split("\n");

    // ─── SectionBox state ──────────────────────────────────────────
    const sectionLayout = data.sectionLayout ?? {};
    const [selectedId, setSelectedId] = useState<SectionId | null>(null);

    // Per-section z-index resolution: explicit > default by section order.
    // Branding on top of caption on top of QR (so the brand mark never
    // gets hidden behind the QR if the user drags them overlapping).
    function zFor(id: SectionId): number {
      const explicit = sectionLayout[id]?.z;
      if (typeof explicit === "number") return explicit;
      if (id === "branding") return 30;
      if (id === "caption") return 20;
      if (id === "qr") return 10;
      return 0;
    }
    const sectionPeerZs: number[] = ["qr", "caption", "branding"].map((id) =>
      zFor(id),
    );

    // Lock body scroll when the user is dragging/scrolling inside the canvas.
    const canvasRefForHooks = ref as React.RefObject<HTMLDivElement | null>;
    useCanvasScrollIsolation(canvasRefForHooks, sectionsEditable || editable);
    useNonPassiveWheel(
      canvasRefForHooks,
      () => {
        /* no-op — wheel is just used to prevent parent scroll; SectionBox handles its own resize */
      },
      sectionsEditable || editable,
    );

    return (
      <GuideProvider
        canvasRef={ref as React.RefObject<HTMLDivElement | null>}
        enabled={sectionsEditable}
      >
        <div
          ref={ref}
          className={className}
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            background: data.background ?? "#FFFFFF",
            position: "relative",
            overflow: "hidden",
            fontFamily:
              "'Inter', 'Helvetica Neue', Arial, sans-serif",
          }}
          onPointerDown={(e) => {
            // Clicking the canvas background (not a section) deselects.
            if (sectionsEditable && e.target === e.currentTarget) {
              setSelectedId(null);
            }
          }}
        >
          {/* ===== QR CODE ===== */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "qr"}
            onSelect={() => setSelectedId("qr")}
            pos={sectionLayout.qr?.pos}
            scale={sectionLayout.qr?.scale ?? 1}
            boxSize={sectionLayout.qr?.boxSize}
            onMove={(p) => onSectionMove?.("qr", p)}
            onResize={(s) => onSectionResize?.("qr", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("qr", sz)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            label="QR code"
            zIndex={zFor("qr")}
            style={{
              // Default position (used when sectionLayout.qr.pos is unset).
              position: "absolute",
              left: qrDefaultLeftPx,
              top: qrDefaultTopPx,
              width: qrSize,
              height: qrSize,
              background: qrLight,
            }}
          >
            <QrCode
              url={data.qrCodeUrl}
              size={qrSize}
              margin={qrMargin}
              dark={qrDark}
              light={qrLight}
            />
          </SectionBox>

          {/* ===== CAPTION ===== */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "caption"}
            onSelect={() => setSelectedId("caption")}
            pos={sectionLayout.caption?.pos}
            scale={sectionLayout.caption?.scale ?? 1}
            boxSize={sectionLayout.caption?.boxSize}
            onMove={(p) => onSectionMove?.("caption", p)}
            onResize={(s) => onSectionResize?.("caption", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("caption", sz)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            label="Caption"
            zIndex={zFor("caption")}
            style={{
              position: "absolute",
              left: captionDefaultLeftPx,
              top: captionDefaultTopPx,
              width: captionWidthPx,
              textAlign: captionAlign,
              color: captionColor,
              fontSize: captionFontSize,
              fontWeight: captionWeight,
              lineHeight: 1.3,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {captionLines.length > 0 && captionLines[0] !== "" ? (
              captionLines.map((line, i) => (
                <div key={i}>{line || "\u00A0"}</div>
              ))
            ) : (
              <div>{data.qrCodeUrl}</div>
            )}
          </SectionBox>

          {/* ===== BRANDING ASSET ===== */}
          <SectionBox
            active={sectionsEditable}
            selected={selectedId === "branding"}
            onSelect={() => setSelectedId("branding")}
            pos={sectionLayout.branding?.pos}
            scale={sectionLayout.branding?.scale ?? 1}
            boxSize={sectionLayout.branding?.boxSize}
            onMove={(p) => onSectionMove?.("branding", p)}
            onResize={(s) => onSectionResize?.("branding", s)}
            onBoxResize={(sz) => onSectionBoxResize?.("branding", sz)}
            previewScale={previewScale}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
            label="Brand mark"
            zIndex={zFor("branding")}
            style={{
              position: "absolute",
              left: brandingLeftPx,
              top: brandingTopPx,
              height: brandingHeight,
              width: "auto",
              cursor: editable && !sectionsEditable ? "pointer" : "default",
            }}
          >
            <button
              type="button"
              onClick={
                editable && !sectionsEditable
                  ? (e) => {
                      e.stopPropagation();
                      onPickBranding?.();
                    }
                  : undefined
              }
              style={{
                display: "block",
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                height: "100%",
                width: "100%",
                cursor: editable && !sectionsEditable ? "pointer" : "default",
              }}
              aria-label="Replace brand mark"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandingSrc}
                alt="AI Salon brand mark"
                style={{
                  display: "block",
                  height: "100%",
                  width: "auto",
                  objectFit: "contain",
                  pointerEvents: "none",
                }}
              />
            </button>
          </SectionBox>

          {/* ===== Guide overlay + Object Properties Panel ===== */}
          <GuideOverlay />

          {sectionsEditable && selectedId && (
            <ObjectPropertiesPanel
              label={
                selectedId === "qr"
                  ? "QR code"
                  : selectedId === "caption"
                    ? "Caption"
                    : "Brand mark"
              }
              pos={sectionLayout[selectedId]?.pos}
              onPosChange={(p) => onSectionMove?.(selectedId, p)}
              z={zFor(selectedId)}
              onZChange={(z) => onSectionZChange?.(selectedId, z)}
              peers={sectionPeerZs}
              onDeselect={() => setSelectedId(null)}
              showBoxSize
              boxSize={sectionLayout[selectedId]?.boxSize}
              onBoxSizeChange={(sz) =>
                onSectionBoxResize?.(selectedId, sz)
              }
              scale={sectionLayout[selectedId]?.scale ?? 1}
              onScaleChange={(s) => onSectionResize?.(selectedId, s)}
            />
          )}
        </div>
      </GuideProvider>
    );
  },
);

/**
 * QrCode — generates a QR code data URL via the `qrcode` library and
 * renders it as an <img>. Same pattern as the other AI Salon mockups.
 */
function QrCode({
  url,
  size,
  margin,
  dark,
  light,
}: {
  url: string;
  size: number;
  margin: number;
  dark: string;
  light: string;
}) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setDataUrl("");
      return;
    }
    QRCode.toDataURL(url, {
      width: size,
      margin,
      color: { dark, light },
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
  }, [url, size, margin, dark, light]);

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
      style={{ width: size, height: size }}
    />
  );
}
