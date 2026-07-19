"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Image as ImageIcon,
  Users,
  Calendar,
  Pencil,
  ExternalLink,
  Ticket,
  UserCircle,
} from "lucide-react";
import {
  CountryChapterScopeFilter,
  type ScopeFilterCountry,
  type ScopeFilterChapter,
} from "@/components/ais/country-chapter-scope-filter";
import { BulkAssignScopeDialog } from "@/components/ais/bulk-assign-scope-dialog";

type EventRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  chapter: string;
  venue: string | null;
  country: string | null;
  isCrossChapter?: boolean;
  chapterRef?: { id: string; name: string; slug: string; country: { name: string; code: string; flagEmoji?: string | null } } | null;
  startsAt: string;
  endsAt: string;
  mainImage: { id: string; fileUrl: string } | null;
  coHosts: {
    id: string;
    userId: string;
    userName: string;
    userPhotoUrl: string | null;
  }[];
  _count: {
    images: number;
    speakers: number;
    agenda: number;
    rsvps: number;
    checkedIn: number;
  };
};

const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", month: "short" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", day: "2-digit" });
const fullDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jerusalem",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jerusalem",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function AdminEventsListWithActions({
  events,
  allCountries,
  allChapters,
  isSuperAdmin,
}: {
  events: EventRow[];
  allCountries?: ScopeFilterCountry[];
  allChapters?: ScopeFilterChapter[];
  isSuperAdmin?: boolean;
}) {
  // V7: scope filter (Super Admin only)
  const [scopeFilter, setScopeFilter] = useState<{ countryId: string; chapterId: string }>({
    countryId: "",
    chapterId: "",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkScopeOpen, setBulkScopeOpen] = useState(false);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (scopeFilter.chapterId) {
        if ((e.chapterRef?.id ?? null) !== scopeFilter.chapterId) return false;
      } else if (scopeFilter.countryId) {
        const country = allCountries?.find((c) => c.id === scopeFilter.countryId);
        if (country && e.chapterRef?.country?.code !== country.code) return false;
      }
      return true;
    });
  }, [events, scopeFilter, allCountries]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(filtered.map((e) => e.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  if (events.length === 0) {
    return (
      <Card className="p-12 text-center bg-white border border-black/10">
        <p className="text-sm text-black/80 mb-4">No events created yet.</p>
        <Link
          href="/admin/events/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] hover:bg-[#D8004D] text-white px-4 py-2 text-sm font-semibold transition-colors"
        >
          Create your first event
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* V7 scope filter (Super Admin only) */}
      {isSuperAdmin && allCountries && allChapters && allCountries.length > 0 && (
        <CountryChapterScopeFilter
          countries={allCountries}
          chapters={allChapters}
          value={scopeFilter}
          onChange={setScopeFilter}
        />
      )}

      {/* Bulk-action bar (Super Admin only) */}
      {isSuperAdmin && (
        <div className="flex flex-wrap items-center gap-2 text-xs bg-[#820A7D]/5 border border-[#820A7D]/20 rounded-md px-3 py-1.5">
          {selected.size > 0 ? (
            <>
              <span className="font-semibold text-[#820A7D]">{selected.size} selected</span>
              <Button size="sm" variant="ghost" className="h-6 text-[0.65rem]" onClick={selectAllVisible}>
                Select all {filtered.length} visible
              </Button>
              <BulkAssignScopeDialog
                entityType="events"
                selectedIds={Array.from(selected)}
                onClear={clearSelection}
                open={bulkScopeOpen}
                onOpenChange={setBulkScopeOpen}
              />
              <Button size="sm" variant="ghost" className="h-6 text-[0.65rem] ml-auto" onClick={clearSelection}>
                Clear
              </Button>
            </>
          ) : (
            <span className="text-black/60">
              Tip: tick the checkbox on each event to enable bulk-assign scope.
            </span>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center bg-white border border-black/10">
          <p className="text-sm text-black/80">No events match your filter.</p>
        </Card>
      ) : (
        <>
          <div className="text-xs text-black/60 px-1">
            Showing <strong>{filtered.length}</strong> of {events.length} events
          </div>
          {filtered.map((e) => {
            const start = new Date(e.startsAt);
            const coHostSummary =
              e.coHosts.length === 0
                ? null
                : e.coHosts
                    .slice(0, 3)
                    .map((c) => c.userName)
                    .join(", ") + (e.coHosts.length > 3 ? ` +${e.coHosts.length - 3}` : "");
            const isSelected = selected.has(e.id);

            return (
              <Card
                key={e.id}
                className={`p-4 border bg-white flex flex-wrap items-center gap-4 ais-lift ${isSelected ? "border-[#820A7D] bg-[#820A7D]/5" : "border-black/10"}`}
              >
                {isSuperAdmin && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(e.id)}
                    className="h-4 w-4 accent-[#820A7D]"
                  />
                )}

                {/* Thumbnail or date block */}
                <div className="flex-shrink-0">
                  {e.mainImage ? (
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-black/10 bg-black/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={e.mainImage.fileUrl}
                        alt={e.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-black/10 bg-white text-center flex flex-col items-center justify-center">
                      <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#FF005A]">
                        {monthFmt.format(start).toUpperCase()}
                      </div>
                      <div className="text-xl font-extrabold text-black leading-none">
                        {dayFmt.format(start)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-[200px]">
                  <div className="font-bold text-black text-sm">
                {e.title}
              </div>
              {e.subtitle && (
                <div className="text-xs text-black/50 mt-0.5 line-clamp-1">{e.subtitle}</div>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-black/50">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fullDateFmt.format(start)} · {timeFmt.format(start)}
                </span>
                {e.venue && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {e.venue}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[0.7rem] text-black/80">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {e._count.speakers} speakers
                </span>
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  {e._count.images} images
                </span>
                <span className="inline-flex items-center gap-1">
                  <Ticket className="h-3 w-3" />
                  {e._count.rsvps} RSVPs · {e._count.checkedIn} checked in
                </span>
                {coHostSummary && (
                  <span className="inline-flex items-center gap-1">
                    <UserCircle className="h-3 w-3" />
                    {coHostSummary}
                  </span>
                )}
              </div>
            </div>

            {/* Chapter badge */}
            <Badge variant="outline" className="hidden sm:inline-flex text-[0.6rem] uppercase tracking-wider">
              {e.chapter} · {e.country}
            </Badge>

            {/* Actions */}
            <div className="flex items-center gap-1.5 ml-auto">
              <Link href={`/admin/events/${e.id}`}>
                <Button size="sm" variant="default" className="gap-1.5 bg-[#FF005A] hover:bg-[#D8004D] text-white">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </Link>
              <Link href={`/events/${e.slug}`} target="_blank">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  View
                </Button>
              </Link>
            </div>
          </Card>
        );
      })}
        </>
      )}
    </div>
  );
}
