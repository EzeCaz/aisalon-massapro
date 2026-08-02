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
  X,
  RefreshCw,
} from "lucide-react";

/**
 * ChapterBrandImagesEditor — per-chapter brand image override picker.
 *
 * Shown inside the chapter editor at /admin/chapters/[id] and
 * /admin/c/[slug]. Lets Super Admin / Admin / Chapter Organizer pick
 * the favicon, login hero, and login banner FOR THIS SPECIFIC CHAPTER
 * — overriding the global defaults when visitors are on /c/[slug] or
 * /login?chapterSlug=[slug].
 *
 * Image sources shown in the gallery (matches /admin/images):
 *   - The 3 globally-selected defaults (favicon, loginHero, loginBanner)
 *   - The curated global brand library (canonical AI Salon logos/mascots)
 *   - This chapter's already-set override images (so the admin can
 *     see / re-pick what they previously chose)
 *
 * Writes go to POST /api/admin/chapters/[chapterId]/brand-images/select,
 * which enforces scope (Super Admin = any chapter; Admin = own country;
 * Chapter Organizer = own chapter).
 *
 * The component is read-only when `canEdit` is false — gallery is
 * visible but select / clear buttons are disabled.
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

type ChapterOverridesResponse = {
  chapter: { id: string; name: string; slug: string };
  overrides: Partial<Selections>;
  global: Selections;
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

export function ChapterBrandImagesEditor({
  chapterId,
  chapterName,
  canEdit,
}: {
  chapterId: string;
  chapterName: string;
  canEdit: boolean;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [overrides, setOverrides] = useState<Partial<Selections>>({});
  const [globalSettings, setGlobalSettings] = useState<Selections | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  // Load the image list + chapter overrides in parallel on mount.
  const load = async () => {
    try {
      const [galleryRes, overridesRes] = await Promise.all([
        fetch("/api/admin/brand-images", { cache: "no-store" }),
        fetch(`/api/admin/chapters/${chapterId}/brand-images`, { cache: "no-store" }),
      ]);
      if (!galleryRes.ok) throw new Error(`Gallery HTTP ${galleryRes.status}`);
      if (!overridesRes.ok) throw new Error(`Overrides HTTP ${overridesRes.status}`);
      const gallery = (await galleryRes.json()) as ApiResponse;
      const overridesJson = (await overridesRes.json()) as ChapterOverridesResponse;
      setData(gallery);
      setOverrides(overridesJson.overrides ?? {});
      setGlobalSettings(overridesJson.global ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load brand images");
    }
  };

  useEffect(() => {
    load();
  }, [chapterId]);

  const images = data?.images ?? [];

  // For each role, find which image is currently selected as the
  // chapter override (vs the global default).
  const isImageSelectedForChapterRole = (
    img: BrandImage,
    role: keyof Selections
  ): boolean => {
    return overrides[role] === img.url;
  };

  /** Mark an image as the selected one for a given CHAPTER-SCOPED role. */
  async function handleChapterSelect(img: BrandImage, role: keyof Selections) {
    setBusyKey(`cselect:${img.url}:${role}`);
    try {
      const source = img.kind === "stock" ? img.name : img.url;
      const res = await fetch(
        `/api/admin/chapters/${chapterId}/brand-images/select`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: role, source }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Select failed (${res.status})`);
      }
      const json = await res.json();
      setOverrides((prev) => ({ ...prev, [role]: json.value }));
      toast.success(`${ROLE_LABELS[role]} set for ${chapterName}`, {
        description:
          img.kind === "stock"
            ? `${img.name} copied to Vercel Blob and set as ${ROLE_LABELS[role]} for ${chapterName}.`
            : `${img.name} set as ${ROLE_LABELS[role]} for ${chapterName}.`,
      });
    } catch (e) {
      toast.error("Chapter selection failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyKey(null);
    }
  }

  /** Remove a chapter-scoped override for a given role. */
  async function handleChapterClear(role: keyof Selections) {
    setBusyKey(`cclear:${role}`);
    try {
      const res = await fetch(
        `/api/admin/chapters/${chapterId}/brand-images/select`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: role, clear: true }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Clear failed (${res.status})`);
      }
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[role];
        return next;
      });
      toast.success(`${ROLE_LABELS[role]} override cleared for ${chapterName}`, {
        description: "Chapter will now fall back to the global default.",
      });
    } catch (e) {
      toast.error("Clear failed", {
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
        Loading brand images…
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold mb-1">Could not load brand images</p>
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
      <div>
        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[#820A7D] mb-1">
          Chapter brand images
        </p>
        <p className="text-xs text-black/70">
          Override the global favicon, login hero, and login banner{" "}
          <strong>for the {chapterName} chapter only</strong>. Overrides take
          effect when visitors are on{" "}
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">/c/&lt;slug&gt;</code>{" "}
          or{" "}
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">/login?chapterSlug=&lt;slug&gt;</code>.
          If no override is set, the chapter falls back to the global default.
        </p>
        {!canEdit && (
          <p className="mt-2 text-[0.7rem] text-black/60 italic">
            You don&rsquo;t have permission to edit this chapter&rsquo;s brand
            images. The gallery below is read-only.
          </p>
        )}
      </div>

      {/* Current overrides summary — 3 cards showing the current state
          for each role (override URL or "falling back to global"). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROLE_KEYS.map((role) => {
          const url = overrides[role];
          const globalUrl = globalSettings?.[role] ?? "";
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
                {url && canEdit && (
                  <button
                    type="button"
                    onClick={() => handleChapterClear(role)}
                    disabled={busyKey !== null}
                    className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-[#FF005A] hover:underline disabled:opacity-50"
                    title={`Clear ${ROLE_LABELS[role]} override (fall back to global)`}
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              {url ? (
                <div className="space-y-1.5">
                  <div className="relative h-16 w-full rounded bg-black/[0.03] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${ROLE_LABELS[role]} override`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <p
                    className="text-[0.65rem] text-black/60 truncate font-mono"
                    title={url}
                  >
                    {url}
                  </p>
                  <p className="text-[0.6rem] font-semibold text-[#820A7D]">
                    Chapter override active
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {globalUrl && (
                    <div className="relative h-16 w-full rounded bg-black/[0.03] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={globalUrl}
                        alt={`${ROLE_LABELS[role]} global default`}
                        className="h-full w-full object-contain opacity-70"
                      />
                    </div>
                  )}
                  <p
                    className="text-[0.65rem] text-black/50 truncate font-mono"
                    title={globalUrl}
                  >
                    {globalUrl || "(no global default set)"}
                  </p>
                  <p className="text-[0.6rem] text-black/50 italic">
                    Falling back to global default
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
        className="inline-flex items-center gap-1.5 rounded-md border border-[#820A7D] text-[#820A7D] font-semibold px-3 py-1.5 text-xs hover:bg-[#820A7D] hover:text-white transition"
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
              No images available. Ask a Super Admin to upload brand images
              via /admin/images first.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {images.map((img) => {
                const selectedChapterRoles = ROLE_KEYS.filter((role) =>
                  isImageSelectedForChapterRole(img, role)
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
                      {selectedChapterRoles.length > 0 && (
                        <div className="absolute top-1 right-1 flex flex-col gap-0.5 items-end">
                          {selectedChapterRoles.map((role) => (
                            <span
                              key={`c-${role}`}
                              className="inline-flex items-center gap-0.5 rounded bg-[#820A7D] px-1 py-0.5 text-[0.55rem] font-semibold text-white"
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
                          const isSelected = selectedChapterRoles.includes(role);
                          const busy =
                            busyKey === `cselect:${img.url}:${role}`;
                          return (
                            <button
                              key={`c-btn-${role}`}
                              type="button"
                              onClick={() =>
                                handleChapterSelect(img, role)
                              }
                              disabled={!canEdit || busyKey !== null}
                              className={`inline-flex items-center justify-center gap-0.5 rounded px-1 py-1 text-[0.6rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                isSelected
                                  ? "bg-[#820A7D] text-white hover:bg-[#6a0868]"
                                  : "bg-[#820A7D]/10 text-[#820A7D] hover:bg-[#820A7D]/20"
                              }`}
                              title={`Set as ${ROLE_LABELS[role]} for ${chapterName}`}
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
            Only images you have permission to use are shown. Super Admins
            can upload new images at{" "}
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
