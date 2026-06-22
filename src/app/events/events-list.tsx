"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Image as ImageIcon, Users, ArrowRight } from "lucide-react";

type EventCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  chapter: string;
  venue: string | null;
  city: string | null;
  country: string | null;
  startsAt: string;
  endsAt: string;
  _count: { images: number; speakers: number };
  // The admin-picked main image — used as the event's profile picture /
  // banner at the top of the card. null when none has been set.
  mainImage: { id: string; fileUrl: string; caption: string | null } | null;
};

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

export function EventsList({ events }: { events: EventCard[] }) {
  if (events.length === 0) {
    return (
      <Card className="p-12 text-center bg-white border border-black/10">
        <p className="text-black/60">
          No events yet. Check back soon — the next AI Salon Tel Aviv gathering is being planned.
        </p>
      </Card>
    );
  }

  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.endsAt) >= now);
  const past = events.filter((e) => new Date(e.endsAt) < now);

  return (
    <div className="space-y-12">
      {upcoming.length > 0 && (
        <Section title="Upcoming" count={upcoming.length}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((e) => (
              <EventCardItem key={e.id} e={e} isPast={false} />
            ))}
          </div>
        </Section>
      )}
      {past.length > 0 && (
        <Section title="Past events" count={past.length}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((e) => (
              <EventCardItem key={e.id} e={e} isPast />
            ))}
          </div>
        </Section>
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
        <span className="text-xs text-black/40">{count} event{count === 1 ? "" : "s"}</span>
      </div>
      {children}
    </section>
  );
}

function EventCardItem({ e, isPast }: { e: EventCard; isPast: boolean }) {
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
                  <div className="text-[0.55rem] font-semibold uppercase tracking-wider text-black/40 mt-0.5">
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
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-black/60">
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
                  ? "border-black/20 text-black/40"
                  : "border-[#00E6FF] text-[#007E72] bg-[#00E6FF]/10"
              }`}
            >
              {hasMainImage ? (e.country || "") : `${e.chapter} · ${e.country || ""}`}
            </Badge>
          </div>

          {/* CTA */}
          <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-black group-hover:text-[#FF005A] transition-colors">
            {isPast ? "View recap & photos" : "View event & RSVP"}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
