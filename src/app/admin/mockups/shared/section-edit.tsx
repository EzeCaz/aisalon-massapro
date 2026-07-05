"use client";

/**
 * Shared section-edit primitives — used by all three mockup canvases
 * (speaker-intro, meet-the-speaker, event-profile) to provide a
 * uniform "Edit sections" mode.
 *
 * What this module provides:
 *   - GuideContext / GuideProvider — a React context that lets every
 *     SectionBox register its DOM rect so peer boxes can compute
 *     snap guides against each other.
 *   - GuideOverlay — renders the cyan alignment guides (vertical /
 *     horizontal) at the canvas edges and centers, and against peer
 *     boxes, when a drag is in progress.
 *   - SectionBox — a wrapper that makes any region of the canvas
 *     draggable (move) and resizeable (4 corner handles). Stores its
 *     position as % of canvas width/height so it round-trips through
 *     JSON and survives preview-scale changes.
 *   - clampScale — clamp a scale factor to [0.01, 6].
 *   - ResizeHandle8 — an 8-direction resize handle (corners + mid-edges).
 *
 * Coordinate system:
 *   - pos.x / pos.y are in % of canvas width / height (0..100).
 *   - scale is a uniform multiplier (1 = default, 2 = double).
 *   - When a pos is set, the box's `left`/`top` are overridden to
 *     `${pos.x}%` / `${pos.y}%` and `right`/`bottom` are cleared.
 *   - When scale != 1, `transform: scale(s)` is applied with
 *     `transformOrigin` set based on the anchor.
 *
 * Layout persistence:
 *   The editor stores these under `data.sectionLayout[id] = { pos, scale }`
 *   so they round-trip through JSON. Missing ids = default position
 *   (defined by the JSX `style` prop on the SectionBox).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SectionId =
  | "header"
  | "topic"
  | "speakers"
  | "sponsors"
  | "collaborators"
  | "branding"
  | "qr"
  | "footer"
  | "title"
  | "subtitle"
  | "bio"
  | "expertise"
  | "photo"
  | "event-meta"
  | "agenda"
  | "description"
  | string; // allow custom ids per mockup

export type SectionPos = { x: number; y: number };

/** Per-section layout entry. `pos` is the drag position in % of canvas.
 *  `scale` is the uniform corner-scale multiplier. `boxSize` is the
 *  explicit width/height in canvas px set by mid-edge handle drags.
 *  `z` is the per-section z-index (set by Front/Back buttons in the
 *  ObjectPropertiesPanel). */
export type SectionLayoutEntry = {
  pos?: SectionPos;
  scale?: number;
  boxSize?: { width?: number; height?: number };
  z?: number;
};

export type SectionLayout = Partial<Record<SectionId, SectionLayoutEntry>>;

export type GuideLine =
  | { type: "vertical"; pos: number }
  | { type: "horizontal"; pos: number };

type GuideContextValue = {
  enabled: boolean;
  guides: GuideLine[];
  setGuides: (g: GuideLine[]) => void;
  registerBox: (id: string, el: HTMLElement | null) => void;
  getPeers: (id: string) => {
    rects: { id: string; rect: DOMRect }[];
    canvasRect: DOMRect | null;
  };
};

// ---------------------------------------------------------------------------
// clampScale — REMOVED upper limit per user spec 2026-06-28:
//   "All locks on component dimensions are removed. Users must have the
//    ability to freely drag, stretch, and reshape the width and height of
//    any image, text box, or section without restrictions."
//   The ONLY limitation is the canvas border (overflow-hidden clips any
//   bleed). We keep a tiny floor of 0.001 to prevent zero/negative values
//   that would break layout math, but there is NO upper cap.
// ---------------------------------------------------------------------------

/** Clamp a scale multiplier to [0.001, Infinity). No upper limit — the
 *  only real limit is the canvas border (overflow-hidden clips bleed). */
export function clampScale(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0.001;
  return n;
}

// ---------------------------------------------------------------------------
// Guide context
// ---------------------------------------------------------------------------

const GuideContext = createContext<GuideContextValue | null>(null);

function useGuideContext(): GuideContextValue | null {
  return useContext(GuideContext);
}

