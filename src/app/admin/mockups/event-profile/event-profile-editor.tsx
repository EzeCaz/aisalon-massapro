"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Copy, Check, Download, RotateCcw, Code, AlertCircle,
  ImageIcon, Calendar, Loader2, Wand2, FormInput, LayoutPanelTop, Save,
} from "lucide-react";
import { toPng } from "html-to-image";
import type {
  EventProfileData,
  ImagePlacement,
  ImageSlot,
  EventPickListItem,
} from "./types";
import type { SectionId, SectionPos } from "../shared/section-edit";
import { SAMPLE_DATA } from "./sample-data";
import { EventProfileCanvas } from "./event-profile-canvas";
import { ImagePickerModalShared as ImagePickerModal } from "../shared/image-picker-modal";
import { ShareButtons } from "../shared/share-buttons";
import { EventProfileFormView } from "../shared/event-profile-form-view";
import {
  mapEventToEventProfileData,
  type DbEventForMapping,
} from "./event-mapper";

/**
 * EventProfileEditor — interactive editor for the Event Profile mockup.
 *
 * Mirrors the architecture of SpeakerIntroEditor:
 *   1. Pick an event from the dropdown → auto-fill all fields from DB.
 *      BREAK / NETWORKING / CHECKIN sessions auto-set visible=false.
 *   2. Toggle "Edit images" → drag/wheel/click to swap photos + hero.
 *   3. Edit JSON directly for fine-grained control.
 *   4. Per-row visibility checkboxes for sessions + speakers.
 *   5. Download print-quality PNG (2400×3000 at 2× DPR).
 */

const STORAGE_KEY = "event-profile-data-v1";

type Props = {
  events: EventPickListItem[];
};

