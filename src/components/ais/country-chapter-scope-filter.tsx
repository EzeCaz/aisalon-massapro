"use client";

/**
 * <CountryChapterScopeFilter />
 * ─────────────────────────────
 * Reusable V7 scope filter for any admin listing page.
 *
 * Renders two dropdowns:
 *   - Country  (All / Israel / ...)
 *   - Chapter  (All / Tel Aviv / ...)  — filtered by selected country
 *
 * And a row of quick-pick pills for chapters in the selected country
 * (with their member/event counts if provided).
 *
 * Optionally renders a third "City" dropdown when `cities` is provided
 * (used by the Events page where each event has its own venue city).
 *
 * Usage:
 *   <CountryChapterScopeFilter
 *     countries={countries}
 *     chapters={chapters}
 *     value={{ countryId: "", chapterId: "" }}
 *     onChange={(v) => setFilter(v)}
 *   />
 *
 *   // With city filter (Events page):
 *   <CountryChapterScopeFilter
 *     countries={countries}
 *     chapters={chapters}
 *     cities={uniqueCities}  // [{ name, countryId, chapterId }]
 *     value={{ countryId: "", chapterId: "", city: "" }}
 *     onChange={(v) => setFilter(v)}
 *   />
 *
 * The parent owns the state and uses `countryId` / `chapterId` / `city`
 * to filter its own data. This component is purely presentational.
 */

import { useMemo } from "react";
import { Globe2, MapPin, X, Filter } from "lucide-react";

export type ScopeFilterCountry = {
  id: string;
  name: string;
  code: string;
  flagEmoji?: string | null;
  slug?: string;
  isActive?: boolean;
};

export type ScopeFilterChapter = {
  id: string;
  name: string;
  slug?: string;
  countryId: string;
  city?: string | null;
  isActive?: boolean;
  /** Optional count pills (parent provides when known). */
  memberCount?: number;
  eventCount?: number;
  rsvpCount?: number;
  speakerCount?: number;
};

export type ScopeFilterCity = {
  /** City name (e.g. "Tel Aviv-Yafo", "Jerusalem"). */
  name: string;
  /** Country ID this city belongs to (used to filter the city dropdown by selected country). */
  countryId: string;
  /** Chapter ID this city belongs to (used to filter the city dropdown by selected chapter). */
  chapterId: string;
};

export type ScopeFilterValue = {
  countryId: string; // "" = all countries
  chapterId: string; // "" = all chapters in selected country
  /** City name to filter by. "" = all cities. Optional — only used when `cities` prop is provided. */
  city?: string;
};

