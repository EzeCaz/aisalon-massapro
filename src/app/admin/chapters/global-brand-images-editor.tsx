"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  Images,
  Loader2,
  Star,
  RefreshCw,
  Upload,
} from "lucide-react";

/**
 * GlobalBrandImagesEditor — super-admin picker for the 3 GLOBAL brand images.
 *
 * Shown at the top of /admin/chapters (Super Admin only). Lets the Super
 * Admin pick the site-wide favicon, login hero, and login banner — used
 * on every page that doesn't have a chapter-specific override.
 *
 * Image sources shown in the gallery (same as /admin/images):
 *   - Stock images from the hidden `.images/` folder (admin-only)
 *   - Uploaded images in Vercel Blob (brand-assets/ prefix)
 *   - The 3 currently-selected global defaults
 *
 * Writes go to POST /api/admin/brand-images/select, which is
 * SUPER_ADMIN-only (enforced server-side).
 *
 * Per-chapter overrides are managed separately — either:
 *   - On each chapter's edit page at /admin/chapters/[id] (ChapterBrandImagesEditor)
 *   - Or via the full gallery at /admin/images (ImagesGallery with chapter filter)
 *
 * This component is the "quick access" global picker — for uploads and the
 * full gallery experience, the Super Admin should use /admin/images.
 */

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

const ROLE_HINTS: Record<"favicon" | "loginHero" | "loginBanner", string> = {
  favicon: "Browser tab icon (32×32 or larger, square)",
  loginHero: "Square mascot image on the login page right panel",
  loginBanner: "Wide hero image used as login page background / OG image",
};

const ROLE_KEYS = ["favicon", "loginHero", "loginBanner"] as const;
type RoleKey = (typeof ROLE_KEYS)[number];

