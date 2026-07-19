"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Image as ImageIcon, Users, ArrowRight, Calendar } from "lucide-react";

type EventRow = {
  id: string;
  slug: string;
  title: string;
  chapter: string;
  venue: string | null;
  country: string | null;
  city: string | null;
  isCrossChapter?: boolean;
  chapterRef?: {
    id: string;
    name: string;
    slug: string;
    country: { name: string; code: string; flagEmoji: string | null };
  } | null;
  startsAt: string;
  endsAt: string;
  _count: { images: number; speakers: number };
};

export function AdminEventsList({ events }: { events: EventRow[] }) {
  if (events.length === 0) {
    return (
      <Card className="p-8 text-center bg-white border border-black/10">
        <p className="text-sm text-black/80">No events created yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((e) => {
        const start = new Date(e.startsAt);
        return (
          <Link
            key={e.id}
            href={`/events/${e.slug}`}
            className="block group"
          >
            <Card className="p-4 border border-black/10 bg-white flex items-center gap-4 ais-lift">
              <div className="flex-shrink-0 w-14 text-center">
                <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#FF005A]">
                  {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", month: "short" }).format(start).toUpperCase()}
                </div>
                <div className="text-2xl font-extrabold text-black leading-none">
                  {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", day: "2-digit" }).format(start)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-black text-sm group-hover:text-[#FF005A] transition-colors line-clamp-1">
                  {e.title}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-black/50">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short", month: "short", day: "numeric" }).format(start)} · {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(start)}
                  </span>
                  {e.venue && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {e.venue}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {e._count.speakers}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    {e._count.images}
                  </span>
                </div>
              </div>
              <Badge variant="outline" className="hidden sm:inline-flex text-[0.6rem] uppercase tracking-wider items-center gap-1">
                {e.chapterRef?.country?.flagEmoji && <span>{e.chapterRef.country.flagEmoji}</span>}
                {e.chapterRef ? e.chapterRef.name : e.chapter}
                {e.isCrossChapter && (
                  <span className="ml-1 rounded bg-[#FF005A]/10 px-1 py-0.5 text-[0.55rem] font-bold text-[#FF005A]">CROSS</span>
                )}
              </Badge>
              <ArrowRight className="h-4 w-4 text-black/30 group-hover:text-black/80 transition-colors flex-shrink-0" />
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
