"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save, BarChart3 } from "lucide-react";

/**
 * AnalyticsSettingsEditor — admin form to set the Google Analytics 4
 * Measurement ID and Meta (Facebook) Pixel ID.
 *
 * Lives at /admin/images (next to the WhatsApp link editor). Writes go
 * to POST /api/admin/site-settings (SUPER_ADMIN-only). Changes take
 * effect on the next page load — no redeploy needed.
 *
 * Both IDs are validated client-side:
 *   - GA4: must match /^G-[A-Z0-9]{6,}$/ (e.g. "G-ABC123DEFG")
 *   - Pixel: must match /^\d{10,20}$/ (e.g. "123456789012345")
 *
 * Empty values disable the respective tracker. The actual scripts are
 * only loaded after the visitor accepts cookies on the consent banner.
 */
export function AnalyticsSettingsEditor({
  currentGa4Id,
  currentMetaPixelId,
  canEdit,
}: {
  currentGa4Id: string;
  currentMetaPixelId: string;
  canEdit: boolean;
}) {
  const [ga4Id, setGa4Id] = React.useState(currentGa4Id);
  const [pixelId, setPixelId] = React.useState(currentMetaPixelId);
  const [saving, setSaving] = React.useState<"ga4" | "pixel" | null>(null);

  React.useEffect(() => {
    setGa4Id(currentGa4Id);
  }, [currentGa4Id]);
  React.useEffect(() => {
    setPixelId(currentMetaPixelId);
  }, [currentMetaPixelId]);

  async function saveGa4(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = ga4Id.trim().toUpperCase();
    if (trimmed && !/^G-[A-Z0-9]{6,}$/.test(trimmed)) {
      toast.error("GA4 ID must look like G-XXXXXXXXXX (letters + digits)");
      return;
    }
    setSaving("ga4");
    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "ga4MeasurementId", value: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Failed (HTTP ${res.status})`);
        return;
      }
      toast.success(trimmed ? `GA4 ID saved: ${trimmed}` : "GA4 disabled");
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(null);
    }
  }

  async function savePixel(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = pixelId.trim();
    if (trimmed && !/^\d{10,20}$/.test(trimmed)) {
      toast.error("Meta Pixel ID must be 10-20 digits");
      return;
    }
    setSaving("pixel");
    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "metaPixelId", value: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Failed (HTTP ${res.status})`);
        return;
      }
      toast.success(trimmed ? `Meta Pixel ID saved: ${trimmed}` : "Meta Pixel disabled");
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-xl border border-[#004F98]/30 bg-gradient-to-br from-[#004F98]/5 to-white p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-[#004F98] text-white">
          <BarChart3 className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest text-[#004F98]">
          Analytics tracking IDs
        </h2>
      </div>
      <p className="text-xs text-black/60 mb-4 leading-relaxed">
        Configure Google Analytics 4 and Meta (Facebook) Pixel. Scripts only
        load after a visitor accepts cookies on the consent banner — no
        tracking before opt-in. Leave blank to disable.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* GA4 */}
        <form onSubmit={saveGa4} className="space-y-2">
          <label className="block">
            <span className="block text-[0.7rem] font-semibold uppercase tracking-wide text-black/60 mb-1">
              GA4 Measurement ID
            </span>
            <input
              type="text"
              value={ga4Id}
              onChange={(e) => setGa4Id(e.target.value)}
              placeholder="G-XXXXXXXXXX"
              disabled={!canEdit || saving !== null}
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004F98]/40 disabled:bg-black/5 disabled:cursor-not-allowed"
            />
          </label>
          <button
            type="submit"
            disabled={!canEdit || saving !== null || ga4Id.trim().toUpperCase() === currentGa4Id}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#004F98] text-white font-semibold px-3 py-1.5 text-xs hover:bg-[#003674] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving === "ga4" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save GA4
          </button>
        </form>

        {/* Meta Pixel */}
        <form onSubmit={savePixel} className="space-y-2">
          <label className="block">
            <span className="block text-[0.7rem] font-semibold uppercase tracking-wide text-black/60 mb-1">
              Meta Pixel ID
            </span>
            <input
              type="text"
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder="123456789012345"
              disabled={!canEdit || saving !== null}
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004F98]/40 disabled:bg-black/5 disabled:cursor-not-allowed"
            />
          </label>
          <button
            type="submit"
            disabled={!canEdit || saving !== null || pixelId.trim() === currentMetaPixelId}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#1877F2] text-white font-semibold px-3 py-1.5 text-xs hover:bg-[#0F5BCC] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving === "pixel" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Pixel
          </button>
        </form>
      </div>

      {!canEdit && (
        <p className="mt-3 text-[0.7rem] text-amber-700">
          Only Super Admins can change these IDs.
        </p>
      )}
    </div>
  );
}