export function GuideProvider({
  children,
  canvasRef,
  enabled,
}: {
  children: ReactNode;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
}) {
  const boxesRef = useRef<Map<string, HTMLElement>>(new Map());
  const [guides, setGuides] = useState<GuideLine[]>([]);

  const registerBox = useCallback((id: string, el: HTMLElement | null) => {
    if (el) boxesRef.current.set(id, el);
    else boxesRef.current.delete(id);
  }, []);

  const getPeers = useCallback(
    (id: string) => {
      const rects: { id: string; rect: DOMRect }[] = [];
      boxesRef.current.forEach((el, k) => {
        if (k !== id) rects.push({ id: k, rect: el.getBoundingClientRect() });
      });
      return {
        rects,
        canvasRect: canvasRef.current?.getBoundingClientRect() ?? null,
      };
    },
    [canvasRef],
  );

  useEffect(() => {
    if (!enabled) setGuides([]);
  }, [enabled]);

  return (
    <GuideContext.Provider
      value={{ enabled, guides, setGuides, registerBox, getPeers }}
    >
      {children}
    </GuideContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Guide overlay
// ---------------------------------------------------------------------------

export function GuideOverlay() {
  const ctx = useGuideContext();
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

// ---------------------------------------------------------------------------
// computeGuides — given a dragged rect, canvas rect, and peer rects,
// return snap guides + snap deltas. Threshold is in % units (default 1.5).
// ---------------------------------------------------------------------------

function computeGuides(
  dragged: DOMRect,
  canvas: DOMRect,
  peers: DOMRect[],
  threshold = 1.5,
): { guides: GuideLine[]; snapX: number; snapY: number } {
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    return { guides: [], snapX: 0, snapY: 0 };
  }
  const left = ((dragged.left - canvas.left) / canvas.width) * 100;
  const right = ((dragged.right - canvas.left) / canvas.width) * 100;
  const cx = (left + right) / 2;
  const top = ((dragged.top - canvas.top) / canvas.height) * 100;
  const bottom = ((dragged.bottom - canvas.top) / canvas.height) * 100;
  const cy = (top + bottom) / 2;

  // Candidate vertical lines: canvas edges + centers + peer edges/centers
  const vCandidates: { pos: number; edge: "left" | "right" | "cx" }[] = [
    { pos: 0, edge: "left" },
    { pos: 50, edge: "cx" },
    { pos: 100, edge: "right" },
  ];
  for (const p of peers) {
    const pl = ((p.left - canvas.left) / canvas.width) * 100;
    const pr = ((p.right - canvas.left) / canvas.width) * 100;
    const pc = (pl + pr) / 2;
    vCandidates.push(
      { pos: pl, edge: "left" },
      { pos: pr, edge: "right" },
      { pos: pc, edge: "cx" },
    );
  }

  // Candidate horizontal lines: same idea
  const hCandidates: { pos: number; edge: "top" | "bottom" | "cy" }[] = [
    { pos: 0, edge: "top" },
    { pos: 50, edge: "cy" },
    { pos: 100, edge: "bottom" },
  ];
  for (const p of peers) {
    const pt = ((p.top - canvas.top) / canvas.height) * 100;
    const pb = ((p.bottom - canvas.top) / canvas.height) * 100;
    const pc = (pt + pb) / 2;
    hCandidates.push(
      { pos: pt, edge: "top" },
      { pos: pb, edge: "bottom" },
      { pos: pc, edge: "cy" },
    );
  }

  const guides: GuideLine[] = [];
  let snapX = 0;
  let snapY = 0;

  // Find closest vertical snap among {left, right, cx} × candidates
  let bestVDist = Infinity;
  let bestVPos = 0;
  let bestVEdge: "left" | "right" | "cx" | null = null;
  for (const cur of [
    { val: left, edge: "left" as const },
    { val: right, edge: "right" as const },
    { val: cx, edge: "cx" as const },
  ]) {
    for (const cand of vCandidates) {
      const d = Math.abs(cur.val - cand.pos);
      if (d < threshold && d < bestVDist) {
        bestVDist = d;
        bestVPos = cand.pos;
        bestVEdge = cur.edge;
      }
    }
  }
  if (bestVEdge) {
    guides.push({ type: "vertical", pos: bestVPos });
    snapX =
      bestVEdge === "left"
        ? bestVPos - left
        : bestVEdge === "right"
          ? bestVPos - right
          : bestVPos - cx;
  }

  // Find closest horizontal snap
  let bestHDist = Infinity;
  let bestHPos = 0;
  let bestHEdge: "top" | "bottom" | "cy" | null = null;
  for (const cur of [
    { val: top, edge: "top" as const },
    { val: bottom, edge: "bottom" as const },
    { val: cy, edge: "cy" as const },
  ]) {
    for (const cand of hCandidates) {
      const d = Math.abs(cur.val - cand.pos);
      if (d < threshold && d < bestHDist) {
        bestHDist = d;
        bestHPos = cand.pos;
        bestHEdge = cur.edge;
      }
    }
  }
  if (bestHEdge) {
    guides.push({ type: "horizontal", pos: bestHPos });
    snapY =
      bestHEdge === "top"
        ? bestHPos - top
        : bestHEdge === "bottom"
          ? bestHPos - bottom
          : bestHPos - cy;
  }

  return { guides, snapX, snapY };
}

// ---------------------------------------------------------------------------
// 8-direction ResizeHandle (corners + mid-edges)
// ---------------------------------------------------------------------------

export type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export function ResizeHandle8({
  handle,
  onMouseDown,
}: {
  handle: HandleDir;
  onMouseDown: (e: React.MouseEvent, handle: HandleDir) => void;
}) {
  const posClass =
    handle === "nw"
      ? "top-0 left-0"
      : handle === "n"
        ? "top-0 left-1/2 -translate-x-1/2"
        : handle === "ne"
          ? "top-0 right-0"
          : handle === "e"
            ? "top-1/2 right-0 -translate-y-1/2"
            : handle === "se"
              ? "bottom-0 right-0"
              : handle === "s"
                ? "bottom-0 left-1/2 -translate-x-1/2"
                : handle === "sw"
                  ? "bottom-0 left-0"
                  : "top-1/2 left-0 -translate-y-1/2";
  const cursorClass =
    handle === "nw" || handle === "se"
      ? "cursor-nwse-resize"
      : handle === "ne" || handle === "sw"
        ? "cursor-nesw-resize"
        : handle === "n" || handle === "s"
          ? "cursor-ns-resize"
          : "cursor-ew-resize";
  // Corner handles = SCALE (proportional). Pink squares.
  // Mid-edge handles = EXPAND PADDING (container only, content locked).
  //   Smaller cyan rounded bars so users can tell them apart at a glance.
  const isCorner =
    handle === "nw" || handle === "ne" ||
    handle === "se" || handle === "sw";
  if (isCorner) {
    return (
      <div
        onMouseDown={(e) => onMouseDown(e, handle)}
        className={`absolute ${posClass} ${cursorClass} z-30 w-3 h-3 bg-white border-2 border-[#FF005A] rounded-sm shadow-md opacity-100 transition`}
        style={{ pointerEvents: "auto" }}
        aria-label={`Scale ${handle} corner (proportional)`}
        title={`Scale ${handle} corner — drag to scale the whole section proportionally`}
      />
    );
  }
  // Mid-edge: a thin cyan bar. Long axis = the edge it sits on.
  const isHorizontalEdge = handle === "n" || handle === "s";
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, handle)}
      className={`absolute ${posClass} ${cursorClass} z-30 bg-[#00E6FF] border border-[#0099B8] shadow-md opacity-100 transition`}
      style={{
        pointerEvents: "auto",
        width: isHorizontalEdge ? "24px" : "4px",
        height: isHorizontalEdge ? "4px" : "24px",
        borderRadius: "2px",
      }}
      aria-label={`Expand ${handle} edge (padding only, content locked)`}
      title={`Expand ${handle} edge — drag to grow the container padding (content stays locked)`}
    />
  );
}

