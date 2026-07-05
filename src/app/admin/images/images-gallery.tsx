"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  ExternalLink,
  Images,
  Loader2,
  Star,
  Upload,
} from "lucide-react";

type BrandImage = {
  name: string;
  size: number;
  mimeType: string;
  url: string;
  kind: "stock" | "uploaded";
};

type Selections = {
  favicon: string;
  loginHero: string;
  loginBanner: string;
};

type ApiResponse = {
  images: BrandImage[];
  selections: Selections;
};

const ROLE_LABELS: Record<"favicon" | "loginHero" | "loginBanner", string> = {
  favicon: "Favicon",
  loginHero: "Login hero",
  loginBanner: "Login banner",
};

/**
 * ImagesGallery — Super Admin UI for managing brand images.
 *
 * Functionality:
 *   1. Upload new images to Vercel Blob (POST /api/admin/brand-images)
 *   2. View both stock images (from .images/) and uploaded images (from
 *      Vercel Blob) in a single grid
 *   3. Select any image as the favicon, login hero, or login banner
 *      (POST /api/admin/brand-images/select — auto-copies stock images
 *      to Vercel Blob so the resulting URL is publicly accessible)
 *   4. Visual badges show which image is currently selected for each role
 *
 * Loading, empty, and error states are handled inline.
 */
