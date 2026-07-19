"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";

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

        <Field label="Slug" required hint="Used in URLs: /tel-aviv/events/...">
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="tel-aviv"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
          />
        </Field>

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
