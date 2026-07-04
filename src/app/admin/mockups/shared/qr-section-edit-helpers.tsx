"use client";

/**
 * Shared helpers for QR-code and text-section interactive editing
 * across all mockup canvases (speaker-intro, meet-the-speaker,
 * event-profile, agenda-profile).
 *
 * Provides:
 *   - DragResizeBox: a wrapper that adds drag-to-move + 4-corner resize
 *     handles to ANY child element. Used for the QR code AND for text
 *     sections (event header, topic, speakers list, sponsors, branding).
 *   - useScrollLockOnHover: a hook that prevents the page from scrolling
 *     when the user's wheel is over the preview container in edit mode.
 *
 * Design notes:
 *   - Reuses the existing ResizeHandle8 component from editable-image-helpers
 *     so the visual style matches the image edit handles (white square with
 *     pink border).
 *   - Position is stored in PERCENT of the canvas (0-100) so it's
 *     resolution-independent and survives preview-scale changes.
 *   - Size is stored as a SCALE multiplier (1 = default) so the box's
 *     intrinsic layout (determined by its children) is preserved.
 *   - The box's anchor is always top-left when active (we convert
 *     right-anchored defaults to left-anchored when the user first drags).
 */

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ResizeHandle8, clampScale, type Handle8 } from "./editable-image-helpers";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type BoxPos = { x?: number; y?: number };

export type BoxLayout = {
  /** Position in % of canvas (0-100). Omitted = use default CSS. */
  pos?: BoxPos;
  /** Proportional scale multiplier (1 = default size). Range 0.01–6.
   *  Updated by dragging the 4 CORNER handles (proportional resize). */
  scale?: number;
  /** Horizontal-only multiplier (1 = default). Range 0.01–6.
   *  Updated by dragging the LEFT/RIGHT edge handles. Composes
   *  multiplicatively with `scale` (final X = scale * (scaleX ?? 1)). */
  scaleX?: number;
  /** Vertical-only multiplier (1 = default). Range 0.01–6.
   *  Updated by dragging the TOP/BOTTOM edge handles. Composes
   *  multiplicatively with `scale` (final Y = scale * (scaleY ?? 1)). */
  scaleY?: number;
};

/* ------------------------------------------------------------------ */
/*  Alignment Guides                                                  */
/* ------------------------------------------------------------------ */

/**
 * A guide line shown during drag/resize to help align boxes.
 * - vertical: a vertical line at x% of canvas (spans full height)
 * - horizontal: a horizontal line at y% of canvas (spans full width)
 */
export type GuideLine = {
  type: "vertical" | "horizontal";
  /** Position in % of canvas (0–100). */
  pos: number;
};

/**
 * Context value provided by GuidesProvider. Each DragResizeBox
 * registers its DOM element so peers can query it during drag.
 */
type GuidesContextValue = {
  /** Register a box's DOM element under a unique id. */
  registerBox: (id: string, el: HTMLElement | null) => void;
  /**
   * Get bounding rects of all registered peers (excluding `excludeId`),
   * plus the canvas rect. All rects are in SCREEN coordinates
   * (from getBoundingClientRect) so callers can compare directly.
   */
  getPeers: (
    excludeId: string,
  ) => { rects: Array<{ id: string; rect: DOMRect }>; canvasRect: DOMRect | null };
  /** Set the current guide lines to render (replaces all). */
  setGuides: (lines: GuideLine[]) => void;
  /** The current guide lines (consumed by GuidesOverlay). */
  guides: GuideLine[];
  /** Whether guides are enabled (any edit mode on). */
  enabled: boolean;
};

const GuidesContext = React.createContext<GuidesContextValue | null>(null);

/**
 * useGuides — hook to access the guides context.
 * Returns null when not inside a GuidesProvider (guides disabled).
 * Exported so EditableImage (hero image) can also participate in
 * guide alignment.
 */
export function useGuides(): GuidesContextValue | null {
  return useContext(GuidesContext);
}

/**
 * Compute alignment guides for an element being dragged.
 * Exported so EditableImage (hero image) can reuse the same logic.
 */
