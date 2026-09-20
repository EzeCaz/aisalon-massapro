"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save, Plus, MapPin, X } from "lucide-react";

type Country = { id: string; name: string; code: string; flagEmoji: string | null };

type Location = {
  id?: string;
  countryId: string | null;
  country: Country | null;
  city: string;
  region?: string | null;
};

/**
 * InterestedLocationsEditor — shown on /profile. Lets the user edit
 * the locations they want community updates from (up to 5). Same
 * picker UI as the anonymous /c/[slug] signup form.
 *
 * Loads via GET /api/me/interested-locations, saves via PUT.
 */
export function InterestedLocationsEditor({
  countries,
  initial,
  accentColor,
}: {
  countries: Country[];
  initial: Location[];
  /** Accent color hex (drives the Add-location link + save button color). */
  accentColor: string;
}) {
  const [locations, setLocations] = React.useState<Location[]>(
    initial.length > 0
      ? initial
      : [{ countryId: null, country: null, city: "" }]
  );
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  function update(idx: number, patch: Partial<Location>) {
    setLocations((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p))
    );
    setDirty(true);
  }

  function add() {
    if (locations.length >= 5) return;
    setLocations((prev) => [...prev, { countryId: null, country: null, city: "" }]);
    setDirty(true);
  }

  function remove(idx: number) {
    setLocations((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  async function save() {
    const cleaned = locations
      .map((l) => ({
        city: l.city.trim(),
        countryId: l.countryId || null,
      }))
      .filter((l) => l.city);
    if (cleaned.length === 0) {
      toast.error("Add at least one location (city is required).");
      return;
    }
    if (cleaned.length > 5) {
      toast.error("Maximum 5 locations.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/me/interested-locations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Failed (HTTP ${res.status}).`);
        return;
      }
      toast.success(`Saved ${cleaned.length} location${cleaned.length === 1 ? "" : "s"}.`);
      setDirty(false);
    } catch {
      toast.error("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-black/80">
            <MapPin className="inline h-4 w-4 mr-1.5 -mt-0.5" />
            Communities you want updates from
          </h2>
          <p className="text-[0.7rem] text-black/50 mt-0.5">
            We&apos;ll show you communities + events in these cities first.
            Up to 5.
          </p>
        </div>
        {locations.length < 5 && (
          <button
            type="button"
            onClick={add}
            className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
            style={{ color: accentColor }}
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        )}
      </div>

      <div className="space-y-2">
        {locations.map((loc, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <select
              value={loc.countryId ?? ""}
              onChange={(e) => {
                const countryId = e.target.value || null;
                const country = countries.find((c) => c.id === countryId) ?? null;
                update(idx, { countryId, country });
              }}
              className="w-36 rounded-md border border-black/15 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
              aria-label={`Location ${idx + 1} country`}
            >
              <option value="">🌍 Any country</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.flagEmoji ?? "🌍"} {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={loc.city}
              onChange={(e) => update(idx, { city: e.target.value })}
              placeholder="City (e.g. Berlin, Tel Aviv)"
              className="flex-1 rounded-md border border-black/15 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
              aria-label={`Location ${idx + 1} city`}
            />
            {locations.length > 1 && (
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-black/40 hover:text-black/70 px-1.5 py-2"
                aria-label={`Remove location ${idx + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/[0.06]">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-md text-white font-semibold px-4 py-2 text-sm disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>
    </div>
  );
}