export function CountryChapterScopeFilter({
  countries,
  chapters,
  cities,
  value,
  onChange,
  showCounts = true,
  compact = false,
}: {
  countries: ScopeFilterCountry[];
  chapters: ScopeFilterChapter[];
  /** Optional — when provided, renders a third "City" dropdown. */
  cities?: ScopeFilterCity[];
  value: ScopeFilterValue;
  onChange: (v: ScopeFilterValue) => void;
  /** When true, shows member/event count pills next to each chapter quick-pick. */
  showCounts?: boolean;
  /** When true, renders a more compact single-row layout. */
  compact?: boolean;
}) {
  const { countryId, chapterId, city } = value;

  // Chapters filtered by selected country.
  const filteredChapters = useMemo(
    () => (countryId ? chapters.filter((c) => c.countryId === countryId) : chapters),
    [chapters, countryId]
  );

  // Cities filtered by selected country + chapter. When country is selected,
  // only show cities in that country. When chapter is selected, only show
  // cities in that chapter. This keeps the city dropdown contextual.
  const filteredCities = useMemo(() => {
    if (!cities || cities.length === 0) return [];
    let result = cities;
    if (chapterId) {
      result = result.filter((c) => c.chapterId === chapterId);
    } else if (countryId) {
      result = result.filter((c) => c.countryId === countryId);
    }
    // De-duplicate by name (a city may appear in multiple chapters of
    // the same country — e.g. "Tel Aviv-Yafo" could be the venue city
    // for events in both Tel Aviv and Herzliya chapters).
    const seen = new Set<string>();
    return result.filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });
  }, [cities, countryId, chapterId]);

  const selectedCountry = countries.find((c) => c.id === countryId);
  const selectedChapter = chapters.find((c) => c.id === chapterId);

  const isActive = !!countryId || !!chapterId || !!city;

  function setCountry(newCountryId: string) {
    // If chapter is selected and doesn't belong to the new country, clear it.
    let nextChapterId = chapterId;
    if (chapterId) {
      const ch = chapters.find((c) => c.id === chapterId);
      if (ch && ch.countryId !== newCountryId) {
        nextChapterId = "";
      }
    }
    // If city is selected and doesn't belong to the new country, clear it.
    let nextCity = city;
    if (city && cities) {
      const c = cities.find((cc) => cc.name === city);
      if (c && c.countryId !== newCountryId) {
        nextCity = "";
      }
    }
    onChange({ countryId: newCountryId, chapterId: nextChapterId, city: nextCity });
  }

  function setChapter(newChapterId: string) {
    // If city is selected and doesn't belong to the new chapter, clear it.
    let nextCity = city;
    if (city && cities) {
      const c = cities.find((cc) => cc.name === city);
      if (c && c.chapterId !== newChapterId) {
        nextCity = "";
      }
    }
    onChange({ countryId, chapterId: newChapterId, city: nextCity });
  }

  function setCity(newCity: string) {
    onChange({ countryId, chapterId, city: newCity });
  }

  function clearAll() {
    onChange({ countryId: "", chapterId: "", city: "" });
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-black/60">
          <Filter className="h-3 w-3" />
          Scope
        </div>
        <select
          value={countryId}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40"
        >
          <option value="">🌍 All countries</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.flagEmoji ?? ""} {c.name}
            </option>
          ))}
        </select>
        <select
          value={chapterId}
          onChange={(e) => setChapter(e.target.value)}
          disabled={!countryId}
          className={`rounded-md border border-black/15 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40 ${
            !countryId ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <option value="">📍 All chapters</option>
          {filteredChapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.city ? ` — ${c.city}` : ""}
            </option>
          ))}
        </select>
        {cities && cities.length > 0 && (
          <select
            value={city ?? ""}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40"
          >
            <option value="">🏙️ All cities</option>
            {filteredCities.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {isActive && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[0.65rem] font-bold uppercase tracking-wider text-[#FF005A] hover:text-[#FF005A]/80 flex items-center gap-0.5"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-[#820A7D]">
          <Globe2 className="h-3 w-3" />
          Filter by country, chapter &amp; city
        </div>
        {isActive && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[0.65rem] font-bold uppercase tracking-wider text-[#FF005A] hover:text-[#FF005A]/80 flex items-center gap-0.5"
          >
            <X className="h-3 w-3" /> Clear filter
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {/* Country selector */}
        <div>
          <label className="block text-[0.65rem] font-bold uppercase tracking-wide text-black/60 mb-1">
            Country
          </label>
          <select
            value={countryId}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40"
          >
            <option value="">🌍 All countries</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.flagEmoji ?? ""} {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

        {/* Chapter selector */}
        <div>
          <label className="block text-[0.65rem] font-bold uppercase tracking-wide text-black/60 mb-1">
            Chapter
          </label>
          <select
            value={chapterId}
            onChange={(e) => setChapter(e.target.value)}
            disabled={!countryId}
            className={`w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40 ${
              !countryId ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <option value="">📍 All chapters in {selectedCountry?.name ?? "country"}</option>
            {filteredChapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.city ? ` — ${c.city}` : ""}
                {!c.isActive ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* City selector — only rendered when `cities` prop is provided. */}
        {cities && cities.length > 0 && (
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-wide text-black/60 mb-1">
              City
            </label>
            <select
              value={city ?? ""}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40"
            >
              <option value="">🏙️ All cities{selectedChapter ? ` in ${selectedChapter.name}` : selectedCountry ? ` in ${selectedCountry.name}` : ""}</option>
              {filteredCities.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Quick-pick pills for chapters in the selected country */}
      {countryId && filteredChapters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-black/5">
          <span className="text-[0.65rem] font-bold uppercase tracking-wide text-black/50 flex items-center gap-0.5">
            <MapPin className="h-3 w-3" />
            Quick pick:
          </span>
          <button
            type="button"
            onClick={() => setChapter("")}
            className={`text-[0.7rem] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
              !chapterId
                ? "bg-[#820A7D] text-white border-[#820A7D]"
                : "bg-white text-black/70 border-black/15 hover:border-[#820A7D]/50"
            }`}
          >
            All
          </button>
          {filteredChapters.map((c) => {
            const active = c.id === chapterId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setChapter(c.id)}
                className={`text-[0.7rem] font-semibold px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${
                  active
                    ? "bg-[#820A7D] text-white border-[#820A7D]"
                    : "bg-white text-black/70 border-black/15 hover:border-[#820A7D]/50"
                }`}
                title={c.city ? `${c.name} — ${c.city}` : c.name}
              >
                {c.name}
                {showCounts && typeof c.memberCount === "number" && (
                  <span
                    className={`text-[0.6rem] px-1 rounded-full ${
                      active ? "bg-white/20" : "bg-black/5 text-black/60"
                    }`}
                  >
                    {c.memberCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active scope summary */}
      {isActive && (
        <div className="text-[0.7rem] text-black/60 bg-[#820A7D]/5 rounded px-2 py-1">
          <strong>Active filter:</strong>{" "}
          {selectedCountry ? (
            <>
              {selectedCountry.flagEmoji} {selectedCountry.name}
              {selectedChapter && (
                <>
                  {" → "}
                  <MapPin className="inline h-2.5 w-2.5" /> {selectedChapter.name}
                </>
              )}
              {city && (
                <>
                  {" → "}
                  <MapPin className="inline h-2.5 w-2.5" /> {city}
                </>
              )}
            </>
          ) : city ? (
            <>
              <MapPin className="inline h-2.5 w-2.5" /> {city} (any country)
            </>
          ) : (
            "All countries"
          )}
        </div>
      )}
    </div>
  );
}
