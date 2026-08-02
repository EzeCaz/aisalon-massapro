"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Copy,
  Check,
  Download,
  RotateCcw,
  Code,
  AlertCircle,
  ImageIcon,
  Calendar,
  Loader2,
  Wand2,
  FormInput,
  LayoutPanelTop,
  Save,
} from "lucide-react";
import { toPng } from "html-to-image";
import type {
  SpeakerIntroData,
  ImagePlacement,
  ImageSlot,
  EventPickListItem,
} from "./types";
import type { SectionId, SectionPos } from "../shared/section-edit";
import { CollapsibleFormPanel } from "../shared/section-edit";
import { SelectedElementPanel } from "../shared/selected-element-panel";
import { SAMPLE_DATA } from "./sample-data";
import { SpeakerIntroCanvas } from "./speaker-intro-canvas";
import { SpeakerIntroStyle2Canvas } from "./speaker-intro-style2-canvas";
import { ImagePickerModalShared as ImagePickerModal } from "../shared/image-picker-modal";
import { ShareButtons } from "../shared/share-buttons";
import { SpeakerIntroFormView } from "../shared/speaker-intro-form-view";
import {
  mapEventToSpeakerIntroData,
  type DbEventForMapping,
} from "./event-mapper";

/**
 * SpeakerIntroEditor — the editor + live preview surface.
 *
 * Layout:
 *   - Top toolbar: Event picker / Edit-mode toggle / JSON toggle / Reset / Copy / Download
 *   - Left panel: JSON editor (textarea-based, syntax-ish)
 *   - Right panel: Live mockup preview (scaled to fit) + error overlay
 *
 * Workflows:
 *   1. Pick an event from the dropdown → fetch /api/events/[slug] →
 *      mapEventToSpeakerIntroData → data is replaced.
 *   2. Toggle "Edit images" → image areas on the canvas become
 *      interactive. Click "Replace" to open the image picker.
 *      Drag to pan. Wheel to zoom. Double-click to reset.
 *   3. Edit JSON directly → canvas re-renders live.
 */

const STORAGE_KEY = "speaker-intro-data-v4";
// PER USER SPEC 2026-08-02 (TSK-0049): Per-style default storage keys.
// When the user clicks "Set as default" (in the properties panel or the
// toolbar next to Style 3), the ENTIRE current `data` is saved under
// `speaker-intro-style-defaults-{style}`. When the user clicks "Reset",
// if a saved default exists for the current style, it is loaded instead
// of SAMPLE_DATA.
const STYLE_DEFAULTS_KEY_PREFIX = "speaker-intro-style-defaults-";

type Props = {
  /** Lightweight event list for the dropdown (passed from server). */
  events: EventPickListItem[];
};

