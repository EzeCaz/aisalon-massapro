"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Check,
  Download,
  RotateCcw,
  Code,
  AlertCircle,
  Loader2,
  Wand2,
  FormInput,
  ImageIcon,
  LayoutPanelTop,
  Save,
} from "lucide-react";
import { toPng } from "html-to-image";
import type { QrSalonData } from "./types";
import { SAMPLE_DATA } from "./sample-data";
import { QrSalonCanvas } from "./qr-salon-canvas";
import { ImagePickerModalShared } from "../shared/image-picker-modal";
import { ShareButtons } from "../shared/share-buttons";
import type {
  SectionId,
  SectionPos,
  SectionBoxSize,
} from "../shared/section-edit";
import { CollapsibleFormPanel } from "../shared/section-edit";
import { QrSalonSelectedPanel } from "../shared/qr-salon-selected-panel";

/**
 * QrSalonEditor — the editor + live preview surface for the QR-only
 * mockup.
 *
 * 1. Type a URL → QR code regenerates in the canvas.
 * 2. Type a caption → renders below the QR.
 * 3. Toggle "Edit images" (blue) → click the branding asset to replace
 *    it from the brand library.
 * 4. Toggle "Edit sections" (pink) → drag the QR / caption / brand mark
 *    to reposition; 8 handles to resize; Object Properties Panel for
 *    precise position/size/z control. Same pattern as the other mockups.
 * 5. Edit the JSON directly for fine-grained control.
 * 6. Download a print-quality PNG.
 *
 * All state persists in localStorage so a refresh doesn't lose work.
 */

const STORAGE_KEY = "qr-salon-data-v4";
// PER TSK-0053: Local "Set as default" storage. The ENTIRE current `data`
// is saved under `qr-salon-style-defaults-{scopeKey}-current`. When the
// user clicks "Reset", if a saved default exists it is loaded instead of
// SAMPLE_DATA.
// TSK-0076: the scopeKey segment namespaces the default by chapter.
const STYLE_DEFAULTS_KEY_PREFIX = "qr-salon-style-defaults-";

type Props = {
  /**
   * Chapter-scope key for localStorage namespacing (TSK-0076).
   * e.g. "chapter_abc123" for a Montreal admin, "global" for SUPER_ADMIN.
   */
  scopeKey: string;
};