export function EventProfileEditor({ events }: Props) {
  const [data, setData] = useState<EventProfileData>(SAMPLE_DATA);
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(SAMPLE_DATA, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);
  /** View mode for the left panel: "form" (structured inputs) or "json" (raw textarea). */
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewScale, setPreviewScale] = useState<number>(0.32);
  const [editMode, setEditMode] = useState<boolean>(false);
  /** Sections edit mode = text sections are draggable + resizeable. */
  const [sectionsEditMode, setSectionsEditMode] = useState<boolean>(false);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string>("");
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<ImageSlot | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const applyData = useCallback((next: EventProfileData) => {
    setData(next);
    setParseError(null);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }, []);

  function applyImagePick(slot: ImageSlot, url: string): EventProfileData {
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "hero") {
      next.heroOverlay.imageUrl = url;
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

  function applyPlacementChange(
    slot: ImageSlot,
    placement: ImagePlacement,
  ): EventProfileData {
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "hero") {
      next.heroOverlay.imagePlacement = placement;
    } else if (slot.kind === "speaker") {
      const sp = next.speakers.sort((a, b) => a.order - b.order)[slot.index];
      if (sp) sp.photoPlacement = placement;
    }
    return next;
  }

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

  // Auto-scale preview
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const compute = () => {
      const avail = el.clientWidth - 32;
      const scale = Math.min(0.45, Math.max(0.15, avail / 1200));
      setPreviewScale(scale);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode]);

  // localStorage hydration
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as EventProfileData;
        setData(parsed);
        setJsonText(JSON.stringify(parsed, null, 2));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }, [data]);

  const handleJsonChange = useCallback((next: string) => {
    setJsonText(next);
    try {
      const parsed = JSON.parse(next) as EventProfileData;
      if (!parsed || typeof parsed !== "object") throw new Error("Root must be an object");
      if (!parsed.event || !parsed.sessions || !parsed.speakers) {
        throw new Error("Missing required fields: event, sessions, speakers");
      }
      setData(parsed);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }, []);

  async function handleEventPick(slug: string) {
    setSelectedEventSlug(slug);
    if (!slug) return;
    setLoadingEvent(true);
    setParseError(null);
    try {
      const res = await fetch(`/api/events/${slug}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load event (HTTP ${res.status})`);
      const json = (await res.json()) as { event: DbEventForMapping };
      const mapped = mapEventToEventProfileData(json.event);
      applyData(mapped);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setLoadingEvent(false);
    }
  }

  function handlePickImage(slot: ImageSlot) { setPickerSlot(slot); }
  function handlePickerSelect(url: string) {
    if (!pickerSlot) return;
    const next = applyImagePick(pickerSlot, url);
    applyData(next);
    setPickerSlot(null);
  }
  function handlePlacementChange(slot: ImageSlot, placement: ImagePlacement) {
    const next = applyPlacementChange(slot, placement);
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a resize drag — updates the size multiplier on the targeted slot. */
  function applySizeChange(slot: ImageSlot, newMultiplier: number): EventProfileData {
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
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
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
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
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
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
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
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
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
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

  /** Apply a hero X scale change (slider). */
  function handleHeroScaleXChange(n: number) {
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
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
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
    next.heroOverlay.imageScaleY = n;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a hero z-index change (Front/Back button). */
  function handleHeroZChange(z: number) {
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
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
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
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
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
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
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
    next.heroOverlay.pos = pos;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }, [data]);

  // --- visibility toggles ---
  function toggleSessionVisible(sortedIdx: number) {
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
    const s = next.sessions.sort((a, b) => a.order - b.order)[sortedIdx];
    if (!s) return;
    s.visible = s.visible === false ? true : false;
    applyData(next);
  }
  function toggleSpeakerVisible(sortedIdx: number) {
    const next: EventProfileData = JSON.parse(JSON.stringify(data));
    const sp = next.speakers.sort((a, b) => a.order - b.order)[sortedIdx];
    if (!sp) return;
    sp.visible = sp.visible === false ? true : false;
    applyData(next);
  }

  function handleReset() {
    if (!confirm("Reset to the sample data? Any local edits you've made will be lost.")) return;
    applyData(SAMPLE_DATA);
    setSelectedEventSlug("");
  }
  async function handleCopyJson() {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
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
      const slug = data.event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      link.download = `event-profile-${slug || "mockup"}-${Date.now()}.png`;
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
   * Save as event-profile default for the selected event.
   * The API also creates an EventImage row and sets event.mainImageId,
   * so the event page hero image updates immediately.
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
            type: "event-profile",
            dataJson: JSON.stringify(data),
            pngBase64: pngDataUrl,
          }),
        },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
      alert(`✓ Saved as event-profile default for "${data.event.name}".\n\nThe PNG is now in /admin/images (brand-assets) AND set as the event's main image on /events/${data.event.sourceEventSlug || ""}.`);
    } catch (err) {
      console.error("Save as default failed:", err);
      alert(`Save as default failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

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
              {events.length === 0 ? "No events found" : "— Pick an event to auto-fill all fields —"}
            </option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.slug}>
                {new Date(ev.startsAt).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}{" "}· {ev.title}{ev.venue ? ` @ ${ev.venue}` : ""}
              </option>
            ))}
          </select>
          {loadingEvent && <Loader2 className="h-4 w-4 animate-spin text-[#FF005A]" />}
        </div>
        {data.event.sourceEventSlug && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FF005A]/10 px-2 py-1 text-[0.65rem] font-semibold text-[#FF005A]">
            <Wand2 className="h-3 w-3" />
            Auto-filled from &ldquo;{data.event.name}&rdquo;
          </span>
        )}
        <span className="text-xs text-black/80">
          Breaks & networking auto-hidden — toggle them back on below
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white p-3">
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
          <RotateCcw className="h-3.5 w-3.5" /> Reset to sample
        </button>
        <button
          type="button"
          onClick={handleCopyJson}
          className="inline-flex items-center gap-1.5 rounded-md border border-black/15 bg-white text-black font-semibold px-3 py-1.5 text-xs hover:bg-black/5"
        >
          {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy JSON</>}
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
              ? `Save as event-profile default + set as event main image for "${data.event.name}"`
              : "Pick an event from the dropdown first"
          }
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save as event default"}
        </button>
        <ShareButtons
          getPngDataUrl={getPngDataUrl}
          title={`${data.event.name} — ${data.event.topic}`}
          filename={`event-profile-${(data.event.name || "mockup").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
        />
        <span className="ml-auto text-xs text-black/80">
          Canvas: 1200 × 1200 (1:1 square — visual-first) · Edits auto-saved to this browser
        </span>
      </div>

      {(editMode || sectionsEditMode) && (
        <div className="rounded-md border border-[#0066FF]/30 bg-[#0066FF]/5 px-3 py-2 text-xs text-[#0066FF]">
          {editMode && (
            <>
              <strong>Image edit mode is ON.</strong> Hover the hero image or any speaker
              photo to see a <em>Replace</em> button. Drag to pan. Scroll to zoom.
              Double-click to reset placement.
            </>
          )}
          {sectionsEditMode && (
            <div className={editMode ? "mt-3" : ""}>
              <strong>Section edit mode is ON.</strong>{" "}
              Drag any text section (header, topic, agenda, speakers, sponsors,
              QR+branding) to reposition. Drag the 8 pink handles (4 corners +
              4 mid-edges) to resize. Layout persists in the JSON under{" "}
              <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.65rem]">sectionLayout</code>.
              Use the <strong>Hero layer</strong> Front/Back buttons at the
              bottom-left of the canvas to control whether the hero overlay
              sits above or below the text layers.
            </div>
          )}
        </div>
      )}

      {/* Sessions visibility sidebar */}
      {data.sessions.length > 0 && (
        <div className="rounded-lg border border-black/15 bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-black uppercase tracking-wider">
              Sessions ({data.sessions.filter((s) => s.visible !== false).length}/
              {data.sessions.length} visible)
            </h3>
            <span className="text-[0.65rem] text-black/80">
              Chronological · uncheck to hide on canvas
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[...data.sessions]
              .sort((a, b) => a.order - b.order)
              .map((session, idx) => {
                const isVisible = session.visible !== false;
                return (
                  <label
                    key={`sess-${session.order}`}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition ${
                      isVisible
                        ? "border-black/15 bg-white hover:bg-black/[0.02]"
                        : "border-black/10 bg-black/[0.03] opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => toggleSessionVisible(idx)}
                      className="h-3.5 w-3.5 rounded border-black/30 text-[#FF005A] focus:ring-[#FF005A]/40"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-black truncate">
                        {session.startTime && (
                          <span className="font-mono text-[#004F98]">{session.startTime}</span>
                        )}
                        {" "}
                        {session.title}
                      </span>
                      <span className="block text-[0.65rem] text-black/50 truncate">
                        {session.type}
                        {session.speakerName ? ` · ${session.speakerName}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
          </div>
        </div>
      )}

      {/* Speakers visibility sidebar */}
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
                    key={`sp-${speaker.order}-${speaker.fullName}`}
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
        {/* Left: Form view OR JSON editor (toggled by viewMode) */}
        {viewMode === "form" ? (
          <div className="rounded-lg border border-black/15 bg-white overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 bg-black/[0.03] border-b border-black/10">
              <div className="flex items-center gap-2">
                <FormInput className="h-3.5 w-3.5 text-[#FF005A]" />
                <span className="text-[0.7rem] font-mono text-black/80">
                  event-profile.form
                </span>
              </div>
              <span className="text-[0.65rem] font-mono text-[#27C93F]">
                LIVE
              </span>
            </div>
            <EventProfileFormView
              data={data}
              onChange={(next) => applyData(next)}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-black/15 bg-[#0a0a0a] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 bg-black/90 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                <span className="ml-3 text-[0.7rem] font-mono text-white/40">
                  event-profile.data.json
                </span>
              </div>
              <span className={`text-[0.65rem] font-mono ${parseError ? "text-[#FF5F56]" : "text-[#27C93F]"}`}>
                {parseError ? "ERROR" : "VALID"}
              </span>
            </div>
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
                  <p className="text-[0.7rem] font-mono text-[#FF5F56] break-words">{parseError}</p>
                  <p className="text-[0.65rem] text-white/40 mt-1">
                    The canvas still shows the last valid state — fix the JSON to live-update.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right: live preview */}
        <div
          ref={previewContainerRef}
          className="relative rounded-lg border border-black/15 bg-gradient-to-br from-black/[0.03] to-black/[0.06] p-4 overflow-hidden"
        >
        {/* Edit images + Edit sections — floating at the top-right of the
            Live Preview box, per user spec. The buttons stay visible
            regardless of scroll position inside the preview area. */}
        <div className="flex items-center gap-1.5 absolute top-2 right-2 z-10">
          <button
            type="button"
            onClick={() => setEditMode((s) => !s)}
            className={`inline-flex items-center gap-1 rounded-md font-semibold px-2.5 py-1.5 text-[0.7rem] shadow-md ${
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
            className={`inline-flex items-center gap-1 rounded-md font-semibold px-2.5 py-1.5 text-[0.7rem] shadow-md ${
              sectionsEditMode
                ? "bg-[#FF005A] text-white hover:bg-[#CC0048]"
                : "border border-black/15 bg-white text-black hover:bg-black/5"
            }`}
            title="Toggle section edit mode: drag text sections and the QR code to reposition; drag handles to resize."
          >
            <LayoutPanelTop className="h-3.5 w-3.5" />
            {sectionsEditMode ? "Editing sections" : "Edit sections"}
          </button>
        </div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-black/80 mb-3">
            Live Preview · {Math.round(previewScale * 100)}% scale · exported PNG is 2400 × 2400 (2× DPR)
          </div>
          <div
            className="relative mx-auto"
            style={{
              width: `${1200 * previewScale}px`,
              height: `${1200 * previewScale}px`,
            }}
          >
            <div
              className="absolute top-0 left-0 origin-top-left shadow-2xl"
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
                width: "1200px",
                height: "1200px",
              }}
            >
              <EventProfileCanvas
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
                onSectionZChange={handleSectionZChange}
                onBrandingAssetPosChange={handleBrandingAssetPosChange}
                onHeroPosChange={handleHeroPosChange}
              />
            </div>
          </div>
        </div>
      </div>

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
