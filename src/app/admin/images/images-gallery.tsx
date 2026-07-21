"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe2,
  Images,
  Loader2,
  Star,
  Upload,
  X,
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

type Country = {
  id: string;
  name: string;
  code: string;
  flagEmoji: string | null;
  chapters: Array<{
    id: string;
    name: string;
    slug: string;
    city: string | null;
  }>;
};

type ApiResponse = {
  images: BrandImage[];
  selections: Selections;
  /** chapterId → { key: value } */
  chapterSelections: Record<string, Record<string, string>>;
  countries: Country[];
};

const ROLE_LABELS: Record<"favicon" | "loginHero" | "loginBanner", string> = {
  favicon: "Favicon",
  loginHero: "Login hero",
  loginBanner: "Login banner",
};

type RoleKey = "favicon" | "loginHero" | "loginBanner";
type Scope =
  | { type: "global" }
  | { type: "chapter"; chapterId: string; chapterName: string; chapterSlug: string };

/**
 * ImagesGallery — Super Admin UI for managing brand images.
 *
 * Each image card has 3 buttons: Favicon · Login hero · Login banner.
 * Clicking a button opens a picker modal where the admin picks the target
 * scope — either Global (applies to the main /login page) or a specific
 * chapter (applies to /c/[chapterSlug]).
 */