export function computeAlignmentGuides(
  activeRect: DOMRect,
  canvasRect: DOMRect,
  peerRects: DOMRect[],
  threshold: number = 1.5,
): { guides: GuideLine[]; snapX: number; snapY: number } {
  return computeGuides(activeRect, canvasRect, peerRects, threshold);
}

/**
 * GuidesProvider — wraps a canvas to enable alignment guide lines.
 *
 * Each DragResizeBox with a `guideId` registers its DOM element.
 * During drag, the active box queries peers via `getPeers`, computes
 * alignment, and calls `setGuides` to render guide lines.
 *
 * The `canvasRef` should point to the canvas container (the 1200×800
 * div, or whatever the full-canvas element is). It's used to convert
 * screen coordinates to canvas-% coordinates.
 */
export function GuidesProvider({
  children,
  canvasRef,
  enabled,
}: {
  children: React.ReactNode;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
}) {
  const boxesRef = useRef<Map<string, HTMLElement>>(new Map());
  const [guides, setGuidesState] = useState<GuideLine[]>([]);

  const registerBox = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      boxesRef.current.set(id, el);
    } else {
      boxesRef.current.delete(id);
    }
  }, []);

  const getPeers = useCallback(
    (excludeId: string) => {
      const rects: Array<{ id: string; rect: DOMRect }> = [];
      boxesRef.current.forEach((el, id) => {
        if (id !== excludeId) {
          rects.push({ id, rect: el.getBoundingClientRect() });
        }
      });
      const canvasRect = canvasRef.current?.getBoundingClientRect() ?? null;
      return { rects, canvasRect };
    },
    [canvasRef],
  );

  const setGuides = useCallback((lines: GuideLine[]) => {
    setGuidesState(lines);
  }, []);

  // Clear guides when disabled.
  useEffect(() => {
    if (!enabled) {
      setGuidesState([]);
    }
  }, [enabled]);

  return (
    <GuidesContext.Provider
      value={{ registerBox, getPeers, setGuides, guides, enabled }}
    >
      {children}
    </GuidesContext.Provider>
  );
}

/**
 * GuidesOverlay — renders the current guide lines as absolute-positioned
 * divs spanning the full canvas. Must be rendered INSIDE the canvas
 * container (the relatively-positioned parent) so `left: X%` and
 * `top: Y%` map correctly.
 *
 * Lines are rendered with pointer-events: none so they don't interfere
 * with drag operations.
 */
export function GuidesOverlay() {
  const ctx = useContext(GuidesContext);
  if (!ctx || !ctx.enabled || ctx.guides.length === 0) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
      aria-hidden
    >
      {ctx.guides.map((g, i) =>
        g.type === "vertical" ? (
          <div
            key={`v-${i}`}
            className="absolute top-0 bottom-0"
            style={{
              left: `${g.pos}%`,
              width: "1px",
              background: "#00E6FF",
              boxShadow: "0 0 4px rgba(0,230,255,0.6)",
            }}
          />
        ) : (
          <div
            key={`h-${i}`}
            className="absolute left-0 right-0"
            style={{
              top: `${g.pos}%`,
              height: "1px",
              background: "#00E6FF",
              boxShadow: "0 0 4px rgba(0,230,255,0.6)",
            }}
          />
        ),
      )}
    </div>
  );
}

/**
 * Compute alignment guide lines for a box being dragged/resized.
 *
 * Compares the active box's edges (left, right, top, bottom) and
 * centers (horizontal, vertical) against:
 *   - Each peer box's edges and centers
 *   - The canvas center lines (50%, 50%)
 *   - The canvas edges (0%, 100%)
 *
 * When an alignment is found within `threshold` (in canvas-%), a guide
 * line is added at the aligned position. The function returns both the
 * guide lines and the snap offset (how much to adjust the active box's
 * position to perfectly align).
 *
 * @param activeRect  Screen rect of the active box
 * @param canvasRect  Screen rect of the canvas container
 * @param peerRects   Screen rects of all peer boxes
 * @param threshold   Alignment threshold in canvas-% (default 1.5%)
 * @returns { guides, snapX, snapY } — snapX/snapY are in canvas-%;
 *          0 means no snap on that axis.
 */
