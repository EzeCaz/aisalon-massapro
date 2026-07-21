"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Copy, Check, ExternalLink, Globe2, ShieldCheck, Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type Country = { id: string; name: string; code: string; flagEmoji: string | null };

export function ChapterEditor({
  mode,
  chapterId,
  initial,
  countries,
  isSuperAdmin,
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
    isActive: boolean;
  };
  countries: Country[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedAdmin, setCopiedAdmin] = useState(false);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    city: initial?.city ?? "",
    timezone: initial?.timezone ?? "Asia/Jerusalem",
    countryId: initial?.countryId ?? params.get("countryId") ?? countries[0]?.id ?? "",
    whatsappGroupUrl: initial?.whatsappGroupUrl ?? "",
    linkedinUrl: initial?.linkedinUrl ?? "",
    isActive: initial?.isActive ?? true,
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
  const registrationUrl = form.slug ? `${siteUrl}/c/${form.slug}` : "";
  const adminUrl = form.slug ? `${siteUrl}/admin/c/${form.slug}` : "";

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
            placeholder="Tel Aviv"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          />
        </Field>

        <Field label="Slug" required hint="Used in URLs: /c/tel-aviv">
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="tel-aviv"
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

        <Field label="Country" required>
          <select
            value={form.countryId}
            onChange={(e) => setForm({ ...form, countryId: e.target.value })}
            disabled={!isSuperAdmin && mode === "edit"}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          >
            <option value="">Select country…</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.flagEmoji} {c.name} ({c.code})
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Tel Aviv-Yafo"
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
            />
          </Field>
          <Field label="Timezone">
            <input
              type="text"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              placeholder="Asia/Jerusalem"
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
            />
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

        <Field label="LinkedIn URL">
          <input
            type="url"
            value={form.linkedinUrl}
            onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
            placeholder="https://www.linkedin.com/groups/..."
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-black/80">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="rounded"
          />
          Active (chapter is visible and accepting new members)
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
            disabled={saving || !form.name || !form.slug || !form.countryId}
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