export function ImagesGallery() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Picker modal state — when non-null, modal is open for this
  // (image, role) tuple. The modal asks the user to pick a scope.
  const [picker, setPicker] = useState<{ img: BrandImage; role: RoleKey } | null>(null);

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
  const chapterSelections = data?.chapterSelections ?? {};
  const countries = data?.countries ?? [];

  /**
   * Returns a list of scope descriptors for which this image is currently
   * the selected one. Used to render the "currently set for…" badges on
   * the image card.
   */
  function scopesForImage(img: BrandImage, role: RoleKey): Array<{
    label: string;
    scope: Scope;
  }> {
    const out: Array<{ label: string; scope: Scope }> = [];
    if (selections[role] === img.url) {
      out.push({ label: "Global", scope: { type: "global" } });
    }
    for (const country of countries) {
      for (const ch of country.chapters) {
        const sel = chapterSelections[ch.id];
        if (sel?.[role] === img.url) {
          out.push({
            label: `${ch.name}`,
            scope: {
              type: "chapter",
              chapterId: ch.id,
              chapterName: ch.name,
              chapterSlug: ch.slug,
            },
          });
        }
      }
    }
    return out;
  }

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

  /**
   * Apply the selection: write the image URL as `role` at the chosen scope.
   */
  async function handleApplySelection(img: BrandImage, role: RoleKey, scope: Scope) {
    setBusyKey(`select:${img.url}:${role}:${scope.type}`);
    try {
      const source = img.kind === "stock" ? img.name : img.url;
      const body: Record<string, unknown> = { key: role, source };
      if (scope.type === "global") {
        body.scope = { type: "global" };
      } else {
        body.scope = { type: "chapter", chapterId: scope.chapterId };
      }
      const res = await fetch("/api/admin/brand-images/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Select failed (${res.status})`);
      }
      const json = await res.json();
      // Optimistically update local state.
      setData((prev) => {
        if (!prev) return prev;
        if (scope.type === "global") {
          return {
            ...prev,
            selections: { ...prev.selections, [role]: json.value },
          };
        }
        const next = { ...prev.chapterSelections };
        const chap = { ...(next[scope.chapterId] ?? {}) };
        chap[role] = json.value;
        next[scope.chapterId] = chap;
        return { ...prev, chapterSelections: next };
      });
      const targetLabel =
        scope.type === "global"
          ? "the global scope (main site)"
          : `${scope.chapterName} chapter`;
      toast.success(`${ROLE_LABELS[role]} set for ${targetLabel}`, {
        description: img.kind === "stock"
          ? `${img.name} copied to Vercel Blob and selected.`
          : `${img.name} selected.`,
      });
      setPicker(null);
    } catch (e) {
      toast.error("Selection failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyKey(null);
    }
  }

  /**
   * Clear a chapter-scoped override so it falls back to the global value.
   */
  async function handleClearChapterSelection(
    img: BrandImage,
    role: RoleKey,
    chapterId: string,
    chapterName: string
  ) {
    setBusyKey(`clear:${img.url}:${role}:${chapterId}`);
    try {
      const res = await fetch("/api/admin/brand-images/select", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: role, chapterId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Clear failed (${res.status})`);
      }
      setData((prev) => {
        if (!prev) return prev;
        const next = { ...prev.chapterSelections };
        const chap = { ...(next[chapterId] ?? {}) };
        delete chap[role];
        next[chapterId] = chap;
        return { ...prev, chapterSelections: next };
      });
      toast.success(`${ROLE_LABELS[role]} cleared for ${chapterName}`, {
        description: "Will fall back to the global value.",
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
            e.target.value = "";
          }}
        />
      </div>

      {/* How-to card explaining the new flow */}
      <div className="rounded-lg border border-[#820A7D]/20 bg-[#820A7D]/[0.04] px-4 py-3 text-xs text-black/80">
        <p className="font-semibold text-[#820A7D] uppercase tracking-[0.2em] text-[0.7rem] mb-1">
          How it works
        </p>
        <p>
          Each image card has 3 buttons — <strong>Favicon</strong>,{" "}
          <strong>Login hero</strong>, <strong>Login banner</strong>. Click any
          button to choose where the image applies:
        </p>
        <ul className="mt-2 space-y-0.5 list-disc list-inside text-black/70">
          <li>
            <strong>Global</strong> — applies to the main site{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">
              /login
            </code>{" "}
            page (the default).
          </li>
          <li>
            <strong>A specific chapter</strong> — overrides the global value
            for{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">
              /c/[chapterSlug]
            </code>{" "}
            only. Pick a country → chapter in the picker.
          </li>
        </ul>
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
                <span
                  className={`absolute top-2 left-2 rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${
                    img.kind === "uploaded"
                      ? "bg-[#00E6FF]/90 text-[#004F98]"
                      : "bg-black/70 text-white"
                  }`}
                >
                  {img.kind}
                </span>
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

                {/* Select-as buttons — each opens the picker */}
                <div className="mt-3 grid grid-cols-3 gap-1">
                  {(["favicon", "loginHero", "loginBanner"] as const).map((role) => {
                    const scopes = scopesForImage(img, role);
                    const isSelectedSomewhere = scopes.length > 0;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setPicker({ img, role })}
                        className={`inline-flex items-center justify-center gap-1 rounded px-1.5 py-1.5 text-[0.65rem] font-semibold transition-colors ${
                          isSelectedSomewhere
                            ? "bg-[#FF005A] text-white hover:bg-[#D8004D]"
                            : "bg-black/[0.05] text-black/70 hover:bg-black/[0.1]"
                        }`}
                        title={`Set as ${ROLE_LABELS[role]}…`}
                      >
                        {isSelectedSomewhere ? (
                          <BadgeCheck className="h-3 w-3" />
                        ) : (
                          <Star className="h-3 w-3" />
                        )}
                        <span className="truncate">{ROLE_LABELS[role]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Scope badges — list every scope where this image is
                    currently selected for ANY of the 3 roles. */}
                {(["favicon", "loginHero", "loginBanner"] as const).some(
                  (r) => scopesForImage(img, r).length > 0
                ) && (
                  <div className="mt-3 space-y-1.5 border-t border-black/5 pt-2">
                    <p className="text-[0.6rem] uppercase tracking-[0.2em] text-black/40 font-semibold">
                      Currently used for
                    </p>
                    {(["favicon", "loginHero", "loginBanner"] as const).map((role) => {
                      const scopes = scopesForImage(img, role);
                      if (scopes.length === 0) return null;
                      return (
                        <div key={role} className="space-y-1">
                          {scopes.map(({ label, scope }) => {
                            const clearBusy =
                              scope.type === "chapter" &&
                              busyKey === `clear:${img.url}:${role}:${scope.chapterId}`;
                            return (
                              <div
                                key={`${role}:${scope.type}:${"chapterId" in scope ? scope.chapterId : "g"}`}
                                className="inline-flex items-center gap-1.5 rounded bg-[#FF005A]/10 px-1.5 py-0.5 text-[0.6rem] font-semibold text-[#FF005A]"
                              >
                                <BadgeCheck className="h-3 w-3" />
                                <span>
                                  {ROLE_LABELS[role]} · {label}
                                </span>
                                {scope.type === "chapter" && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleClearChapterSelection(
                                        img,
                                        role,
                                        scope.chapterId,
                                        scope.chapterName
                                      )
                                    }
                                    disabled={busyKey !== null}
                                    className="ml-0.5 text-[#FF005A]/70 hover:text-[#FF005A] disabled:opacity-50"
                                    title={`Clear ${ROLE_LABELS[role]} override for ${scope.chapterName}`}
                                  >
                                    {clearBusy ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Picker modal */}
      {picker && (
        <ScopePickerModal
          img={picker.img}
          role={picker.role}
          countries={countries}
          currentSelectionUrl={selections[picker.role]}
          chapterSelections={chapterSelections}
          busyKey={busyKey}
          onApply={(scope) => handleApplySelection(picker.img, picker.role, scope)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------
// Scope picker modal
// --------------------------------------------------------------------

type ScopePickerModalProps = {
  img: BrandImage;
  role: RoleKey;
  countries: Country[];
  currentSelectionUrl: string; // global value for this role
  chapterSelections: Record<string, Record<string, string>>;
  busyKey: string | null;
  onApply: (scope: Scope) => void;
  onClose: () => void;
};

function ScopePickerModal({
  img,
  role,
  countries,
  currentSelectionUrl,
  chapterSelections,
  busyKey,
  onApply,
  onClose,
}: ScopePickerModalProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(countries.map((c) => [c.id, true]))
  );
  const [selected, setSelected] = useState<Scope>({ type: "global" });

  const isBusy = busyKey?.startsWith(`select:${img.url}:${role}:`) ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#FF005A]">
              Set as {ROLE_LABELS[role]}
            </p>
            <h3 className="text-base font-bold text-black mt-0.5 truncate" title={img.name}>
              {img.name}
            </h3>
            <p className="text-xs text-black/60 mt-1">
              Choose where this image applies. Global affects the main{" "}
              <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">
                /login
              </code>{" "}
              page; chapter overrides affect only{" "}
              <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">
                /c/[slug]
              </code>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-black/40 hover:text-black/70 flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — scrollable scope list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {/* Global option */}
          <button
            type="button"
            onClick={() => setSelected({ type: "global" })}
            className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors ${
              selected.type === "global"
                ? "border-[#FF005A] bg-[#FF005A]/5"
                : "border-black/10 hover:border-black/20 bg-white"
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-[#820A7D]" />
              <span className="font-semibold text-sm text-black">Global</span>
              {currentSelectionUrl === img.url && (
                <span className="ml-auto inline-flex items-center gap-1 rounded bg-[#FF005A] px-1.5 py-0.5 text-[0.6rem] font-semibold text-white">
                  <BadgeCheck className="h-3 w-3" /> Current
                </span>
              )}
            </div>
            <p className="text-[0.7rem] text-black/60 mt-0.5 pl-6">
              Applies to the main website{" "}
              <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">
                /login
              </code>{" "}
              page.
            </p>
          </button>

          {/* Per-country → per-chapter options */}
          {countries.length === 0 ? (
            <p className="text-xs text-black/50 italic py-2">
              No countries or chapters configured yet. Create one in{" "}
              <Link href="/admin/chapters" className="underline">
                /admin/chapters
              </Link>{" "}
              first.
            </p>
          ) : (
            countries.map((country) => {
              const isOpen = expanded[country.id];
              return (
                <div
                  key={country.id}
                  className="rounded-md border border-black/10 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((p) => ({ ...p, [country.id]: !p[country.id] }))
                    }
                    className="w-full text-left bg-black/[0.02] px-3 py-2 flex items-center gap-2 hover:bg-black/[0.04]"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-black/60" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-black/60" />
                    )}
                    <span className="text-base">{country.flagEmoji || "🌍"}</span>
                    <span className="font-semibold text-sm text-black">{country.name}</span>
                    <span className="text-[0.65rem] text-black/50 ml-1">
                      ({country.chapters.length} chapter
                      {country.chapters.length === 1 ? "" : "s"})
                    </span>
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-black/5">
                      {country.chapters.length === 0 ? (
                        <p className="px-3 py-2 text-[0.7rem] text-black/50 italic">
                          No active chapters in this country.
                        </p>
                      ) : (
                        country.chapters.map((ch) => {
                          const isSel =
                            selected.type === "chapter" && selected.chapterId === ch.id;
                          const chapSel = chapterSelections[ch.id];
                          const isCurrent = chapSel?.[role] === img.url;
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={() =>
                                setSelected({
                                  type: "chapter",
                                  chapterId: ch.id,
                                  chapterName: ch.name,
                                  chapterSlug: ch.slug,
                                })
                              }
                              className={`w-full text-left px-3 py-2 pl-8 flex items-center gap-2 transition-colors ${
                                isSel
                                  ? "bg-[#FF005A]/5"
                                  : "hover:bg-black/[0.02]"
                              }`}
                            >
                              <span
                                className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
                                  isSel
                                    ? "border-[#FF005A] bg-[#FF005A]"
                                    : "border-black/20"
                                }`}
                              />
                              <span className="text-sm text-black font-medium">
                                {ch.name}
                              </span>
                              {ch.city && (
                                <span className="text-[0.7rem] text-black/50">
                                  · {ch.city}
                                </span>
                              )}
                              <code className="ml-auto text-[0.65rem] text-black/40 font-mono">
                                /c/{ch.slug}
                              </code>
                              {isCurrent && (
                                <span className="inline-flex items-center gap-1 rounded bg-[#FF005A] px-1.5 py-0.5 text-[0.6rem] font-semibold text-white">
                                  <BadgeCheck className="h-3 w-3" /> Current
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer — Apply / Cancel */}
        <div className="px-5 py-3 border-t border-black/10 flex items-center justify-between gap-2 bg-black/[0.02]">
          <p className="text-[0.7rem] text-black/60">
            {selected.type === "global"
              ? "Will apply to the main /login page."
              : `Will override ${ROLE_LABELS[role]} for ${selected.chapterName} (/c/${selected.chapterSlug}).`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onApply(selected)}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] text-white px-4 py-1.5 text-xs font-semibold hover:bg-[#D8004D] disabled:opacity-50"
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…
                </>
              ) : (
                <>Apply</>
              )}
            </button>
          </div>
        </div>
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