// ---------------------------------------------------------------------------
// SectionBox — the workhorse. Wraps a region of the canvas, makes it
// draggable + resizeable when `active` is true.
// ---------------------------------------------------------------------------

export type SectionPadding = { left?: number; right?: number; top?: number; bottom?: number };

/** Box size in canvas pixels (NOT screen px). When set, overrides the
 *  auto-shrink-to-fit behavior so the box has an explicit width/height.
 *  Set by mid-edge handle drags. */
export type SectionBoxSize = { width?: number; height?: number };

export function SectionBox({
  active = false,
  selected = false,
  pos,
  scale = 1,
  padding,
  boxSize,
  onMove,
  onResize,
  onPaddingChange,
  onBoxResize,
  onSelect,
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
}: {
  active?: boolean;
  /** Whether THIS box is the currently-selected one (shows handles + label).
   *  When false but `active` is true, the box shows a faint outline only. */
  selected?: boolean;
  pos?: SectionPos;
  scale?: number;
  /** Container padding (in px at canvas scale). Rarely used — prefer boxSize. */
  padding?: SectionPadding;
  /** Explicit box dimensions in canvas px. Set by mid-edge handle drags.
   *  When provided, the box no longer shrinks to fit content — it has the
   *  exact dimensions specified, and the content reflows inside. */
  boxSize?: SectionBoxSize;
  onMove?: (pos: SectionPos) => void;
  onResize?: (scale: number) => void;
  /** Legacy: called when mid-edge handle is dragged AND onBoxResize is not
   *  provided. Expands padding without scaling content. */
  onPaddingChange?: (padding: SectionPadding) => void;
  /** Preferred: called when a mid-edge handle is dragged. Updates the
   *  box's explicit width/height in canvas px. The box visibly grows /
   *  shrinks; content inside reflows. */
  onBoxResize?: (size: SectionBoxSize) => void;
  /** Called when the user clicks on this box (to make it the selected one).
   *  The editor should set its `selectedId` state to this box's guideId. */
  onSelect?: () => void;
  previewScale: number;
  canvasW: number;
  canvasH: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  accentColor?: string;
  label?: string;
  /** Which corner the box is anchored to (used for transformOrigin). */
  anchor?: "top-left" | "top-right";
  /** Id for guide-system registration (so peers can snap to it). */
  guideId?: string;
  zIndex?: number;
}) {
  const ctx = useGuideContext();
  const boxRef = useRef<HTMLDivElement>(null);

  // Register this box with the guide system so peers can snap to it.
  // Register ALL active boxes (not just selected) so snap guides work
  // against every visible region, not only the one being dragged.
  useEffect(() => {
    if (!ctx || !guideId) return;
    if (active) ctx.registerBox(guideId, boxRef.current);
    else ctx.registerBox(guideId, null);
    return () => ctx.registerBox(guideId, null);
  }, [ctx, guideId, active]);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    mode: "move" | "resize";
    handle?: HandleDir;
    startScale: number;
    startPadding?: SectionPadding;
    startBoxSize?: SectionBoxSize;
  } | null>(null);

  // Recompute guides during a drag/resize. Returns snap deltas in %.
  const recomputeGuides = useCallback(
    (isMove: boolean): { snapX: number; snapY: number } => {
      if (!ctx || !guideId || !boxRef.current) return { snapX: 0, snapY: 0 };
      const { rects, canvasRect } = ctx.getPeers(guideId);
      if (!canvasRect) {
        ctx.setGuides([]);
        return { snapX: 0, snapY: 0 };
      }
      const { guides, snapX, snapY } = computeGuides(
        boxRef.current.getBoundingClientRect(),
        canvasRect,
        rects.map((r) => r.rect),
      );
      ctx.setGuides(guides);
      return { snapX: isMove ? snapX : 0, snapY: isMove ? snapY : 0 };
    },
    [ctx, guideId],
  );

  // Move handler — also fires onSelect so clicking a box selects it.
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!active || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      // Select this box on click (even if no onMove, so the properties panel appears).
      onSelect?.();
      if (!onMove) return;
      const startX = pos?.x ?? 0;
      const startY = pos?.y ?? 0;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: startX,
        startPosY: startY,
        mode: "move",
        startScale: scale,
      };
      (e.currentTarget as HTMLElement).style.cursor = "grabbing";

      const onMove2 = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d || d.mode !== "move") return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        const pctX = (dx / (canvasW * previewScale)) * 100;
        const pctY = (dy / (canvasH * previewScale)) * 100;
        const nextX = d.startPosX + pctX;
        const nextY = d.startPosY + pctY;
        onMove({ x: nextX, y: nextY });
        const { snapX, snapY } = recomputeGuides(true);
        if (snapX !== 0 || snapY !== 0) {
          onMove({ x: nextX + snapX, y: nextY + snapY });
        }
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove2);
        window.removeEventListener("mouseup", onUp);
        const el = e.currentTarget as HTMLElement;
        if (el) el.style.cursor = selected ? "grab" : "default";
        ctx?.setGuides([]);
      };
      window.addEventListener("mousemove", onMove2);
      window.addEventListener("mouseup", onUp);
    },
    [active, selected, onMove, onSelect, pos?.x, pos?.y, scale, canvasW, canvasH, previewScale, ctx, recomputeGuides],
  );

  // Resize handler (8-direction)
  // CORNER HANDLES (nw/ne/se/sw) — scale the entire box uniformly.
  //   Dragging AWAY from the box center always GROWS it; dragging TOWARD
  //   the center always SHRINKS it. The SW/NE corner inversion fix is
  //   applied (previously these were inverted).
  //
  // MID-EDGE HANDLES (n/s/e/w) — directly change the box's WIDTH or
  //   HEIGHT in canvas px. The opposite edge is anchored:
  //     - n (north): bottom edge stays fixed; top edge follows cursor.
  //         → height increases AND pos.y decreases (so box grows upward).
  //     - s (south): top edge stays fixed; bottom edge follows cursor.
  //         → height increases, pos.y unchanged (box grows downward).
  //     - e (east): left edge stays fixed; right edge follows cursor.
  //         → width increases, pos.x unchanged (box grows rightward).
  //     - w (west): right edge stays fixed; left edge follows cursor.
  //         → width increases AND pos.x decreases (so box grows leftward).
  //   Content inside reflows; it is NOT scaled by mid-edge drags.
  //   No minimum size — the box can shrink to 0 if the user wishes.
  //   (User spec 2026-06-28: "All locks on component dimensions are removed.")
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandleDir) => {
      if (!active || e.button !== 0 || !onResize) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect?.();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: pos?.x ?? 0,
        startPosY: pos?.y ?? 0,
        mode: "resize",
        handle,
        startScale: scale,
        startPadding: padding ?? {},
        startBoxSize: boxSize ?? {},
      };

      const onMove2 = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d || d.mode !== "resize" || !d.handle) return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        const denom = 100 * previewScale;
        // CORNER HANDLES — scale the entire box uniformly.
        // The sign of the diagonal delta is normalized per corner so
        // that dragging AWAY from the box center always grows it and
        // dragging TOWARD the center always shrinks it.
        //
        // Edge cases fixed (user report):
        //   - SW (bottom-left): dragging down-left should grow, up-right
        //     should shrink. Previously the formula was inverted.
        //   - NE (top-right): dragging up-right should grow, down-left
        //     should shrink. Previously the formula was inverted.
        //
        // EDGE HANDLES (n/s/e/w) — directly change the box's WIDTH or
        // HEIGHT in canvas px. The opposite edge is ANCHORED:
        //   - n: bottom edge fixed; top follows cursor (adjust pos.y + height).
        //   - s: top edge fixed; bottom follows cursor (adjust height only).
        //   - e: left edge fixed; right follows cursor (adjust width only).
        //   - w: right edge fixed; left follows cursor (adjust pos.x + width).
        // Content inside reflows; it is NOT scaled.
        // NO minimum size — user spec 2026-06-28: "All locks on component
        // dimensions are removed." The box can shrink to 0.
        const isCorner =
          d.handle === "nw" || d.handle === "ne" ||
          d.handle === "se" || d.handle === "sw";
        if (isCorner) {
          let delta = 0;
          switch (d.handle) {
            case "se":
              // down-right grows
              delta = (dx + dy) / denom;
              break;
            case "nw":
              // up-left grows
              delta = -(dx + dy) / denom;
              break;
            case "ne":
              // up-right grows: dx>0 grows, dy<0 grows → dx - dy grows
              delta = (dx - dy) / denom;
              break;
            case "sw":
              // down-left grows: dx<0 grows, dy>0 grows → -dx + dy grows
              delta = (-dx + dy) / denom;
              break;
          }
          onResize(clampScale(d.startScale + delta));
        } else if (onBoxResize) {
          // PREFERRED: update explicit width/height in canvas px.
          // Drag distance in screen px → canvas px = deltaPx / previewScale.
          // No minimum size — the box can shrink to 0 (user spec 2026-06-28).
          const px = (deltaPx: number) => deltaPx / previewScale;
          const startSize: SectionBoxSize = d.startBoxSize ?? {};
          const next: SectionBoxSize = { ...startSize };
          // For n/w handles, we also need to adjust pos so the opposite edge
          // stays anchored. pos is in % of canvas, so we convert drag delta
          // from screen px to canvas %.
          const pct = (deltaPx: number) =>
            (deltaPx / (canvasW * previewScale)) * 100;
          const pctY = (deltaPx: number) =>
            (deltaPx / (canvasH * previewScale)) * 100;
          let nextPosX = d.startPosX;
          let nextPosY = d.startPosY;
          switch (d.handle) {
            case "n":
              // Dragging north handle UP should grow height, DOWN shrink.
              // Bottom edge anchored: pos.y decreases by drag amount,
              // height increases by same amount.
              next.height = Math.max(0, (startSize.height ?? 0) + px(-dy));
              nextPosY = d.startPosY + pctY(dy);
              break;
            case "s":
              // Dragging south handle DOWN should grow height, UP shrink.
              // Top edge anchored: pos.y unchanged, height grows.
              next.height = Math.max(0, (startSize.height ?? 0) + px(dy));
              break;
            case "e":
              // Dragging east handle RIGHT should grow width, LEFT shrink.
              // Left edge anchored: pos.x unchanged, width grows.
              next.width = Math.max(0, (startSize.width ?? 0) + px(dx));
              break;
            case "w":
              // Dragging west handle LEFT should grow width, RIGHT shrink.
              // Right edge anchored: pos.x decreases by drag amount,
              // width increases by same amount.
              next.width = Math.max(0, (startSize.width ?? 0) + px(-dx));
              nextPosX = d.startPosX + pct(dx);
              break;
          }
          onBoxResize(next);
          // If we adjusted pos (n or w handle), also call onMove so the
          // opposite edge stays visually anchored.
          if (onMove && (nextPosX !== d.startPosX || nextPosY !== d.startPosY)) {
            onMove({ x: nextPosX, y: nextPosY });
          }
        } else if (onPaddingChange) {
          // LEGACY fallback: expand padding (only when onBoxResize is not
          // provided by the canvas). Kept for backward compat.
          const px = (deltaPx: number) => deltaPx / previewScale;
          const startPad: SectionPadding = d.startPadding ?? {};
          const next: SectionPadding = { ...startPad };
          switch (d.handle) {
            case "n":
              next.top = Math.max(0, (startPad.top ?? 0) + px(-dy));
              break;
            case "s":
              next.bottom = Math.max(0, (startPad.bottom ?? 0) + px(dy));
              break;
            case "e":
              next.right = Math.max(0, (startPad.right ?? 0) + px(dx));
              break;
            case "w":
              next.left = Math.max(0, (startPad.left ?? 0) + px(-dx));
              break;
          }
          onPaddingChange(next);
        }
        recomputeGuides(false);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove2);
        window.removeEventListener("mouseup", onUp);
        ctx?.setGuides([]);
      };
      window.addEventListener("mousemove", onMove2);
      window.addEventListener("mouseup", onUp);
    },
    [active, onResize, onPaddingChange, onBoxResize, onMove, onSelect, padding, boxSize, pos?.x, pos?.y, scale, previewScale, canvasW, canvasH, ctx, recomputeGuides],
  );

  // Build the inline style, layering pos/scale overrides on top of the
  // caller-supplied style.
  const computedStyle: CSSProperties = { ...(style ?? {}) };
  if (pos?.x !== undefined) {
    computedStyle.left = `${pos.x}%`;
    computedStyle.right = "auto";
  }
  if (pos?.y !== undefined) {
    computedStyle.top = `${pos.y}%`;
    computedStyle.bottom = "auto";
  }
  if (scale !== 1) {
    computedStyle.transform = `scale(${scale})`;
    computedStyle.transformOrigin =
      pos?.x !== undefined || pos?.y !== undefined
        ? "top-left"
        : anchor === "top-right"
          ? "top-right"
          : "top-left";
  }
  // Mid-edge handle drags update the box's explicit width / height in
  // canvas px (preferred over the legacy padding approach). When set,
  // the box no longer shrinks to fit content — it has the dimensions
  // the user dragged to, and content reflows inside.
  //
  // IMPORTANT: when an explicit width/height is requested, we also clear
  // any inherited `maxWidth` / `maxHeight` from the caller-supplied style.
  // Otherwise the user types e.g. W=1000 but the box is clamped to the
  // 640px maxWidth baked into the canvas — making it look like the input
  // "does nothing". The user's explicit value always wins.
  if (boxSize && (boxSize.width || boxSize.height)) {
    if (boxSize.width) {
      computedStyle.width = `${boxSize.width}px`;
      computedStyle.maxWidth = "none";
    }
    if (boxSize.height) {
      computedStyle.height = `${boxSize.height}px`;
      computedStyle.maxHeight = "none";
    }
  }
  // Legacy padding support (kept for backward compat — rarely used now).
  if (padding && (padding.left || padding.right || padding.top || padding.bottom)) {
    computedStyle.paddingLeft = `${padding.left ?? 0}px`;
    computedStyle.paddingRight = `${padding.right ?? 0}px`;
    computedStyle.paddingTop = `${padding.top ?? 0}px`;
    computedStyle.paddingBottom = `${padding.bottom ?? 0}px`;
  }
  if (active) {
    computedStyle.cursor = selected ? "grab" : "pointer";
    // Selected box: solid 2px accent outline.
    // Non-selected (but active) box: faint 1px dashed outline so user can
    // see all editable regions but knows which one is selected.
    if (selected) {
      computedStyle.outline = `2px solid ${accentColor}`;
      computedStyle.outlineOffset = "2px";
    } else {
      computedStyle.outline = `1px dashed ${accentColor}66`;
      computedStyle.outlineOffset = "1px";
    }
  }
  if (zIndex !== undefined) computedStyle.zIndex = zIndex;

  return (
    <div
      ref={boxRef}
      className={className}
      style={computedStyle}
      onMouseDown={handleMouseDown}
      data-guide-box={active && guideId ? "true" : undefined}
      data-guide-id={active && guideId ? guideId : undefined}
    >
      {selected && label && (
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
      {selected && onResize && (
        <>
          <ResizeHandle8 handle="nw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle8 handle="n" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle8 handle="ne" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle8 handle="e" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle8 handle="se" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle8 handle="s" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle8 handle="sw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle8 handle="w" onMouseDown={handleResizeMouseDown} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayerControls — front/back z-order toggle for hero overlay layers.
// Used by the "hero overlay sections" front/back button the user asked for.
// ---------------------------------------------------------------------------

export type LayerZ = {
  /** Current z-index of the layer. */
  z: number;
  /** Setter that takes a new z-index. */
  setZ: (z: number) => void;
};

export function LayerFrontBackButtons({
  layer,
  peers,
  label,
}: {
  layer: LayerZ;
  /** All peer layers in the same stacking context (so we can find max/min). */
  peers: LayerZ[];
  label?: string;
}) {
  const bringToFront = () => {
    const max = Math.max(...peers.map((p) => p.z), 0);
    if (layer.z < max) layer.setZ(max + 1);
  };
  const sendToBack = () => {
    const min = Math.min(...peers.map((p) => p.z), 0);
    if (layer.z > min) layer.setZ(min - 1);
  };
  return (
    <div className="inline-flex items-center gap-1">
      {label && (
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-black/80 mr-1">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={bringToFront}
        title="Bring this layer to the front"
        className="rounded border border-black/15 bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-black hover:bg-black/5"
      >
        Front
      </button>
      <button
        type="button"
        onClick={sendToBack}
        title="Send this layer to the back"
        className="rounded border border-black/15 bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-black hover:bg-black/5"
      >
        Back
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeroOverlayControl — floating panel that bundles the 3 hero controls the
// user asked for into one place:
//   1. X image scale slider  (0.05× – 10×) — only limit is the canvas border
//   2. Y image scale slider  (0.05× – 10×) — only limit is the canvas border
//   3. Front / Back layer buttons (z-index toggle)
//
// IMPORTANT (user spec, 2026-06-28):
//   The X/Y sliders must NOT impose any arbitrary min/max limit. The ONLY
//   limitation is the border of the entire mockup box — i.e. the canvas
//   container has `overflow: hidden`, so any portion of the hero image
//   that exceeds the canvas is simply clipped by the canvas border.
//   The user is free to scale up (bleed off-canvas, clipped by border)
//   or scale down (shrink within the canvas) as they wish.
//
// Each slider is paired with a numeric input box so the user can type
// an exact value (e.g. 0.13, 7.5) for fine control beyond what the
// slider's 0.05 step provides.
//
// Drop it into any canvas inside the section-edit overlay. It anchors to
// the top-left of the canvas (just below the Live Preview toolbar).
//
// Usage:
//   <HeroOverlayControl
//     label="Hero"
//     scaleX={data.heroOverlay.imageScale ?? 1}
//     scaleY={data.heroOverlay.imageScaleY ?? 1}
//     onScaleXChange={(n) => applyHeroScaleX(n)}
//     onScaleYChange={(n) => applyHeroScaleY(n)}
//     z={heroZ}
//     onZChange={(n) => onHeroZChange?.(n)}
//     peers={[{ z: heroZ, setZ: onHeroZChange }, { z: triangleZ, setZ: onTriangleZChange }]}
//   />
// ---------------------------------------------------------------------------

/** Slider min/max for hero image scale. The only hard limit is the canvas
 *  border (overflow-hidden on the canvas container clips any bleed). We
 *  allow 0.05× (essentially invisible) up to 10× (very large bleed).
 *  Values outside this range are still respected if entered via the
 *  numeric input box. */
const HERO_SCALE_SLIDER_MIN = 0.05;
const HERO_SCALE_SLIDER_MAX = 10;

export function HeroOverlayControl({
  label,
  scaleX,
  scaleY,
  onScaleXChange,
  onScaleYChange,
  z,
  onZChange,
  peers,
  showScaleX = true,
  showScaleY = true,
  showFrontBack = true,
}: {
  label?: string;
  /** Current X scale (1 = default). */
  scaleX?: number;
  /** Current Y scale (1 = default). */
  scaleY?: number;
  onScaleXChange?: (n: number) => void;
  onScaleYChange?: (n: number) => void;
  /** Current z-index of the layer. */
  z?: number;
  onZChange?: (n: number) => void;
  /** Peer layers in the same stacking context — needed for Front/Back to
   *  compute max/min z. If omitted, Front/Back just increments/decrements
   *  the current z by 1. */
  peers?: LayerZ[];
  showScaleX?: boolean;
  showScaleY?: boolean;
  showFrontBack?: boolean;
}) {
  const sx = scaleX ?? 1;
  const sy = scaleY ?? 1;
  const bringToFront = () => {
    if (!onZChange) return;
    if (peers && peers.length > 0) {
      const max = Math.max(...peers.map((p) => p.z), 0);
      if ((z ?? 0) < max) onZChange(max + 1);
    } else {
      onZChange((z ?? 0) + 1);
    }
  };
  const sendToBack = () => {
    if (!onZChange) return;
    if (peers && peers.length > 0) {
      const min = Math.min(...peers.map((p) => p.z), 0);
      if ((z ?? 0) > min) onZChange(min - 1);
    } else {
      onZChange(Math.max(0, (z ?? 0) - 1));
    }
  };
  return (
    <div className="rounded-md border border-black/15 bg-white/95 backdrop-blur px-2 py-1.5 shadow-md flex items-center gap-2 flex-wrap max-w-[560px]">
      {label && (
        <span className="text-[0.6rem] font-bold uppercase tracking-wider text-black/50 mr-1">
          {label}
        </span>
      )}
      {showScaleX && onScaleXChange && (
        <label className="inline-flex items-center gap-1">
          <span className="text-[0.6rem] font-semibold text-black/80">X</span>
          <input
            type="range"
            min={HERO_SCALE_SLIDER_MIN}
            max={HERO_SCALE_SLIDER_MAX}
            step={0.05}
            value={Math.min(HERO_SCALE_SLIDER_MAX, Math.max(HERO_SCALE_SLIDER_MIN, sx))}
            onChange={(e) => onScaleXChange(parseFloat(e.target.value))}
            className="w-20 h-1 accent-[#FF005A]"
            title={`Horizontal image scale: ${sx.toFixed(2)}× — only limit is the canvas border`}
          />
          <input
            type="number"
            min={0.01}
            step={0.05}
            value={Number(sx.toFixed(2))}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) onScaleXChange(n);
            }}
            className="w-12 text-[0.6rem] font-mono text-black/70 border border-black/15 rounded px-1 py-0.5 bg-white"
            title="Exact X scale (no arbitrary limit — only the canvas border clips)"
          />
          <span className="text-[0.6rem] font-mono text-black/80">×</span>
        </label>
      )}
      {showScaleY && onScaleYChange && (
        <label className="inline-flex items-center gap-1">
          <span className="text-[0.6rem] font-semibold text-black/80">Y</span>
          <input
            type="range"
            min={HERO_SCALE_SLIDER_MIN}
            max={HERO_SCALE_SLIDER_MAX}
            step={0.05}
            value={Math.min(HERO_SCALE_SLIDER_MAX, Math.max(HERO_SCALE_SLIDER_MIN, sy))}
            onChange={(e) => onScaleYChange(parseFloat(e.target.value))}
            className="w-20 h-1 accent-[#FF005A]"
            title={`Vertical image scale: ${sy.toFixed(2)}× — only limit is the canvas border`}
          />
          <input
            type="number"
            min={0.01}
            step={0.05}
            value={Number(sy.toFixed(2))}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) onScaleYChange(n);
            }}
            className="w-12 text-[0.6rem] font-mono text-black/70 border border-black/15 rounded px-1 py-0.5 bg-white"
            title="Exact Y scale (no arbitrary limit — only the canvas border clips)"
          />
          <span className="text-[0.6rem] font-mono text-black/80">×</span>
        </label>
      )}
      {showFrontBack && onZChange && (
        <div className="inline-flex items-center gap-0.5 ml-1">
          <button
            type="button"
            onClick={bringToFront}
            title={`Bring ${label ?? "layer"} to front`}
            className="rounded border border-black/15 bg-white px-1.5 py-0.5 text-[0.6rem] font-semibold text-black hover:bg-black/5"
          >
            Front
          </button>
          <button
            type="button"
            onClick={sendToBack}
            title={`Send ${label ?? "layer"} to back`}
            className="rounded border border-black/15 bg-white px-1.5 py-0.5 text-[0.6rem] font-semibold text-black hover:bg-black/5"
          >
            Back
          </button>
          <span className="text-[0.6rem] font-mono text-black/80 ml-0.5">z={z ?? 0}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// useNonPassiveWheel — attach a non-passive wheel listener to a ref so we
// can call preventDefault() on wheel events over hovered images/components
// and STOP the parent workspace from scrolling while the user is zooming
// or adjusting a hovered element.
//
// React's onWheel is passive by default in modern browsers, which means
// e.preventDefault() inside an onWheel handler logs a warning and does
// nothing. The only way to actually prevent the parent from scrolling is
// to attach a native 'wheel' listener with { passive: false }.
//
// Usage:
//   const ref = useRef<HTMLDivElement>(null);
//   useNonPassiveWheel(ref, (e) => { e.preventDefault(); ... });
// ---------------------------------------------------------------------------

export function useNonPassiveWheel(
  ref: React.RefObject<HTMLElement | null>,
  handler: (e: WheelEvent) => void,
  enabled: boolean = true,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    // Attach via addEventListener with { passive: false } so preventDefault
    // actually works. This is the only way to stop the parent workspace
    // from scrolling when the user spins the wheel over a hovered image.
    const listener = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    };
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, [ref, handler, enabled]);
}

// ---------------------------------------------------------------------------
// useCanvasScrollIsolation — attach a non-passive wheel listener to the
// canvas root that calls preventDefault() to stop the parent workspace
// (the scrollable editor panel) from scrolling when the user spins the
// wheel over the canvas.
//
// This is the "Scroll Isolation" fix from user spec 2026-06-28:
//   "Disable parent/window scrolling when the mouse is hovering over an
//    element or actively editing a component on the canvas."
//
// Usage:
//   const canvasRef = useRef<HTMLDivElement>(null);
//   useCanvasScrollIsolation(canvasRef, sectionsEditable);
// ---------------------------------------------------------------------------
export function useCanvasScrollIsolation(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean = true,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const listener = (e: WheelEvent) => {
      // Always prevent the parent from scrolling when the wheel spins
      // over the canvas. The canvas itself doesn't scroll (it's a fixed
      // mockup preview), so there's no reason to let the event bubble.
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, [ref, enabled]);
}

// ---------------------------------------------------------------------------
// ObjectPropertiesPanel — floating panel that shows the properties of the
// currently-selected section. Per user spec 2026-06-28:
//   "Every selected element (image or section) must display an active
//    properties panel (or floating tooltip) containing:
//      - Positioning: X and Y coordinate inputs for precise placement.
//      - Layering: Front and Back toggles to reorder the z-index."
//
// Drop this into any canvas inside the section-edit overlay. It anchors to
// the top-right of the canvas so it doesn't overlap the HeroOverlayControl
// (which sits top-left).
//
// Usage:
//   {selectedId && (
//     <ObjectPropertiesPanel
//       label="Header"
//       pos={data.sectionLayout?.[selectedId]?.pos}
//       onPosChange={(p) => onSectionMove?.(selectedId, p)}
//       z={data.sectionLayout?.[selectedId]?.z ?? defaultZ}
//       onZChange={(z) => onSectionZChange?.(selectedId, z)}
//       onDeselect={() => setSelectedId(null)}
//     />
//   )}
// ---------------------------------------------------------------------------

export function ObjectPropertiesPanel({
  label,
  pos,
  onPosChange,
  z,
  onZChange,
  peers,
  onDeselect,
  showBoxSize = true,
  boxSize,
  onBoxSizeChange,
  scale,
  onScaleChange,
}: {
  label?: string;
  pos?: SectionPos;
  onPosChange?: (pos: SectionPos) => void;
  /** Current z-index of the selected element. */
  z?: number;
  /** Called when Front/Back is clicked. */
  onZChange?: (z: number) => void;
  /** Peer z-indices in the same stacking context (for Front/Back to compute
   *  max/min). If omitted, Front/Back just increments/decrements by 1. */
  peers?: number[];
  /** Called when the user clicks the × close button. */
  onDeselect?: () => void;
  /** Show width/height inputs (for mid-edge-resized boxes).
   *  Defaults to true — users should always be able to type a precise
   *  width/height for the selected section, even before dragging a handle. */
  showBoxSize?: boolean;
  boxSize?: SectionBoxSize;
  onBoxSizeChange?: (size: SectionBoxSize) => void;
  /** Uniform scale multiplier (1 = 100%). Applied via CSS transform on the
   *  SectionBox, so it scales BOTH the container AND its contents (text +
   *  images) together. Use this to grow/shrink the whole element. */
  scale?: number;
  /** Called when the user types a new scale percentage (e.g. 150 = 150%). */
  onScaleChange?: (scale: number) => void;
}) {
  const px = pos?.x ?? 0;
  const py = pos?.y ?? 0;
  const bw = boxSize?.width ?? 0;
  const bh = boxSize?.height ?? 0;
  const sc = scale ?? 1;

  const bringToFront = () => {
    if (!onZChange) return;
    if (peers && peers.length > 0) {
      const max = Math.max(...peers, 0);
      if ((z ?? 0) <= max) onZChange(max + 1);
    } else {
      onZChange((z ?? 0) + 1);
    }
  };
  const sendToBack = () => {
    if (!onZChange) return;
    if (peers && peers.length > 0) {
      const min = Math.min(...peers, 0);
      if ((z ?? 0) >= min) onZChange(min - 1);
    } else {
      onZChange((z ?? 0) - 1);
    }
  };

  return (
    <div
      className="absolute rounded-md border-2 border-[#FF005A] bg-white shadow-xl"
      style={{ right: "12px", top: "12px", zIndex: 9998, minWidth: "220px" }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between bg-[#FF005A] text-white px-2 py-1 rounded-t-md">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider">
          {label ?? "Element"} Properties
        </span>
        {onDeselect && (
          <button
            type="button"
            onClick={onDeselect}
            className="text-white/80 hover:text-white text-[0.8rem] leading-none ml-2"
            title="Deselect"
            aria-label="Deselect"
          >
            ×
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-2 py-2 flex flex-col gap-2">
        {/* Positioning: X / Y coordinate inputs */}
        <div>
          <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
            Position (% of canvas)
          </div>
          <div className="flex items-center gap-1.5">
            <label className="inline-flex items-center gap-1 flex-1">
              <span className="text-[0.6rem] font-semibold text-black/80 w-3">X</span>
              <input
                type="number"
                step="0.1"
                value={Number(px.toFixed(1))}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n)) onPosChange?.({ x: n, y: py });
                }}
                className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                title="X position as % of canvas width"
              />
            </label>
            <label className="inline-flex items-center gap-1 flex-1">
              <span className="text-[0.6rem] font-semibold text-black/80 w-3">Y</span>
              <input
                type="number"
                step="0.1"
                value={Number(py.toFixed(1))}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n)) onPosChange?.({ x: px, y: n });
                }}
                className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                title="Y position as % of canvas height"
              />
            </label>
          </div>
        </div>

        {/* Box size (width / height in canvas px).
         *  Always shown by default so users can type a precise size for the
         *  selected section — they no longer have to drag a mid-edge handle
         *  first just to reveal the inputs. Typing a value here visibly
         *  grows/shrinks the container; content inside reflows. To grow the
         *  TEXT together with the box, use the Scale % input below. */}
        {showBoxSize && onBoxSizeChange && (
          <div>
            <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
              Size (canvas px) — box dimensions
            </div>
            <div className="flex items-center gap-1.5">
              <label className="inline-flex items-center gap-1 flex-1">
                <span className="text-[0.6rem] font-semibold text-black/80 w-3">W</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="auto"
                  value={bw > 0 ? Math.round(bw) : ""}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (Number.isFinite(n) && n >= 0)
                      onBoxSizeChange({ ...boxSize, width: n });
                  }}
                  className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                  title="Width in canvas pixels. Empty = auto-fit content."
                />
              </label>
              <label className="inline-flex items-center gap-1 flex-1">
                <span className="text-[0.6rem] font-semibold text-black/80 w-3">H</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="auto"
                  value={bh > 0 ? Math.round(bh) : ""}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (Number.isFinite(n) && n >= 0)
                      onBoxSizeChange({ ...boxSize, height: n });
                  }}
                  className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                  title="Height in canvas pixels. Empty = auto-fit content."
                />
              </label>
            </div>
          </div>
        )}

        {/* Scale % — uniform scale multiplier for the entire element
         *  (box + text + images). Uses CSS transform: scale(N) so EVERYTHING
         *  grows/shrinks together. 100% = default. Type 150 to make the whole
         *  element 1.5× bigger, 50 to halve it. */}
        {onScaleChange && (
          <div>
            <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
              Scale % (box + text together)
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="1"
                min="1"
                value={Math.round(sc * 100)}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n) && n > 0)
                    onScaleChange(n / 100);
                }}
                className="w-full text-[0.65rem] font-mono border border-black/15 rounded px-1 py-0.5 bg-white"
                title="Scale percentage — 100 = default size, 150 = 1.5× bigger, 50 = half size. Scales the entire element (box + text + images)."
              />
              <span className="text-[0.6rem] font-semibold text-black/80">%</span>
              <button
                type="button"
                onClick={() => onScaleChange(1)}
                title="Reset to 100%"
                className="rounded border border-black/15 bg-white px-1.5 py-0.5 text-[0.55rem] font-semibold text-black hover:bg-black/5"
              >
                100%
              </button>
            </div>
          </div>
        )}

        {/* Layering: Front / Back toggles */}
        {onZChange && (
          <div>
            <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/80 mb-1">
              Layer (z-index: {z ?? 0})
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={bringToFront}
                title="Bring this element to the front"
                className="flex-1 rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
              >
                ↑ Front
              </button>
              <button
                type="button"
                onClick={sendToBack}
                title="Send this element to the back"
                className="flex-1 rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
              >
                ↓ Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