export function ImagesGallery() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null); // "upload" | "select:imgIdx:role" | null
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/brand-images", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load images");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const images = data?.images ?? [];
  const selections = data?.selections ?? { favicon: "", loginHero: "", loginBanner: "" };

  // Map a selection URL back to the image card it belongs to (so we can
  // show a "Currently selected" badge on the right card).
  const selectionToImageIdx = useMemo(() => {
    const map: Record<string, number> = {};
    images.forEach((img, idx) => {
      // Match by URL (for uploaded images selected via their direct URL) or
      // by name (for stock images selected — the URL stored is the resulting
      // Vercel Blob URL, which won't match the .images/ source URL, so we
      // also store a fallback match by image name).
      map[img.url] = idx;
    });
    return map;
  }, [images]);

  // For each role, find which image is currently selected.
  // We compare by URL — if a stock image was previously selected, its
  // selection URL is a Vercel Blob URL (because we copied the bytes on
  // select), so it WON'T match the stock image's URL. The user just
  // sees "currently set" status only on uploaded-image cards that match.
  const isImageSelectedForRole = (img: BrandImage, role: keyof Selections): boolean => {
    return selections[role] === img.url;
  };

  /** Handle file upload via input or drag-and-drop. */
  async function handleUpload(file: File) {
    setBusyKey("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/brand-images", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Upload failed (${res.status})`);
      }
      toast.success("Image uploaded", { description: file.name });
      await load();
    } catch (e) {
      toast.error("Upload failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyKey(null);
    }
  }

  /** Mark an image as the selected one for a given role. */
  async function handleSelect(img: BrandImage, role: keyof Selections) {
    setBusyKey(`select:${img.url}:${role}`);
    try {
      // For stock images, send the bare filename; the server copies bytes
      // to Vercel Blob and returns the new public URL.
      // For uploaded images, send the Blob URL directly.
      const source = img.kind === "stock" ? img.name : img.url;
      const res = await fetch("/api/admin/brand-images/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: role, source }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Select failed (${res.status})`);
      }
      const json = await res.json();
      // Optimistically update local state with the new selection URL.
      setData((prev) =>
        prev
          ? {
              ...prev,
              selections: { ...prev.selections, [role]: json.value },
            }
          : prev
      );
      toast.success(`${ROLE_LABELS[role]} updated`, {
        description: img.kind === "stock"
          ? `${img.name} copied to Vercel Blob and set as ${ROLE_LABELS[role]}.`
          : `${img.name} set as ${ROLE_LABELS[role]}.`,
      });
    } catch (e) {
      toast.error("Selection failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyKey(null);
    }
  }

  // ---- Loading / Error / Empty states ----

  if (data === null && error === null) {
    return (
      <div className="flex items-center justify-center py-20 text-black/80">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading brand images…
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700 flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-1">Could not load images</p>
          <p className="text-red-600/80">{error}</p>
        </div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="rounded-md border border-black/10 bg-black/[0.02] px-4 py-12 text-center">
        <Images className="h-8 w-8 mx-auto text-black/30 mb-3" />
        <p className="text-sm font-semibold text-black/70">No images yet</p>
        <p className="text-xs text-black/50 mt-1">
          Upload your first brand image using the button above.
        </p>
      </div>
    );
  }

  // ---- Main UI ----

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleUpload(f);
        }}
        className={`rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragOver ? "border-[#FF005A] bg-[#FF005A]/5" : "border-black/15 bg-black/[0.02]"
        }`}
      >
        <Upload className="h-6 w-6 mx-auto text-black/80 mb-2" />
        <p className="text-sm text-black/70 mb-2">
          <span className="font-semibold">Click to upload</span> or drag & drop
        </p>
        <p className="text-[0.7rem] text-black/80 mb-3">
          JPG, PNG, WebP, GIF, AVIF — max 8 MB. Stored in Vercel Blob.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busyKey === "upload"}
          className="inline-flex items-center gap-2 rounded-md bg-[#FF005A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#D8004D] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busyKey === "upload" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              Choose file
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            // Reset value so the same file can be selected again later.
            e.target.value = "";
          }}
        />
      </div>

      {/* Selections summary */}
      <div className="rounded-lg border border-black/10 bg-white px-4 py-3">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-black/50 mb-2">
          Current selections
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {(["favicon", "loginHero", "loginBanner"] as const).map((role) => {
            const url = selections[role];
            const isDefault = !url;
            return (
              <div key={role} className="rounded-md bg-black/[0.03] px-3 py-2">
                <p className="font-semibold text-black/70 mb-0.5">{ROLE_LABELS[role]}</p>
                <p className="text-black/80 truncate" title={url}>
                  {isDefault ? "(default)" : url}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats line */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-black/80">
          <span className="font-semibold text-black">{images.length}</span> image
          {images.length === 1 ? "" : "s"}{" "}
          <span className="text-black/80">
            ({images.filter((i) => i.kind === "uploaded").length} uploaded,{" "}
            {images.filter((i) => i.kind === "stock").length} stock)
          </span>
        </p>
        <p className="text-xs text-black/80">
          Total: {formatBytes(images.reduce((sum, img) => sum + img.size, 0))}
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {images.map((img) => {
          const selectedRoles = (["favicon", "loginHero", "loginBanner"] as const).filter(
            (role) => isImageSelectedForRole(img, role)
          );
          return (
            <article
              key={`${img.kind}:${img.url}`}
              className="group rounded-lg border border-black/10 bg-white overflow-hidden ais-lift"
            >
              {/* Image preview */}
              <div className="relative aspect-[4/3] bg-black/[0.03] overflow-hidden">
                <Image
                  src={img.url}
                  alt={img.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-contain p-2"
                  unoptimized
                />
                {/* Kind badge (stock vs uploaded) */}
                <span
                  className={`absolute top-2 left-2 rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${
                    img.kind === "uploaded"
                      ? "bg-[#00E6FF]/90 text-[#004F98]"
                      : "bg-black/70 text-white"
                  }`}
                >
                  {img.kind}
                </span>
                {/* Selected role badges */}
                {selectedRoles.length > 0 && (
                  <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                    {selectedRoles.map((role) => (
                      <span
                        key={role}
                        className="inline-flex items-center gap-1 rounded bg-[#FF005A] px-1.5 py-0.5 text-[0.6rem] font-semibold text-white"
                      >
                        <BadgeCheck className="h-3 w-3" />
                        {ROLE_LABELS[role]}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Metadata + actions */}
              <div className="px-3 py-2.5 border-t border-black/5">
                <p
                  className="text-sm font-semibold text-black truncate"
                  title={img.name}
                >
                  {img.name}
                </p>
                <div className="mt-1 flex items-center justify-between text-[0.7rem] text-black/50">
                  <span className="font-mono">{img.mimeType}</span>
                  <span>{formatBytes(img.size)}</span>
                </div>
                <div className="mt-1">
                  <Link
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-[#FF005A] hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open original
                  </Link>
                </div>

                {/* Select-as buttons */}
                <div className="mt-3 grid grid-cols-3 gap-1">
                  {(["favicon", "loginHero", "loginBanner"] as const).map((role) => {
                    const isSelected = selectedRoles.includes(role);
                    const busy = busyKey === `select:${img.url}:${role}`;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleSelect(img, role)}
                        disabled={busyKey !== null}
                        className={`inline-flex items-center justify-center gap-1 rounded px-1.5 py-1.5 text-[0.65rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          isSelected
                            ? "bg-[#FF005A] text-white hover:bg-[#D8004D]"
                            : "bg-black/[0.05] text-black/70 hover:bg-black/[0.1]"
                        }`}
                        title={`Set as ${ROLE_LABELS[role]}`}
                      >
                        {busy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isSelected ? (
                          <BadgeCheck className="h-3 w-3" />
                        ) : (
                          <Star className="h-3 w-3" />
                        )}
                        <span className="truncate">{ROLE_LABELS[role]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** Formats a byte count as a human-readable string (e.g. "454 KB"). */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, i);
  const rounded = i === 0 ? value : value.toFixed(value < 10 ? 1 : 0);
  return `${rounded} ${units[i]}`;
}
