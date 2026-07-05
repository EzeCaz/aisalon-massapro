"use client";

import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  Clock,
  Mic2,
  Users,
  FileText,
  Image as ImageIcon,
  ArrowRight,
  CalendarCheck,
} from "lucide-react";

/**
 * EventPrepListClient — read-only list of events the current user can
 * prep for. Each card links to /admin/event-prep/[id] for the full
 * read-only detail view (agenda, speakers, event info).
 *
 * For SPEAKER users, we additionally show "You're speaking at this
 * event" with their speaker role/topic.
 */

type EventItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  chapter: string;
  venue: string | null;
  city: string | null;
  startsAt: string;
  endsAt: string;
  description: string | null;
  takeaways: string | null;
  intendedFor: string | null;
  _count: {
    speakers: number;
    agenda: number;
    images: number;
    presentations: number;
    rsvps: number;
  };
};

type MySpeakerRow = {
  eventId: string;
  name: string;
  role: string | null;
  company: string | null;
  topic: string | null;
  order: number;
};

type Props = {
  events: EventItem[];
  mySpeakerRows: MySpeakerRow[];
  userRole: string;
};

export function EventPrepListClient({ events, mySpeakerRows, userRole }: Props) {
  // Build a quick lookup of "my speaker row per event" for SPEAKER users
  const mySpeakerByEventId = new Map<string, MySpeakerRow>();
  for (const r of mySpeakerRows) {
    mySpeakerByEventId.set(r.eventId, r);
  }

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-black/10 bg-black/[0.02] p-12 text-center">
        <CalendarCheck className="h-12 w-12 text-black/20 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-black/70 mb-2">
          No events assigned yet
        </h3>
        <p className="text-sm text-black/50 max-w-md mx-auto">
          {userRole === "SPEAKER"
            ? "You aren't currently linked as a speaker for any event. Once an organizer adds you to an event's speaker roster (using your platform email), the event will appear here."
            : userRole === "CO_HOST"
              ? "You aren't currently a co-host for any event. Ask an admin to add you as a co-host to an event — it will then show up here with full event-scoped access."
              : "There are no events on the platform yet. Create one from the Events tab."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {events.map((event) => {
        const mySpeaker = mySpeakerByEventId.get(event.id);
        const startDate = new Date(event.startsAt);
        const dateStr = startDate.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const timeStr = startDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <Link
            key={event.id}
            href={`/admin/event-prep/${event.id}`}
            className="group rounded-2xl border border-black/10 bg-white hover:border-[#FF005A]/40 hover:shadow-lg hover:shadow-[#FF005A]/5 transition-all p-5 flex flex-col gap-4"
          >
            {/* Date pill */}
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FF005A]/10 text-[#FF005A] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wider">
                <CalendarDays className="h-3 w-3" />
                {dateStr}
              </div>
              <span className="text-[0.7rem] font-semibold text-black/80 uppercase tracking-wider">
                {event.chapter}
              </span>
            </div>

            {/* Title */}
            <div>
              <h3 className="text-lg font-bold text-black group-hover:text-[#FF005A] transition-colors line-clamp-2">
                {event.title}
              </h3>
              {event.subtitle && (
                <p className="mt-1 text-sm text-black/80 line-clamp-2">
                  {event.subtitle}
                </p>
              )}
            </div>

            {/* Time + venue */}
            <div className="space-y-1.5 text-xs text-black/80">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-black/80" />
                <span>{timeStr}</span>
              </div>
              {event.venue && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-black/80" />
                  <span className="line-clamp-1">
                    {event.venue}
                    {event.city ? ` · ${event.city}` : ""}
                  </span>
                </div>
              )}
            </div>

            {/* "You're speaking at this event" — SPEAKER only */}
            {mySpeaker && (
              <div className="rounded-lg bg-[#FFB300]/10 border border-[#FFB300]/30 p-2.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#8a5a00] flex items-center gap-1">
                  <Mic2 className="h-3 w-3" />
                  You&apos;re speaking
                </p>
                <p className="mt-0.5 text-xs text-black/70">
                  {mySpeaker.role ? `${mySpeaker.role}` : ""}
                  {mySpeaker.company ? ` · ${mySpeaker.company}` : ""}
                </p>
                {mySpeaker.topic && (
                  <p className="mt-0.5 text-xs font-medium text-black/80 italic">
                    &ldquo;{mySpeaker.topic}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-black/5">
              <Stat
                icon={<Mic2 className="h-3 w-3" />}
                value={event._count.speakers}
                label="Speakers"
              />
              <Stat
                icon={<CalendarDays className="h-3 w-3" />}
                value={event._count.agenda}
                label="Agenda"
              />
              <Stat
                icon={<Users className="h-3 w-3" />}
                value={event._count.rsvps}
                label="RSVPs"
              />
              <Stat
                icon={<FileText className="h-3 w-3" />}
                value={event._count.presentations}
                label="Slides"
              />
            </div>

            {/* CTA */}
            <div className="mt-auto flex items-center justify-end text-xs font-semibold text-[#FF005A] group-hover:gap-2 transition-all">
              View prep details
              <ArrowRight className="h-3.5 w-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-0.5 text-black/50">{icon}</div>
      <span className="text-sm font-bold text-black/80 leading-tight">{value}</span>
      <span className="text-[0.6rem] uppercase tracking-wider text-black/80">{label}</span>
    </div>
  );
}

// Unused import suppression — ImageIcon kept for future use (event
// image count display).
void ImageIcon;
