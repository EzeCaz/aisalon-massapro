"use client";

/**
 * Shared 8-point resize + drag-to-move utilities for mockup canvases.
 *
 * Used by speaker-intro, meet-the-speaker, and event-profile canvases
 * to provide consistent interactive editing of hero/large images.
 *
 * Exports:
 *   - Handle8 type (8 handle positions: 4 corners + 4 edge midpoints)
 *   - ResizeHandle8 component (a styled handle at one of the 8 positions)
 *   - clampScale helper
 *   - HeroResizeState type + useHeroResize hook for tracking drag state
 */

import React, { useRef } from "react";

export type Handle8 = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Clamp a scale multiplier to the allowed range [0.01, 6]. */
export function clampScale(n: number): number {
  return Math.max(0.01, Math.min(6, n));
}

/**
 * Resize drag state — shared shape used by all canvases.
 * Tracks the starting mouse position + the starting scales/pos so
 * the move handler can compute deltas correctly.
 */
export type ResizeDragState = {
  startX: number;
  startY: number;
  startSize: number;
  startScaleX: number;
  startScaleY: number;
  startPosX: number;
  startPosY: number;
  handle: Handle8;
};

/**
 * Hero drag-to-move state — tracks starting mouse + starting position
 * so the move handler can compute the new container position.
 */
export type HeroDragState = {
  startX: number;
  startY: number;
  startFocusX: number;
  startFocusY: number;
  startPosX: number;
  startPosY: number;
  isShift: boolean;
};

/**
 * ResizeHandle8 — a small square handle at one of the 8 positions on an
 * editable image (4 corners + 4 edge midpoints). Dragging it resizes the
 * image via the parent's onSizeChange / onHeroResize callback.
 *
 * Visible only in edit mode (the parent conditionally renders it).
 * Opacity is always 100% so the user can see the handles immediately
 * when edit mode is on.
 */
export function ResizeHandle8({
  handle,
  onMouseDown,
}: {
  handle: Handle8;
  onMouseDown: (e: React.MouseEvent, handle: Handle8) => void;
}) {
  // Position classes for each of the 8 handles. The -translate-x-1/2 /
  // -translate-y-1/2 center the handle on the edge midpoint.
  const posClass =
    handle === "nw" ? "top-0 left-0" :
    handle === "n"  ? "top-0 left-1/2 -translate-x-1/2" :
    handle === "ne" ? "top-0 right-0" :
    handle === "e"  ? "top-1/2 right-0 -translate-y-1/2" :
    handle === "se" ? "bottom-0 right-0" :
    handle === "s"  ? "bottom-0 left-1/2 -translate-x-1/2" :
    handle === "sw" ? "bottom-0 left-0" :
                      "top-1/2 left-0 -translate-y-1/2";
  const cursorClass =
    handle === "nw" || handle === "se" ? "cursor-nwse-resize" :
    handle === "ne" || handle === "sw" ? "cursor-nesw-resize" :
    handle === "n"  || handle === "s"  ? "cursor-ns-resize" :
                                          "cursor-ew-resize";
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, handle)}
      className={`absolute ${posClass} ${cursorClass} z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-100 transition`}
      style={{ pointerEvents: "auto" }}
      aria-label={`Resize ${handle} handle`}
    />
  );
}

/**
 * Build the 8-handle resize mousedown handler. Returns a function you can
 * attach to each ResizeHandle8's onMouseDown.
 *
 * Behavior:
 *   - Corners (nw, ne, se, sw): update BOTH X and Y scales.
 *   - Edges n/s: update only Y scale.
 *   - Edges e/w: update only X scale.
 *
 * For non-hero slots (speaker/sponsor), only corners are rendered and
 * they call the legacy `onSizeChange` with a single multiplier.
 *
 * @param isHero Whether this is a hero image (uses 2D resize) or non-hero (uses single multiplier)
 * @param editable Whether edit mode is on
 * @param previewScale The current scale of the preview (for converting screen-drag to canvas-%)
 * @param sizeMultiplier Current single-axis size (for non-hero)
 * @param heroScaleX Current hero X scale (for hero)
 * @param heroScaleY Current hero Y scale (for hero)
 * @param heroPos Current hero container position (for hero — used as a fallback if needed)
 * @param onHeroResize Callback for hero 2D resize
 * @param onSizeChange Callback for non-hero single-axis resize
 * @param resizeRef Ref to store the drag state
 */
