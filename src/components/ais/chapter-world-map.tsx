"use client";

/**
 * <ChapterWorldMap />
 * ──────────────────
 * Interactive choropleth world map for /admin/chapters.
 *
 * Renders an SVG world map (via react-simple-maps + world-atlas TopoJSON)
 * with a clickable pin for every chapter. Clicking a pin (or a country)
 * filters the parent list to that chapter/country and shows the count
 * summary (members, speakers, events, emails, mockups, quiz) in a
 * side panel.
 *
 * Props:
 *   - chapters: list of chapters with their country + counts
 *   - selectedCountryId / selectedChapterId: parent filter state
 *   - onSelect: callback when a country/chapter is clicked
 *
 * Implementation notes:
 *   - react-simple-maps v3 is used. Geographies come from world-atlas
 *     (countries-110m.json — 110m resolution keeps the bundle small).
 *   - Country lat/long (for pin placement) is hard-coded for the
 *     countries we expect (Israel, US, UK, etc.). For unknown countries,
 *     we use the geographic centroid from d3-geo as a fallback.
 */

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import * as d3geo from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { Globe2, MapPin, X, Users, Mic2, CalendarDays, Mail, Image as ImageIcon, Brain } from "lucide-react";

export type MapChapter = {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  countryId: string;
  countryName: string;
  countryCode: string; // ISO 3166-1 alpha-2
  countryFlagEmoji?: string | null;
  // Counts (optional — when present, the pin is sized by member count)
  memberCount?: number;
  eventCount?: number;
  rsvpCount?: number;
  speakerCount?: number;
  emailCount?: number;
  mockupCount?: number;
  quizCount?: number;
};

// Lat/long for known country centroids (ISO alpha-2 → [lat, lon]).
// Source: https://developers.google.com/public-data/docs/canonical/countries_csv
// Trimmed to a small set; unknowns fall back to d3-geo centroid.
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  IL: [31.0461, 34.8516],   // Israel
  US: [37.0902, -95.7129],  // United States
  GB: [55.3781, -3.4360],   // United Kingdom
  FR: [46.2276, 2.2137],    // France
  DE: [51.1657, 10.4515],   // Germany
  IT: [41.8719, 12.5674],   // Italy
  ES: [40.4637, -3.7492],   // Spain
  NL: [52.1326, 5.2913],    // Netherlands
  AU: [25.2744, 133.7751],  // Australia
  CA: [56.1304, -106.3468], // Canada
  BR: [14.235, -51.9253],   // Brazil
  IN: [20.5937, 78.9629],   // India
  JP: [36.2048, 138.2529],  // Japan
  CN: [35.8617, 104.1954],  // China
  AE: [23.4241, 53.8478],   // UAE
  SG: [1.3521, 103.8198],   // Singapore
  ZA: [30.5595, 22.9375],   // South Africa
  MX: [23.6345, -102.5528], // Mexico
  AR: [38.4164, -63.6167],  // Argentina
  EG: [26.8206, 30.8025],   // Egypt
  TR: [38.9637, 35.2433],   // Turkey
  GR: [39.9399, 21.5099],   // Greece
  PT: [39.3999, -8.2245],   // Portugal
  CH: [46.8182, 8.2275],    // Switzerland
  AT: [47.5162, 14.5501],   // Austria
  BE: [50.5039, 4.4699],    // Belgium
  SE: [60.1282, 18.6435],   // Sweden
  NO: [60.472, 8.4689],     // Norway
  DK: [56.2639, 9.5018],    // Denmark
  FI: [61.9241, 25.7482],   // Finland
  PL: [51.9194, 19.1451],   // Poland
  RU: [61.524, 105.3188],   // Russia
  UA: [48.3794, 31.1656],   // Ukraine
  IE: [53.4129, -8.2439],   // Ireland
  NZ: [40.9006, -174.886],  // New Zealand
  TH: [15.87, 100.9925],    // Thailand
  KR: [35.9078, 127.7669],  // South Korea
  ID: [0.7893, 113.9213],   // Indonesia
  MY: [4.2105, 101.9758],   // Malaysia
  PH: [12.8797, 121.774],   // Philippines
  VN: [14.0583, 108.2772],  // Vietnam
  HK: [22.3193, 114.1694],  // Hong Kong
  TW: [23.6978, 120.9605],  // Taiwan
};

