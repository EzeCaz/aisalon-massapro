"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * AI Salon brand book color palette (7 colors).
 * Source: brandbook_specs.json
 *   Black   #000000
 *   Pink    #FF005A
 *   Cyan    #00E5FF
 *   Yellow  #FFC300
 *   Teal    #007E72
 *   Blue    #004F98
 *   Purple  #820A7D
 *
 * Each of the 14 cities is assigned a distinct color from this palette.
 * With 14 cities and 7 colors, each color is used exactly twice —
 * assigned so that no two nearby cities share a color.
 */
type BrandColor =
  | "black"
  | "pink"
  | "cyan"
  | "yellow"
  | "teal"
  | "blue"
  | "purple";

const BRAND_HEX: Record<BrandColor, string> = {
  black: "#000000",
  pink: "#FF005A",
  cyan: "#00E5FF",
  yellow: "#FFC300",
  teal: "#007E72",
  blue: "#004F98",
  purple: "#820A7D",
};

interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
  region: string;
  color: BrandColor;
}

// 14 cities joining the AI Salon global event — each gets its own brand-book color.
// Assignments ensure no two nearby cities share a color.
const CITIES: City[] = [
  { name: "Amsterdam",      country: "Netherlands", lat: 52.3676, lon:   4.9041, region: "Europe",          color: "cyan"    },
  { name: "Bologna",        country: "Italy",       lat: 44.4949, lon:  11.3426, region: "Europe",          color: "purple"  },
  { name: "Chicago",        country: "USA",         lat: 41.8781, lon: -87.6298, region: "North America",   color: "blue"    },
  { name: "Dubai",          country: "UAE",         lat: 25.2048, lon:  55.2708, region: "Middle East",     color: "teal"    },
  { name: "Guatemala City", country: "Guatemala",   lat: 14.6349, lon: -90.5069, region: "Central America", color: "yellow"  },
  { name: "Hermosillo",     country: "Mexico",      lat: 29.0729, lon:-110.9559, region: "North America",   color: "pink"    },
  { name: "Houston",        country: "USA",         lat: 29.7604, lon: -95.3698, region: "North America",   color: "black"   },
  { name: "Milan",          country: "Italy",       lat: 45.4642, lon:   9.1900, region: "Europe",          color: "blue"    },
  { name: "New York",       country: "USA",         lat: 40.7128, lon: -74.0060, region: "North America",   color: "yellow"  },
  { name: "Osaka",          country: "Japan",       lat: 34.6937, lon: 135.5023, region: "Asia",            color: "purple"  },
  { name: "Rome",           country: "Italy",       lat: 41.9028, lon:  12.4964, region: "Europe",          color: "pink"    },
  { name: "São Paulo",      country: "Brazil",      lat:-23.5505, lon: -46.6333, region: "South America",   color: "teal"    },
  { name: "Sydney",         country: "Australia",   lat:-33.8688, lon: 151.2093, region: "Oceania",         color: "black"   },
  { name: "Tel Aviv",       country: "Israel",      lat: 32.0853, lon:  34.7818, region: "Middle East",     color: "cyan"    },
];

// Equirectangular projection: lat/lon → x/y on a 1000×500 canvas
const MAP_W = 1000;
const MAP_H = 500;

function project(lat: number, lon: number) {
  const x = ((lon + 180) / 360) * MAP_W;
  const y = ((90 - lat) / 180) * MAP_H;
  return { x, y };
}

// Helper: every brand color is its own "region" for the legend now.
const BRAND_COLORS_LIST = Object.entries(BRAND_HEX) as [BrandColor, string][];