export function GlobalBrandImagesEditor({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  // Load the image list + current global selections on mount.
  const load = async () => {
    try {
      const res = await fetch("/api/admin/brand-images", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load brand images");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const images = data?.images ?? [];
  const selections = data?.selections ?? {
    favicon: "",
    loginHero: "",
    loginBanner: "",
  };

  // For each role, find which image is currently selected as the global default.
  const isImageSelectedForRole = (
    img: BrandImage,
    role: keyof Selections
  ): boolean => {
    return selections[role] === img.url;
  };

  /** Mark an image as the selected one for a given GLOBAL role. */
  async function handleSelect(img: BrandImage, role: keyof Selections) {
    setBusyKey(`select:${img.url}:${role}`);
    try {
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
      const json = (await res.json()) as { ok: boolean; key: string; value: string };
      setData((prev) =>
        prev
          ? {
              ...prev,
              selections: { ...prev.selections, [role]: json.value },
            }
          : prev
      );
      toast.success(`${ROLE_LABELS[role]} set as global default`, {
        description:
          img.kind === "stock"
            ? `${img.name} copied to Vercel Blob and set as the global ${ROLE_LABELS[role]}.`
            : `${img.name} set as the global ${ROLE_LABELS[role]}.`,
      });
    } catch (e) {
      toast.error("Global selection failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyKey(null);
    }
  }

  // ---- Loading / Error states ----

  if (data === null && error === null) {
    return (
      <div className="flex items-center justify-center py-8 text-black/80 text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading global brand images…
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold mb-1">Could not load global brand images</p>
          <p className="text-red-600/80 text-xs">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-[0.7rem] font-semibold text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[#FF005A] mb-1">
            Global brand images
          </p>
          <p className="text-xs text-black/70">
            Set the site-wide <strong>favicon</strong>, <strong>login hero</strong>,
            and <strong>login banner</strong>. These are used on every page that
            doesn&rsquo;t have a chapter-specific override. Changes take effect
            immediately on the next page load — no redeploy needed.
          </p>
          {!canEdit && (
            <p className="mt-2 text-[0.7rem] text-black/60 italic">
              You don&rsquo;t have permission to edit global brand images. The
              gallery below is read-only.
            </p>
          )}
        </div>
        {canEdit && (
          <Link
            href="/admin/images"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#FF005A] text-[#FF005A] font-semibold px-3 py-1.5 text-xs hover:bg-[#FF005A] hover:text-white whitespace-nowrap transition"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload new image
          </Link>
        )}
      </div>

      {/* Current global selections summary — 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROLE_KEYS.map((role) => {
          const url = selections[role] ?? "";
          return (
            <div
              key={role}
              className="rounded-md border border-black/10 bg-white px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <p className="text-xs font-semibold text-black/80">
                    {ROLE_LABELS[role]}
                  </p>
                  <p className="text-[0.65rem] text-black/50">
                    {ROLE_HINTS[role]}
                  </p>
                </div>
              </div>
              {url ? (
                <div className="space-y-1.5">
                  <div className="relative h-16 w-full rounded bg-black/[0.03] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${ROLE_LABELS[role]} global default`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <p
                    className="text-[0.65rem] text-black/60 truncate font-mono"
                    title={url}
                  >
                    {url}
                  </p>
                  <p className="text-[0.6rem] font-semibold text-[#FF005A]">
                    Global default active
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="h-16 w-full rounded bg-black/[0.03] flex items-center justify-center">
                    <Images className="h-5 w-5 text-black/30" />
                  </div>
                  <p className="text-[0.65rem] text-black/50 italic">
                    No global default set
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Toggle gallery button */}
      <button
        type="button"
        onClick={() => setShowGallery((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#FF005A] text-[#FF005A] font-semibold px-3 py-1.5 text-xs hover:bg-[#FF005A] hover:text-white transition"
      >
        <Images className="h-3.5 w-3.5" />
        {showGallery ? "Hide image gallery" : "Pick from image gallery"}
      </button>

      {/* Gallery — shows all pickable images, with per-role set buttons */}
      {showGallery && (
        <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-black/70">
              {images.length} image{images.length === 1 ? "" : "s"} available
            </p>
            <button
              type="button"
              onClick={load}
              disabled={busyKey !== null}
              className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-black/60 hover:text-black hover:underline disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>

          {images.length === 0 ? (
            <div className="rounded-md bg-white border border-black/10 px-4 py-6 text-center text-xs text-black/60">
              <Images className="h-6 w-6 mx-auto text-black/30 mb-2" />
              No images available. Upload brand images at{" "}
              <Link
                href="/admin/images"
                className="text-[#FF005A] hover:underline font-semibold"
              >
                /admin/images
              </Link>
              .
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {images.map((img) => {
                const selectedRoles = ROLE_KEYS.filter((role) =>
                  isImageSelectedForRole(img, role)
                );
                return (
                  <article
                    key={`${img.kind}:${img.url}`}
                    className="group rounded-md border border-black/10 bg-white overflow-hidden"
                  >
                    {/* Image preview */}
                    <div className="relative aspect-[4/3] bg-black/[0.03] overflow-hidden">
                      <Image
                        src={img.url}
                        alt={img.name}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-contain p-1.5"
                        unoptimized
                      />
                      <span
                        className={`absolute top-1 left-1 rounded px-1 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide ${
                          img.kind === "uploaded"
                            ? "bg-[#00E6FF]/90 text-[#004F98]"
                            : "bg-black/70 text-white"
                        }`}
                      >
                        {img.kind}
                      </span>
                      {selectedRoles.length > 0 && (
                        <div className="absolute top-1 right-1 flex flex-col gap-0.5 items-end">
                          {selectedRoles.map((role) => (
                            <span
                              key={`g-${role}`}
                              className="inline-flex items-center gap-0.5 rounded bg-[#FF005A] px-1 py-0.5 text-[0.55rem] font-semibold text-white"
                            >
                              <BadgeCheck className="h-2.5 w-2.5" />
                              {ROLE_LABELS[role]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="px-2 py-1.5 border-t border-black/5">
                      <p
                        className="text-[0.7rem] font-semibold text-black truncate"
                        title={img.name}
                      >
                        {img.name}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between text-[0.6rem] text-black/50">
                        <span className="font-mono">{img.mimeType}</span>
                        <span>{formatBytes(img.size)}</span>
                      </div>

                      {/* Per-role set buttons */}
                      <div className="mt-1.5 grid grid-cols-3 gap-0.5">
                        {ROLE_KEYS.map((role) => {
                          const isSelected = selectedRoles.includes(role);
                          const busy = busyKey === `select:${img.url}:${role}`;
                          return (
                            <button
                              key={`g-btn-${role}`}
                              type="button"
                              onClick={() => handleSelect(img, role)}
                              disabled={!canEdit || busyKey !== null}
                              className={`inline-flex items-center justify-center gap-0.5 rounded px-1 py-1 text-[0.6rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                isSelected
                                  ? "bg-[#FF005A] text-white hover:bg-[#d1004b]"
                                  : "bg-[#FF005A]/10 text-[#FF005A] hover:bg-[#FF005A]/20"
                              }`}
                              title={`Set as global ${ROLE_LABELS[role]}`}
                            >
                              {busy ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : isSelected ? (
                                <BadgeCheck className="h-2.5 w-2.5" />
                              ) : (
                                <Star className="h-2.5 w-2.5" />
                              )}
                              <span className="truncate">
                                {ROLE_LABELS[role]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Helper text */}
          <p className="text-[0.7rem] text-black/50">
            For the full gallery experience (including uploads and per-chapter
            overrides in one place), visit{" "}
            <Link
              href="/admin/images"
              className="text-[#FF005A] hover:underline font-semibold"
            >
              /admin/images
            </Link>
            .
          </p>
        </div>
      )}
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