function computeGuides(
  activeRect: DOMRect,
  canvasRect: DOMRect,
  peerRects: DOMRect[],
  threshold: number = 1.5,
): { guides: GuideLine[]; snapX: number; snapY: number } {
  if (!canvasRect || canvasRect.width === 0 || canvasRect.height === 0) {
    return { guides: [], snapX: 0, snapY: 0 };
  }

  // Convert active rect to canvas-% coordinates.
  const aLeft = ((activeRect.left - canvasRect.left) / canvasRect.width) * 100;
  const aRight = ((activeRect.right - canvasRect.left) / canvasRect.width) * 100;
  const aCx = (aLeft + aRight) / 2;
  const aTop = ((activeRect.top - canvasRect.top) / canvasRect.height) * 100;
  const aBottom = ((activeRect.bottom - canvasRect.top) / canvasRect.height) * 100;
  const aCy = (aTop + aBottom) / 2;

  // Candidate X alignment targets: canvas edges + center, plus each peer's
  // left/right/center-x.
  const xTargets: Array<{ pos: number; edge: "left" | "right" | "cx" }> = [
    { pos: 0, edge: "left" },
    { pos: 50, edge: "cx" },
    { pos: 100, edge: "right" },
  ];
  for (const pr of peerRects) {
    const pLeft = ((pr.left - canvasRect.left) / canvasRect.width) * 100;
    const pRight = ((pr.right - canvasRect.left) / canvasRect.width) * 100;
    const pCx = (pLeft + pRight) / 2;
    xTargets.push(
      { pos: pLeft, edge: "left" },
      { pos: pRight, edge: "right" },
      { pos: pCx, edge: "cx" },
    );
  }

  // Candidate Y alignment targets.
  const yTargets: Array<{ pos: number; edge: "top" | "bottom" | "cy" }> = [
    { pos: 0, edge: "top" },
    { pos: 50, edge: "cy" },
    { pos: 100, edge: "bottom" },
  ];
  for (const pr of peerRects) {
    const pTop = ((pr.top - canvasRect.top) / canvasRect.height) * 100;
    const pBottom = ((pr.bottom - canvasRect.top) / canvasRect.height) * 100;
    const pCy = (pTop + pBottom) / 2;
    yTargets.push(
      { pos: pTop, edge: "top" },
      { pos: pBottom, edge: "bottom" },
      { pos: pCy, edge: "cy" },
    );
  }

  // Active box's X reference points: left edge, right edge, center.
  const xRefs: Array<{ val: number; edge: "left" | "right" | "cx" }> = [
    { val: aLeft, edge: "left" },
    { val: aRight, edge: "right" },
    { val: aCx, edge: "cx" },
  ];
  const yRefs: Array<{ val: number; edge: "top" | "bottom" | "cy" }> = [
    { val: aTop, edge: "top" },
    { val: aBottom, edge: "bottom" },
    { val: aCy, edge: "cy" },
  ];

  const guides: GuideLine[] = [];
  let snapX = 0;
  let snapY = 0;

  // Find the best X alignment (smallest delta within threshold).
  let bestXDelta = Infinity;
  let bestXTarget = 0;
  let bestXEdge: "left" | "right" | "cx" | null = null;
  for (const ref of xRefs) {
    for (const target of xTargets) {
      const delta = Math.abs(ref.val - target.pos);
      if (delta < threshold && delta < bestXDelta) {
        bestXDelta = delta;
        bestXTarget = target.pos;
        bestXEdge = ref.edge;
      }
    }
  }
  if (bestXEdge !== null) {
    guides.push({ type: "vertical", pos: bestXTarget });
    // Compute snap: how much to shift the box so the aligned edge matches.
    if (bestXEdge === "left") snapX = bestXTarget - aLeft;
    else if (bestXEdge === "right") snapX = bestXTarget - aRight;
    else snapX = bestXTarget - aCx;
  }

  // Find the best Y alignment.
  let bestYDelta = Infinity;
  let bestYTarget = 0;
  let bestYEdge: "top" | "bottom" | "cy" | null = null;
  for (const ref of yRefs) {
    for (const target of yTargets) {
      const delta = Math.abs(ref.val - target.pos);
      if (delta < threshold && delta < bestYDelta) {
        bestYDelta = delta;
        bestYTarget = target.pos;
        bestYEdge = ref.edge;
      }
    }
  }
  if (bestYEdge !== null) {
    guides.push({ type: "horizontal", pos: bestYTarget });
    if (bestYEdge === "top") snapY = bestYTarget - aTop;
    else if (bestYEdge === "bottom") snapY = bestYTarget - aBottom;
    else snapY = bestYTarget - aCy;
  }

  return { guides, snapX, snapY };
}