export function WorldMap() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const active = hovered ?? selected;

  const stats = useMemo(() => {
    const regions = new Set(CITIES.map((c) => c.region));
    return {
      cities: CITIES.length,
      regions: regions.size,
      countries: new Set(CITIES.map((c) => c.country)).size,
    };
  }, []);

  return (
    <section
      id="map"
      className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-secondary/40 border-y border-border"
    >
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-10 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card mb-4">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan opacity-75 salon-pulse" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan" />
            </span>
            <span className="tagline text-[0.65rem] text-muted-foreground">
              14 Cities · One Conversation
            </span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4">
            The world is{" "}
            <span className="brand-gradient-text">gathering</span>.
          </h2>
          <p className="text-base sm:text-lg text-foreground/70 leading-relaxed max-w-2xl mx-auto">
            Hover or tap a marker to meet the city. Each dot is a room — a
            chapter convening around the question of what it means to be human
            in the age of AI.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8 items-start">
          {/* Map */}
          <div className="relative rounded-3xl border border-border bg-card p-3 sm:p-5 overflow-hidden">
            <div
              aria-hidden
              className="absolute inset-0 dot-pattern opacity-30 pointer-events-none"
            />
            <div className="relative aspect-[2/1] w-full">
              <svg
                viewBox={`0 0 ${MAP_W} ${MAP_H}`}
                className="w-full h-full"
                role="img"
                aria-label="World map showing 14 cities hosting AI Salon events"
              >
                {/* Ocean background */}
                <defs>
                  <linearGradient id="oceanGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.97 0.02 200)" />
                    <stop offset="100%" stopColor="oklch(0.95 0.04 200)" />
                  </linearGradient>
                  <linearGradient id="landGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.88 0.02 240)" />
                    <stop offset="100%" stopColor="oklch(0.82 0.02 240)" />
                  </linearGradient>
                  <filter id="markerGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <rect
                  x={0}
                  y={0}
                  width={MAP_W}
                  height={MAP_H}
                  fill="url(#oceanGrad)"
                />

                {/* Latitude / longitude grid */}
                <g stroke="oklch(0.82 0.16 200 / 0.12)" strokeWidth="0.5">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <line
                      key={`v${i}`}
                      x1={(i * MAP_W) / 10}
                      y1={0}
                      x2={(i * MAP_W) / 10}
                      y2={MAP_H}
                    />
                  ))}
                  {Array.from({ length: 7 }).map((_, i) => (
                    <line
                      key={`h${i}`}
                      x1={0}
                      y1={(i * MAP_H) / 6}
                      x2={MAP_W}
                      y2={(i * MAP_H) / 6}
                    />
                  ))}
                </g>

                {/* Continents — recognizable silhouettes tuned so every host city sits on land */}
                <g fill="url(#landGrad)" stroke="oklch(0.75 0.04 200)" strokeWidth="0.6" strokeLinejoin="round">
                  {/* North America — Alaska through southern Mexico, with Yucatát/Guatemala dip */}
                  <path d="M 55 92 L 90 75 L 135 65 L 195 58 L 255 62 L 298 78 L 318 100 L 320 128 L 308 152 L 292 172 L 275 188 L 262 205 L 268 220 L 250 224 L 232 218 L 215 214 L 205 208 L 188 195 L 172 180 L 158 165 L 144 150 L 128 135 L 112 122 L 92 108 L 72 100 Z" />
                  {/* Central America — connector including Guatemala City */}
                  <path d="M 230 208 L 252 218 L 268 232 L 274 248 L 260 254 L 244 246 L 230 232 L 222 218 Z" />
                  {/* Caribbean arc (Cuba / Hispaniola) for geographic context */}
                  <path d="M 270 178 L 296 174 L 310 182 L 300 192 L 278 190 Z" />
                  {/* South America — narrow north, widening to Brazil bulge, tapering to Patagonia */}
                  <path d="M 285 232 L 318 224 L 348 232 L 372 248 L 388 274 L 398 308 L 392 348 L 374 384 L 350 408 L 322 416 L 298 408 L 282 384 L 274 348 L 272 308 L 278 272 L 282 248 Z" />
                  {/* Greenland — geographic context, top-right */}
                  <path d="M 372 50 L 408 48 L 425 65 L 420 90 L 400 100 L 380 90 L 372 72 Z" />
                  {/* British Isles */}
                  <path d="M 478 92 L 492 88 L 498 102 L 492 118 L 480 116 L 474 104 Z" />
                  {/* Scandinavia spur */}
                  <path d="M 518 60 L 542 56 L 552 78 L 545 92 L 528 90 L 520 76 Z" />
                  {/* Europe mainland — includes Amsterdam, Milan, Bologna, Rome */}
                  <path d="M 490 98 L 520 92 L 552 92 L 580 100 L 600 112 L 606 130 L 598 146 L 580 152 L 558 154 L 535 150 L 512 142 L 495 130 L 484 116 Z" />
                  {/* Africa — broad top, tapering to Cape */}
                  <path d="M 502 156 L 548 154 L 590 168 L 614 196 L 624 230 L 618 266 L 598 302 L 574 330 L 548 344 L 524 332 L 508 302 L 496 266 L 488 226 L 488 190 Z" />
                  {/* Madagascar */}
                  <path d="M 622 280 L 632 282 L 638 304 L 632 322 L 624 318 L 620 300 Z" />
                  {/* Arabian Peninsula & Levant — KEY: must include both Tel Aviv (596.6, 160.9) and Dubai (653.5, 180.0) */}
                  <path d="M 588 148 L 612 148 L 642 154 L 672 168 L 690 188 L 694 212 L 678 232 L 650 240 L 620 232 L 602 214 L 590 192 L 584 170 Z" />
                  {/* Asia mainland — sweeping landmass from Urals to Pacific */}
                  <path d="M 600 78 L 660 66 L 728 70 L 798 80 L 858 92 L 895 110 L 908 132 L 898 154 L 868 168 L 830 178 L 798 182 L 768 184 L 738 182 L 712 174 L 688 164 L 668 150 L 648 134 L 626 118 L 608 100 Z" />
                  {/* Indian subcontinent */}
                  <path d="M 696 178 L 728 180 L 748 192 L 758 218 L 748 244 L 728 248 L 712 228 L 700 204 Z" />
                  {/* Southeast Asia / Indonesia archipelago */}
                  <path d="M 778 198 L 812 202 L 842 214 L 864 230 L 858 248 L 832 256 L 802 252 L 782 240 L 770 224 Z" />
                  {/* Philippines fragment */}
                  <path d="M 855 218 L 868 222 L 870 238 L 860 240 L 854 228 Z" />
                  {/* Korean peninsula */}
                  <path d="M 850 142 L 862 142 L 868 162 L 858 178 L 850 168 Z" />
                  {/* Japan — includes Osaka (876.4, 153.6) */}
                  <path d="M 866 130 L 880 128 L 898 142 L 908 162 L 898 180 L 882 180 L 870 168 L 862 152 Z" />
                  {/* Australia — includes Sydney (920.0, 344.1) */}
                  <path d="M 818 298 L 858 292 L 898 296 L 928 306 L 942 326 L 940 350 L 922 364 L 892 370 L 860 362 L 834 350 L 820 330 L 814 312 Z" />
                  {/* Tasmania */}
                  <path d="M 916 374 L 928 374 L 932 386 L 924 392 L 916 386 Z" />
                  {/* New Zealand — North & South Island */}
                  <path d="M 948 360 L 962 358 L 970 372 L 962 384 L 952 380 Z" />
                  <path d="M 942 388 L 956 386 L 962 402 L 952 410 L 942 402 Z" />
                </g>

                {/* City markers — each uses its assigned brand-book color */}
                {CITIES.map((city) => {
                  const { x, y } = project(city.lat, city.lon);
                  const fillColor = BRAND_HEX[city.color];
                  const isActive = active === city.name;
                  // For very dark colors (black, blue, purple), the white halo
                  // on the marker label needs a brighter stroke; use a light
                  // outer ring for dark fills so they stay visible on land.
                  const isDarkFill =
                    city.color === "black" ||
                    city.color === "blue" ||
                    city.color === "purple" ||
                    city.color === "teal";
                  return (
                    <g
                      key={city.name}
                      transform={`translate(${x} ${y})`}
                      className="cursor-pointer"
                      onMouseEnter={() => setHovered(city.name)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() =>
                        setSelected((s) => (s === city.name ? null : city.name))
                      }
                    >
                      {/* Pulse ring (only on active) */}
                      {isActive && (
                        <circle
                          r={6}
                          fill={fillColor}
                          opacity={0.3}
                          className="salon-pulse"
                          style={{ transformOrigin: "center" }}
                        />
                      )}
                      {/* Soft white halo — keeps dark dots visible on dark land */}
                      {isDarkFill && (
                        <circle
                          r={isActive ? 10 : 7}
                          fill="oklch(1 0 0)"
                          opacity={0.85}
                        />
                      )}
                      {/* Outer ring */}
                      <circle
                        r={isActive ? 9 : 6}
                        fill="none"
                        stroke={fillColor}
                        strokeWidth={isActive ? 2 : 1.5}
                        opacity={isActive ? 1 : 0.85}
                      />
                      {/* Solid dot */}
                      <circle
                        r={isActive ? 4 : 3}
                        fill={fillColor}
                        filter={isActive ? "url(#markerGlow)" : undefined}
                      />
                      {/* Label on hover */}
                      {isActive && (
                        <g transform="translate(0 -14)">
                          <rect
                            x={-city.name.length * 3.2 - 6}
                            y={-10}
                            width={city.name.length * 6.4 + 12}
                            height={18}
                            rx={4}
                            fill="oklch(0.16 0.01 240)"
                            opacity={0.95}
                          />
                          <text
                            x={0}
                            y={3}
                            textAnchor="middle"
                            fontSize={9}
                            fontFamily="var(--font-jakarta), sans-serif"
                            fontWeight={700}
                            fill="white"
                          >
                            {city.name}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Connector lines between cities — network effect */}
                <g
                  stroke="oklch(0.82 0.16 200 / 0.18)"
                  strokeWidth="0.5"
                  strokeDasharray="2 3"
                  fill="none"
                >
                  {CITIES.map((c1, i) =>
                    CITIES.slice(i + 1).map((c2, j) => {
                      // Only draw lines from each city to its 2 nearest neighbors
                      const d = Math.hypot(c1.lat - c2.lat, c1.lon - c2.lon);
                      if (d > 25) return null;
                      const p1 = project(c1.lat, c1.lon);
                      const p2 = project(c2.lat, c2.lon);
                      return (
                        <line
                          key={`${i}-${j}`}
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                        />
                      );
                    })
                  )}
                </g>
              </svg>
            </div>

            {/* Legend — hosting cities, each shown with its assigned brand color */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span className="text-[0.6rem] font-bold uppercase tracking-wider text-foreground/60">
                  Hosting cities:
                </span>
                {CITIES.map((city) => (
                  <span
                    key={city.name}
                    className="inline-flex items-center gap-1.5"
                    title={`${city.name}, ${city.country}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-1 ring-foreground/10"
                      style={{ backgroundColor: BRAND_HEX[city.color] }}
                    />
                    <span>{city.name}</span>
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.cities} cities · {stats.countries} countries ·{" "}
                {stats.regions} regions
              </p>
            </div>
          </div>

          {/* City list / detail panel */}
          <aside className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="font-display text-xl font-bold">Chapters</h3>
              <span className="tagline text-muted-foreground">
                Tap to explore
              </span>
            </div>

            {/* Active city highlight */}
            {active ? (
              <ActiveCityCard
                city={CITIES.find((c) => c.name === active)!}
                onClose={() => {
                  setHovered(null);
                  setSelected(null);
                }}
              />
            ) : (
              <div className="rounded-2xl bg-secondary/60 p-5 mb-4">
                <p className="text-sm text-foreground/70 leading-relaxed">
                  Fourteen cities. One question. From Brooklyn watercolorists
                  to Osaka engineers, from Denver porches to Nairobi guilds —
                  the Salon gathers where the question is alive.
                </p>
                <p className="text-xs text-muted-foreground mt-3 italic">
                  Hover or tap a marker to meet the chapter.
                </p>
              </div>
            )}

            {/* Full city list — each dot uses the city's brand-book color */}
            <ul className="space-y-1 max-h-[400px] overflow-y-auto brand-scroll pr-1">
              {CITIES.map((city) => {
                const isActive = active === city.name;
                return (
                  <li key={city.name}>
                    <button
                      onMouseEnter={() => setHovered(city.name)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setSelected(city.name)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                        isActive
                          ? "bg-secondary"
                          : "hover:bg-secondary/60"
                      )}
                    >
                      <span
                        className="flex-none w-2.5 h-2.5 rounded-full ring-1 ring-foreground/10"
                        style={{ backgroundColor: BRAND_HEX[city.color] }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">
                          {city.name}
                        </span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {city.country} · {city.region}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
}

function ActiveCityCard({
  city,
  onClose,
}: {
  city: City;
  onClose: () => void;
}) {
  const accentHex = BRAND_HEX[city.color];
  return (
    <div
      className="rounded-2xl border p-5 mb-4 salon-rise"
      style={{
        background: `linear-gradient(135deg, ${accentHex}14 0%, oklch(1 0 0) 100%)`,
        borderColor: `${accentHex}40`,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-full ring-1 ring-foreground/10"
              style={{ backgroundColor: accentHex }}
              aria-hidden
            />
            <p
              className="tagline uppercase tracking-wider"
              style={{ color: accentHex }}
            >
              {city.region}
            </p>
          </div>
          <h4 className="font-display text-2xl font-bold leading-tight">
            {city.name}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">{city.country}</p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/60">
        <div>
          <p className="tagline text-[0.55rem] text-muted-foreground">Lat</p>
          <p className="font-mono text-sm">{city.lat.toFixed(2)}°</p>
        </div>
        <div>
          <p className="tagline text-[0.55rem] text-muted-foreground">Lon</p>
          <p className="font-mono text-sm">{city.lon.toFixed(2)}°</p>
        </div>
        <div>
          <p className="tagline text-[0.55rem] text-muted-foreground">Color</p>
          <p className="font-mono text-sm capitalize" style={{ color: accentHex }}>
            {city.color}
          </p>
        </div>
      </div>
      <p className="text-xs text-foreground/70 mt-4 leading-relaxed">
        Part of the global AI Salon gathering around{" "}
        <em>AI &amp; Human Flourishing</em> — what does it mean to be human in
        the age of AI?
      </p>
    </div>
  );
}
