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
  User,
} from "lucide-react";
import { toPng } from "html-to-image";
import type {
  MeetTheSpeakerData,
  ImagePlacement,
  ImageSlot,
  EventPickListItem,
} from "./types";
import type { SectionId, SectionPos } from "../shared/section-edit";
import { SAMPLE_DATA } from "./sample-data";
import { MeetTheSpeakerCanvas } from "./meet-the-speaker-canvas";
import { ImagePickerModalShared } from "../shared/image-picker-modal";
import { ShareButtons } from "../shared/share-buttons";
import { MeetTheSpeakerFormView } from "../shared/meet-the-speaker-form-view";
import {
  mapEventToMeetTheSpeakerData,
  type DbEventForMapping,
} from "./event-mapper";

/**
 * MeetTheSpeakerEditor — the editor + live preview surface.
 *
 * Mirrors the Speaker Intro editor pattern:
 *   1. Pick an event from the dropdown → auto-fill all fields.
 *   2. Toggle "Edit images" → click any image to replace it from the
 *      brand library. Drag to pan. Scroll to zoom.
 *   3. Edit the JSON directly for fine-grained control.
 *   4. Download a print-quality PNG.
 */

const STORAGE_KEY = "meet-the-speaker-data-v1";

type Props = {
  events: EventPickListItem[];
};