export function makeHandleResizeMouseDown8(opts: {
  isHero: boolean;
  editable?: boolean;
  previewScale: number;
  sizeMultiplier?: number;
  heroScaleX?: number;
  heroScaleY?: number;
  heroPos?: { x: number; y: number };
  onHeroResize?: (newScaleX: number, newScaleY: number) => void;
  onSizeChange?: (slot: any, newMultiplier: number) => void;
  slot: any;
  resizeRef: React.MutableRefObject<ResizeDragState | null>;
}) {
  const {
    isHero, editable, previewScale, sizeMultiplier = 1,
    heroScaleX = 1, heroScaleY = 1, heroPos,
    onHeroResize, onSizeChange, slot, resizeRef,
  } = opts;

  return function handleResizeMouseDown8(
    e: React.MouseEvent,
    handle: Handle8,
  ) {
    if (!editable) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startSize = sizeMultiplier;
    const startSX = heroScaleX;
    const startSY = heroScaleY;

    if (isHero) {
      if (!onHeroResize) return;
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startSize,
        startScaleX: startSX,
        startScaleY: startSY,
        startPosX: heroPos?.x ?? 0,
        startPosY: heroPos?.y ?? 0,
        handle,
      };
      const onMove = (ev: MouseEvent) => {
        const r = resizeRef.current;
        if (!r) return;
        const dx = ev.clientX - r.startX;
        const dy = ev.clientY - r.startY;
        const sens = 100 * previewScale;
        const isCorner = r.handle === "nw" || r.handle === "ne" || r.handle === "se" || r.handle === "sw";

        let nextX = r.startScaleX;
        let nextY = r.startScaleY;

        if (isCorner) {
          // Diagonal "grow" direction per corner. Dragging a corner AWAY
          // from the center must grow the image; dragging it TOWARD the
          // opposite corner must shrink it.
          //
          //   se (bottom-right): away = (+dx, +dy) → grow → signedDiag = dx + dy
          //   nw (top-left):     away = (-dx, -dy) → grow → signedDiag = -(dx + dy)
          //   ne (top-right):    away = (+dx, -dy) → grow → signedDiag = dx - dy
          //   sw (bottom-left):  away = (-dx, +dy) → grow → signedDiag = -dx + dy
          let signedDiag: number = 0;
          switch (r.handle) {
            case "se": signedDiag = dx + dy; break;
            case "nw": signedDiag = -(dx + dy); break;
            case "ne": signedDiag = dx - dy; break;
            case "sw": signedDiag = -dx + dy; break;
          }
          const delta = signedDiag / sens;
          nextX = clampScale(r.startScaleX + delta);
          nextY = clampScale(r.startScaleY + delta);
        } else if (r.handle === "n" || r.handle === "s") {
          const sign = r.handle === "s" ? 1 : -1;
          const delta = (sign * dy) / sens;
          nextY = clampScale(r.startScaleY + delta);
        } else {
          const sign = r.handle === "e" ? 1 : -1;
          const delta = (sign * dx) / sens;
          nextX = clampScale(r.startScaleX + delta);
        }
        onHeroResize(nextX, nextY);
      };
      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }

    // Non-hero (speaker/sponsor): legacy single-multiplier path.
    if (!onSizeChange) return;
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startSize,
      startScaleX: startSX,
      startScaleY: startSY,
      startPosX: heroPos?.x ?? 0,
      startPosY: heroPos?.y ?? 0,
      handle,
    };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      // See hero-path comment above: ne/sw formulas are swapped so that
      // dragging a corner toward the opposite corner shrinks the image.
      let signedDiag: number = 0;
      switch (r.handle) {
        case "se": signedDiag = dx + dy; break;
        case "nw": signedDiag = -(dx + dy); break;
        case "ne": signedDiag = dx - dy; break;
        case "sw": signedDiag = -dx + dy; break;
      }
      const sens = 100 * previewScale;
      const delta = signedDiag / sens;
      const next = Math.max(0.01, Math.min(6, r.startSize + delta));
      onSizeChange(slot, next);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}

/**
 * Build the hero body drag-to-move mousedown handler.
 *
 * For hero + plain-drag → move the container (calls onHeroMove).
 * For hero + shift-drag → pan-within-container (calls onPlacementChange
 *   with new focusX/focusY).
 *
 * @param editable Whether edit mode is on
 * @param previewScale The current scale of the preview
 * @param focusX Current focusX (for shift-drag pan)
 * @param focusY Current focusY (for shift-drag pan)
 * @param heroPos Current hero container position
 * @param onHeroMove Callback for hero container move
 * @param onPlacementChange Callback for shift-drag pan-within-container
 * @param dragRef Ref to store the drag state
 */
export function makeHeroHandleMouseDown(opts: {
  editable?: boolean;
  previewScale: number;
  focusX: number;
  focusY: number;
  zoom: number;
  heroPos?: { x: number; y: number };
  onHeroMove?: (newPosX: number, newPosY: number) => void;
  onPlacementChange?: (slot: any, p: { focusX: number; focusY: number; zoom: number }) => void;
  slot: any;
  dragRef: React.MutableRefObject<HeroDragState | null>;
}) {
  const {
    editable, previewScale, focusX, focusY, zoom,
    heroPos, onHeroMove, onPlacementChange, slot, dragRef,
  } = opts;

  return function handleMouseDown(e: React.MouseEvent) {
    if (!editable) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const isShift = e.shiftKey;

    // For hero + shift-drag → pan-within-container (legacy behavior).
    // For hero + plain-drag → move the container.
    if (!isShift) {
      if (!onHeroMove) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startFocusX: focusX,
        startFocusY: focusY,
        startPosX: heroPos?.x ?? 0,
        startPosY: heroPos?.y ?? 0,
        isShift: false,
      };
      (e.currentTarget as HTMLElement).style.cursor = "grabbing";
      const onMove = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        // Convert screen px to canvas %. Canvas is 1200×800 at previewScale.
        const nextX = d.startPosX + dx / (12 * previewScale);
        const nextY = d.startPosY + dy / (8 * previewScale);
        onHeroMove(nextX, nextY);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const el = e.currentTarget as HTMLElement;
        if (el) el.style.cursor = "grab";
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }

    // Shift-drag: pan-within-container.
    if (!onPlacementChange) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startFocusX: focusX,
      startFocusY: focusY,
      startPosX: heroPos?.x ?? 0,
      startPosY: heroPos?.y ?? 0,
      isShift,
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
      const el = e.currentTarget as HTMLElement;
      if (el) el.style.cursor = "grab";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}
