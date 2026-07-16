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
} from "lucide-react";
import { toPng } from "html-to-image";
import type { QrSalonData } from "./types";
import { DEFAULT_BRANDING_ASSET_URL } from "./types";
import { SAMPLE_DATA } from "./sample-data";
import { QrSalonCanvas } from "./qr-salon-canvas";
import { ImagePickerModalShared } from "../shared/image-picker-modal";
import { ShareButtons } from "../shared/share-buttons";

/**
 * QrSalonEditor — the editor + live preview surface for the QR-only
 * mockup.
 *
 * 1. Type a URL → QR code regenerates in the canvas.
 * 2. Type a caption → renders below the QR.
 * 3. Toggle "Edit images" → click the branding asset to replace it from
 *    the brand library. Drag to reposition. Scroll to resize.
 * 4. Edit the JSON directly for fine-grained control.
 * 5. Download a print-quality PNG.
 *
 * All state persists in localStorage so a refresh doesn't lose work.
 */

const STORAGE_KEY = "qr-salon-data-v1";

export function QrSalonEditor() {
  const [data, setData] = useState<QrSalonData>(SAMPLE_DATA);
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(SAMPLE_DATA, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [editImages, setEditImages] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewScale, setPreviewScale] = useState(0.5);

  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // ─── localStorage hydration ─────────────────────────────────────
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

  // ─── Branding canvas interactions ───────────────────────────────
  function handleBrandingPosChange(pos: { x: number; y: number }) {
    patchBranding({ pos });
  }

  function handleBrandingSizeChange(heightPx: number) {
    patchBranding({ height: heightPx });
  }

  // ─── Reset ──────────────────────────────────────────────────────
  function handleReset() {
    if (!confirm("Reset to sample data? Your current edits will be lost.")) return;
    applyData(SAMPLE_DATA);
  }

  // ─── PNG export ─────────────────────────────────────────────────
  async function handleDownloadPng() {
    if (!canvasRef.current) return;
    setDownloading(true);
    try {
      // Temporarily disable edit mode so the dashed outline doesn't
      // appear in the exported PNG.
      const wasEditing = editImages;
      setEditImages(false);
      // Wait one frame so React flushes the outline removal before
      // html-to-image snapshots the DOM.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const dataUrl = await toPng(canvasRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: data.background ?? "#FFFFFF",
      });
      if (wasEditing) setEditImages(true);
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
    return toPng(canvasRef.current, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: data.background ?? "#FFFFFF",
    });
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditImages((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                editImages
                  ? "bg-[#FF005A] text-white hover:bg-[#FF005A]/90"
                  : "bg-black/5 text-black hover:bg-black/10"
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {editImages ? "Editing images — click brand mark to replace · drag to move · scroll to resize" : "Edit images"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold bg-black/5 text-black hover:bg-black/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.7rem] text-black/60">
              {Math.round(previewScale * 100)}%
            </span>
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
              previewScale={previewScale}
              onPickBranding={() => setPickerOpen(true)}
              onBrandingPosChange={handleBrandingPosChange}
              onBrandingSizeChange={handleBrandingSizeChange}
            />
          </div>
        </div>

        <p className="text-[0.7rem] text-black/50 leading-relaxed">
          Canvas: 1200×800 (3:2). The QR is centered horizontally and biased
          upward so the caption fits below. Brand mark sits at the bottom-left
          by default (height 48px, X=2.7%, Y=94%). Drag the brand mark in
          edit mode to reposition; scroll on it to resize.
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

        {viewMode === "form" ? (
          <FormView
            data={data}
            onPatch={patch}
            onPatchCaption={patchCaption}
            onPatchCaptionStyle={patchCaptionStyle}
            onPatchBranding={patchBranding}
            onPickBranding={() => setPickerOpen(true)}
          />
        ) : (
          <JsonView
            jsonText={jsonText}
            parseError={parseError}
            onJsonChange={handleJsonChange}
            onCopy={handleCopyJson}
            copied={copied}
          />
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
  onPickBranding,
}: {
  data: QrSalonData;
  onPatch: (p: Partial<QrSalonData>) => void;
  onPatchCaption: (p: Partial<QrSalonData["caption"]>) => void;
  onPatchCaptionStyle: (p: Partial<NonNullable<QrSalonData["caption"]["style"]>>) => void;
  onPatchBranding: (p: Partial<QrSalonData["brandingAsset"]>) => void;
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
                  onPatch({ qrPos: undefined });
                } else {
                  onPatch({ qrPos: { x: Number(v), y: data.qrPos?.y ?? 10 } });
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
                  onPatch({ qrPos: undefined });
                } else {
                  onPatch({ qrPos: { x: data.qrPos?.x ?? 50, y: Number(v) } });
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
                  onPatch({ captionPos: undefined });
                } else {
                  onPatch({ captionPos: { x: Number(v), y: data.captionPos?.y ?? 60 } });
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
                  onPatch({ captionPos: undefined });
                } else {
                  onPatch({ captionPos: { x: data.captionPos?.x ?? 10, y: Number(v) } });
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
        <Field label="Image URL">
          <input
            type="url"
            value={branding.imageUrl ?? ""}
            onChange={(e) => onPatchBranding({ imageUrl: e.target.value })}
            placeholder={DEFAULT_BRANDING_ASSET_URL}
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
          <Field label="Position X (%)">
            <input
              type="number"
              step={0.1}
              value={branding.pos?.x ?? 2.7}
              onChange={(e) =>
                onPatchBranding({
                  pos: { x: Number(e.target.value), y: branding.pos?.y ?? 94 },
                })
              }
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
          <Field label="Position Y (%)">
            <input
              type="number"
              step={0.1}
              value={branding.pos?.y ?? 94}
              onChange={(e) =>
                onPatchBranding({
                  pos: { x: branding.pos?.x ?? 2.7, y: Number(e.target.value) },
                })
              }
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:border-[#FF005A] focus:outline-none"
            />
          </Field>
        </div>
        <p className="text-[0.7rem] text-black/50 leading-relaxed">
          Default: AI Salon logo on Vercel Blob · height 48px · X 2.7% ·
          Y 94%. You can also drag the brand mark on the canvas directly
          (toggle Edit images) and scroll on it to resize.
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
