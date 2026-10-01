"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, Globe2, ShieldCheck, Upload, Loader2, X, Mail, Plus } from "lucide-react";
import { displayFlag } from "@/lib/country-flag";
import { toast } from "sonner";
import { ChapterBrandImagesEditor } from "./chapter-brand-images-editor";
import { ImagePickerModalShared } from "../mockups/shared/image-picker-modal";
import { COMMON_TIMEZONES } from "@/lib/brand-onboarding-types";

type Country = { id: string; name: string; code: string; flagEmoji: string | null };

export function ChapterEditor({
  mode,
  chapterId,
  initial,
  countries,
  isSuperAdmin,
  brandSlug = "aisalon",
}: {
  mode: "new" | "edit";
  chapterId?: string;
  initial?: {
    name: string;
    slug: string;
    city: string | null;
    timezone: string;
    countryId: string;
    whatsappGroupUrl: string | null;
    linkedinUrl: string | null;
    heroImageUrl: string | null;
    isActive: boolean;
    isPubliclyListed: boolean;
  };
  countries: Country[];
  isSuperAdmin: boolean;
  /** Brand slug for the registration + admin URL display + clipboard
   *  copy. Appends ?brand=<slug> so a Super Admin on platform.joincoma.com
   *  copying a chapter URL for a Coma chapter doesn't end up with an
   *  AIS-tagged link. Defaults to "aisalon" for backward compat.
   *  Phase 2 (2026-09-17). */
  brandSlug?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedAdmin, setCopiedAdmin] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  // Hero image upload state — tracks in-progress uploads so the UI can
  // show a spinner + disables Save while an upload is in flight (so the
  // admin can't save a chapter with a half-uploaded hero URL).
  const [uploadingHero, setUploadingHero] = useState(false);
  const heroInputRef = useRef<HTMLInputElement>(null);
  // Inline country creation state — when "Add new country…" is chosen
  // from the dropdown, we open a dialog to collect name + code + flag.
  const [countryList, setCountryList] = useState<Country[]>(countries);
  const [showAddCountry, setShowAddCountry] = useState(false);
  const [newCountryName, setNewCountryName] = useState("");
  const [newCountryCode, setNewCountryCode] = useState("");
  const [newCountryFlag, setNewCountryFlag] = useState("");
  const [creatingCountry, setCreatingCountry] = useState(false);
  // Inline image picker state — opens a modal to pick a hero image
  // from the brand library (/admin/images) without leaving the form.
  const [showHeroPicker, setShowHeroPicker] = useState(false);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    city: initial?.city ?? "",
    timezone: initial?.timezone ?? "Asia/Jerusalem",
    countryId: initial?.countryId ?? params.get("countryId") ?? countries[0]?.id ?? "",
    whatsappGroupUrl: initial?.whatsappGroupUrl ?? "",
    linkedinUrl: initial?.linkedinUrl ?? "",
    heroImageUrl: initial?.heroImageUrl ?? "",
    isActive: initial?.isActive ?? true,
    isPubliclyListed: initial?.isPubliclyListed ?? true,
  });

  // Public registration URL — derived from the slug. This is the URL
  // admins share with people to register specifically for this chapter.
  // Anyone signing up via this URL gets tagged to this chapter automatically.
  // Admin URL — slug-based admin editor URL (/admin/c/[slug]). Stable
  // across chapter ID changes; bookmarkable; shareable with other admins.
  const siteUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  // Phase 2: append ?brand=<slug> to admin-shareable URLs so the recipient
  // (e.g. a chapter lead getting the registration URL) sees the right brand
  // when they click. Idempotent — won't double-add if ?brand= already there.
  const brandQs = `?brand=${encodeURIComponent(brandSlug)}`;
  const registrationUrl = form.slug ? `${siteUrl}/c/${form.slug}${brandQs}` : "";
  const adminUrl = form.slug ? `${siteUrl}/admin/c/${form.slug}${brandQs}` : "";
  // Round 2 (2026-09-30): per-chapter invite URL — the URL the brand admin
  // shares with people to invite them to join the brand AND get tagged with
  // this specific chapter (auto-joins them via the signup flow).
  const inviteUrl = form.slug
    ? `${siteUrl}/login${brandQs}&chapterSlug=${encodeURIComponent(form.slug)}`
    : "";

  async function copyToClipboard(text: string, setter: (v: boolean) => void) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 1500);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setter(true);
      setTimeout(() => setter(false), 1500);
    }
  }

  // Auto-generate slug from name in "new" mode
  useEffect(() => {
    if (mode === "new" && form.name && !form.slug) {
      setForm((f) => ({ ...f, slug: f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") }));
    }
  }, [form.name, form.slug, mode]);

  /**
   * Inline country creation — opens the dialog when "Add new country…"
   * is selected from the country dropdown. The dialog collects name +
   * 2-letter ISO code + optional flag emoji, then POSTs to
   * /api/admin/countries. On success, the new country is appended to
   * the local countryList and pre-selected as the chapter's countryId.
   *
   * Phase 4 (2026-10-02): BRAND_ADMIN users can also create countries
   * (the API was updated to allow it). This unblocks brand admins who
   * need a chapter in a country that doesn't exist in the platform yet
   * (e.g. a Cazhype brand admin creating their first US chapter).
   */
  async function handleCreateCountry() {
    const n = newCountryName.trim();
    const c = newCountryCode.trim().toUpperCase();
    if (!n) return toast.error("Country name is required");
    if (c.length !== 2) return toast.error("Country code must be 2 letters");
    setCreatingCountry(true);
    try {
      const res = await fetch("/api/admin/countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          code: c,
          flagEmoji: newCountryFlag.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { country: Country };
      setCountryList((prev) =>
        [...prev, data.country].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setForm((f) => ({ ...f, countryId: data.country.id }));
      setShowAddCountry(false);
      setNewCountryName("");
      setNewCountryCode("");
      setNewCountryFlag("");
      toast.success(`Country "${n}" created`);
    } catch (e) {
      toast.error("Country creation failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCreatingCountry(false);
    }
  }

  /**
   * Upload a hero image file to Vercel Blob via the chapter hero-image
   * API. On success, patches form.heroImageUrl with the returned URL.
   *
   * Only available in edit mode — the API needs an existing chapter ID
   * to scope the upload path (chapter-hero/<chapterId>/<filename>).
   * For new chapters, the admin must save first, then upload a hero.
   */
  async function uploadHeroImage(file: File) {
    if (mode !== "edit" || !chapterId) {
      toast.error("Save the chapter first, then upload a hero image.");
      return;
    }
    setUploadingHero(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/chapters/${chapterId}/hero-image`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      const url: string = data.image?.url;
      if (!url) throw new Error("Upload succeeded but no URL returned");
      setForm((f) => ({ ...f, heroImageUrl: url }));
      toast.success("Hero image uploaded", { description: file.name });
    } catch (e) {
      toast.error("Hero image upload failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setUploadingHero(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const url = mode === "new" ? "/api/admin/chapters" : `/api/admin/chapters/${chapterId}`;
      const method = mode === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.push("/admin/chapters");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Card className="p-6 bg-white border border-black/10 max-w-2xl">
      <h2 className="text-lg font-bold text-black mb-4">
        {mode === "new" ? "Create new chapter" : "Edit chapter"}
      </h2>

      <div className="space-y-4">
        <Field label="Chapter name" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="New York City"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          />
        </Field>

        <Field label="Slug" required hint="Used in URLs: /c/new-york">
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="new-york"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          />
        </Field>

        {/* Public registration URL — auto-derived from slug */}
        {registrationUrl && (
          <div className="rounded-md border border-[#820A7D]/20 bg-[#820A7D]/[0.04] p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#820A7D] flex items-center gap-1.5 mb-1">
                  <Globe2 className="h-3 w-3" /> Public registration URL
                </p>
                <p className="text-sm font-mono text-black break-all">
                  {registrationUrl}
                </p>
                <p className="text-xs text-black/60 mt-1.5">
                  Anyone who signs up via this URL is automatically tagged
                  to <strong>{form.name || "this chapter"}</strong>. Share
                  it in your chapter&apos;s WhatsApp group, LinkedIn, event
                  invites, etc.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(registrationUrl, setCopiedPublic)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#820A7D] text-[#820A7D] font-semibold px-3 py-1.5 text-xs hover:bg-[#820A7D] hover:text-white transition"
                >
                  {copiedPublic ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </button>
                <a
                  href={registrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-black/15 text-black/70 font-semibold px-3 py-1.5 text-xs hover:bg-black/5"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Admin URL — slug-based admin editor URL. Only meaningful in
            edit mode (the chapter must exist for the URL to resolve). */}
        {mode === "edit" && adminUrl && (
          <div className="rounded-md border border-black/10 bg-black/[0.02] p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-black/60 flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="h-3 w-3" /> Admin URL
                </p>
                <p className="text-sm font-mono text-black break-all">
                  {adminUrl}
                </p>
                <p className="text-xs text-black/60 mt-1.5">
                  Stable, bookmarkable link to this chapter&apos;s admin editor.
                  Share with other admins instead of the raw
                  <code className="mx-1 px-1 py-0.5 rounded bg-black/5 text-[0.7rem]">
                    /admin/chapters/[id]
                  </code>
                  URL — the slug won&apos;t change even if the record is migrated.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(adminUrl, setCopiedAdmin)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-black/30 text-black/70 font-semibold px-3 py-1.5 text-xs hover:bg-black/5 transition"
                >
                  {copiedAdmin ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </button>
                <a
                  href={adminUrl}
                  className="inline-flex items-center gap-1.5 rounded-md border border-black/15 text-black/70 font-semibold px-3 py-1.5 text-xs hover:bg-black/5"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Round 2 (2026-09-30): per-chapter invite URL — the URL the
            brand admin shares with people to invite them to join the
            brand AND get tagged with this specific chapter. New users
            signing up via this URL get tagged with:
              brandSlug = brandSlug (from the ?brand= param)
              chapterId = this chapter's id (from the ?chapterSlug= param)
            so they automatically join this chapter. */}
        {inviteUrl && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5 mb-1">
                <Mail className="h-3 w-3" /> Chapter invite link
              </p>
              <p className="text-sm font-mono text-black break-all">
                {inviteUrl}
              </p>
              <p className="text-xs text-black/60 mt-1.5">
                Share this with people you want to invite to join this chapter.
                New users signing up via this link get tagged with your brand
                AND auto-join this chapter.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => copyToClipboard(inviteUrl, setCopiedInvite)}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white font-semibold px-3 py-1.5 text-xs hover:bg-emerald-700 transition"
              >
                {copiedInvite ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy invite link
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <Field label="Country" required>
          <select
            value={form.countryId}
            onChange={(e) => {
              if (e.target.value === "__ADD_NEW__") {
                setShowAddCountry(true);
                // Keep the previously selected value (don't clear it)
                return;
              }
              setForm({ ...form, countryId: e.target.value });
            }}
            disabled={!isSuperAdmin && mode === "edit"}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          >
            <option value="">Select country…</option>
            {countryList.map((c) => (
              <option key={c.id} value={c.id}>
                {displayFlag(c.code, c.flagEmoji)} {c.name} ({c.code})
              </option>
            ))}
            <option value="__ADD_NEW__">➕ Add new country…</option>
          </select>
        </Field>

        {/* Inline "Add new country" dialog — opens when "➕ Add new
            country…" is selected from the dropdown above. Lets the
            brand admin / super admin create a new country without
            leaving the chapter creation form. Phase 4 (2026-10-02). */}
        <Dialog open={showAddCountry} onOpenChange={setShowAddCountry}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new country</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-black/70 -mt-2">
              Add a new country to the platform. After creating it, the
              chapter will be attached to this country.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-black/80 mb-1 block">Name *</span>
                  <input
                    type="text"
                    placeholder="e.g. United States"
                    value={newCountryName}
                    onChange={(e) => setNewCountryName(e.target.value)}
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-black/80 mb-1 block">Code (ISO 3166-1 alpha-2) *</span>
                  <input
                    type="text"
                    placeholder="e.g. US"
                    maxLength={2}
                    value={newCountryCode}
                    onChange={(e) => setNewCountryCode(e.target.value)}
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-sm uppercase"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-black/80 mb-1 block">Flag emoji</span>
                <input
                  type="text"
                  placeholder="🇺🇸"
                  value={newCountryFlag}
                  onChange={(e) => setNewCountryFlag(e.target.value)}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                disabled={creatingCountry}
                onClick={handleCreateCountry}
                className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white"
              >
                {creatingCountry ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…</>
                ) : (
                  <><Plus className="h-4 w-4 mr-1.5" /> Create country</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-2 gap-4">
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="New York City"
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
            />
          </Field>
          <Field label="Timezone">
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-black/50">
              IANA timezone — used for event times + email scheduling. Example:{" "}
              <code className="font-mono">America/New_York</code>.
            </p>
          </Field>
        </div>

        <Field label="WhatsApp group URL">
          <input
            type="url"
            value={form.whatsappGroupUrl}
            onChange={(e) => setForm({ ...form, whatsappGroupUrl: e.target.value })}
            placeholder="https://chat.whatsapp.com/..."
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          />
        </Field>

        <Field label="LinkedIn URL" hint="https://www.linkedin.com/groups/...">
          <input
            type="url"
            value={form.linkedinUrl}
            onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
            placeholder="https://www.linkedin.com/groups/..."
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          />
        </Field>

        {/* Hero image — shown on the chapter landing page (/c/[slug])
            right side of the hero section. Either upload a file (saved to
            Vercel Blob at chapter-hero/<id>/<filename>) OR paste an
            existing https:// URL (e.g. a brand-assets URL from
            /admin/images). */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-black/70 mb-1.5">
            Hero image <span className="text-black/40 normal-case font-normal">— shown on /c/{form.slug || "slug"}</span>
          </label>
          <p className="text-xs text-black/50 mb-2">
            Upload a new image, pick one from the brand gallery, or paste
            an existing https:// URL. Renders on the right side of the
            chapter landing page hero.
          </p>

          {/* Preview thumbnail */}
          {form.heroImageUrl ? (
            <div className="mb-2 relative inline-block rounded-md overflow-hidden border border-black/15 bg-black/[0.03]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.heroImageUrl}
                alt="Chapter hero preview"
                className="h-32 w-auto max-w-full object-contain"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, heroImageUrl: "" })}
                className="absolute top-1 right-1 inline-flex items-center justify-center h-6 w-6 rounded-full bg-black/70 text-white hover:bg-black"
                title="Remove hero image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="mb-2 h-32 w-full rounded-md border-2 border-dashed border-black/15 bg-black/[0.02] flex items-center justify-center text-xs text-black/40">
              No hero image — gradient-only hero will be shown
            </div>
          )}

          {/* URL input — lets admin paste an existing URL */}
          <input
            type="url"
            value={form.heroImageUrl}
            onChange={(e) => setForm({ ...form, heroImageUrl: e.target.value })}
            placeholder="https://...public.blob.vercel-storage.com/brand-assets/..."
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          />

          {/* Action buttons — Pick from gallery (any mode) + Upload
              (edit mode only — needs chapterId to scope the upload). */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {/* Pick from gallery — works in BOTH new + edit mode. The
                picker just sets form.heroImageUrl to an existing URL,
                so no chapterId is required. */}
            <button
              type="button"
              onClick={() => setShowHeroPicker(true)}
              disabled={uploadingHero || saving}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#FF005A] text-[#FF005A] font-semibold px-3 py-1.5 text-xs hover:bg-[#FF005A] hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Globe2 className="h-3.5 w-3.5" /> Pick from gallery
            </button>

            {/* Upload — only in edit mode (needs chapterId) */}
            {mode === "edit" && (
              <>
                <button
                  type="button"
                  onClick={() => heroInputRef.current?.click()}
                  disabled={uploadingHero || saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#820A7D] text-[#820A7D] font-semibold px-3 py-1.5 text-xs hover:bg-[#820A7D] hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingHero ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" /> Upload new image
                    </>
                  )}
                </button>
                <input
                  ref={heroInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadHeroImage(f);
                    e.target.value = "";
                  }}
                />
              </>
            )}

            {form.heroImageUrl && (
              <a
                href={form.heroImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-black/15 text-black/70 font-semibold px-3 py-1.5 text-xs hover:bg-black/5"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
            )}
          </div>
          {mode === "new" && (
            <p className="mt-2 text-[0.7rem] text-black/50">
              Pick from the gallery now (or save the chapter first, then upload a custom hero image).
            </p>
          )}
        </div>

        {/* Hero image picker modal — shared component from the mockups
            toolkit. Pulls from /api/admin/brand-images (the same image
            gallery as /admin/images), scoped to the chapter's brand.
            On pick, sets form.heroImageUrl to the chosen URL. */}
        <ImagePickerModalShared
          open={showHeroPicker}
          onClose={() => setShowHeroPicker(false)}
          onPick={(url) => {
            setForm((f) => ({ ...f, heroImageUrl: url }));
            setShowHeroPicker(false);
          }}
          currentUrl={form.heroImageUrl}
          brandSlug={brandSlug}
        />

        <label className="flex items-center gap-2 text-sm text-black/80">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="rounded"
          />
          Active (chapter is visible and accepting new members)
        </label>

        <label className="flex items-start gap-2 text-sm text-black/80">
          <input
            type="checkbox"
            checked={form.isPubliclyListed}
            onChange={(e) => setForm({ ...form, isPubliclyListed: e.target.checked })}
            className="rounded mt-0.5"
          />
          <span>
            <strong>Publicly listed</strong> (chapter appears in /communities
            and the events filter dropdown).
            <span className="block text-xs text-black/60 mt-1">
              Uncheck to make this community <strong>private</strong> — only
              reachable via the direct registration URL you share with
              invited members. Hidden from /communities and the events
              filter dropdown for non-members.
            </span>
          </span>
        </label>

        {error && (
          <div className="rounded-md bg-[#FF005A]/10 border border-[#FF005A]/30 px-3 py-2 text-sm text-[#FF005A]">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || uploadingHero || !form.name || !form.slug || !form.countryId}
            className="inline-flex items-center gap-2 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-2 text-sm hover:bg-[#FF005A]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : mode === "new" ? "Create chapter" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/chapters")}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold text-black/70 hover:bg-black/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </Card>

    {/* Chapter-scoped brand image overrides — only shown in edit mode
        (needs a saved chapterId to write overrides against). Lets the
        Super Admin / Admin / Chapter Organizer pick the favicon, login
        hero, and login banner for THIS chapter, overriding the global
        defaults when visitors are on /c/[slug] or /login?chapterSlug=[slug].

        PER USER SPEC 2026-08-02: chapter admins should be able to change
        any of the default images for the specific chapter they manage,
        directly from the chapter editor at /admin/chapters/[id]. The
        pickable images come from the global brand library + the 3
        global defaults + this chapter's already-set overrides.

        `canEdit` is true for anyone who reached this editor — the
        page-level scope check (chapter-edit-content.tsx) already
        verified the user can edit this chapter. The brand-images
        select API also enforces its own scope server-side as a
        defense-in-depth measure. */}
    {mode === "edit" && chapterId && (
      <Card className="p-6 bg-white border border-black/10 max-w-2xl mt-6">
        <h2 className="text-lg font-bold text-black mb-4">
          Brand image overrides
        </h2>
        <ChapterBrandImagesEditor
          chapterId={chapterId}
          chapterName={form.name || "this chapter"}
          canEdit={true}
        />
      </Card>
    )}
    </>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-black/70 mb-1.5">
        {label} {required && <span className="text-[#FF005A]">*</span>}
        {hint && <span className="ml-2 text-black/40 normal-case font-normal">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
