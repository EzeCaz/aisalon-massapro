"use client";

/**
 * <ChapterMapPanel />
 * ──────────────────
 * Client wrapper around <ChapterWorldMap> with a tab toggle:
 *   - "Map view" — shows the interactive choropleth
 *   - "Tree view" — shows the classic Country → Chapter tree (default)
 *
 * The parent server page passes the chapters list + counts. This
 * component owns the filter state and re-renders the tree filtered.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Globe2 } from "lucide-react";
import { ChapterWorldMap, type MapChapter } from "./chapter-world-map";

export type ChapterTreeNode = MapChapter;

export function ChapterMapPanel({
  chapters,
  isSuperAdmin,
}: {
  chapters: ChapterTreeNode[];
  isSuperAdmin: boolean;
}) {
  const [view, setView] = useState<"tree" | "map">("map");
  const [filter, setFilter] = useState<{ countryId: string; chapterId: string }>({
    countryId: "",
    chapterId: "",
  });

  const filtered = chapters.filter((c) => {
    if (filter.chapterId) return c.id === filter.chapterId;
    if (filter.countryId) return c.countryId === filter.countryId;
    return true;
  });

  // Group by country for tree view
  const byCountry = new Map<string, { countryName: string; countryCode: string; flag?: string | null; chapters: ChapterTreeNode[] }>();
  for (const ch of filtered) {
    if (!byCountry.has(ch.countryId)) {
      byCountry.set(ch.countryId, {
        countryName: ch.countryName,
        countryCode: ch.countryCode,
        flag: ch.countryFlagEmoji,
        chapters: [],
      });
    }
    byCountry.get(ch.countryId)!.chapters.push(ch);
  }

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center gap-2">
        <div className="inline-flex border border-black/15 rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setView("map")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === "map" ? "bg-black text-white" : "bg-white text-black/80 hover:bg-black/5"
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" /> Map view
          </button>
          <button
            type="button"
            onClick={() => setView("tree")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors border-l border-black/10 ${
              view === "tree" ? "bg-black text-white" : "bg-white text-black/80 hover:bg-black/5"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" /> Tree view
          </button>
        </div>
        {(filter.countryId || filter.chapterId) && (
          <button
            type="button"
            onClick={() => setFilter({ countryId: "", chapterId: "" })}
            className="text-xs font-semibold text-[#FF005A] hover:underline ml-2"
          >
            Clear filter
          </button>
        )}
        <span className="ml-auto text-xs text-black/60">
          Showing <strong>{filtered.length}</strong> of {chapters.length} chapters
        </span>
      </div>

      {/* Map view */}
      {view === "map" && (
        <ChapterWorldMap
          chapters={chapters}
          selectedCountryId={filter.countryId}
          selectedChapterId={filter.chapterId}
          onSelect={setFilter}
        />
      )}

      {/* Tree view (filtered by the same scope as the map) */}
      {view === "tree" && (
        <div className="space-y-6">
          {byCountry.size === 0 && (
            <div className="rounded-md border border-black/10 bg-black/[0.02] p-8 text-center">
              <p className="text-sm text-black/70">
                {chapters.length === 0
                  ? "No countries in your scope yet. Click \"+ Add country\" above to create one (Super Admin only)."
                  : "No chapters match your filter."}
              </p>
            </div>
          )}
          {Array.from(byCountry.entries()).map(([countryId, entry]) => (
            <section key={countryId} className="rounded-lg border border-black/10 bg-white overflow-hidden">
              <header className="px-5 py-4 bg-[#820A7D]/[0.04] border-b border-[#820A7D]/20 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none">{entry.flag ?? "🏳️"}</span>
                  <div>
                    <h2 className="text-lg font-bold text-black">
                      {entry.countryName}{" "}
                      <span className="text-xs font-mono text-black/50">({entry.countryCode})</span>
                    </h2>
                    <p className="text-xs text-black/60">
                      {entry.chapters.length} chapter{entry.chapters.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {isSuperAdmin && (
                  <Link
                    href={`/admin/chapters/new?countryId=${countryId}`}
                    className="inline-flex items-center gap-2 rounded-md border border-[#820A7D] text-[#820A7D] font-semibold px-3 py-1.5 text-xs hover:bg-[#820A7D] hover:text-white whitespace-nowrap"
                  >
                    + Add chapter
                  </Link>
                )}
              </header>
              <div className="divide-y divide-black/5">
                {entry.chapters.map((chapter) => (
                  <div key={chapter.id} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap hover:bg-black/[0.015]">
                    <div className="flex items-center gap-3 min-w-0">
                      <MapPin className="h-4 w-4 text-[#FF005A] flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-black truncate">
                          {chapter.name}
                          {chapter.city && <span className="ml-2 text-xs font-normal text-black/50">{chapter.city}</span>}
                        </p>
                        <p className="text-xs text-black/60">
                          <code className="bg-black/5 px-1 rounded text-[0.65rem]">/{chapter.slug}</code>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <CountPill label="Members" value={chapter.memberCount ?? 0} />
                      <CountPill label="Events" value={chapter.eventCount ?? 0} />
                      <CountPill label="RSVPs" value={chapter.rsvpCount ?? 0} />
                      <CountPill label="Speakers" value={chapter.speakerCount ?? 0} />
                      <CountPill label="Emails" value={chapter.emailCount ?? 0} />
                      <CountPill label="Mockups" value={chapter.mockupCount ?? 0} />
                      <CountPill label="Quiz" value={chapter.quizCount ?? 0} />
                      <Link
                        href={`/admin/chapters/${chapter.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-black text-white font-semibold px-2.5 py-1 text-xs hover:bg-black/80 whitespace-nowrap"
                      >
                        Edit <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-bold text-black">{value}</span>
      <span className="text-black/50">{label}</span>
    </span>
  );
}