export function SpeakerIntroEditor({ events }: Props) {
  const [data, setData] = useState<SpeakerIntroData>(SAMPLE_DATA);
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(SAMPLE_DATA, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);
  /** View mode for the left panel: "form" (structured inputs) or "json" (raw textarea). */
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  // PER USER SPEC 2026-08-02 (TSK-0049): brief "Saved!" feedback shown on
  // the "Set as default" button after the user clicks it.
  const [savedDefaultFeedback, setSavedDefaultFeedback] = useState(false);
  const [previewScale, setPreviewScale] = useState<number>(0.5);
  /** Edit mode = image areas are interactive (drag/wheel/click). */
  const [editMode, setEditMode] = useState<boolean>(false);
  /** Sections edit mode = text sections are draggable + resizeable. */
  const [sectionsEditMode, setSectionsEditMode] = useState<boolean>(false);
  /** PER USER SPEC 2026-08-02 (TSK-0051): currently-selected element on the
   *  canvas. LIFTED from the canvases so the new "Selected Element" panel
   *  (top of the form column) can render content-specific fields for it.
   *  Both canvases write to this via onSelectChange. Reset to null when
   *  sectionsEditMode turns off (mirrors the old in-canvas behavior). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Currently selected event slug in the dropdown. */
  const [selectedEventSlug, setSelectedEventSlug] = useState<string>("");
  /** Loading state when fetching event data. */
  const [loadingEvent, setLoadingEvent] = useState(false);
  /** Image picker modal state. */
  const [pickerSlot, setPickerSlot] = useState<ImageSlot | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // --- helpers ---------------------------------------------------------

  // rafRef is declared BEFORE applyData so applyData can use it to debounce
  // JSON serialization. Without debouncing, every keystroke in the form
  // triggers a synchronous JSON.stringify — for large data objects this
  // causes noticeable typing lag.
  const rafRef = useRef<number | null>(null);

  /** Apply a new SpeakerIntroData object: update data + JSON + clear error.
   *  The JSON text update is debounced via requestAnimationFrame so rapid
   *  edits (e.g. typing in a form field) don't trigger a serialize on every
   *  single keystroke. */
  const applyData = useCallback((next: SpeakerIntroData) => {
    setData(next);
    setParseError(null);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }, []);

  /** Update a single image's URL based on its slot. */
  function applyImagePick(slot: ImageSlot, url: string): SpeakerIntroData {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "hero") {
      // Auto-hide the triangle overlay when the user picks a new hero image
      // (per user spec). They can re-enable it in the form/JSON editor.
      const prevUrl = next.heroOverlay.imageUrl;
      next.heroOverlay.imageUrl = url;
      if (prevUrl && url && prevUrl !== url) {
        next.heroOverlay.showTriangleOverlay = false;
        // Also reset the image placement (pan/zoom) so the new image starts
        // at default focus=50/50, zoom=1. Otherwise the previous image's
        // crop/zoom carries over to the new image, making it look "cropped
        // to the original size of the box" even after the user picks a
        // different image. (Per user spec 2026-06-30: "when selecting this
        // image as the hero image, actually crops the images... and even
        // when i scroll out and reduce the image, the crop still there".)
        next.heroOverlay.imagePlacement = { focusX: 50, focusY: 50, zoom: 1 };
      }
    } else if (slot.kind === "speaker") {
      const sp = next.speakers.sort((a, b) => a.order - b.order)[slot.index];
      if (sp) sp.photoUrl = url;
    } else if (slot.kind === "branding-asset") {
      // Bottom-LEFT branding asset (per user spec 2026-07-02). Replaceable
      // via the canvas Replace button or the form view URL input.
      next.brandingAsset = { ...(next.brandingAsset ?? {}), imageUrl: url };
    } else {
      const arr = slot.group === "collaborators" ? next.collaborators : next.sponsors;
      const item = arr[slot.index];
      if (item) item.logoUrl = url;
    }
    return next;
  }

  /** Update a single image's placement based on its slot. */
  function applyPlacementChange(
    slot: ImageSlot,
    placement: ImagePlacement,
  ): SpeakerIntroData {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "hero") {
      next.heroOverlay.imagePlacement = placement;
    } else if (slot.kind === "speaker") {
      const sp = next.speakers.sort((a, b) => a.order - b.order)[slot.index];
      if (sp) sp.photoPlacement = placement;
    }
    // sponsors use object-contain — no placement.
    return next;
  }

  /** Get the current URL for a slot (used to highlight current pick). */
  function urlForSlot(slot: ImageSlot): string | undefined {
    if (slot.kind === "hero") return data.heroOverlay.imageUrl;
    if (slot.kind === "speaker") {
      const sp = [...data.speakers].sort((a, b) => a.order - b.order)[slot.index];
      return sp?.photoUrl;
    }
    if (slot.kind === "branding-asset") {
      return data.brandingAsset?.imageUrl;
    }
    const arr = slot.group === "collaborators" ? data.collaborators : data.sponsors;
    return arr[slot.index]?.logoUrl;
  }

  // --- auto-scale preview ---------------------------------------------

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const compute = () => {
      const avail = el.clientWidth - 32;
      const scale = Math.min(1, Math.max(0.2, avail / 1200));
      setPreviewScale(scale);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode]);

  // --- localStorage hydration -----------------------------------------

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SpeakerIntroData;
        setData(parsed);
        setJsonText(JSON.stringify(parsed, null, 2));
      }
    } catch {
      // ignore — fall back to sample
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore quota errors
    }
  }, [data]);

  // PER USER SPEC 2026-08-02 (TSK-0051): reset the selected element when
  // sectionsEditMode turns off, so the "Selected Element" panel disappears
  // when the user exits section-edit mode. (Mirrors the old in-canvas
  // useEffect that did the same thing locally.)
  //
  // PER USER SPEC 2026-08-02 (TSK-0055): the panel now ALSO appears in
  // image-edit mode (for per-image selections like speaker photos, sponsor
  // logos, hero image, branding asset). So we only clear `selectedId` when
  // BOTH modes are off — turning off one mode shouldn't kill a selection
  // made in the other.
  useEffect(() => {
    if (!sectionsEditMode && !editMode) setSelectedId(null);
  }, [sectionsEditMode, editMode]);

  // --- JSON textarea → data ------------------------------------------

  const handleJsonChange = useCallback((next: string) => {
    setJsonText(next);
    try {
      const parsed = JSON.parse(next) as SpeakerIntroData;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Root must be an object");
      }
      if (!parsed.event || !parsed.speakers) {
        throw new Error("Missing required fields: event, speakers");
      }
      setData(parsed);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }, []);

  // --- event picker ---------------------------------------------------

  async function handleEventPick(slug: string) {
    setSelectedEventSlug(slug);
    if (!slug) return;
    setLoadingEvent(true);
    setParseError(null);
    try {
      const res = await fetch(`/api/events/${slug}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load event (HTTP ${res.status})`);
      }
      const json = (await res.json()) as { event: DbEventForMapping };
      const mapped = mapEventToSpeakerIntroData(json.event);
      applyData(mapped);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setLoadingEvent(false);
    }
  }

  // --- image picker callbacks ----------------------------------------

  function handlePickImage(slot: ImageSlot) {
    setPickerSlot(slot);
  }

  function handlePickerSelect(url: string) {
    if (!pickerSlot) return;
    const next = applyImagePick(pickerSlot, url);
    applyData(next);
    setPickerSlot(null);
  }

  function handlePlacementChange(slot: ImageSlot, placement: ImagePlacement) {
    // Don't call applyData here — it would re-render the JSON textarea on
    // every mousemove (janky). Instead, update data + JSON directly.
    const next = applyPlacementChange(slot, placement);
    setData(next);
    // Debounce the JSON textarea update via requestAnimationFrame.
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a resize drag to the data — updates the size multiplier on the
   *  targeted slot (imageScale for hero, photoSize for speaker, logoSize
   *  for sponsor). Same debounced-JSON pattern as handlePlacementChange. */
  function applySizeChange(slot: ImageSlot, newMultiplier: number): SpeakerIntroData {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "hero") {
      next.heroOverlay.imageScale = newMultiplier;
      next.heroOverlay.imageScaleY = newMultiplier;
    } else if (slot.kind === "speaker") {
      const sp = next.speakers.sort((a, b) => a.order - b.order)[slot.index];
      if (sp) sp.photoSize = newMultiplier;
    } else if (slot.kind === "branding-asset") {
      // Branding asset's size is stored as height-in-px (default 48).
      // The canvas renders the sizeMultiplier as (height/48), so on resize
      // we multiply 48 by the new multiplier to get the new height.
      next.brandingAsset = {
        ...(next.brandingAsset ?? {}),
        height: Math.max(8, Math.round(48 * newMultiplier)),
      };
    } else {
      const arr = slot.group === "collaborators" ? next.collaborators : next.sponsors;
      const item = arr[slot.index];
      if (item) item.logoSize = newMultiplier;
    }
    return next;
  }

  function handleSizeChange(slot: ImageSlot, newMultiplier: number) {
    const next = applySizeChange(slot, newMultiplier);
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }
  // --- section edit callbacks -----------------------------------------

  /** Apply a section move (drag) — updates data.sectionLayout[id].pos. */
  function handleSectionMove(id: SectionId, pos: SectionPos) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    if (!next.sectionLayout) next.sectionLayout = {};
    if (!next.sectionLayout[id]) next.sectionLayout[id] = {};
    next.sectionLayout[id]!.pos = pos;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a section resize — updates data.sectionLayout[id].scale. */
  function handleSectionResize(id: SectionId, scale: number) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    if (!next.sectionLayout) next.sectionLayout = {};
    if (!next.sectionLayout[id]) next.sectionLayout[id] = {};
    next.sectionLayout[id]!.scale = scale;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a section box resize (mid-edge handle) — updates
   *  data.sectionLayout[id].boxSize = { width, height } in canvas px. */
  function handleSectionBoxResize(id: SectionId, size: { width?: number; height?: number }) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    if (!next.sectionLayout) next.sectionLayout = {};
    if (!next.sectionLayout[id]) next.sectionLayout[id] = {};
    next.sectionLayout[id]!.boxSize = size;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a section z-index change (Front/Back in ObjectPropertiesPanel). */
  function handleSectionZChange(id: SectionId, z: number) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    if (!next.sectionLayout) next.sectionLayout = {};
    if (!next.sectionLayout[id]) next.sectionLayout[id] = {};
    next.sectionLayout[id]!.z = z;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a hero gradient shape change (shape type, colors, direction,
   *  opacity, rotation) — updates data.style2HeroGradient.
   *  PER USER SPEC 2026-07-31 (TSK-0026). */
  function handleHeroShapeChange(
    patch: Partial<NonNullable<SpeakerIntroData["style2HeroGradient"]>>,
  ) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    if (!next.style2HeroGradient) {
      next.style2HeroGradient = {
        shape: "rectangle",
        colors: ["#311B92", "#1A237E", "#0B0B2E"],
        direction: 180,
        opacity: 0.9,
        rotation: 0,
      };
    }
    Object.assign(next.style2HeroGradient, patch);
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a hero X scale change (slider). */
  function handleHeroScaleXChange(n: number) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    next.heroOverlay.imageScale = n;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a hero Y scale change (slider). */
  function handleHeroScaleYChange(n: number) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    next.heroOverlay.imageScaleY = n;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /**
   * Apply a hero boxSize change (W/H in canvas px) from the new Hero
   * Image Properties panel — PER USER SPEC 2026-07-31 (TSK-0032).
   * Updates `data.heroOverlay.boxSize`. When W/H are set, they override
   * the legacy imageScale/imageScaleY multipliers in the canvas.
   */
  const handleHeroBoxResize = useCallback(
    (size: { width?: number; height?: number }) => {
      const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
      next.heroOverlay.boxSize = {
        width: size.width && size.width > 0 ? size.width : undefined,
        height: size.height && size.height > 0 ? size.height : undefined,
      };
      // Clean up: if both are undefined, remove the field entirely.
      if (!next.heroOverlay.boxSize.width && !next.heroOverlay.boxSize.height) {
        delete next.heroOverlay.boxSize;
      }
      setData(next);
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setJsonText(JSON.stringify(next, null, 2));
        });
      }
    },
    [data],
  );

  /** Apply a hero z-index change (Front/Back button). */
  function handleHeroZChange(z: number) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    next.heroZ = z;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a triangle z-index change (Front/Back button). */
  function handleTriangleZChange(z: number) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    next.triangleZ = z;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a branding-asset position change — fires when the user drags
   *  the "⠿ Move branding" handle on the canvas. Updates
   *  `data.brandingAsset.pos` (free-form {x, y} as % of canvas). */
  function handleBrandingAssetPosChange(pos: { x: number; y: number }) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    next.brandingAsset = { ...(next.brandingAsset ?? {}), pos };
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a free-form position change for the hero image — fires when
   *  the user drags the "⠿ Move hero" grip bar on the canvas. Updates
   *  `data.heroOverlay.pos` (free-form {x, y} as % of canvas).
   *
   *  Per user spec 2026-07-04: "make sure i am able to drag with my
   *  mouse the hero image along the entire canvas and not only by using
   *  the Photo position (X%, Y%)". */
  const handleHeroPosChange = useCallback((pos: { x: number; y: number }) => {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    next.heroOverlay.pos = pos;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }, [data]);

  // --- toolbar actions ------------------------------------------------

  /**
   * PER USER SPEC 2026-08-02 (TSK-0049):
   * Save the ENTIRE current mockup state (style + all section properties +
   * image placements + hero gradient config + etc.) as the default for the
   * CURRENT style. Stored in localStorage under
   * `speaker-intro-style-defaults-{style}`. When the user later clicks
   * "Reset", this saved default is loaded instead of SAMPLE_DATA.
   *
   * This is LOCAL per-style default (browser-only). It is separate from
   * the per-event server-side default saved by `handleSaveAsDefault`
   * (which uploads a PNG snapshot + dataJson to the API).
   */
  const handleSetAsDefault = useCallback(() => {
    const style = data.style ?? "style1";
    const key = `${STYLE_DEFAULTS_KEY_PREFIX}${style}`;
    try {
      localStorage.setItem(key, JSON.stringify(data));
      setSavedDefaultFeedback(true);
      setTimeout(() => setSavedDefaultFeedback(false), 2000);
    } catch {
      // ignore quota errors
    }
  }, [data]);

  function handleReset() {
    const style = data.style ?? "style1";
    const key = `${STYLE_DEFAULTS_KEY_PREFIX}${style}`;
    let savedDefault: SpeakerIntroData | null = null;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        savedDefault = JSON.parse(saved) as SpeakerIntroData;
      }
    } catch {
      // ignore — fall through to SAMPLE_DATA
    }
    const msg = savedDefault
      ? `Reset to the saved default for "${style}"? Any local edits you've made will be lost.`
      : "Reset to the sample data? Any local edits you've made will be lost.";
    if (!confirm(msg)) {
      return;
    }
    applyData(savedDefault ?? SAMPLE_DATA);
    if (!savedDefault) {
      setSelectedEventSlug("");
    }
  }

  async function handleCopyJson() {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  /** Export the canvas to a PNG data URL (used by Share buttons + Download). */
  const getPngDataUrl = useCallback(async (): Promise<string> => {
    if (!canvasRef.current) {
      throw new Error("Canvas not ready");
    }
    return toPng(canvasRef.current, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#ffffff",
    });
  }, []);

  async function handleDownloadPng() {
    if (!canvasRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await getPngDataUrl();
      const link = document.createElement("a");
      const slug = data.event.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      link.download = `speaker-intro-${slug || "mockup"}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("PNG export failed:", err);
      alert("PNG export failed — see console for details.");
    } finally {
      setDownloading(false);
    }
  }

  /**
   * Save the current mockup as the speaker-intro default for the selected
   * event. Uploads the PNG snapshot to /admin/images (brand-assets) and
   * creates an EventMockupDefault row. The event page can then load this
   * default to show the speaker-intro image.
   */
  async function handleSaveAsDefault() {
    if (!data.event.sourceEventId) {
      alert("Please pick an event from the dropdown first — the mockup is saved per event.");
      return;
    }
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      const pngDataUrl = await getPngDataUrl();
      const res = await fetch(
        `/api/admin/events/${encodeURIComponent(data.event.sourceEventId)}/mockup-defaults`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "speaker-intro",
            dataJson: JSON.stringify(data),
            pngBase64: pngDataUrl,
          }),
        },
      );
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }
      alert(
        `✓ Saved as speaker-intro default for "${data.event.name}".\n\nThe PNG snapshot is now in /admin/images under brand-assets.`,
      );
    } catch (err) {
      console.error("Save as default failed:", err);
      alert(`Save as default failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  // --- visibility toggle ----------------------------------------------

  /**
   * Toggle a speaker's `visible` field. Updates both `data` and the JSON
   * textarea. Used by the per-row checkboxes in the speakers sidebar.
   */
  function toggleSpeakerVisible(sortedIdx: number) {
    const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
    const sp = next.speakers.sort((a, b) => a.order - b.order)[sortedIdx];
    if (!sp) return;
    sp.visible = sp.visible === false ? true : false;
    applyData(next);
  }

  // --- render ---------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Event picker row */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#FF005A]/20 bg-gradient-to-r from-[#FF005A]/[0.03] to-transparent p-3">
        <div className="flex items-center gap-2 text-sm font-bold text-black">
          <Calendar className="h-4 w-4 text-[#FF005A]" />
          Auto-fill from event:
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          <select
            value={selectedEventSlug}
            onChange={(e) => handleEventPick(e.target.value)}
            disabled={loadingEvent}
            className="flex-1 max-w-md rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm text-black disabled:opacity-50"
          >
            <option value="">
              {events.length === 0
                ? "No events found"
                : "— Pick an event to auto-fill all fields —"}
            </option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.slug}>
                {new Date(ev.startsAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                · {ev.title}
                {ev.venue ? ` @ ${ev.venue}` : ""}
              </option>
            ))}
          </select>
          {loadingEvent && (
            <Loader2 className="h-4 w-4 animate-spin text-[#FF005A]" />
          )}
        </div>
        {data.event.sourceEventSlug && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FF005A]/10 px-2 py-1 text-[0.65rem] font-semibold text-[#FF005A]">
            <Wand2 className="h-3 w-3" />
            Auto-filled from &ldquo;{data.event.name}&rdquo;
          </span>
        )}
        <span className="text-xs text-black/80">
          (you can still edit any field in the JSON below)
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white p-3">
        {/* Per TSK-0025: "Edit images" + "Edit sections" buttons moved OUT
            of the toolbar and into the canvas caption area (left of the
            Style 1/2/3 segmented buttons). All three canvas-interaction
            controls now live together as a single cluster right above the
            canvas. Toolbar keeps only the data/export actions:
            Form/JSON · Reset · Copy · Download · Save. */}
        {/* View-mode toggle: Form vs JSON */}
        <div className="inline-flex items-center rounded-md border border-black/15 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode("form")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "form"
                ? "bg-[#FF005A] text-white"
                : "text-black hover:bg-black/5"
            }`}
          >
            <FormInput className="h-3.5 w-3.5" />
            Form
          </button>
          <button
            type="button"
            onClick={() => setViewMode("json")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition border-l border-black/10 ${
              viewMode === "json"
                ? "bg-[#FF005A] text-white"
                : "text-black hover:bg-black/5"
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            JSON
          </button>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-md border border-black/15 bg-white text-black font-semibold px-3 py-1.5 text-xs hover:bg-black/5"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <button
          type="button"
          onClick={handleCopyJson}
          className="inline-flex items-center gap-1.5 rounded-md border border-black/15 bg-white text-black font-semibold px-3 py-1.5 text-xs hover:bg-black/5"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy JSON
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleDownloadPng}
          disabled={downloading || !!parseError}
          className="inline-flex items-center gap-1.5 rounded-md bg-black text-white font-semibold px-3 py-1.5 text-xs hover:bg-black/90 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? "Exporting…" : "Download"}
        </button>
        <button
          type="button"
          onClick={handleSaveAsDefault}
          disabled={saving || !!parseError || !data.event.sourceEventId}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] text-white font-semibold px-3 py-1.5 text-xs hover:bg-[#CC0048] disabled:opacity-50"
          title={
            data.event.sourceEventId
              ? `Save as speaker-intro default for "${data.event.name}"`
              : "Pick an event from the dropdown first"
          }
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save as event default"}
        </button>
        <ShareButtons
          getPngDataUrl={getPngDataUrl}
          title={`${data.event.name} — ${data.event.topic}`}
          filename={`speaker-intro-${(data.event.name || "mockup").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
        />
      </div>

      {/* Edit-mode hint */}
      {(editMode || sectionsEditMode) && (
        <div className="rounded-md border border-[#0066FF]/30 bg-[#0066FF]/5 px-3 py-2 text-xs text-[#0066FF]">
          {editMode && (
            <>
              <strong>Image edit mode is ON.</strong> Hover any image to see:
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                <li><strong>Replace</strong> button (top-left) — swap from brand library</li>
                <li><strong>4 corner handles</strong> (pink squares) — drag to resize the image</li>
                <li>Drag the image body to pan; scroll to zoom; double-click to reset</li>
                <li><strong>Click any image</strong> (hero, speaker photo, sponsor logo, branding) to open its edit panel above</li>
              </ul>
            </>
          )}
          {sectionsEditMode && (
            <div className={editMode ? "mt-3" : ""}>
              <strong>Section edit mode is ON.</strong>{" "}
              Drag any text section (header, topic, speakers, sponsors, branding) or the QR code to reposition. Drag the 8 pink handles (4 corners + 4 mid-edges) to resize. Layout persists in the JSON under <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.65rem]">sectionLayout</code>. Use the <strong>Hero layer</strong> Front/Back buttons at the bottom-left of the canvas to control whether the hero overlay sits above or below the text layers.
            </div>
          )}
        </div>
      )}

      {/* Speakers visibility sidebar — shown whenever there are speakers */}
      {data.speakers.length > 0 && (
        <div className="rounded-lg border border-black/15 bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-black uppercase tracking-wider">
              Speakers ({data.speakers.filter((s) => s.visible !== false).length}/
              {data.speakers.length} visible)
            </h3>
            <span className="text-[0.65rem] text-black/80">
              Ordered by session time · uncheck to hide on canvas
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[...data.speakers]
              .sort((a, b) => a.order - b.order)
              .map((speaker, idx) => {
                const isVisible = speaker.visible !== false;
                return (
                  <label
                    key={`${speaker.order}-${speaker.fullName}`}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition ${
                      isVisible
                        ? "border-black/15 bg-white hover:bg-black/[0.02]"
                        : "border-black/10 bg-black/[0.03] opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => toggleSpeakerVisible(idx)}
                      className="h-3.5 w-3.5 rounded border-black/30 text-[#FF005A] focus:ring-[#FF005A]/40"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-black truncate">
                        {speaker.fullName}
                      </span>
                      <span className="block text-[0.65rem] text-black/50 truncate">
                        {speaker.sessionTime && (
                          <span className="font-mono text-[#004F98]">{speaker.sessionTime}</span>
                        )}
                        {speaker.sessionTime && (speaker.title || speaker.company) ? " · " : ""}
                        {speaker.title}
                        {speaker.title && speaker.company ? ", " : ""}
                        {speaker.company}
                      </span>
                    </span>
                  </label>
                );
              })}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        {/* Left column: Selected Element panel (top) + Form/JSON editor (below).
         *  PER USER SPEC 2026-08-02 (TSK-0051): when the user clicks an
         *  element on the canvas (header, speakers, hero-image, logo, etc.),
         *  a compact "Selected Element" panel appears at the TOP of this
         *  column showing ONLY the content-specific fields for that element.
         *  The full form stays below (unchanged). */}
        <div className="flex flex-col gap-3">
          {/* PER USER SPEC 2026-08-02 (TSK-0051): Selected Element panel.
           *  Renders when an element is selected AND at least one edit mode
           *  is on. PER USER SPEC 2026-08-02 (TSK-0055): now also renders in
           *  image-edit mode — clicking a specific image on the canvas
           *  (speaker photo, sponsor logo, hero image, branding asset)
           *  triggers this panel with per-image edit fields (Replace
           *  button, URL, focus/zoom, size). */}
          {(sectionsEditMode || editMode) && selectedId && (
            <SelectedElementPanel
              selectedId={selectedId}
              data={data}
              onChange={(next) => applyData(next)}
              onPickImage={handlePickImage}
              onDeselect={() => setSelectedId(null)}
            />
          )}

          {/* Full form (or JSON editor) — collapsed by default per TSK-0050 */}
          {viewMode === "form" ? (
            <CollapsibleFormPanel
              title="speaker-intro.form"
              icon={<FormInput className="h-3.5 w-3.5 text-[#FF005A]" />}
            >
              <SpeakerIntroFormView
                data={data}
                onChange={(next) => applyData(next)}
              />
            </CollapsibleFormPanel>
          ) : (
            <CollapsibleFormPanel
              title="speaker-intro.data.json"
              icon={
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                </div>
              }
              dark
              error={parseError}
            >
              <textarea
                value={jsonText}
                onChange={(e) => handleJsonChange(e.target.value)}
                spellCheck={false}
                className="flex-1 min-h-[640px] w-full resize-none bg-[#0a0a0a] text-white/85 font-mono text-[0.72rem] leading-relaxed p-4 outline-none"
                style={{ tabSize: 2 }}
              />
              {parseError && (
                <div className="border-t border-[#FF5F56]/40 bg-[#FF5F56]/10 px-4 py-2.5 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-[#FF5F56] mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.7rem] font-mono text-[#FF5F56] break-words">
                      {parseError}
                    </p>
                    <p className="text-[0.65rem] text-white/40 mt-1">
                      The canvas still shows the last valid state — fix the JSON
                      to live-update.
                    </p>
                  </div>
                </div>
              )}
            </CollapsibleFormPanel>
          )}
        </div>

        {/* Right: live preview */}
        <div
          ref={previewContainerRef}
          className="relative rounded-lg border border-black/15 bg-gradient-to-br from-black/[0.03] to-black/[0.06] p-4 overflow-hidden"
        >
          {/* Canvas caption — moved ABOVE the canvas frame per TSK-0023 Phase 1.
              Per TSK-0024: Style 1/2/3 segmented buttons live here on the
              RIGHT side (replacing the previous "{scale}% scale · PNG export
              2400 × 1600" text).
              Per TSK-0025: "Edit images" + "Edit sections" buttons ALSO live
              here now, positioned to the LEFT of the Style buttons. All three
              canvas-interaction controls (Edit images, Edit sections, Style
              1/2/3) cluster together right above the canvas. */}
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="text-[0.7rem] font-semibold text-black/70">
              Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser
              <span className="ml-2 text-black/40 font-normal">
                · {Math.round(previewScale * 100)}% scale
              </span>
            </div>
            <div className="inline-flex items-center gap-2 flex-wrap">
              {/* Edit images + Edit sections — moved here from the toolbar per TSK-0025. */}
              <button
                type="button"
                onClick={() => setEditMode((s) => !s)}
                className={`inline-flex items-center gap-1.5 rounded-md font-semibold px-3 py-1.5 text-xs ${
                  editMode
                    ? "bg-[#0066FF] text-white hover:bg-[#0052CC]"
                    : "border border-black/15 bg-white text-black hover:bg-black/5"
                }`}
                title="Toggle image edit mode: drag/wheel/click on images to pan, zoom, and swap from the brand library."
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {editMode ? "Editing images" : "Edit images"}
              </button>
              <button
                type="button"
                onClick={() => setSectionsEditMode((s) => !s)}
                className={`inline-flex items-center gap-1.5 rounded-md font-semibold px-3 py-1.5 text-xs ${
                  sectionsEditMode
                    ? "bg-[#FF005A] text-white hover:bg-[#CC0048]"
                    : "border border-black/15 bg-white text-black hover:bg-black/5"
                }`}
                title="Toggle section edit mode: drag text sections and the QR code to reposition; drag handles to resize."
              >
                <LayoutPanelTop className="h-3.5 w-3.5" />
                {sectionsEditMode ? "Editing sections" : "Edit sections"}
              </button>
              {/* Style 1/2/3 segmented buttons (TSK-0024). */}
              <div className="inline-flex items-center rounded-md border border-black/15 bg-white overflow-hidden shadow-sm">
                {([
                  { value: "style1", label: "Style 1" },
                  { value: "style2", label: "Style 2" },
                  { value: "style3", label: "Style 3" },
                ] as const).map((opt, i) => {
                  const active = (data.style ?? "style1") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setData((prev) => ({ ...prev, style: opt.value }))}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold transition ${
                        i > 0 ? "border-l border-black/10" : ""
                      } ${
                        active
                          ? "bg-[#FF005A] text-white"
                          : "text-black hover:bg-black/5"
                      }`}
                      title={
                        opt.value === "style1"
                          ? "Style 1 — hero on right, text on left"
                          : opt.value === "style2"
                          ? "Style 2 — split-screen: speaker cards on left, hero on right"
                          : "Style 3 — exact duplicate of Style 1 (per user spec 2026-07-31)"
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {/* PER USER SPEC 2026-08-02 (TSK-0049): "Set as default"
                  button next to the Style 3 button. Saves the ENTIRE
                  current mockup state (style + all section properties +
                  image placements) as the default for the current style.
                  Click "Reset" to restore. */}
              <button
                type="button"
                onClick={handleSetAsDefault}
                className={`inline-flex items-center gap-1.5 rounded-md font-semibold px-3 py-1.5 text-xs transition ${
                  savedDefaultFeedback
                    ? "bg-[#27C93F] text-white"
                    : "border border-[#FF005A] bg-[#FF005A]/5 text-[#FF005A] hover:bg-[#FF005A]/10"
                }`}
                title={`Save the entire current style (${data.style ?? "style1"}) + all section properties as the default. Click Reset to restore.`}
              >
                {savedDefaultFeedback ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Saved!
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Set as default
                  </>
                )}
              </button>
            </div>
          </div>
          <div
            className="relative mx-auto"
            style={{
              width: `${1200 * previewScale}px`,
              height: `${800 * previewScale}px`,
            }}
          >
            <div
              className="absolute top-0 left-0 origin-top-left shadow-2xl"
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
                width: "1200px",
                height: "800px",
              }}
            >
              {/* PER USER SPEC 2026-07-31 (TSK-0028): "Intro speaker style 3
                  must be an exact duplicate of style one." So Style 1 AND
                  Style 3 both use the SpeakerIntroCanvas (Style 1), not the
                  Style 2 canvas. Only Style 2 uses SpeakerIntroStyle2Canvas. */}
              {data.style === "style2" ? (
                <SpeakerIntroStyle2Canvas
                  ref={canvasRef}
                  data={data}
                  editable={editMode}
                  sectionsEditable={sectionsEditMode}
                  previewScale={previewScale}
                  onPickImage={handlePickImage}
                  onPlacementChange={handlePlacementChange}
                  onSizeChange={handleSizeChange}
                  onSectionMove={handleSectionMove}
                  onSectionResize={handleSectionResize}
                  onSectionBoxResize={handleSectionBoxResize}
                  onSectionZChange={handleSectionZChange}
                  onHeroShapeChange={handleHeroShapeChange}
                  onHeroPosChange={handleHeroPosChange}
                  onSetAsDefault={handleSetAsDefault}
                  selectedId={selectedId}
                  onSelectChange={setSelectedId}
                />
              ) : (
                <SpeakerIntroCanvas
                  ref={canvasRef}
                  data={data}
                  editable={editMode}
                  sectionsEditable={sectionsEditMode}
                  previewScale={previewScale}
                  onPickImage={handlePickImage}
                  onPlacementChange={handlePlacementChange}
                  onSizeChange={handleSizeChange}
                  onSectionMove={handleSectionMove}
                  onSectionResize={handleSectionResize}
                  onSectionBoxResize={handleSectionBoxResize}
                  onHeroZChange={handleHeroZChange}
                  onTriangleZChange={handleTriangleZChange}
                  onHeroScaleXChange={handleHeroScaleXChange}
                  onHeroScaleYChange={handleHeroScaleYChange}
                  onHeroBoxResize={handleHeroBoxResize}
                  onSectionZChange={handleSectionZChange}
                  onBrandingAssetPosChange={handleBrandingAssetPosChange}
                  onHeroPosChange={handleHeroPosChange}
                  onSetAsDefault={handleSetAsDefault}
                  selectedId={selectedId}
                  onSelectChange={setSelectedId}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Component breakdown reminder */}
      <details className="rounded-lg border border-black/10 bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold text-black">
          Component breakdown (9 editable regions)
        </summary>
        <ol className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-black/70">
          <li><strong>1. Event Header</strong> — name, date, time, venue</li>
          <li><strong>2. Event Topic</strong> — main topic with accent bar</li>
          <li><strong>3. QR Code</strong> — points to qrCodeUrl</li>
          <li><strong>4. Speakers List</strong> — array of speaker cards</li>
          <li><strong>5. Hero Visual</strong> — Tel Aviv skyline + meerkat</li>
          <li><strong>6. Triangle Overlay</strong> — gradient triangles</li>
          <li><strong>7. Location Pins</strong> — labels + connector lines</li>
          <li><strong>8. Sponsors</strong> — collaborators + sponsors</li>
          <li><strong>9. Branding</strong> — ai salon wordmark</li>
        </ol>
        <p className="mt-3 text-xs text-black/50">
          Pick an event at the top to auto-fill everything. Toggle{" "}
          <strong>Edit images</strong> to swap photos/logos/hero from the
          brand library. Drag images on the canvas to pan; scroll to zoom.
          Edit any field in the JSON on the left and the canvas re-renders live.
        </p>
      </details>

      {/* Image picker modal */}
      <ImagePickerModal
        open={pickerSlot !== null}
        onClose={() => setPickerSlot(null)}
        onPick={handlePickerSelect}
        eventSlug={selectedEventSlug || data.event.sourceEventSlug || undefined}
        currentUrl={pickerSlot ? urlForSlot(pickerSlot) : undefined}
      />
    </div>
  );
}
