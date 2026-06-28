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
  Save,
} from "lucide-react";
import { toPng } from "html-to-image";
import type {
  MeetTheSpeakerData,
  ImagePlacement,
  ImageSlot,
  EventPickListItem,
} from "./types";
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
  const [previewScale, setPreviewScale] = useState<number>(0.5);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string>("");
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<ImageSlot | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // --- helpers ---------------------------------------------------------

  const applyData = useCallback((next: MeetTheSpeakerData) => {
    setData(next);
    setJsonText(JSON.stringify(next, null, 2));
    setParseError(null);
  }, []);

  function applyImagePick(slot: ImageSlot, url: string): MeetTheSpeakerData {
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "speaker-photo") {
      next.speaker.photoUrl = url;
    } else if (slot.kind === "graphic") {
      next.graphic.imageUrl = url;
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
    }
    // sponsors use object-contain — no placement.
    return next;
  }

  function urlForSlot(slot: ImageSlot): string | undefined {
    if (slot.kind === "speaker-photo") return data.speaker.photoUrl;
    if (slot.kind === "graphic") return data.graphic.imageUrl;
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
    if (!slug) return;
    setLoadingEvent(true);
    setParseError(null);
    try {
      const res = await fetch(`/api/events/${slug}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load event (HTTP ${res.status})`);
      }
      const json = (await res.json()) as { event: DbEventForMapping };
      const mapped = mapEventToMeetTheSpeakerData(json.event);
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
   *  (photoSize for speaker, imageScale for graphic, logoSize for sponsor). */
  function applySizeChange(slot: ImageSlot, newMultiplier: number): MeetTheSpeakerData {
    const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
    if (slot.kind === "speaker-photo") {
      next.speaker.photoSize = newMultiplier;
    } else if (slot.kind === "graphic") {
      next.graphic.imageScale = newMultiplier;
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

  /**
   * Save the current mockup as the default meet-the-speaker for the
   * selected event. POSTs the PNG snapshot + JSON to the
   * /api/admin/events/[id]/mockup-defaults endpoint.
   */
  const [savingDefault, setSavingDefault] = useState(false);
  async function handleSaveAsDefault() {
    const eventId = data.event.sourceEventId;
    if (!eventId) {
      alert(
        "No event is currently selected. Use the 'Auto-fill from event' dropdown at the top to pick an event first.",
      );
      return;
    }
    setSavingDefault(true);
    try {
      const dataUrl = await getPngDataUrl();
      const res = await fetch(`/api/admin/events/${eventId}/mockup-defaults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "meet-the-speaker",
          dataJson: JSON.stringify(data, null, 2),
          pngBase64: dataUrl,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      alert(
        `✓ Saved as default meet-the-speaker for "${data.event.name}".\n\nThe PNG snapshot is now in /admin/images under brand-assets.`,
      );
    } catch (err) {
      console.error("Save as default failed:", err);
      alert(`Save as default failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingDefault(false);
    }
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
            Auto-filled from &ldquo;{data.event.name.slice(0, 40)}{data.event.name.length > 40 ? "…" : ""}&rdquo;
          </span>
        )}
        <span className="text-xs text-black/40">
          (you can still edit any field in the JSON below)
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white p-3">
        <button
          type="button"
          onClick={() => setEditMode((s) => !s)}
          className={`inline-flex items-center gap-1.5 rounded-md font-semibold px-3 py-1.5 text-xs ${
            editMode
              ? "bg-[#0066FF] text-white hover:bg-[#0052CC]"
              : "border border-black/15 bg-white text-black hover:bg-black/5"
          }`}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          {editMode ? "Editing images (on)" : "Edit images"}
        </button>
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
          disabled={savingDefault || !!parseError}
          title={
            data.event.sourceEventId
              ? `Save as default meet-the-speaker for "${data.event.name}"`
              : "Pick an event from the dropdown first"
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] text-white font-semibold px-3 py-1.5 text-xs hover:bg-[#D8004D] disabled:opacity-50"
        >
          {savingDefault ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {savingDefault ? "Saving…" : "Save as event default"}
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
      {editMode && (
        <div className="rounded-md border border-[#0066FF]/30 bg-[#0066FF]/5 px-3 py-2 text-xs text-[#0066FF]">
          <strong>Edit mode is ON.</strong> Hover the speaker photo, meerkat
          graphic, or sponsor logos to see a <em>Replace</em> button. Drag
          images to pan. Scroll on an image to zoom. Double-click to reset
          placement. Use <code className="font-mono">photoSize</code>,{" "}
          <code className="font-mono">imageScale</code>, and{" "}
          <code className="font-mono">logoSize</code> in the JSON to resize
          containers.
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
          className="rounded-lg border border-black/15 bg-gradient-to-br from-black/[0.03] to-black/[0.06] p-4 overflow-hidden"
        >
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
                previewScale={previewScale}
                onPickImage={handlePickImage}
                onPlacementChange={handlePlacementChange}
                onSizeChange={handleSizeChange}
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