export type DragResizeBoxProps = {
  /**
   * Whether edit mode is active for this box. When false (or undefined),
   * the box renders as a plain div with no handles and no drag handlers.
   */
  active?: boolean;
  /**
   * Current position in % of canvas. When undefined, the box uses its
   * default CSS positioning (which may be right-anchored, etc.).
   */
  pos?: BoxPos;
  /**
   * Current proportional scale multiplier (corner drag). Default 1.
   */
  scale?: number;
  /**
   * Current horizontal-only multiplier (left/right edge drag). Default 1.
   * Composes multiplicatively with `scale`.
   */
  scaleX?: number;
  /**
   * Current vertical-only multiplier (top/bottom edge drag). Default 1.
   * Composes multiplicatively with `scale`.
   */
  scaleY?: number;
  /**
   * Called when the user drags the box body. Receives the new position
   * in % of canvas.
   */
  onMove?: (pos: { x: number; y: number }) => void;
  /**
   * Called when the user drags a CORNER handle. Receives the new
   * proportional scale. (Legacy / corner-only callback.)
   */
  onResize?: (newScale: number) => void;
  /**
   * Called when the user drags an EDGE handle (mid-top/bottom/left/right).
   * Receives the new axis-specific multipliers. If provided, the box
   * renders all 8 handles (4 corners + 4 edges). If only `onResize`
   * is provided, only the 4 corner handles render (legacy behavior).
   */
  onResize2D?: (newScaleX: number, newScaleY: number) => void;
  /**
   * Preview scale of the parent canvas (e.g. 0.5 = 50% preview).
   * Used to convert screen-pixel drag deltas to canvas-% deltas.
   */
  previewScale: number;
  /**
   * Canvas width in px (e.g. 1200 for speaker-intro, 1200 for agenda-profile).
   */
  canvasW: number;
  /**
   * Canvas height in px (e.g. 800 for speaker-intro, 1500 for agenda-profile).
   */
  canvasH: number;
  /** Optional className for the wrapper div. */
  className?: string;
  /** Optional inline style for the wrapper div (merged with computed style). */
  style?: React.CSSProperties;
  /** The content of the box (QR code, text, etc.). */
  children: React.ReactNode;
  /**
   * Optional accent color for the edit outline + handles. Defaults to
   * pink (#FF005A) to match the image edit handles. Use a different
   * color to visually distinguish section edit from image edit.
   */
  accentColor?: string;
  /** Optional label shown in the top-left corner when active (e.g. "QR Code"). */
  label?: string;
  /**
   * Which corner of the box is the anchor when scale is applied AND
   * `pos` is NOT set (i.e. the box is using its default CSS positioning).
   *
   *   - "top-left" (default): scale from top-left. Use for left-anchored boxes.
   *   - "top-right": scale from top-right. Use for right-anchored boxes
   *     (QR, sponsors, branding) so they don't appear to shift when resized.
   *
   * When `pos` IS set (user has dragged the box), the anchor is always
   * "top-left" because we switch to left/top positioning.
   */
  anchor?: "top-left" | "top-right";
  /**
   * Unique ID for this box within the canvas, used for alignment guide
   * computation. When set AND `active` is true, the box registers its
   * DOM element with the GuidesProvider so other boxes can align to it
   * during drag, and vice versa.
   *
   * When omitted, the box does not participate in guide alignment.
   */
  guideId?: string;
  /**
   * Optional z-index override. Use a higher value for boxes that should
   * appear on top of other sections (e.g. sponsors, branding).
   */
  zIndex?: number;
};

