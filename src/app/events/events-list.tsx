"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Image as ImageIcon, Users, ArrowRight, Filter, X } from "lucide-react";

type EventCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  chapter: string;
  venue: string | null;
  city: string | null;
  country: string | null;
  chapterId: string | null;
  startsAt: string;
  endsAt: string;
  _count: { images: number; speakers: number };
  // The admin-picked main image — used as the event's profile picture /
  // banner at the top of the card. null when none has been set.
  mainImage: { id: string; fileUrl: string; caption: string | null } | null;
};

type ChapterOption = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: { name: string; code: string; flagEmoji: string | null };
};

type CityOption = { name: string; chapterId: string };

function monthCode(d: Date) {
  return format(d, "MMM").toUpperCase();
}
function dayNum(d: Date) {
  return format(d, "dd");
}

// Format a time in *Israel* timezone (Asia/Jerusalem), regardless of server TZ.
// The brand book says events are at Google for Startups Campus TLV — always
// Tel Aviv time. We use Intl with timeZone option to avoid pulling in a tz db.
function timeInTLV(d: Date): string {
  // Returns "HH:mm" in Asia/Jerusalem
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value || "00";
  const m = parts.find((p) => p.type === "minute")?.value || "00";
  return `${h}:${m}`;
}

// Format a date (no time) in Israel timezone.
function dateInTLV(d: Date, fmt: "weekday" | "shortDate" | "longDate" | "monthDay" | "year"): string {
  const opts: Intl.DateTimeFormatOptions =
    fmt === "weekday"
      ? { timeZone: "Asia/Jerusalem", weekday: "short" }
      : fmt === "shortDate"
        ? { timeZone: "Asia/Jerusalem", month: "short", day: "2-digit" }
        : fmt === "longDate"
          ? { timeZone: "Asia/Jerusalem", weekday: "long", month: "short", day: "numeric" }
          : fmt === "year"
            ? { timeZone: "Asia/Jerusalem", year: "numeric" }
            : { timeZone: "Asia/Jerusalem", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", opts).format(d);
}

export function EventsList({
  events,
  goingCounts,
  chapters,
  cities,
}: {
  events: EventCard[];
  // Map of eventId → number of RSVPs with status="GOING". Lookup is
  // safe via `?? 0` for events with no RSVPs yet.
  goingCounts?: Map<string, number>;
  /** Active chapters for the filter dropdown. */
  chapters?: ChapterOption[];
  /** Unique venue cities derived from the events list. */
  cities?: CityOption[];
}) {
  // Chapter + city filter state. Both default to "" (all).
  const [chapterFilter, setChapterFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");

  // Cities contextual to the selected chapter (or all cities when no
  // chapter is selected). De-duplicated by name.
  const filteredCities = useMemo(() => {
    if (!cities || cities.length === 0) return [];
    const list = chapterFilter
      ? cities.filter((c) => c.chapterId === chapterFilter)
      : cities;
    const seen = new Set<string>();
    return list.filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });
  }, [cities, chapterFilter]);

  // Apply both filters to the events list.
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (chapterFilter && e.chapterId !== chapterFilter) return false;
      if (cityFilter && (e.city ?? "") !== cityFilter) return false;
      return true;
    });
  }, [events, chapterFilter, cityFilter]);

  const isFilterActive = !!chapterFilter || !!cityFilter;
  function clearFilters() {
    setChapterFilter("");
    setCityFilter("");
  }

  function onChapterChange(id: string) {
    // If the selected city doesn't belong to the new chapter, clear it.
    if (cityFilter && id) {
      const stillValid = cities?.some((c) => c.name === cityFilter && c.chapterId === id);
      if (!stillValid) setCityFilter("");
    }
    setChapterFilter(id);
  }

  // Show the filter bar only when there are chapters/cities to filter by.
  const showFilter = (chapters && chapters.length > 1) || (cities && cities.length > 0);

  if (events.length === 0) {
    return (
      <Card className="p-12 text-center bg-white border border-black/10">
        <p className="text-black/80">
          No events yet. Check back soon — the next AI Salon Tel Aviv gathering is being planned.
        </p>
      </Card>
    );
  }

  const now = new Date();
  const upcoming = filteredEvents.filter((e) => new Date(e.endsAt) >= now);
  const past = filteredEvents.filter((e) => new Date(e.endsAt) < now);

  return (
    <div className="space-y-8">
      {/* Chapter + city filter — only shown when there are multiple chapters
          or any cities to filter by. Hidden for single-chapter platforms with
          no city data (keeps the UI clean for the common case). */}
      {showFilter && (
        <div className="rounded-lg border border-black/10 bg-white p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-[#FF005A]">
              <Filter className="h-3 w-3" />
              Filter by chapter &amp; city
            </div>
            {isFilterActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[0.65rem] font-bold uppercase tracking-wider text-[#FF005A] hover:text-[#FF005A]/80 flex items-center gap-0.5"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Chapter dropdown */}
            {chapters && chapters.length > 0 && (
              <div>
                <label className="block text-[0.65rem] font-bold uppercase tracking-wide text-black/60 mb-1">
                  Chapter
                </label>
                <select
                  value={chapterFilter}
                  onChange={(e) => onChapterChange(e.target.value)}
                  className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                >
                  <option value="">📍 All chapters</option>
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.country.flagEmoji ?? ""} {c.name}
                      {c.city ? ` — ${c.city}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* City dropdown */}
            {cities && cities.length > 0 && (
              <div>
                <label className="block text-[0.65rem] font-bold uppercase tracking-wide text-black/60 mb-1">
                  City
                </label>
                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                >
                  <option value="">🏙️ All cities</option>
                  {filteredCities.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {/* Active filter summary + result count */}
          {isFilterActive && (
            <div className="mt-2 text-[0.7rem] text-black/60">
              Showing <strong>{filteredEvents.length}</strong> of {events.length} events
              {chapterFilter && chapters && (
                <>
                  {" "}· chapter: <strong>{chapters.find((c) => c.id === chapterFilter)?.name ?? "?"}</strong>
                </>
              )}
              {cityFilter && (
                <>
                  {" "}· city: <strong>{cityFilter}</strong>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {filteredEvents.length === 0 ? (
        <Card className="p-12 text-center bg-white border border-black/10">
          <p className="text-black/80 mb-4">No events match your filter.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] hover:bg-[#D8004D] text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            Clear filter
          </button>
        </Card>
      ) : (
        <div className="space-y-12">
          {upcoming.length > 0 && (
            <Section title="Upcoming" count={upcoming.length}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((e) => (
                  <EventCardItem
                    key={e.id}
                    e={e}
                    isPast={false}
                    goingCount={goingCounts?.get(e.id) ?? 0}
                  />
                ))}
              </div>
            </Section>
          )}
          {past.length > 0 && (
            <Section title="Past events" count={past.length}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {past.map((e) => (
                  <EventCardItem
                    key={e.id}
                    e={e}
                    isPast
                    goingCount={goingCounts?.get(e.id) ?? 0}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold text-black uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-black/80">{count} event{count === 1 ? "" : "s"}</span>
      </div>
      {children}
    </section>
  );
}

function EventCardItem({
  e,
  isPast,
  goingCount = 0,
}: {
  e: EventCard;
  isPast: boolean;
  goingCount?: number;
}) {
  const start = new Date(e.startsAt);
  const end = new Date(e.endsAt);
  const hasMainImage = !!e.mainImage?.fileUrl;
  return (
    <Link href={`/events/${e.slug}`} className="block group">
      <Card
        className={`overflow-hidden border border-black/10 bg-white ais-lift relative ${
          isPast ? "opacity-80" : ""
        }`}
      >
        {/* AIS GRADIENT top strip — brand anchor (only when there's no
            main image; when a main image is present it replaces this
            strip as the card's visual header) */}
        {!hasMainImage && <div className="h-1.5 w-full ais-gradient" />}

        {/* Main image banner — sized to the card width with a fixed
            16:9 aspect ratio so all cards line up regardless of the
            source image's native dimensions. object-cover crops to fill. */}
        {hasMainImage && (
          <div className="relative w-full aspect-[16/9] overflow-hidden bg-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={e.mainImage!.fileUrl}
              alt={e.mainImage!.caption || e.title}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            {/* Gradient overlay at the bottom so the chapter badge is
                legible against any photo. */}
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />
            {/* Chapter pill — sits over the image bottom-left */}
            <span className="absolute bottom-2 left-2 inline-flex items-center rounded-full bg-[#FF005A] text-white px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider shadow-sm">
              {e.chapter}
            </span>
            {/* Date chip — sits over the image top-left, replaces the
                old date block when an image is present. */}
            <div className="absolute top-2 left-2 rounded-md border border-white/40 bg-white/85 backdrop-blur px-2 py-1 text-center shadow-sm">
              <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#FF005A] leading-none">
                {monthCode(start)}
              </div>
              <div className="text-base font-extrabold text-black leading-none mt-0.5">
                {dayNum(start)}
              </div>
            </div>
          </div>
        )}

        <div className="p-5">
          <div className="flex items-start gap-4">
            {/* Date block — only shown when there's no main image
                (otherwise the date is overlaid on the image). */}
            {!hasMainImage && (
              <div className="flex-shrink-0 w-16 text-center">
                <div className="rounded-md border border-black/15 bg-white py-1.5 px-2">
                  <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#FF005A]">
                    {monthCode(start)}
                  </div>
                  <div className="text-2xl font-extrabold text-black leading-none">
                    {dayNum(start)}
                  </div>
                  <div className="text-[0.55rem] font-semibold uppercase tracking-wider text-black/80 mt-0.5">
                    {dateInTLV(start, "weekday")}
                  </div>
                </div>
              </div>
            )}

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-black text-base leading-snug line-clamp-2 group-hover:text-[#FF005A] transition-colors">
                {e.title}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-black/80">
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono">{timeInTLV(start)}</span>
                  <span className="text-black/30">–</span>
                  <span className="font-mono">{timeInTLV(end)}</span>
                </span>
                {e.venue && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {e.venue}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Footer stats */}
          <div className="mt-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3 text-black/50">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {e._count.speakers} speaker{e._count.speakers === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                {e._count.images} photo{e._count.images === 1 ? "" : "s"}
              </span>
            </div>
            <Badge
              variant="outline"
              className={`text-[0.6rem] uppercase tracking-wider font-semibold ${
                isPast
                  ? "border-black/20 text-black/80"
                  : "border-[#00E6FF] text-[#007E72] bg-[#00E6FF]/10"
              }`}
            >
              {hasMainImage ? (e.country || "") : `${e.chapter} · ${e.country || ""}`}
            </Badge>
          </div>

          {/* CTA + Going count row.
              The Going count is rendered as a black pill that visually
              matches the size + format of the date block (top-left),
              per the user's spec: "in its own box at the bottom right
              and the format and size of the date". */}
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="inline-flex items-center gap-1 text-xs font-semibold text-black group-hover:text-[#FF005A] transition-colors">
              {isPast ? "View recap & photos" : "View event & RSVP"}
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </div>
            {/* Going pill — black bg, white text. Same compact sizing
                as the date block: tiny uppercase label + big number. */}
            <div
              className="flex-shrink-0 rounded-md border border-black/15 bg-black text-white py-1.5 px-2 text-center min-w-[3rem]"
              title={`${goingCount} going to this event`}
            >
              <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#FF005A] leading-none">
                Going
              </div>
              <div className="text-2xl font-extrabold text-white leading-none mt-0.5">
                {goingCount}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
