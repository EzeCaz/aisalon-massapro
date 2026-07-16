"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { QrSalonData } from "./types";
import { DEFAULT_BRANDING_ASSET_URL } from "./types";

/**
 * QrSalonCanvas — the data-driven QR-only mockup renderer.
 *
 * Canvas size: 1200×800 (3:2). Same export-quality approach as the
 * other AI Salon mockups.
 *
 * Layout (defaults):
 *   - QR code centered horizontally, vertically biased toward the upper
 *     third so the caption has room to breathe underneath.
 *   - Caption printed below the QR (centered, 80%-wide text box).
 *   - Branding asset (small AI Salon logo) anchored at the bottom-left
 *     corner — height 48px, X=2.7%, Y=94% by default.
 *   - White canvas background.
 *
 * Editable mode (editable=true): the branding asset becomes interactive
 * — click to replace from the brand library, drag to reposition,
 * scroll to resize. The QR code itself is not image-editable (it's
 * generated from `qrCodeUrl`); change the URL in the form / JSON.
 */
const CANVAS_W = 1200;
const CANVAS_H = 800;

type Props = {
  data: QrSalonData;
  className?: string;
  /** When true, the branding asset gets hover/replace affordances. */
  editable?: boolean;
  /** Called when the user clicks the branding asset to replace it. */
  onPickBranding?: () => void;
  /** Called when the user drags the branding asset to a new position. */
  onBrandingPosChange?: (pos: { x: number; y: number }) => void;
  /** Called when the user scroll-zooms the branding asset. */
  onBrandingSizeChange?: (heightPx: number) => void;
  /** Render scale of the canvas in the editor (1 = full size). Used to
   *  scale drag deltas and hover hit areas. */
  previewScale?: number;
};