export function MeetTheSpeakerEditor({ events }: Props) {
  const [data, setData] = useState<MeetTheSpeakerData>(SAMPLE_DATA);
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(SAMPLE_DATA, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);
  /** View mode for the left panel: "form" (structured inputs) or "json" (raw textarea). */
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewScale, setPreviewScale] = useState<number>(0.5);
  const [editMode, setEditMode] = useState<boolean>(false);
  /** Sections edit mode = text sections are draggable + resizeable. */
  const [sectionsEditMode, setSectionsEditMode] = useState<boolean>(false);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string>("");
  const [loadingEvent, setLoadingEvent] = useState(false);
  /**
   * Last event fetched by handleEventPick. Kept in state so the speaker
   * <select> can render its speakers list without re-fetching.
   */
  const [lastFetchedEvent, setLastFetchedEvent] =
    useState<DbEventForMapping | null>(null);
  /** Speaker selected in the secondary dropdown (auto-fills the mockup with
   *  that specific speaker's data instead of the default first-by-order). */
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");
  const [pickerSlot, setPickerSlot] = useState<ImageSlot | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // --- helpers ---------------------------------------------------------

  const applyData = useCallback((next: MeetTheSpeakerData) => {
    setData(next);
    setParseError(null);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }, []);

  function applyImagePick(slot: ImageSlot, url: string): MeetTheSpeakerData {
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "speaker-photo") {
      next.speaker.photoUrl = url;
    } else if (slot.kind === "graphic") {
      next.graphic.imageUrl = url;
    } else if (slot.kind === "hero-style2") {
      next.heroStyle2Url = url;
    } else {
      const arr =
        slot.group === "collaborators" ? next.collaborators : next.sponsors;
      const item = arr[slot.index];
      if (item) item.logoUrl = url;
    }
    return next;
  }

  function applyPlacementChange(
    slot: ImageSlot,
    placement: ImagePlacement,
  ): MeetTheSpeakerData {
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "speaker-photo") {
      next.speaker.photoPlacement = placement;
    } else if (slot.kind === "graphic") {
      next.graphic.imagePlacement = placement;
    } else if (slot.kind === "hero-style2") {
      next.heroStyle2Placement = placement;
    }
    // sponsors use object-contain — no placement.
    return next;
  }

  function urlForSlot(slot: ImageSlot): string | undefined {
    if (slot.kind === "speaker-photo") return data.speaker.photoUrl;
    if (slot.kind === "graphic") return data.graphic.imageUrl;
    if (slot.kind === "hero-style2") return data.heroStyle2Url;
    const arr =
      slot.group === "collaborators" ? data.collaborators : data.sponsors;
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
        const parsed = JSON.parse(saved) as MeetTheSpeakerData;
        setData(parsed);
        setJsonText(JSON.stringify(parsed, null, 2));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [data]);

  // --- JSON textarea → data ------------------------------------------

  const handleJsonChange = useCallback((next: string) => {
    setJsonText(next);
    try {
      const parsed = JSON.parse(next) as MeetTheSpeakerData;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Root must be an object");
      }
      if (!parsed.speaker || !parsed.event) {
        throw new Error("Missing required fields: speaker, event");
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
    // Reset the speaker picker whenever the event changes — the new event
    // may not have the previously-picked speaker.
    setSelectedSpeakerId("");
    if (!slug) {
      setLastFetchedEvent(null);
      return;
    }
    setLoadingEvent(true);
    setParseError(null);
    try {
      const res = await fetch(`/api/events/${slug}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load event (HTTP ${res.status})`);
      }
      const json = (await res.json()) as { event: DbEventForMapping };
      setLastFetchedEvent(json.event);
      const mapped = mapEventToMeetTheSpeakerData(json.event);
      applyData(mapped);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setLoadingEvent(false);
    }
  }

  /**
   * Re-run the mapper with a specific speaker selected. Pulls from the
   * cached `lastFetchedEvent` so no extra API call is needed.
   */
  function handleSpeakerPick(speakerId: string) {
    setSelectedSpeakerId(speakerId);
    if (!lastFetchedEvent || !speakerId) return;
    const mapped = mapEventToMeetTheSpeakerData(lastFetchedEvent, speakerId);
    applyData(mapped);
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
    const next = applyPlacementChange(slot, placement);
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a resize drag — updates the size multiplier on the targeted slot
   *  (photoSize for speaker, imageScale for graphic, logoSize for sponsor,
   *  heroStyle2Scale for Style 2 hero image). */
  function applySizeChange(slot: ImageSlot, newMultiplier: number): MeetTheSpeakerData {
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "speaker-photo") {
      next.speaker.photoSize = newMultiplier;
    } else if (slot.kind === "graphic") {
      next.graphic.imageScale = newMultiplier;
    } else if (slot.kind === "hero-style2") {
      next.heroStyle2Scale = newMultiplier;
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
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
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
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
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
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
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
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
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
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
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
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    next.heroOverlay.imageScaleY = n;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a layer z-index change (Hero / Photo / Graphic Front/Back). */
  function handleLayerZChange(layer: "hero" | "photo" | "graphic", z: number) {
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    if (layer === "hero") next.heroZ = z;
    else if (layer === "photo") next.photoZ = z;
    else next.graphicZ = z;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a speaker photo container position change (free drag). */
  function handlePhotoPosChange(pos: { x: number; y: number }) {
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    next.speaker.photoPos = pos;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a Local Street pin position change (free drag on canvas). */
  function handleLocalStreetPinMove(index: number, pos: { x: number; y: number }) {
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    if (!next.localStreetPins) next.localStreetPins = [];
    if (next.localStreetPins[index]) {
      next.localStreetPins[index] = { ...next.localStreetPins[index], ...pos };
    }
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  /** Apply a Style 2 hero image container position change (free drag). */
  function handleHeroStyle2PosChange(pos: { x: number; y: number }) {
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    next.heroStyle2Pos = pos;
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  // --- toolbar actions ------------------------------------------------

  function handleReset() {
    if (
      !confirm(
        "Reset to the sample data? Any local edits you've made will be lost.",
      )
    ) {
      return;
    }
    applyData(SAMPLE_DATA);
    setSelectedEventSlug("");
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
      const slug = data.speaker.fullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      link.download = `meet-the-speaker-${slug || "mockup"}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("PNG export failed:", err);
      alert("PNG export failed — see console for details.");
    } finally {
      setDownloading(false);
    }
  }

  /** Save as meet-the-speaker default for the selected event. */
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
            type: "meet-the-speaker",
            dataJson: JSON.stringify(data),
            pngBase64: pngDataUrl,
          }),
        },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
      alert(`✓ Saved as meet-the-speaker default for "${data.event.name}".\n\nThe PNG snapshot is now in /admin/images under brand-assets.`);
    } catch (err) {
      console.error("Save as default failed:", err);
      alert(`Save as default failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  // --- render ---------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Event + speaker picker — stacked on two rows so each dropdown
          gets the full width. Event picker on top, speaker picker below. */}
      <div className="space-y-2 rounded-lg border border-[#FF005A]/20 bg-gradient-to-r from-[#FF005A]/[0.03] to-transparent p-3">
        {/* Row 1: Event picker */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-black whitespace-nowrap">
            <Calendar className="h-4 w-4 text-[#FF005A]" />
            Auto-fill from event:
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <select
              value={selectedEventSlug}
              onChange={(e) => handleEventPick(e.target.value)}
              disabled={loadingEvent}
              className="flex-1 rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm text-black disabled:opacity-50"
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
              <Loader2 className="h-4 w-4 animate-spin text-[#FF005A] shrink-0" />
            )}
          </div>
        </div>

        {/* Row 2: Speaker picker — appears once an event has been picked.
            Re-runs the mapper with the selected speaker instead of the
            default first-by-order. */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-black whitespace-nowrap">
            <User className="h-4 w-4 text-[#FF005A]" />
            Speaker:
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <select
              value={selectedSpeakerId}
              onChange={(e) => handleSpeakerPick(e.target.value)}
              disabled={!lastFetchedEvent || loadingEvent}
              className="flex-1 rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm text-black disabled:opacity-50"
            >
              <option value="">
                {!lastFetchedEvent
                  ? "— Pick an event first —"
                  : lastFetchedEvent.speakers.length === 0
                    ? "No speakers on this event"
                    : "— Default (first speaker) —"}
              </option>
              {[...(lastFetchedEvent?.speakers ?? [])]
                .sort((a, b) => a.order - b.order)
                .map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                    {sp.role ? ` · ${sp.role}` : ""}
                    {sp.company ? ` · ${sp.company}` : ""}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[#FF005A]/10">
          {data.event.sourceEventSlug && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FF005A]/10 px-2 py-1 text-[0.65rem] font-semibold text-[#FF005A]">
              <Wand2 className="h-3 w-3" />
              Auto-filled from &ldquo;{data.event.name.slice(0, 40)}{data.event.name.length > 40 ? "…" : ""}&rdquo;
            </span>
          )}
          <span className="text-xs text-black/40">
            (you can still edit any field in the JSON below)
          </span>
        </div>
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
              ? `Save as meet-the-speaker default for "${data.event.name}"`
              : "Pick an event from the dropdown first"
          }
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save as event default"}
        </button>
        <ShareButtons
          getPngDataUrl={getPngDataUrl}
          title={`${data.speaker.fullName} — ${data.speaker.topic}`}
          filename={`meet-the-speaker-${(data.speaker.fullName || "mockup").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
        />
        <span className="ml-auto text-xs text-black/40">
          Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser
        </span>
      </div>

      {/* Edit-mode hint */}
      {(editMode || sectionsEditMode) && (
        <div className="rounded-md border border-[#0066FF]/30 bg-[#0066FF]/5 px-3 py-2 text-xs text-[#0066FF]">
          {editMode && (
            <>
              <strong>Image edit mode is ON.</strong> Hover the speaker photo, meerkat
              graphic, or sponsor logos to see a <em>Replace</em> button. Drag
              images to pan. Scroll on an image to zoom. Double-click to reset
              placement. Use <code className="font-mono">photoSize</code>,{" "}
              <code className="font-mono">imageScale</code>, and{" "}
              <code className="font-mono">logoSize</code> in the JSON to resize
              containers.
              <div className="mt-2">
                <strong>New (2026-07-02):</strong>{" "}
                Drag the <code className="font-mono">⠿ Move</code> handle on the
                speaker photo to move it freely around the canvas — no longer
                anchored to the top-right.
                {data.heroStyle === 2 && (
                  <>
                    {" "}For Style 2, the hero image has a{" "}
                    <code className="font-mono">⠿ Move hero</code> handle (free
                    position), corner handles (resize), mouse-wheel zoom, and a{" "}
                    <em>Replace</em> button. Local Street pins are also draggable.
                  </>
                )}
              </div>
            </>
          )}
          {sectionsEditMode && (
            <div className={editMode ? "mt-3" : ""}>
              <strong>Section edit mode is ON.</strong>{" "}
              Drag any text section (speaker info, event details, sponsors,
              branding) or the QR code to reposition. Drag the 8 pink handles
              (4 corners + 4 mid-edges) to resize. Layout persists in the JSON
              under <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.65rem]">sectionLayout</code>.
              Use the <strong>Layers</strong> Front/Back buttons at the
              bottom-left of the canvas to control whether the Hero overlay,
              Photo, or Brand graphic sits above or below the text layers.
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        {/* Left: Form view OR JSON editor (toggled by viewMode) */}
        {viewMode === "form" ? (
          <div className="rounded-lg border border-black/15 bg-white overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 bg-black/[0.03] border-b border-black/10">
              <div className="flex items-center gap-2">
                <FormInput className="h-3.5 w-3.5 text-[#FF005A]" />
                <span className="text-[0.7rem] font-mono text-black/60">
                  meet-the-speaker.form
                </span>
              </div>
              <span className="text-[0.65rem] font-mono text-[#27C93F]">
                LIVE
              </span>
            </div>
            <MeetTheSpeakerFormView
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
                  meet-the-speaker.data.json
                </span>
              </div>
              <span
                className={`text-[0.65rem] font-mono ${
                  parseError ? "text-[#FF5F56]" : "text-[#27C93F]"
                }`}
              >
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
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-black/40 mb-3">
            Live Preview · {Math.round(previewScale * 100)}% scale · exported PNG is 2400 × 1600 (2× DPR)
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
              <MeetTheSpeakerCanvas
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
                onLayerZChange={handleLayerZChange}
                onHeroScaleXChange={handleHeroScaleXChange}
                onHeroScaleYChange={handleHeroScaleYChange}
                onSectionZChange={handleSectionZChange}
                onPhotoPosChange={handlePhotoPosChange}
                onLocalStreetPinMove={handleLocalStreetPinMove}
                onHeroStyle2PosChange={handleHeroStyle2PosChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Component breakdown reminder */}
      <details className="rounded-lg border border-black/10 bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold text-black">
          Component breakdown (editable regions)
        </summary>
        <ol className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-black/70">
          <li><strong>1. Header</strong> — pink &ldquo;Meet the speaker&rdquo; title</li>
          <li><strong>2. Speaker Name</strong> — large bold name</li>
          <li><strong>3. Speaker Title</strong> — job title</li>
          <li><strong>4. Speaker Company</strong> — company name</li>
          <li><strong>5. Topic</strong> — talk title + description</li>
          <li><strong>6. Bio</strong> — main bio paragraph</li>
          <li><strong>7. Expertise</strong> — optional second paragraph</li>
          <li><strong>8. Speaker Photo</strong> — large portrait</li>
          <li><strong>9. Meerkat Graphic</strong> — bottom-right brand graphic</li>
          <li><strong>10. Gradient Overlay</strong> — geometric triangles</li>
          <li><strong>11. QR Code</strong> — top-right, &ldquo;Register here&rdquo;</li>
          <li><strong>12. Event Title</strong> — bottom-right</li>
          <li><strong>13. Event Date/Time</strong> — bottom-right</li>
          <li><strong>14. Event Venue</strong> — bottom-right</li>
          <li><strong>15. Sponsors</strong> — collaborators + sponsors</li>
          <li><strong>16. Branding</strong> — ai salon wordmark</li>
        </ol>
        <p className="mt-3 text-xs text-black/50">
          Pick an event at the top to auto-fill everything. Toggle{" "}
          <strong>Edit images</strong> to swap the photo/graphic/logos from
          the brand library. Drag images on the canvas to pan; scroll to
          zoom. Use <code className="rounded bg-black/5 px-1 py-0.5 font-mono">photoSize</code>,{" "}
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono">imageScale</code>,{" "}
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono">logoSize</code> in the
          JSON to make any image larger or smaller.
        </p>
      </details>

      {/* Image picker modal */}
      <ImagePickerModalShared
        open={pickerSlot !== null}
        onClose={() => setPickerSlot(null)}
        onPick={handlePickerSelect}
        eventSlug={selectedEventSlug || data.event.sourceEventSlug || undefined}
        currentUrl={pickerSlot ? urlForSlot(pickerSlot) : undefined}
      />
    </div>
  );
}