export function QrSalonEditor({ scopeKey }: Props) {
  const [data, setData] = useState<QrSalonData>(SAMPLE_DATA);
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(SAMPLE_DATA, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [editImages, setEditImages] = useState(false);
  const [sectionsEditMode, setSectionsEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** PER USER SPEC 2026-08-02: currently-selected element on the canvas.
   *  LIFTED from the canvas so the new "Selected Element" panel (rendered
   *  above the form) can read/write it. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(0.5);
  // PER TSK-0053: brief "Saved!" feedback shown on the "Set as default"
  // button after the user clicks it.
  const [savedDefaultFeedback, setSavedDefaultFeedback] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // ─── localStorage hydration ─────────────────────────────────────
  // PER USER SPEC 2026-08-02: reset the selected element when
  // sectionsEditMode turns off, so the "Selected Element" panel disappears.
  //
  // PER USER SPEC 2026-08-02 (TSK-0055-extend): the panel now ALSO
  // appears in image-edit mode (for the per-image branding selection).
  // So we only clear `selectedId` when BOTH modes are off — turning
  // off one mode shouldn't kill a selection made in the other.
  useEffect(() => {
    if (!sectionsEditMode && !editImages) setSelectedId(null);
  }, [sectionsEditMode, editImages]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as QrSalonData;
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

  // ─── Preview scale: fit canvas to container width ───────────────
  useEffect(() => {
    function updateScale() {
      if (!canvasWrapRef.current) return;
      const w = canvasWrapRef.current.clientWidth;
      // Canvas is 1200px wide. Fit to ~95% of container, max 1.0.
      const s = Math.min(1, Math.max(0.2, (w * 0.95) / 1200));
      setPreviewScale(s);
    }
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (canvasWrapRef.current) ro.observe(canvasWrapRef.current);
    return () => ro.disconnect();
  }, []);

  // ─── Apply new data + sync JSON ─────────────────────────────────
  function applyData(next: QrSalonData) {
    setData(next);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setJsonText(JSON.stringify(next, null, 2));
      });
    }
  }

  // ─── Form change handlers ───────────────────────────────────────
  function patch(p: Partial<QrSalonData>) {
    applyData({ ...data, ...p });
  }

  function patchCaption(p: Partial<QrSalonData["caption"]>) {
    applyData({ ...data, caption: { ...data.caption, ...p } });
  }

  function patchCaptionStyle(p: Partial<NonNullable<QrSalonData["caption"]["style"]>>) {
    applyData({
      ...data,
      caption: {
        ...data.caption,
        style: { ...data.caption.style, ...p },
      },
    });
  }

  function patchBranding(p: Partial<QrSalonData["brandingAsset"]>) {
    applyData({
      ...data,
      brandingAsset: { ...data.brandingAsset, ...p },
    });
  }

  // ─── Patch + clear drag-override ────────────────────────────────
  // When the user types in a position form field (qrPos / captionPos /
  // brandingAsset.pos), we want the form value to take effect on the
  // canvas IMMEDIATELY. The canvas prefers sectionLayout[id].pos over
  // the form-friendly pos, so we MUST clear the drag-override slot
  // atomically with the patch — otherwise the last drag position would
  // keep winning and the form input would appear to do nothing.
  function patchWithSectionClear(
    p: Partial<QrSalonData>,
    sectionId: SectionId,
  ) {
    const next: QrSalonData = JSON.parse(JSON.stringify(data));
    Object.assign(next, p);
    if (next.sectionLayout?.[sectionId]) {
      delete next.sectionLayout[sectionId]!.pos;
    }
    applyData(next);
  }

  // ─── JSON textarea → data ───────────────────────────────────────
  const handleJsonChange = useCallback((next: string) => {
    setJsonText(next);
    try {
      const parsed = JSON.parse(next) as QrSalonData;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Root must be an object");
      }
      if (!parsed.qrCodeUrl || !parsed.caption || !parsed.brandingAsset) {
        throw new Error("Missing required fields: qrCodeUrl, caption, brandingAsset");
      }
      setData(parsed);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }, []);

  // ─── Image picker ───────────────────────────────────────────────
  function handleBrandingPick(url: string) {
    patchBranding({ imageUrl: url });
    setPickerOpen(false);
  }

  // ─── SectionBox handlers (Edit-sections mode) ───────────────────
  // When the user drags a section on the canvas, we write the new pos
  // to BOTH the drag-override slot (sectionLayout[id].pos) AND the
  // form-friendly field (qrPos / captionPos / brandingAsset.pos) so the
  // form fields stay in sync with manual drags.
  function handleSectionMove(id: SectionId, pos: SectionPos) {
    const next: QrSalonData = JSON.parse(JSON.stringify(data));
    if (!next.sectionLayout) next.sectionLayout = {};
    if (!next.sectionLayout[id]) next.sectionLayout[id] = {};
    next.sectionLayout[id]!.pos = pos;
    // Sync to the form-friendly field so the form reflects drags too.
    if (id === "qr") {
      next.qrPos = pos;
    } else if (id === "caption") {
      next.captionPos = pos;
    } else if (id === "branding") {
      if (!next.brandingAsset) next.brandingAsset = {};
      next.brandingAsset.pos = pos;
    }
    applyData(next);
  }

  function handleSectionResize(id: SectionId, scale: number) {
    const next: QrSalonData = JSON.parse(JSON.stringify(data));
    if (!next.sectionLayout) next.sectionLayout = {};
    if (!next.sectionLayout[id]) next.sectionLayout[id] = {};
    next.sectionLayout[id]!.scale = scale;
    applyData(next);
  }

  function handleSectionBoxResize(id: SectionId, size: SectionBoxSize) {
    const next: QrSalonData = JSON.parse(JSON.stringify(data));
    if (!next.sectionLayout) next.sectionLayout = {};
    if (!next.sectionLayout[id]) next.sectionLayout[id] = {};
    next.sectionLayout[id]!.boxSize = size;
    applyData(next);
  }

  function handleSectionZChange(id: SectionId, z: number) {
    const next: QrSalonData = JSON.parse(JSON.stringify(data));
    if (!next.sectionLayout) next.sectionLayout = {};
    if (!next.sectionLayout[id]) next.sectionLayout[id] = {};
    next.sectionLayout[id]!.z = z;
    applyData(next);
  }

  // ─── Toolbar actions ────────────────────────────────────────────

  /**
   * PER TSK-0053: Save the ENTIRE current mockup state (all section
   * properties + image placements + caption config + etc.) as the
   * default. Stored in localStorage under
   * `qr-salon-style-defaults-current`. When the user later clicks
   * "Reset", this saved default is loaded instead of SAMPLE_DATA.
   */
  const handleSetAsDefault = useCallback(() => {
    const key = `${STYLE_DEFAULTS_KEY_PREFIX}${scopeKey}-current`;
    try {
      localStorage.setItem(key, JSON.stringify(data));
      setSavedDefaultFeedback(true);
      setTimeout(() => setSavedDefaultFeedback(false), 2000);
    } catch {
      // ignore quota errors
    }
  }, [data, scopeKey]);

  // ─── Reset ──────────────────────────────────────────────────────
  function handleReset() {
    const key = `${STYLE_DEFAULTS_KEY_PREFIX}${scopeKey}-current`;
    let savedDefault: QrSalonData | null = null;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        savedDefault = JSON.parse(saved) as QrSalonData;
      }
    } catch {
      // ignore — fall through to SAMPLE_DATA
    }
    const msg = savedDefault
      ? "Reset to the saved default? Any local edits you've made will be lost."
      : "Reset to sample data? Your current edits will be lost.";
    if (!confirm(msg)) return;
    applyData(savedDefault ?? SAMPLE_DATA);
  }

  // ─── PNG export ─────────────────────────────────────────────────
  async function handleDownloadPng() {
    if (!canvasRef.current) return;
    setDownloading(true);
    try {
      // Temporarily disable both edit modes so dashed outlines + handles
      // don't appear in the exported PNG.
      const wasEditingImages = editImages;
      const wasEditingSections = sectionsEditMode;
      setEditImages(false);
      setSectionsEditMode(false);
      // Wait one frame so React flushes the outline/handle removal before
      // html-to-image snapshots the DOM.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const dataUrl = await toPng(canvasRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: data.background ?? "#FFFFFF",
      });
      if (wasEditingImages) setEditImages(true);
      if (wasEditingSections) setSectionsEditMode(true);
      const link = document.createElement("a");
      const slug = (data.caption.text || "qr-salon")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      link.download = `qr-salon-${slug || "mockup"}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("PNG export failed:", err);
      alert("PNG export failed — see console for details.");
    } finally {
      setDownloading(false);
    }
  }

  async function getPngDataUrl(): Promise<string> {
    if (!canvasRef.current) {
      throw new Error("Canvas not ready");
    }
    // Strip edit-mode outlines/handles from the share PNG too.
    const wasEditingImages = editImages;
    const wasEditingSections = sectionsEditMode;
    setEditImages(false);
    setSectionsEditMode(false);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      return await toPng(canvasRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: data.background ?? "#FFFFFF",
      });
    } finally {
      if (wasEditingImages) setEditImages(true);
      if (wasEditingSections) setSectionsEditMode(true);
    }
  }

  async function handleCopyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-6">
      {/* ===== LEFT: CANVAS PREVIEW ===== */}
      <div className="space-y-3">
        {/* Top row: Reset button (kept here per TSK-0053; Edit images /
            Edit sections / Set as default moved to the canvas caption row
            directly above the canvas, mirroring speaker-intro). */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold bg-black/5 text-black hover:bg-black/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        {/* Canvas caption — moved ABOVE the canvas per TSK-0053.
            Edit images + Edit sections + Set as default cluster together
            right above the canvas (mirrors speaker-intro pattern). */}
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="text-[0.7rem] font-semibold text-black/70">
            Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser
            <span className="ml-2 text-black/40 font-normal">
              · {Math.round(previewScale * 100)}% scale
            </span>
          </div>
          <div className="inline-flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setEditImages((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md font-semibold px-3 py-1.5 text-xs ${
                editImages
                  ? "bg-[#0066FF] text-white hover:bg-[#0052CC]"
                  : "border border-black/15 bg-white text-black hover:bg-black/5"
              }`}
              title="Toggle image edit mode: click the brand mark to replace it from the brand library."
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {editImages ? "Editing images" : "Edit images"}
            </button>
            <button
              type="button"
              onClick={() => setSectionsEditMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md font-semibold px-3 py-1.5 text-xs ${
                sectionsEditMode
                  ? "bg-[#FF005A] text-white hover:bg-[#CC0048]"
                  : "border border-black/15 bg-white text-black hover:bg-black/5"
              }`}
              title="Toggle section edit mode: drag the QR / caption / brand mark to reposition; 8 handles to resize; Object Properties Panel for precise control."
            >
              <LayoutPanelTop className="h-3.5 w-3.5" />
              {sectionsEditMode ? "Editing sections" : "Edit sections"}
            </button>
            {/* PER TSK-0053: "Set as default" button — saves the ENTIRE
                current mockup state as the default. Click "Reset" to
                restore. */}
            <button
              type="button"
              onClick={handleSetAsDefault}
              className={`inline-flex items-center gap-1.5 rounded-md font-semibold px-3 py-1.5 text-xs transition ${
                savedDefaultFeedback
                  ? "bg-[#27C93F] text-white"
                  : "border border-[#FF005A] bg-[#FF005A]/5 text-[#FF005A] hover:bg-[#FF005A]/10"
              }`}
              title="Save the entire current mockup state as the default. Click Reset to restore."
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
          ref={canvasWrapRef}
          className="rounded-lg border border-black/10 bg-black/[0.02] p-3 flex items-center justify-center overflow-hidden"
          style={{ minHeight: 400 }}
        >
          <div
            style={{
              width: 1200 * previewScale,
              height: 800 * previewScale,
              flexShrink: 0,
            }}
          >
            <QrSalonCanvas
              ref={canvasRef}
              data={data}
              editable={editImages}
              sectionsEditable={sectionsEditMode}
              previewScale={previewScale}
              onPickBranding={() => setPickerOpen(true)}
              onSectionMove={handleSectionMove}
              onSectionResize={handleSectionResize}
              onSectionBoxResize={handleSectionBoxResize}
              onSectionZChange={handleSectionZChange}
              selectedId={selectedId}
              onSelectChange={setSelectedId}
            />
          </div>
        </div>

        <p className="text-[0.7rem] text-black/50 leading-relaxed">
          <strong>Edit images</strong> (blue) → click the brand mark to swap it from the brand library.{" "}
          <strong>Edit sections</strong> (pink) → drag the QR / caption / brand
          mark to reposition; 8 handles to resize; Object Properties Panel for
          precise position, size, and z-order.
        </p>
      </div>

      {/* ===== RIGHT: EDITOR PANEL ===== */}
      <div className="space-y-4">
        {/* View mode toggle */}
        <div className="flex items-center gap-1 rounded-md bg-black/5 p-1">
          <button
            type="button"
            onClick={() => setViewMode("form")}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "form"
                ? "bg-white text-black shadow-sm"
                : "text-black/60 hover:text-black"
            }`}
          >
            <FormInput className="h-3.5 w-3.5" />
            Form
          </button>
          <button
            type="button"
            onClick={() => setViewMode("json")}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "json"
                ? "bg-white text-black shadow-sm"
                : "text-black/60 hover:text-black"
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            JSON
          </button>
        </div>

        {/* PER USER SPEC 2026-08-02: Selected Element panel.
           *  Sits ABOVE the form editor in the right column. Renders when
           *  an element is selected AND at least one edit mode is on.
           *  PER USER SPEC 2026-08-02 (TSK-0055-extend): now also renders
           *  in image-edit mode — clicking the brand mark in Edit-images
           *  mode triggers this panel with per-image edit fields. */}
        {(sectionsEditMode || editImages) && selectedId && (
          <QrSalonSelectedPanel
            selectedId={selectedId}
            data={data}
            onChange={(next) => applyData(next)}
            onPickBranding={() => setPickerOpen(true)}
            onDeselect={() => setSelectedId(null)}
          />
        )}

        {viewMode === "form" ? (
          /* PER USER SPEC 2026-08-02 (TSK-0050): the entire form is now
             COMPRESSED (collapsed) by default. Click the header to expand.
             The floating ObjectPropertiesPanel anchors top-LEFT of the
             canvas (the left column) so it doesn't overlap this editor. */
          <CollapsibleFormPanel
            title="qr-salon.form"
            icon={<FormInput className="h-3.5 w-3.5 text-[#FF005A]" />}
          >
            <div className="p-4">
              <FormView
                data={data}
                onPatch={patch}
                onPatchCaption={patchCaption}
                onPatchCaptionStyle={patchCaptionStyle}
                onPatchBranding={patchBranding}
                onPatchWithSectionClear={patchWithSectionClear}
                onPickBranding={() => setPickerOpen(true)}
              />
            </div>
          </CollapsibleFormPanel>
        ) : (
          <CollapsibleFormPanel
            title="qr-salon.data.json"
            icon={
              <div className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
              </div>
            }
            error={parseError}
          >
            <div className="p-4">
              <JsonView
                jsonText={jsonText}
                parseError={parseError}
                onJsonChange={handleJsonChange}
                onCopy={handleCopyJson}
                copied={copied}
              />
            </div>
          </CollapsibleFormPanel>
        )}

        {/* Export buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-2 text-xs hover:bg-[#FF005A]/90 transition-colors disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {downloading ? "Exporting..." : "Download PNG"}
          </button>
        </div>

        {/* Share buttons */}
        <ShareButtons
          getPngDataUrl={getPngDataUrl}
          title="AI Salon QR Mockup"
          filename="qr-salon-mockup.png"
        />
      </div>

      {/* ===== IMAGE PICKER MODAL ===== */}
      <ImagePickerModalShared
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handleBrandingPick}
        currentUrl={data.brandingAsset?.imageUrl}
        accept="logo"
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// FormView — friendly inputs for every field in QrSalonData.
// ───────────────────────────────────────────────────────────────────