export const QrSalonCanvas = forwardRef<HTMLDivElement, Props>(
  function QrSalonCanvas(
    {
      data,
      className,
      editable = false,
      onPickBranding,
      onBrandingPosChange,
      onBrandingSizeChange,
      previewScale = 1,
    },
    ref,
  ) {
    const qrSize = data.qrSize ?? 360;
    const qrMargin = data.qrMargin ?? 2;
    const qrDark = data.qrDarkColor ?? "#000000";
    const qrLight = data.qrLightColor ?? "#FFFFFF";

    // ─── QR position ───────────────────────────────────────────────
    // Default: horizontally centered, vertically biased upward so the
    // caption fits below. Centered QR occupies roughly (CANVAS_W-qrSize)/2
    // horizontally and ~120px from the top.
    const qrPos = data.qrPos;
    const qrLeftPx = qrPos ? (qrPos.x / 100) * CANVAS_W : (CANVAS_W - qrSize) / 2;
    const qrTopPx = qrPos ? (qrPos.y / 100) * CANVAS_H : 120;

    // ─── Caption position ──────────────────────────────────────────
    const captionPos = data.captionPos;
    const captionWidthPct = data.captionWidthPct ?? 80;
    const captionWidthPx = (captionWidthPct / 100) * CANVAS_W;
    // Default: centered horizontally, sits 32px below the QR code.
    const captionLeftPx = captionPos
      ? (captionPos.x / 100) * CANVAS_W
      : (CANVAS_W - captionWidthPx) / 2;
    const captionTopPx = captionPos
      ? (captionPos.y / 100) * CANVAS_H
      : qrTopPx + qrSize + 32;

    // ─── Branding asset ────────────────────────────────────────────
    const brandingHeight = data.brandingAsset?.height ?? 48;
    const brandingPos = data.brandingAsset?.pos ?? { x: 2.7, y: 94 };
    const brandingLeftPx = (brandingPos.x / 100) * CANVAS_W;
    const brandingTopPx = (brandingPos.y / 100) * CANVAS_H;
    const brandingSrc =
      data.brandingAsset?.imageUrl || DEFAULT_BRANDING_ASSET_URL;

    // ─── Caption text style ────────────────────────────────────────
    const captionStyle = data.caption.style ?? {};
    const captionFontSize = captionStyle.fontSize ?? 28;
    const captionColor = captionStyle.color ?? "#000000";
    const captionAlign = captionStyle.align ?? "center";
    const captionWeight = captionStyle.fontWeight ?? "700";

    // Pre-split the caption into lines so the editor renders newlines
    // the same way html-to-image does (avoids baseline drift).
    const captionLines = (data.caption.text || "").split("\n");

    return (
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
      >
        {/* ===== QR CODE (centered, top-biased) ===== */}
        <div
          style={{
            position: "absolute",
            left: qrLeftPx,
            top: qrTopPx,
            width: qrSize,
            height: qrSize,
            background: qrLight,
            padding: 0,
            zIndex: 10,
          }}
        >
          <QrCode
            url={data.qrCodeUrl}
            size={qrSize}
            margin={qrMargin}
            dark={qrDark}
            light={qrLight}
          />
        </div>

        {/* ===== CAPTION (below QR, centered, 80% wide) ===== */}
        <div
          style={{
            position: "absolute",
            left: captionLeftPx,
            top: captionTopPx,
            width: captionWidthPx,
            textAlign: captionAlign,
            color: captionColor,
            fontSize: captionFontSize,
            fontWeight: captionWeight,
            lineHeight: 1.3,
            zIndex: 20,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {captionLines.length > 0 ? (
            captionLines.map((line, i) => (
              <div key={i}>{line || "\u00A0"}</div>
            ))
          ) : (
            <div>{data.qrCodeUrl}</div>
          )}
        </div>

        {/* ===== BRANDING ASSET (bottom-left by default, draggable) ===== */}
        <BrandingAsset
          src={brandingSrc}
          height={brandingHeight}
          leftPx={brandingLeftPx}
          topPx={brandingTopPx}
          editable={editable}
          previewScale={previewScale}
          onPick={onPickBranding}
          onPosChange={onBrandingPosChange}
          onSizeChange={onBrandingSizeChange}
        />
      </div>
    );
  },
);

/**
 * BrandingAsset — renders the small AI Salon logo with optional drag-to-
 * move + wheel-to-resize affordances. The hit area is padded a bit so
 * the user can grab it easily even on small heights.
 */
function BrandingAsset({
  src,
  height,
  leftPx,
  topPx,
  editable,
  previewScale,
  onPick,
  onPosChange,
  onSizeChange,
}: {
  src: string;
  height: number;
  leftPx: number;
  topPx: number;
  editable: boolean;
  previewScale: number;
  onPick?: () => void;
  onPosChange?: (pos: { x: number; y: number }) => void;
  onSizeChange?: (heightPx: number) => void;
}) {
  // Drag state — kept in a ref so we don't re-render on every mousemove.
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!editable || !onPosChange) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: leftPx, origY: topPx };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!editable || !onPosChange) return;
    if (!dragRef.current) return;
    if (e.buttons === 0) return;
    const dx = (e.clientX - dragRef.current.startX) / previewScale;
    const dy = (e.clientY - dragRef.current.startY) / previewScale;
    const newX = Math.max(0, Math.min(CANVAS_W, dragRef.current.origX + dx));
    const newY = Math.max(0, Math.min(CANVAS_H, dragRef.current.origY + dy));
    onPosChange({
      x: (newX / CANVAS_W) * 100,
      y: (newY / CANVAS_H) * 100,
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!editable) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!editable || !onSizeChange) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -4 : 4;
    const next = Math.max(16, Math.min(240, height + delta));
    onSizeChange(next);
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onClick={editable ? (e) => { e.stopPropagation(); onPick?.(); } : undefined}
      style={{
        position: "absolute",
        left: leftPx,
        top: topPx,
        height,
        // Width is auto — image keeps its natural aspect ratio.
        width: "auto",
        cursor: editable ? "move" : "default",
        zIndex: 30,
        touchAction: "none",
        outline: editable ? "1px dashed rgba(255,0,90,0.4)" : "none",
        outlineOffset: 2,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="AI Salon brand mark"
        style={{
          display: "block",
          height: "100%",
          width: "auto",
          objectFit: "contain",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

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
