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
  Globe2,
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

type Country = {
  id: string;
  name: string;
  code: string;
  flagEmoji: string | null;
  chapters: Chapter[];
};

type Chapter = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
};

const ROLE_LABELS: Record<"favicon" | "loginHero" | "loginBanner", string> = {
  favicon: "Favicon",
  loginHero: "Login hero",
  loginBanner: "Login banner",
};

const ROLE_KEYS = ["favicon", "loginHero", "loginBanner"] as const;
type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * ImagesGallery — Super Admin UI for managing brand images.
 *
 * Functionality:
 *   1. Upload new images to Vercel Blob (POST /api/admin/brand-images)
 *   2. View both stock images (from .images/) and uploaded images (from
 *      Vercel Blob) in a single grid
 *   3. Select any image as the favicon, login hero, or login banner
 *      GLOBALLY (POST /api/admin/brand-images/select)
 *   4. When a chapter is selected in the filter dropdown, ALSO show
 *      per-chapter select buttons (POST /api/admin/chapters/[id]/brand-images/select).
 *      Chapter overrides take precedence when a visitor is on
 *      /c/[chapterSlug] or /login?chapterSlug=….
 *   5. Visual badges show which image is currently selected for each role
 *      — both globally and for the active chapter.
 *
 * Loading, empty, and error states are handled inline.
 */