/* ------------------------------------------------------------------ */
/*  DragResizeBox                                                     */
/* ------------------------------------------------------------------ */

/**
 * A wrapper that adds drag-to-move + 4-corner resize handles to any
 * child element. Used for the QR code AND for text sections.
 *
 * When `active` is false, renders the children inside a plain div with
 * the given className/style. When `active` is true, renders the same
 * div but with:
 *   - A dashed outline (so the user can see the box bounds)
 *   - 4 corner resize handles (nw, ne, se, sw)
 *   - A drag-to-move handler on the body (cursor: grab)
 *   - An optional label badge in the top-left corner
 *
 * Position is applied via `left`/`top` in % of canvas when `pos` is
 * set; otherwise the box uses its original CSS positioning (which may
 * be right-anchored). Scale is applied via CSS `transform: scale()`
 * with `transform-origin: top left`.
 *
 * The drag math:
 *   - On mousedown (body): record start mouse + start pos.
 *   - On mousemove: dx = ev.clientX - startX; convert to % via
 *     (dx / (canvasW * previewScale)) * 100; newPosX = startPosX + dxPct.
 *   - Same for Y.
 *
 * The resize math (4 corners, uniform scale):
 *   - On mousedown (corner): record start mouse + start scale.
 *   - On mousemove: compute signed diagonal delta per corner (see
 *     code comments); newScale = clamp(startScale + delta / sens).
 *   - Sensitivity = 100 * previewScale (matches image resize feel).
 */