function FormView({
  data,
  onPatch,
  onPatchCaption,
  onPatchCaptionStyle,
  onPatchBranding,
  onPatchWithSectionClear,
  onPickBranding,
}: {
  data: QrSalonData;
  onPatch: (p: Partial<QrSalonData>) => void;
  onPatchCaption: (p: Partial<QrSalonData["caption"]>) => void;
  onPatchCaptionStyle: (p: Partial<NonNullable<QrSalonData["caption"]["style"]>>) => void;
  onPatchBranding: (p: Partial<QrSalonData["brandingAsset"]>) => void;
  /** Patches data AND clears the matching sectionLayout[id].pos so the
   *  form-friendly position takes effect on the canvas. Used by the
   *  position X/Y inputs for QR / caption / branding. */
  onPatchWithSectionClear: (
    p: Partial<QrSalonData>,
    sectionId: SectionId,
  ) => void;
  onPickBranding: () => void;
}) {
  const captionStyle = data.caption.style ?? {};
  const branding = data.brandingAsset;

  return (
    <div className="space-y-5">
      {/* ===== QR CODE ===== */}
      <section className="rounded-lg border border-black/10 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#FF005A]">
          QR code
        </h3>
        <Field label="URL the QR code encodes">
          <input
            type="url"
            value={data.qrCodeUrl}
            onChange={(e) => onPatch({ qrCodeUrl: e.target.value })}
            placeholder="https://aisalon.massapro.com/events"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="QR size (px)">
            <input
              type="number"
              min={64}
              max={1000}
              value={data.qrSize ?? 360}
              onChange={(e) => onPatch({ qrSize: Number(e.target.value) })}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
          <Field label="QR margin">
            <input
              type="number"
              min={0}
              max={8}
              value={data.qrMargin ?? 2}
              onChange={(e) => onPatch({ qrMargin: Number(e.target.value) })}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
          <Field label="QR position X (%)">
            <input
              type="number"
              step={0.1}
              placeholder="auto"
              value={data.qrPos?.x ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  onPatchWithSectionClear({ qrPos: undefined }, "qr");
                } else {
                  onPatchWithSectionClear(
                    { qrPos: { x: Number(v), y: data.qrPos?.y ?? 10 } },
                    "qr",
                  );
                }
              }}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
          <Field label="QR position Y (%)">
            <input
              type="number"
              step={0.1}
              placeholder="auto"
              value={data.qrPos?.y ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  onPatchWithSectionClear({ qrPos: undefined }, "qr");
                } else {
                  onPatchWithSectionClear(
                    { qrPos: { x: data.qrPos?.x ?? 50, y: Number(v) } },
                    "qr",
                  );
                }
              }}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
          <Field label="Dark color">
            <input
              type="color"
              value={data.qrDarkColor ?? "#000000"}
              onChange={(e) => onPatch({ qrDarkColor: e.target.value })}
              className="w-full h-9 rounded-md border border-black/15 px-1 py-1"
            />
          </Field>
          <Field label="Light color">
            <input
              type="color"
              value={data.qrLightColor ?? "#FFFFFF"}
              onChange={(e) => onPatch({ qrLightColor: e.target.value })}
              className="w-full h-9 rounded-md border border-black/15 px-1 py-1"
            />
          </Field>
        </div>
      </section>

      {/* ===== CAPTION ===== */}
      <section className="rounded-lg border border-black/10 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#FF005A]">
          Caption (below QR)
        </h3>
        <Field label="Caption text (use newlines for multi-line)">
          <textarea
            value={data.caption.text}
            onChange={(e) => onPatchCaption({ text: e.target.value })}
            rows={3}
            placeholder="Scan to register"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none resize-y"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Font size (px)">
            <input
              type="number"
              min={8}
              max={120}
              value={captionStyle.fontSize ?? 28}
              onChange={(e) => onPatchCaptionStyle({ fontSize: Number(e.target.value) })}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
          <Field label="Font weight">
            <select
              value={captionStyle.fontWeight ?? "700"}
              onChange={(e) => onPatchCaptionStyle({ fontWeight: e.target.value })}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none bg-white"
            >
              <option value="400">Regular (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">Semibold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="800">Extrabold (800)</option>
            </select>
          </Field>
          <Field label="Text color">
            <input
              type="color"
              value={captionStyle.color ?? "#000000"}
              onChange={(e) => onPatchCaptionStyle({ color: e.target.value })}
              className="w-full h-9 rounded-md border border-black/15 px-1 py-1"
            />
          </Field>
          <Field label="Alignment">
            <select
              value={captionStyle.align ?? "center"}
              onChange={(e) =>
                onPatchCaptionStyle({ align: e.target.value as "left" | "center" | "right" })
              }
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none bg-white"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Caption position X (%) — blank = auto">
            <input
              type="number"
              step={0.1}
              placeholder="auto"
              value={data.captionPos?.x ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  onPatchWithSectionClear({ captionPos: undefined }, "caption");
                } else {
                  onPatchWithSectionClear(
                    { captionPos: { x: Number(v), y: data.captionPos?.y ?? 60 } },
                    "caption",
                  );
                }
              }}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
          <Field label="Caption position Y (%) — blank = auto">
            <input
              type="number"
              step={0.1}
              placeholder="auto"
              value={data.captionPos?.y ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  onPatchWithSectionClear({ captionPos: undefined }, "caption");
                } else {
                  onPatchWithSectionClear(
                    { captionPos: { x: data.captionPos?.x ?? 10, y: Number(v) } },
                    "caption",
                  );
                }
              }}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
        </div>
      </section>

      {/* ===== BRANDING ASSET ===== */}
      <section className="rounded-lg border border-black/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FF005A]">
            Brand mark (bottom-left)
          </h3>
          <button
            type="button"
            onClick={onPickBranding}
            className="inline-flex items-center gap-1 rounded-md bg-black/5 px-2 py-1 text-[0.7rem] font-semibold text-black hover:bg-black/10"
          >
            <Wand2 className="h-3 w-3" />
            Replace
          </button>
        </div>
        {/* PER USER SPEC 2026-08-02: Logo theme selector. */}
        <Field label="Logo theme variant">
          <div className="flex gap-2">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onPatchBranding({ theme: t })}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  (branding.theme ?? "light") === t
                    ? "border-[#FF005A] bg-[#FF005A]/10 text-[#FF005A]"
                    : "border-black/15 bg-white text-black/70 hover:bg-black/5"
                }`}
              >
                {t === "light" ? "Light (white bg)" : "Dark (dark bg)"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Image URL (overrides theme)">
          <input
            type="url"
            value={branding.imageUrl ?? ""}
            onChange={(e) => onPatchBranding({ imageUrl: e.target.value })}
            placeholder="Leave empty to use the theme-selected logo"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-xs font-mono focus:border-[#FF005A] focus:outline-none"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Height (px)">
            <input
              type="number"
              min={8}
              max={240}
              value={branding.height ?? 48}
              onChange={(e) => onPatchBranding({ height: Number(e.target.value) })}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
          <Field label="Position X (%) — blank = auto-center">
            <input
              type="number"
              step={0.1}
              placeholder="auto"
              value={branding.pos?.x ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  onPatchWithSectionClear(
                    { brandingAsset: { ...branding, pos: undefined } },
                    "branding",
                  );
                } else {
                  onPatchWithSectionClear(
                    {
                      brandingAsset: {
                        ...branding,
                        pos: { x: Number(v), y: branding.pos?.y ?? 77.5 },
                      },
                    },
                    "branding",
                  );
                }
              }}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
          <Field label="Position Y (%) — blank = auto">
            <input
              type="number"
              step={0.1}
              placeholder="auto"
              value={branding.pos?.y ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  onPatchWithSectionClear(
                    { brandingAsset: { ...branding, pos: undefined } },
                    "branding",
                  );
                } else {
                  onPatchWithSectionClear(
                    {
                      brandingAsset: {
                        ...branding,
                        pos: { x: branding.pos?.x ?? 50, y: Number(v) },
                      },
                    },
                    "branding",
                  );
                }
              }}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
        </div>
        <p className="text-[0.7rem] text-black/50 leading-relaxed">
          Default: AI Salon logo on Vercel Blob · height 48px · centered
          horizontally below the QR. Leave X/Y blank to use the centered
          default; set them to override. You can also drag the brand mark on
          the canvas directly (toggle Edit sections) and use the Object
          Properties Panel for precise control.
        </p>
      </section>

      {/* ===== BACKGROUND ===== */}
      <section className="rounded-lg border border-black/10 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#FF005A]">
          Background
        </h3>
        <Field label="Canvas background color">
          <input
            type="color"
            value={data.background ?? "#FFFFFF"}
            onChange={(e) => onPatch({ background: e.target.value })}
            className="w-full h-9 rounded-md border border-black/15 px-1 py-1"
          />
        </Field>
      </section>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// JsonView — raw JSON editor for power users.
// ───────────────────────────────────────────────────────────────────

function JsonView({
  jsonText,
  parseError,
  onJsonChange,
  onCopy,
  copied,
}: {
  jsonText: string;
  parseError: string | null;
  onJsonChange: (next: string) => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-black/70">JSON</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-md bg-black/5 px-2 py-1 text-[0.7rem] font-semibold text-black hover:bg-black/10"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      <textarea
        value={jsonText}
        onChange={(e) => onJsonChange(e.target.value)}
        rows={28}
        spellCheck={false}
        className="w-full rounded-md border border-black/15 px-3 py-2 text-xs font-mono leading-relaxed focus:border-[#FF005A] focus:outline-none resize-y bg-black/[0.02]"
      />
      {parseError && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="font-mono break-all">{parseError}</span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Field — labeled input wrapper.
// ───────────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[0.7rem] font-semibold text-black/70">{label}</span>
      {children}
    </label>
  );
}