export function ImagesGallery({
  countries,
  isSuperAdmin,
}: {
  countries: Country[];
  isSuperAdmin: boolean;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chapter filter — when a chapter is selected, the gallery shows
  // per-chapter select buttons + the chapter's current overrides.
  // `chapterId === ""` means "global only" (no chapter filter).
  const [countryId, setCountryId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");

  // Selected chapter object (looked up from countries prop).
  const selectedChapter = useMemo(() => {
    if (!chapterId) return null;
    for (const c of countries) {
      const ch = c.chapters.find((ch) => ch.id === chapterId);
      if (ch) return ch;
    }
    return null;
  }, [countries, chapterId]);

  // When country changes, reset chapter selection (chapters are
  // country-scoped — selecting a different country invalidates the
  // currently selected chapter).
  useEffect(() => {
    setChapterId("");
  }, [countryId]);

  // Chapter-scoped overrides — fetched from the chapter brand-images API
  // when a chapter is selected. Reset to {} when no chapter is selected.
  const [chapterOverrides, setChapterOverrides] = useState<Partial<Selections>>({});
  useEffect(() => {
    if (!chapterId) {
      setChapterOverrides({});
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/chapters/${chapterId}/brand-images`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: { overrides: Partial<Selections> }) => {
        if (!cancelled) setChapterOverrides(json.overrides ?? {});
      })
      .catch((err) => {
        console.warn("[images-gallery] could not load chapter overrides:", err);
        if (!cancelled) setChapterOverrides({});
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

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

  // For each role, find which image is currently selected.
  const isImageSelectedForRole = (img: BrandImage, role: keyof Selections): boolean => {
    return selections[role] === img.url;
  };

  // Same, but for chapter-scoped overrides.
  const isImageSelectedForChapterRole = (
    img: BrandImage,
    role: keyof Selections
  ): boolean => {
    return chapterOverrides[role] === img.url;
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
      const json = await res.json();
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
          ? `${img.name} copied to Vercel Blob and set as ${ROLE_LABELS[role]} (global).`
          : `${img.name} set as ${ROLE_LABELS[role]} (global).`,
      });
    } catch (e) {
      toast.error("Selection failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyKey(null);
    }
  }

  /** Mark an image as the selected one for a given CHAPTER-SCOPED role. */
  async function handleChapterSelect(
    img: BrandImage,
    role: keyof Selections,
    chapter: Chapter
  ) {
    setBusyKey(`cselect:${chapter.id}:${img.url}:${role}`);
    try {
      const source = img.kind === "stock" ? img.name : img.url;
      const res = await fetch(
        `/api/admin/chapters/${chapter.id}/brand-images/select`,
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
      setChapterOverrides((prev) => ({ ...prev, [role]: json.value }));
      toast.success(`${ROLE_LABELS[role]} set for ${chapter.name}`, {
        description:
          img.kind === "stock"
            ? `${img.name} copied to Vercel Blob and set as ${ROLE_LABELS[role]} for ${chapter.name}.`
            : `${img.name} set as ${ROLE_LABELS[role]} for ${chapter.name}.`,
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
  async function handleChapterClear(
    role: keyof Selections,
    chapter: Chapter
  ) {
    setBusyKey(`cclear:${chapter.id}:${role}`);
    try {
      const res = await fetch(
        `/api/admin/chapters/${chapter.id}/brand-images/select`,
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
      setChapterOverrides((prev) => {
        const next = { ...prev };
        delete next[role];
        return next;
      });
      toast.success(`${ROLE_LABELS[role]} override cleared for ${chapter.name}`, {
        description: "Chapter will now fall back to the global selection.",
      });
    } catch (e) {
      toast.error("Clear failed", {
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
          disabled={!isSuperAdmin || busyKey === "upload"}
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
            e.target.value = "";
          }}
        />
      </div>

      {/* Chapter filter — when a chapter is selected, per-chapter
          selection buttons appear on each image card. */}
      <div className="rounded-lg border border-[#820A7D]/20 bg-[#820A7D]/[0.03] p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#820A7D] flex items-center gap-1.5 mb-1">
              <Globe2 className="h-3 w-3" /> Chapter-scoped overrides
            </p>
            <p className="text-xs text-black/60 mt-1.5">
              Select a chapter to set its favicon, login hero, and login banner
              overrides. Chapter overrides take precedence over the global
              defaults when a visitor is on{" "}
              <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">/c/&lt;slug&gt;</code>{" "}
              or{" "}
              <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">/login?chapterSlug=&lt;slug&gt;</code>.
            </p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="block text-[0.65rem] font-semibold uppercase tracking-wider text-black/60 mb-1">
                Country
              </label>
              <select
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#820A7D]"
              >
                <option value="">All countries</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.flagEmoji} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[0.65rem] font-semibold uppercase tracking-wider text-black/60 mb-1">
                Chapter
              </label>
              <select
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#820A7D] min-w-[180px]"
              >
                <option value="">Global only</option>
                {countries
                  .filter((c) => !countryId || c.id === countryId)
                  .flatMap((c) => c.chapters)
                  .map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                      {ch.city ? ` — ${ch.city}` : ""}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Chapter-scoped selections summary — shown when a chapter is
            selected. Each role shows the override URL (or "falling back
            to global") with a Clear button. */}
        {selectedChapter && (
          <div className="mt-4 pt-3 border-t border-[#820A7D]/15">
            <p className="text-xs font-semibold text-[#820A7D] mb-2">
              {selectedChapter.name} chapter — current overrides
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {ROLE_KEYS.map((role) => {
                const url = chapterOverrides[role];
                return (
                  <div
                    key={role}
                    className="rounded-md bg-white border border-black/10 px-3 py-2"
                  >
                    <p className="font-semibold text-black/70 mb-0.5">
                      {ROLE_LABELS[role]}
                    </p>
                    {url ? (
                      <>
                        <p className="text-black/80 truncate font-mono text-[0.7rem]" title={url}>
                          {url}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleChapterClear(role, selectedChapter)}
                          disabled={busyKey !== null}
                          className="mt-1 inline-flex items-center gap-1 text-[0.65rem] font-semibold text-[#FF005A] hover:underline disabled:opacity-50"
                        >
                          <X className="h-3 w-3" /> Clear override
                        </button>
                      </>
                    ) : (
                      <p className="text-black/40 italic text-[0.7rem]">
                        Falling back to global
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Global selections summary */}
      <div className="rounded-lg border border-black/10 bg-white px-4 py-3">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-black/50 mb-2">
          Global selections (site-wide defaults)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {ROLE_KEYS.map((role) => {
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
          const selectedGlobalRoles = ROLE_KEYS.filter((role) =>
            isImageSelectedForRole(img, role)
          );
          const selectedChapterRoles = selectedChapter
            ? ROLE_KEYS.filter((role) => isImageSelectedForChapterRole(img, role))
            : [];
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
                {/* Selected role badges — global (pink) + chapter (purple) */}
                {(selectedGlobalRoles.length > 0 || selectedChapterRoles.length > 0) && (
                  <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                    {selectedGlobalRoles.map((role) => (
                      <span
                        key={`g-${role}`}
                        className="inline-flex items-center gap-1 rounded bg-[#FF005A] px-1.5 py-0.5 text-[0.6rem] font-semibold text-white"
                      >
                        <BadgeCheck className="h-3 w-3" />
                        {ROLE_LABELS[role]} (global)
                      </span>
                    ))}
                    {selectedChapterRoles.map((role) => (
                      <span
                        key={`c-${role}`}
                        className="inline-flex items-center gap-1 rounded bg-[#820A7D] px-1.5 py-0.5 text-[0.6rem] font-semibold text-white"
                      >
                        <BadgeCheck className="h-3 w-3" />
                        {ROLE_LABELS[role]} ({selectedChapter?.name})
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

                {/* GLOBAL select-as buttons */}
                <div className="mt-3">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-black/50 mb-1">
                    Global
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {ROLE_KEYS.map((role) => {
                      const isSelected = selectedGlobalRoles.includes(role);
                      const busy = busyKey === `select:${img.url}:${role}`;
                      return (
                        <button
                          key={`g-btn-${role}`}
                          type="button"
                          onClick={() => handleSelect(img, role)}
                          disabled={!isSuperAdmin || busyKey !== null}
                          className={`inline-flex items-center justify-center gap-1 rounded px-1.5 py-1.5 text-[0.65rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            isSelected
                              ? "bg-[#FF005A] text-white hover:bg-[#D8004D]"
                              : "bg-black/[0.05] text-black/70 hover:bg-black/[0.1]"
                          }`}
                          title={`Set as ${ROLE_LABELS[role]} (global)`}
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

                {/* CHAPTER-scoped select-as buttons — only shown when a
                    chapter is selected in the filter. */}
                {selectedChapter && (
                  <div className="mt-2">
                    <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-[#820A7D] mb-1">
                      {selectedChapter.name} chapter
                    </p>
                    <div className="grid grid-cols-3 gap-1">
                      {ROLE_KEYS.map((role) => {
                        const isSelected = selectedChapterRoles.includes(role);
                        const busy =
                          busyKey === `cselect:${selectedChapter.id}:${img.url}:${role}`;
                        return (
                          <button
                            key={`c-btn-${role}`}
                            type="button"
                            onClick={() => handleChapterSelect(img, role, selectedChapter)}
                            disabled={!isSuperAdmin || busyKey !== null}
                            className={`inline-flex items-center justify-center gap-1 rounded px-1.5 py-1.5 text-[0.65rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                              isSelected
                                ? "bg-[#820A7D] text-white hover:bg-[#6a0868]"
                                : "bg-[#820A7D]/10 text-[#820A7D] hover:bg-[#820A7D]/20"
                            }`}
                            title={`Set as ${ROLE_LABELS[role]} for ${selectedChapter.name}`}
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
                )}
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