export function DragResizeBox({
  active = false,
  pos,
  scale = 1,
  scaleX,
  scaleY,
  onMove,
  onResize,
  onResize2D,
  previewScale,
  canvasW,
  canvasH,
  className,
  style,
  children,
  accentColor = "#FF005A",
  label,
  anchor = "top-left",
  guideId,
  zIndex,
}: DragResizeBoxProps) {
  const guidesCtx = useGuides();
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Register this box with the GuidesProvider when active + has guideId.
  useEffect(() => {
    if (!guidesCtx || !guideId) return;
    if (active) {
      guidesCtx.registerBox(guideId, boxRef.current);
    } else {
      guidesCtx.registerBox(guideId, null);
    }
    return () => {
      guidesCtx.registerBox(guideId, null);
    };
  }, [guidesCtx, guideId, active]);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    mode: "move" | "resize";
    handle?: Handle8;
    startScale: number;
    startScaleX: number;
    startScaleY: number;
  } | null>(null);

  /**
   * Helper: compute + set alignment guides for the active box during drag.
   * Called on every mousemove. Returns the snap offset (in canvas-%) so
   * the caller can apply it to the box position.
   *
   * For resize mode, snap is not applied (only guide lines are shown)
   * because resizing changes scale, not position — snapping the position
   * during resize would be confusing.
   */
  const updateGuides = useCallback(
    (applySnap: boolean): { snapX: number; snapY: number } => {
      if (!guidesCtx || !guideId || !boxRef.current) {
        return { snapX: 0, snapY: 0 };
      }
      const { rects, canvasRect } = guidesCtx.getPeers(guideId);
      if (!canvasRect) {
        guidesCtx.setGuides([]);
        return { snapX: 0, snapY: 0 };
      }
      const activeRect = boxRef.current.getBoundingClientRect();
      const peerRects = rects.map((r) => r.rect);
      const { guides, snapX, snapY } = computeGuides(activeRect, canvasRect, peerRects);
      guidesCtx.setGuides(guides);
      return { snapX: applySnap ? snapX : 0, snapY: applySnap ? snapY : 0 };
    },
    [guidesCtx, guideId],
  );

  /** Mousedown on body → start drag-to-move. */
  const handleBodyMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!active) return;
      if (e.button !== 0) return;
      if (!onMove) return;
      e.preventDefault();
      e.stopPropagation();
      const startPosX = pos?.x ?? 0;
      const startPosY = pos?.y ?? 0;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX,
        startPosY,
        mode: "move",
        startScale: scale,
        startScaleX: scaleX ?? 1,
        startScaleY: scaleY ?? 1,
      };
      (e.currentTarget as HTMLElement).style.cursor = "grabbing";
      const onMoveEv = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d || d.mode !== "move") return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        // Convert screen px to canvas % (canvasW px wide at previewScale).
        const dxPct = (dx / (canvasW * previewScale)) * 100;
        const dyPct = (dy / (canvasH * previewScale)) * 100;
        let nextX = d.startPosX + dxPct;
        let nextY = d.startPosY + dyPct;
        // Temporarily apply the new position so updateGuides can measure
        // the box at its would-be location. We do this by calling onMove
        // first, then querying the DOM rect. The snap adjustment is added
        // on top and a second onMove call applies the snapped position.
        onMove({ x: nextX, y: nextY });
        const { snapX, snapY } = updateGuides(true);
        if (snapX !== 0 || snapY !== 0) {
          onMove({ x: nextX + snapX, y: nextY + snapY });
        }
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMoveEv);
        window.removeEventListener("mouseup", onUp);
        const el = e.currentTarget as HTMLElement;
        if (el) el.style.cursor = active ? "grab" : "default";
        // Clear guides on drag end.
        if (guidesCtx) guidesCtx.setGuides([]);
      };
      window.addEventListener("mousemove", onMoveEv);
      window.addEventListener("mouseup", onUp);
    },
    [active, onMove, pos?.x, pos?.y, scale, canvasW, canvasH, previewScale, guidesCtx, updateGuides],
  );

  /** Mousedown on a corner handle → start proportional resize.
   *  Corners update `scale` (both X and Y equally). */
  const handleCornerMouseDown = useCallback(
    (e: React.MouseEvent, handle: Handle8) => {
      if (!active) return;
      if (e.button !== 0) return;
      // Corners need either onResize (legacy 1D) or onResize2D (new 2D).
      if (!onResize && !onResize2D) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: pos?.x ?? 0,
        startPosY: pos?.y ?? 0,
        mode: "resize",
        handle,
        startScale: scale,
        startScaleX: scaleX ?? 1,
        startScaleY: scaleY ?? 1,
      };
      const onMoveEv = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d || d.mode !== "resize" || !d.handle) return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        // Signed diagonal: dragging a corner AWAY from the box center
        // grows the scale; dragging TOWARD the center shrinks it.
        let signedDiag = 0;
        switch (d.handle) {
          case "se": signedDiag = dx + dy; break;
          case "nw": signedDiag = -(dx + dy); break;
          case "ne": signedDiag = dx - dy; break;
          case "sw": signedDiag = -dx + dy; break;
          default: return; // edges handled by handleEdgeMouseDown
        }
        const sens = 100 * previewScale;
        const delta = signedDiag / sens;
        if (onResize) {
          // Corner drag updates the proportional `scale` field only.
          // We no longer call onResize2D with the START scaleX/scaleY
          // values to "preserve" them — that caused React state
          // clobbering when both handlers cloned the same `data`
          // closure (the second setData would overwrite the first,
          // undoing the scale update). scaleX/scaleY now retain their
          // data-state values, which is the correct behavior: corner
          // = proportional, edge = axis-specific.
          const next = clampScale(d.startScale + delta);
          onResize(next);
        } else if (onResize2D) {
          // No `scale` field (caller passed only onResize2D, e.g. the
          // meet-the-speaker gradient overlay which has only
          // scaleX/scaleY). Corner drag updates BOTH scaleX and scaleY
          // proportionally. Use startScaleX as the base (the caller
          // should ensure scaleX is the "primary" axis or scaleX ===
          // scaleY at the start of the drag).
          const next = clampScale(d.startScaleX + delta);
          onResize2D(next, next);
        }
        // Show guide lines during resize (no snap).
        updateGuides(false);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMoveEv);
        window.removeEventListener("mouseup", onUp);
        if (guidesCtx) guidesCtx.setGuides([]);
      };
      window.addEventListener("mousemove", onMoveEv);
      window.addEventListener("mouseup", onUp);
    },
    [active, onResize, onResize2D, pos?.x, pos?.y, scale, scaleX, scaleY, previewScale, guidesCtx, updateGuides],
  );

  /** Mousedown on an EDGE handle (mid-top/bottom/left/right) → start
   *  axis-only resize. Edges update `scaleX` or `scaleY` only:
   *    - n / s → update scaleY (expand vertically)
   *    - e / w → update scaleX (expand horizontally)
   *  The proportional `scale` is NOT changed by edge drags.
   */
  const handleEdgeMouseDown = useCallback(
    (e: React.MouseEvent, handle: Handle8) => {
      if (!active) return;
      if (e.button !== 0) return;
      if (!onResize2D) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: pos?.x ?? 0,
        startPosY: pos?.y ?? 0,
        mode: "resize",
        handle,
        startScale: scale,
        startScaleX: scaleX ?? 1,
        startScaleY: scaleY ?? 1,
      };
      const onMoveEv = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d || d.mode !== "resize" || !d.handle) return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        const sens = 100 * previewScale;
        let nextScaleX = d.startScaleX;
        let nextScaleY = d.startScaleY;
        if (d.handle === "n" || d.handle === "s") {
          // Vertical edge → update scaleY only (expand vertically).
          const sign = d.handle === "s" ? 1 : -1;
          nextScaleY = clampScale(d.startScaleY + (sign * dy) / sens);
        } else if (d.handle === "e" || d.handle === "w") {
          // Horizontal edge → update scaleX only (expand horizontally).
          const sign = d.handle === "e" ? 1 : -1;
          nextScaleX = clampScale(d.startScaleX + (sign * dx) / sens);
        }
        onResize2D(nextScaleX, nextScaleY);
        updateGuides(false);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMoveEv);
        window.removeEventListener("mouseup", onUp);
        if (guidesCtx) guidesCtx.setGuides([]);
      };
      window.addEventListener("mousemove", onMoveEv);
      window.addEventListener("mouseup", onUp);
    },
    [active, onResize2D, pos?.x, pos?.y, scale, scaleX, scaleY, previewScale, guidesCtx, updateGuides],
  );

  // Build the computed style. When `pos` is set, override left/top in %.
  // When `pos` is NOT set, fall back to the caller's style (which may
  // use right/top or any other CSS).
  const computedStyle: React.CSSProperties = {
    ...(style || {}),
  };
  if (pos?.x !== undefined) {
    computedStyle.left = `${pos.x}%`;
    computedStyle.right = "auto";
  }
  if (pos?.y !== undefined) {
    computedStyle.top = `${pos.y}%`;
    computedStyle.bottom = "auto";
  }
  // Compose effective 2D scale: scale * (scaleX ?? 1), scale * (scaleY ?? 1).
  // When only `scale` is set, this reduces to `scale(scale, scale)` (uniform).
  // When scaleX/scaleY are also set, they apply on top of `scale` for
  // axis-specific expansion (edge handles).
  const effScaleX = scale * (scaleX ?? 1);
  const effScaleY = scale * (scaleY ?? 1);
  const isUniform = effScaleX === effScaleY;
  if (effScaleX !== 1 || effScaleY !== 1) {
    computedStyle.transform = isUniform
      ? `scale(${effScaleX})`
      : `scale(${effScaleX}, ${effScaleY})`;
    // When pos is set, we use left/top → anchor is top-left.
    // When pos is NOT set, respect the `anchor` prop (top-right for
    // right-anchored elements like QR/sponsors/branding so they don't
    // appear to shift when resized).
    const posIsSet = pos?.x !== undefined || pos?.y !== undefined;
    computedStyle.transformOrigin = posIsSet
      ? "top-left"
      : anchor === "top-right"
        ? "top-right"
        : "top-left";
  }
  if (active) {
    computedStyle.cursor = "grab";
    computedStyle.outline = `2px dashed ${accentColor}`;
    computedStyle.outlineOffset = "2px";
  }
  if (zIndex !== undefined) {
    computedStyle.zIndex = zIndex;
  }

  return (
    <div
      ref={boxRef}
      className={className}
      style={computedStyle}
      onMouseDown={handleBodyMouseDown}
      data-guide-box={active && guideId ? "true" : undefined}
      data-guide-id={active && guideId ? guideId : undefined}
    >
      {active && label && (
        <div
          style={{
            position: "absolute",
            top: "-22px",
            left: 0,
            background: accentColor,
            color: "white",
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "2px 6px",
            borderRadius: "3px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 40,
          }}
        >
          {label}
        </div>
      )}
      {children}
      {active && (onResize || onResize2D) && (
        <>
          {/* 4 CORNER handles — proportional resize (updates `scale`) */}
          <ResizeHandle8 handle="nw" onMouseDown={handleCornerMouseDown} />
          <ResizeHandle8 handle="ne" onMouseDown={handleCornerMouseDown} />
          <ResizeHandle8 handle="se" onMouseDown={handleCornerMouseDown} />
          <ResizeHandle8 handle="sw" onMouseDown={handleCornerMouseDown} />
        </>
      )}
      {active && onResize2D && (
        <>
          {/* 4 EDGE handles — axis-only resize (updates scaleX / scaleY).
              Mid-top/bottom = vertical expand; mid-left/right = horizontal expand.
              Rendered only when the caller supports 2D resize. */}
          <ResizeHandle8 handle="n" onMouseDown={handleEdgeMouseDown} />
          <ResizeHandle8 handle="s" onMouseDown={handleEdgeMouseDown} />
          <ResizeHandle8 handle="e" onMouseDown={handleEdgeMouseDown} />
          <ResizeHandle8 handle="w" onMouseDown={handleEdgeMouseDown} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  useScrollLockOnHover                                              */
/* ------------------------------------------------------------------ */

/**
 * Hook that attaches a non-passive `wheel` listener to a container ref.
 * When `active` is true, wheel events over the container are prevented
 * from scrolling the page (so the user can wheel-zoom images inside
 * the preview without the whole page jumping).
 *
 * When `active` is false, the listener is removed and normal scrolling
 * resumes.
 *
 * The listener is added with `{ passive: false }` so we can call
 * `preventDefault()`. React's synthetic onWheel is passive by default
 * in modern browsers, which is why we use a native listener.
 *
 * @param active Whether to lock scroll (typically `editMode || sectionsEditMode`).
 * @param externalRef Optional external ref to attach the listener to.
 *   When omitted, the hook creates its own ref and returns it. When
 *   provided, the hook uses that ref (so the caller can share the
 *   same element between this hook and other effects like ResizeObserver).
 * @returns The ref (either the hook's own or the external one).
 */
export function useScrollLockOnHover(
  active: boolean,
  externalRef?: React.RefObject<HTMLDivElement | null>,
) {
  const ownRef = useRef<HTMLDivElement | null>(null);
  const ref = externalRef ?? ownRef;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) return;

    const handler = (e: WheelEvent) => {
      // Always prevent default when active — the user is in edit mode
      // and the preview should NOT propagate scroll to the page.
      e.preventDefault();
      // Note: we do NOT stopPropagation — child elements (image zoom
      // handlers) may still want to receive the event via React's
      // synthetic onWheel, which fires separately from native.
    };

    // Add with passive:false so preventDefault works.
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
    };
  }, [active, ref]);

  return ref;
}

/* ------------------------------------------------------------------ */
/*  Preview toolbar button helpers                                    */
/* ------------------------------------------------------------------ */

/**
 * Shared button styles for the "Edit images" / "Edit sections" buttons
 * that live in the top-right of the preview box. Keeps the visual
 * style consistent across all 4 editors.
 */
export const previewButtonBase =
  "inline-flex items-center gap-1.5 rounded-md font-semibold px-3 py-1.5 text-xs transition";
export const previewButtonOn =
  "bg-[#0066FF] text-white hover:bg-[#0052CC]";
export const previewButtonOff =
  "border border-black/15 bg-white text-black hover:bg-black/5";
export const previewButtonSectionsOn =
  "bg-[#FF005A] text-white hover:bg-[#CC0048]";
export const previewButtonSectionsOff =
  "border border-black/15 bg-white text-black hover:bg-black/5";
