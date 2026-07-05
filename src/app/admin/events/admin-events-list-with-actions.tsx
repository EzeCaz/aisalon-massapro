"use client";

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

type EventRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  chapter: string;
  venue: string | null;
  country: string | null;
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
}: {
  events: EventRow[];
}) {
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
      {events.map((e) => {
        const start = new Date(e.startsAt);
        const coHostSummary =
          e.coHosts.length === 0
            ? null
            : e.coHosts
                .slice(0, 3)
                .map((c) => c.userName)
                .join(", ") + (e.coHosts.length > 3 ? ` +${e.coHosts.length - 3}` : "");

        return (
          <Card
            key={e.id}
            className="p-4 border border-black/10 bg-white flex flex-wrap items-center gap-4 ais-lift"
          >
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
    </div>
  );
}