// Path to the world-atlas TopoJSON. We import it as a URL so Next.js /
// webpack can resolve it from node_modules.
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export function ChapterWorldMap({
  chapters,
  selectedCountryId = "",
  selectedChapterId = "",
  onSelect,
}: {
  chapters: MapChapter[];
  selectedCountryId?: string;
  selectedChapterId?: string;
  onSelect?: (next: { countryId: string; chapterId: string }) => void;
}) {
  const [hoveredChapterId, setHoveredChapterId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Group chapters by country for the side panel.
  const byCountry = useMemo(() => {
    const m = new Map<string, { country: MapChapter["countryName"] | "Unknown"; countryCode: string; flag?: string | null; chapters: MapChapter[]; totalMembers: number; totalEvents: number; totalEmails: number; totalMockups: number; totalQuiz: number; totalSpeakers: number }>();
    for (const ch of chapters) {
      const key = ch.countryId || "__none__";
      if (!m.has(key)) {
        m.set(key, {
          country: ch.countryName || "Unknown",
          countryCode: ch.countryCode,
          flag: ch.countryFlagEmoji,
          chapters: [],
          totalMembers: 0,
          totalEvents: 0,
          totalEmails: 0,
          totalMockups: 0,
          totalQuiz: 0,
          totalSpeakers: 0,
        });
      }
      const entry = m.get(key)!;
      entry.chapters.push(ch);
      entry.totalMembers += ch.memberCount ?? 0;
      entry.totalEvents += ch.eventCount ?? 0;
      entry.totalEmails += ch.emailCount ?? 0;
      entry.totalMockups += ch.mockupCount ?? 0;
      entry.totalQuiz += ch.quizCount ?? 0;
      entry.totalSpeakers += ch.speakerCount ?? 0;
    }
    return Array.from(m.entries()).map(([countryId, v]) => ({ countryId, ...v }));
  }, [chapters]);

  // Pin positions: one per chapter (or per country if chapter doesn't have its own coords).
  const pins = useMemo(() => {
    return chapters.map((ch) => {
      const centroid = COUNTRY_CENTROIDS[ch.countryCode.toUpperCase()];
      // Small offset per chapter so multiple chapters in the same country don't overlap.
      const offset = ch.city ? hashOffset(ch.city) : [0, 0];
      const lat = centroid ? centroid[0] + offset[0] : 0;
      const lon = centroid ? centroid[1] + offset[1] : 0;
      return { chapter: ch, coordinates: [lon, lat] as [number, number], hasCoords: !!centroid };
    });
  }, [chapters]);

  // Color scale: pin size by member count.
  const maxMembers = Math.max(1, ...pins.map((p) => p.chapter.memberCount ?? 0));
  const radiusScale = scaleLinear().domain([0, maxMembers]).range([4, 14]);

  function handleChapterClick(ch: MapChapter) {
    onSelect?.({ countryId: ch.countryId, chapterId: ch.id });
  }

  function handleCountryClick(countryId: string) {
    // Toggle: if already selected, clear. Otherwise set country only.
    if (selectedCountryId === countryId && !selectedChapterId) {
      onSelect?.({ countryId: "", chapterId: "" });
    } else {
      onSelect?.({ countryId, chapterId: "" });
    }
  }

  const activeChapter = hoveredChapterId
    ? chapters.find((c) => c.id === hoveredChapterId)
    : selectedChapterId
      ? chapters.find((c) => c.id === selectedChapterId)
      : null;

  return (
    <div className="rounded-lg border border-black/10 bg-white overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-0">
        {/* Map */}
        <div className="relative bg-[#f8fafc]">
          <div className="absolute top-3 left-3 z-10 text-[0.65rem] font-bold uppercase tracking-widest text-[#820A7D] bg-white/90 backdrop-blur px-2 py-1 rounded">
            <Globe2 className="inline h-3 w-3 mr-1" />
            Chapter map — click a pin to filter
          </div>
          {(selectedCountryId || selectedChapterId) && (
            <button
              type="button"
              onClick={() => onSelect?.({ countryId: "", chapterId: "" })}
              className="absolute top-3 right-3 z-10 text-xs font-semibold text-[#FF005A] hover:text-[#FF005A]/80 bg-white/90 backdrop-blur px-2 py-1 rounded border border-[#FF005A]/30 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear filter
            </button>
          )}

          <ComposableMap
            width={800}
            height={400}
            style={{ width: "100%", height: "auto", backgroundColor: "transparent" }}
            projection="geoEqualEarth"
          >
            <ZoomableGroup zoom={1} center={[20, 20]}>
              <Geographies geography={GEO_URL}>
                {({ geographies }: { geographies: Array<Feature<Geometry, { ISO_A2: string; NAME: string }>> }) =>
                  geographies.map((geo) => {
                    const countryCode = (geo.properties as { ISO_A2?: string }).ISO_A2 ?? "";
                    const isSelected = byCountry.some(
                      (c) => c.countryCode.toUpperCase() === countryCode.toUpperCase() && c.countryId === selectedCountryId
                    );
                    const hasChapters = byCountry.some(
                      (c) => c.countryCode.toUpperCase() === countryCode.toUpperCase()
                    );
                    return (
                      <Geography
                        key={geo.id ?? (geo.properties as { NAME: string }).NAME}
                        geography={geo}
                        onClick={() => {
                          const match = byCountry.find(
                            (c) => c.countryCode.toUpperCase() === countryCode.toUpperCase()
                          );
                          if (match) handleCountryClick(match.countryId);
                        }}
                        style={{
                          default: {
                            fill: isSelected
                              ? "#820A7D"
                              : hasChapters
                                ? "#FFE6F4"
                                : "#E5E7EB",
                            stroke: "#FFFFFF",
                            strokeWidth: 0.5,
                            outline: "none",
                            cursor: hasChapters ? "pointer" : "default",
                          },
                          hover: {
                            fill: hasChapters ? "#FF005A" : "#D1D5DB",
                            stroke: "#FFFFFF",
                            strokeWidth: 0.5,
                            outline: "none",
                            cursor: hasChapters ? "pointer" : "default",
                          },
                          pressed: {
                            fill: "#820A7D",
                            outline: "none",
                          },
                        }}
                      />
                    );
                  })
                }
              </Geographies>

              {/* Chapter pins */}
              {pins.filter((p) => p.hasCoords).map((p) => {
                const r = radiusScale(p.chapter.memberCount ?? 0);
                const isActive = selectedChapterId === p.chapter.id || hoveredChapterId === p.chapter.id;
                const isCountryActive = selectedCountryId === p.chapter.countryId;
                return (
                  <Marker
                    key={p.chapter.id}
                    coordinates={p.coordinates}
                    onClick={() => handleChapterClick(p.chapter)}
                    onMouseEnter={() => setHoveredChapterId(p.chapter.id)}
                    onMouseLeave={() => setHoveredChapterId(null)}
                  >
                    <circle
                      r={isActive ? r + 3 : r}
                      fill={isActive ? "#820A7D" : isCountryActive ? "#FF005A" : "#FF005A"}
                      stroke="#FFFFFF"
                      strokeWidth={1.5}
                      opacity={0.9}
                      style={{ cursor: "pointer" }}
                    />
                    {p.chapter.memberCount !== undefined && p.chapter.memberCount > 0 && (
                      <text
                        textAnchor="middle"
                        y={-r - 4}
                        style={{
                          fontSize: "8px",
                          fontWeight: 700,
                          fill: "#000",
                          pointerEvents: "none",
                          userSelect: "none",
                        }}
                      >
                        {p.chapter.memberCount}
                      </text>
                    )}
                  </Marker>
                );
              })}
            </ZoomableGroup>
          </ComposableMap>
        </div>

        {/* Side panel — counts for the active chapter OR summary of selected country */}
        <div className="border-t lg:border-t-0 lg:border-l border-black/10 p-4 bg-white max-h-[400px] overflow-y-auto ais-scroll">
          {activeChapter ? (
            <div className="space-y-3">
              <div>
                <div className="text-[0.6rem] font-bold uppercase tracking-widest text-[#820A7D] flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {activeChapter.countryFlagEmoji} {activeChapter.countryName}
                </div>
                <h3 className="text-base font-bold text-black mt-0.5">
                  {activeChapter.name}
                  {activeChapter.city ? ` — ${activeChapter.city}` : ""}
                </h3>
                <p className="text-[0.65rem] text-black/60 font-mono">/{activeChapter.slug}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <CountTile icon={<Users className="h-3 w-3" />} label="Members" value={activeChapter.memberCount ?? 0} color="#FF005A" />
                <CountTile icon={<Mic2 className="h-3 w-3" />} label="Speakers" value={activeChapter.speakerCount ?? 0} color="#820A7D" />
                <CountTile icon={<CalendarDays className="h-3 w-3" />} label="Events" value={activeChapter.eventCount ?? 0} color="#007E72" />
                <CountTile icon={<Mail className="h-3 w-3" />} label="Emails" value={activeChapter.emailCount ?? 0} color="#00E6FF" />
                <CountTile icon={<ImageIcon className="h-3 w-3" />} label="Mockups" value={activeChapter.mockupCount ?? 0} color="#FFC300" />
                <CountTile icon={<Brain className="h-3 w-3" />} label="Quiz sessions" value={activeChapter.quizCount ?? 0} color="#004F98" />
              </div>

              {onSelect && (
                <button
                  type="button"
                  onClick={() => onSelect({ countryId: activeChapter.countryId, chapterId: activeChapter.id })}
                  className="w-full text-xs font-semibold bg-[#820A7D] text-white px-3 py-2 rounded hover:bg-[#820A7D]/90"
                >
                  Filter list to this chapter →
                </button>
              )}
            </div>
          ) : selectedCountryId ? (
            <div className="space-y-3">
              {byCountry
                .filter((c) => c.countryId === selectedCountryId)
                .map((c) => (
                  <div key={c.countryId} className="space-y-2">
                    <div>
                      <div className="text-[0.6rem] font-bold uppercase tracking-widest text-[#820A7D] flex items-center gap-1">
                        <Globe2 className="h-3 w-3" />
                        Country summary
                      </div>
                      <h3 className="text-base font-bold text-black mt-0.5">
                        {c.flag} {c.country}
                      </h3>
                      <p className="text-[0.65rem] text-black/60">
                        {c.chapters.length} chapter{c.chapters.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <CountTile icon={<Users className="h-3 w-3" />} label="Members" value={c.totalMembers} color="#FF005A" />
                      <CountTile icon={<Mic2 className="h-3 w-3" />} label="Speakers" value={c.totalSpeakers} color="#820A7D" />
                      <CountTile icon={<CalendarDays className="h-3 w-3" />} label="Events" value={c.totalEvents} color="#007E72" />
                      <CountTile icon={<Mail className="h-3 w-3" />} label="Emails" value={c.totalEmails} color="#00E6FF" />
                      <CountTile icon={<ImageIcon className="h-3 w-3" />} label="Mockups" value={c.totalMockups} color="#FFC300" />
                      <CountTile icon={<Brain className="h-3 w-3" />} label="Quiz" value={c.totalQuiz} color="#004F98" />
                    </div>
                    <div className="text-[0.65rem] text-black/60 mt-2">Chapters in this country:</div>
                    <ul className="space-y-1">
                      {c.chapters.map((ch) => (
                        <li key={ch.id}>
                          <button
                            type="button"
                            onClick={() => onSelect?.({ countryId: c.countryId, chapterId: ch.id })}
                            className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${
                              selectedChapterId === ch.id
                                ? "bg-[#820A7D] text-white"
                                : "hover:bg-black/5 text-black/80"
                            }`}
                          >
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="font-semibold">{ch.name}</span>
                            {ch.city ? <span className="text-[0.6rem] opacity-70">· {ch.city}</span> : null}
                            <span className="ml-auto text-[0.6rem] opacity-70">{ch.memberCount ?? 0}m</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[0.6rem] font-bold uppercase tracking-widest text-[#820A7D] flex items-center gap-1">
                <Globe2 className="h-3 w-3" />
                All countries
              </div>
              <p className="text-xs text-black/60">
                Click a country (shaded pink) on the map to see its chapter summary, or click a pin to drill into a specific chapter.
              </p>
              <ul className="space-y-1 mt-2">
                {byCountry.map((c) => (
                  <li key={c.countryId}>
                    <button
                      type="button"
                      onClick={() => onSelect?.({ countryId: c.countryId, chapterId: "" })}
                      className="w-full text-left text-xs px-2 py-1 rounded hover:bg-black/5 text-black/80 flex items-center gap-2"
                    >
                      <span>{c.flag ?? "🏳️"}</span>
                      <span className="font-semibold">{c.country}</span>
                      <span className="text-[0.6rem] opacity-70 ml-auto">
                        {c.chapters.length} ch · {c.totalMembers}m
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CountTile({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-md border border-black/10 p-2 bg-white">
      <div className="flex items-center justify-between">
        <span className="text-[0.55rem] font-bold uppercase tracking-wider text-black/60 flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="mt-0.5 text-lg font-extrabold text-black">{value}</div>
    </div>
  );
}

// Deterministic small offset for chapter pins within the same country.
// Hashes the city name to a stable [lat, lon] offset in degrees.
function hashOffset(s: string): [number, number] {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  // Spread chapters in a 4-degree radius around the country centroid.
  const angle = (Math.abs(h) % 360) * (Math.PI / 180);
  const radius = 1 + (Math.abs(h >> 8) % 30) / 10; // 1–4 degrees
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

// Avoid unused-import TS errors when tree-shaking doesn't catch d3geo.
// (We use it implicitly through react-simple-maps' projection.)
void d3geo;
