"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X, Search, Loader2, ImageIcon, Check } from "lucide-react";

/**
 * ImagePickerModal — reusable image picker that pulls from two sources:
 *
 *   1. Brand library — GET /api/admin/brand-images (uploaded Vercel Blobs
 *      + stock .images/ folder). Visible to all admins.
 *   2. Event gallery — GET /api/events/[slug]/images (rich EventImage
 *      rows with dimensions, uploader, caption). Only available when
 *      an event slug is passed.
 *
 * Uploads go to POST /api/admin/brand-images (SUPER_ADMIN only).
 *
 * On select, calls onPick(url) with the chosen image URL string.
 */

export type BrandImage = {
  name: string;
  size: number;
  mimeType: string;
  url: string;
  kind: "stock" | "uploaded";
};

export type EventImage = {
  id: string;
  fileName: string;
  fileUrl: string;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  mimeType?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
  /** Optional event slug — enables the "Event images" tab. */
  eventSlug?: string;
  /** Optional pre-selected URL — highlights the currently selected image. */
  currentUrl?: string;
  /** Filter the kind of images returned. Defaults to all. */
  accept?: "all" | "photo" | "logo";
};

type Tab = "brand" | "event";

export function ImagePickerModalShared({
  open,
  onClose,
  onPick,
  eventSlug,
  currentUrl,
  accept = "all",
}: Props) {
  const [tab, setTab] = useState<Tab>(eventSlug ? "event" : "brand");
  const [brandImages, setBrandImages] = useState<BrandImage[]>([]);
  const [eventImages, setEventImages] = useState<EventImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load brand images when the brand tab is shown.
  const loadBrandImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/brand-images", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setError("You need Super Admin rights to view the brand library.");
          setBrandImages([]);
          return;
        }
        throw new Error(`Failed to load brand images (HTTP ${res.status})`);
      }
      const json = (await res.json()) as { images: BrandImage[] };
      setBrandImages(json.images ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
      setBrandImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load event images when the event tab is shown.
  const loadEventImages = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${slug}/images`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Failed to load event images (HTTP ${res.status})`);
      }
      const json = (await res.json()) as { images: EventImage[] };
      setEventImages(json.images ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
      setEventImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on tab switch / open.
  useEffect(() => {
    if (!open) return;
    if (tab === "brand") loadBrandImages();
    else if (tab === "event" && eventSlug) loadEventImages(eventSlug);
  }, [open, tab, eventSlug, loadBrandImages, loadEventImages]);

  // Close on ESC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Upload handler.
  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/brand-images", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Upload failed (HTTP ${res.status})`);
      }
      const json = (await res.json()) as {
        image: BrandImage;
      };
      setBrandImages((prev) => [json.image, ...prev]);
      // Auto-pick the freshly uploaded image.
      onPick(json.image.url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filteredBrand = search.trim()
    ? brandImages.filter((img) =>
        img.name.toLowerCase().includes(search.toLowerCase()),
      )
    : brandImages;

  const filteredEvent = search.trim()
    ? eventImages.filter((img) =>
        (img.fileName + " " + (img.caption ?? ""))
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : eventImages;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/10">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-black/60" />
            <h2 className="text-base font-bold text-black">Pick an image</h2>
            <span className="text-xs text-black/40">
              · {accept === "logo" ? "logos" : accept === "photo" ? "photos" : "all"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/50 hover:bg-black/5 hover:text-black"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs + search + upload */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-black/10 bg-black/[0.02]">
          <div className="flex rounded-md border border-black/15 overflow-hidden">
            <button
              type="button"
              onClick={() => setTab("brand")}
              className={`px-3 py-1.5 text-xs font-semibold ${
                tab === "brand"
                  ? "bg-black text-white"
                  : "bg-white text-black/70 hover:bg-black/5"
              }`}
            >
              Brand library
            </button>
            {eventSlug && (
              <button
                type="button"
                onClick={() => setTab("event")}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  tab === "event"
                    ? "bg-black text-white"
                    : "bg-white text-black/70 hover:bg-black/5"
                }`}
              >
                This event&apos;s gallery
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-1 max-w-xs rounded-md border border-black/15 bg-white px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-black/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="flex-1 bg-transparent outline-none text-xs text-black placeholder:text-black/40"
            />
          </div>

          <label
            className={`ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
              uploading
                ? "bg-black/40 text-white/70 cursor-wait"
                : "bg-[#FF005A] text-white hover:bg-[#FF005A]/90"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" /> Upload
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
              className="hidden"
            />
          </label>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 px-3 py-2 text-xs text-[#FF005A]">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-48 text-black/40">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading images…
            </div>
          ) : tab === "brand" ? (
            filteredBrand.length === 0 ? (
              <EmptyState label="No brand images found. Upload one to get started." />
            ) : (
              <ImageGrid
                images={filteredBrand.map((img) => ({
                  url: img.url,
                  name: img.name,
                  sub: `${img.kind} · ${formatBytes(img.size)}`,
                }))}
                currentUrl={currentUrl}
                onPick={(url) => {
                  onPick(url);
                  onClose();
                }}
              />
            )
          ) : filteredEvent.length === 0 ? (
            <EmptyState label="No event images yet. Upload some on the event page first." />
          ) : (
            <ImageGrid
              images={filteredEvent.map((img) => ({
                url: img.fileUrl,
                name: img.fileName,
                sub:
                  img.width && img.height
                    ? `${img.width}×${img.height}`
                    : img.caption || "",
              }))}
              currentUrl={currentUrl}
              onPick={(url) => {
                onPick(url);
                onClose();
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-black/10 bg-black/[0.02] flex items-center justify-between text-xs text-black/50">
          <span>
            {tab === "brand"
              ? `${brandImages.length} images in brand library`
              : `${eventImages.length} images in this event's gallery`}
          </span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
}

function ImageGrid({
  images,
  currentUrl,
  onPick,
}: {
  images: Array<{ url: string; name: string; sub: string }>;
  currentUrl?: string;
  onPick: (url: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {images.map((img) => {
        const selected = currentUrl === img.url;
        return (
          <button
            type="button"
            key={img.url}
            onClick={() => onPick(img.url)}
            className={`group relative aspect-square rounded-md overflow-hidden border-2 bg-black/5 transition ${
              selected
                ? "border-[#FF005A] ring-2 ring-[#FF005A]/30"
                : "border-transparent hover:border-black/30"
            }`}
            title={img.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={img.name}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <p className="text-[0.65rem] font-semibold text-white truncate">
                {img.name}
              </p>
              {img.sub && (
                <p className="text-[0.6rem] text-white/60 truncate">{img.sub}</p>
              )}
            </div>
            {selected && (
              <div className="absolute top-1 right-1 rounded-full bg-[#FF005A] p-1">
                <Check className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center text-black/40">
      <ImageIcon className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
