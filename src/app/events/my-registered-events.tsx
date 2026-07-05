"use client";

import Link from "next/link";
import { Calendar, Clock, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SaveToCalendar } from "@/components/events/save-to-calendar";

type MyRsvp = {
  id: string;
  status: string;
  event: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    venue: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    startsAt: string;
    endsAt: string;
  };
};

type Props = { rsvps: MyRsvp[] };

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * MyRegisteredEvents — compact list of the user's upcoming RSVPs with
 * Save-to-Calendar buttons. Shown at the top of /events for signed-in
 * users who have at least one "GOING" RSVP.
 */
export function MyRegisteredEvents({ rsvps }: Props) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-5 w-5 text-[#FF005A]" />
        <h2 className="text-lg font-bold text-black">Your registered events</h2>
        <span className="ml-1 rounded-full bg-[#FF005A]/10 text-[#FF005A] text-xs font-bold px-2 py-0.5">
          {rsvps.length}
        </span>
      </div>

      <div className="space-y-2">
        {rsvps.map(({ event }) => (
          <Card
            key={event.id}
            className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 border-[#00E6FF]/30 bg-gradient-to-r from-[#00E6FF]/5 to-white"
          >
            {/* Date + time block */}
            <div className="flex items-center gap-3 sm:flex-shrink-0">
              <div className="w-14 text-center rounded-lg overflow-hidden border border-black/10 bg-white">
                <div className="ais-gradient h-1" />
                <div className="py-1">
                  <div className="text-[0.6rem] font-bold uppercase text-black/50">
                    {fmtDate(event.startsAt).split(" ")[0]}
                  </div>
                  <div className="text-base font-bold leading-none">
                    {fmtDate(event.startsAt).split(" ")[2]}
                  </div>
                </div>
              </div>
              <div className="text-xs text-black/80">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono">
                    {fmtTime(event.startsAt)}
                  </span>
                </div>
                {event.venue && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">{event.venue}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Title + link */}
            <div className="flex-1 min-w-0">
              <Link
                href={`/events/${event.slug}`}
                className="font-bold text-black hover:text-[#FF005A] transition-colors text-sm sm:text-base"
              >
                {event.title}
              </Link>
              {event.description && (
                <p className="text-xs text-black/50 line-clamp-1 mt-0.5">
                  {event.description.replace(/[#*`]/g, "").slice(0, 120)}
                </p>
              )}
            </div>

            {/* Save to Calendar */}
            <SaveToCalendar
              event={{
                title: event.title,
                description: event.description,
                startsAt: event.startsAt,
                endsAt: event.endsAt,
                venue: event.venue,
                address: event.address,
                city: event.city,
                country: event.country,
                url:
                  typeof window !== "undefined"
                    ? `${window.location.origin}/events/${event.slug}`
                    : null,
              }}
              variant="outline"
              size="sm"
            />
          </Card>
        ))}
      </div>
    </section>
  );
}
