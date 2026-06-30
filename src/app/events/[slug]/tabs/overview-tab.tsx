"use client";

import { Card } from "@/components/ui/card";
import { Check, MapPin, Calendar, Clock, Users, Target, Gift } from "lucide-react";
import { RsvpCheckInCard, type Rsvp } from "@/components/events/rsvp-check-in-card";
import { SaveToCalendar } from "@/components/events/save-to-calendar";

type EventData = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  chapter: string;
  venue: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  mapUrl: string | null;
  wazeUrl: string | null;
  startsAt: string;
  endsAt: string;
  description: string | null;
  takeaways: string | null;
  intendedFor: string | null;
  rsvpUrl: string | null;
  speakers: { id: string; name: string }[];
  agenda: { id: string; type: string }[];
};

export function OverviewTab({
  event,
  initialRsvp = null,
}: {
  event: EventData;
  initialRsvp?: Rsvp;
}) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const takeaways = event.takeaways
    ? event.takeaways.split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean)
    : [];

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-8">
      <div className="space-y-8">
        {/* About */}
        {event.description && (
          <Card className="p-6 bg-white border border-black/10">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#FF005A] mb-3">
              About this event
            </h2>
            <div className="prose prose-sm max-w-none text-black/80 whitespace-pre-line leading-relaxed">
              {event.description}
            </div>
          </Card>
        )}

        {/* Takeaways */}
        {takeaways.length > 0 && (
          <Card className="p-6 bg-white border border-black/10">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#007E72] mb-4">
              <Gift className="h-4 w-4" /> What you&apos;ll take home
            </h2>
            <ul className="space-y-2">
              {takeaways.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-black/80">
                  <Check className="h-4 w-4 mt-0.5 text-[#007E72] flex-shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Intended for */}
        {event.intendedFor && (
          <Card className="p-6 bg-white border border-black/10">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#004F98] mb-3">
              <Target className="h-4 w-4" /> Who this is for
            </h2>
            <p className="text-sm text-black/80 leading-relaxed whitespace-pre-line">
              {event.intendedFor}
            </p>
          </Card>
        )}
      </div>

      {/* Sidebar */}
      <aside className="space-y-4">
        {/* Registration + day-of check-in widget.
            Renders one of four states: register / registered / check-in
            available / checked-in with code. The unique check-in code
            is generated server-side, globally unique, and tracked
            across all events for door-staff verification. */}
        <RsvpCheckInCard
          eventSlug={event.slug}
          eventTitle={event.title}
          eventStartsAt={event.startsAt}
          eventEndsAt={event.endsAt}
          initialRsvp={initialRsvp}
          eventDescription={event.description}
          eventVenue={event.venue}
          eventAddress={event.address}
          eventCity={event.city}
          eventCountry={event.country}
        />

        {/* Save to Calendar — always visible so the user can add the event
            to their preferred calendar service at any time. */}
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
            url: typeof window !== "undefined" ? window.location.href : null,
          }}
          variant="outline"
          size="md"
          className="w-full justify-center"
        />

        <Card className="p-5 bg-white border border-black/10">
          <h3 className="text-xs font-bold uppercase tracking-widest text-black/40 mb-4">
            Event details
          </h3>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-black/40 flex-shrink-0" />
              <div>
                <dt className="text-black/40 text-xs">Date</dt>
                <dd className="font-semibold text-black">{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "long", month: "short", day: "numeric" }).format(start)}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 text-black/40 flex-shrink-0" />
              <div>
                <dt className="text-black/40 text-xs">Time</dt>
                <dd className="font-semibold text-black font-mono">
                  {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(start)} – {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(end)}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-black/40 flex-shrink-0" />
              <div>
                <dt className="text-black/40 text-xs">Venue</dt>
                <dd className="font-semibold text-black">{event.venue}</dd>
                {event.address && <dd className="text-black/60 text-xs">{event.address}</dd>}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="h-4 w-4 mt-0.5 text-black/40 flex-shrink-0" />
              <div>
                <dt className="text-black/40 text-xs">Speakers</dt>
                <dd className="font-semibold text-black">
                  {event.speakers.filter((s) => s.name !== "Ezequiel Sznaider").length} featured
                </dd>
              </div>
            </div>
          </dl>

          {event.mapUrl && (
            <a
              href={event.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block w-full rounded-md bg-black text-white text-sm font-semibold py-2.5 text-center hover:bg-black/90"
            >
              Open in Maps
            </a>
          )}
          {event.wazeUrl && (
            <a
              href={event.wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block w-full rounded-md bg-[#33CCFF] text-black text-sm font-semibold py-2.5 text-center hover:bg-[#33CCFF]/90"
            >
              Open in Waze
            </a>
          )}
          {event.rsvpUrl && (
            <a
              href={event.rsvpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block w-full rounded-md border border-black/15 text-black/60 text-xs font-semibold py-2 text-center hover:bg-black/[0.03]"
            >
              External RSVP form ↗
            </a>
          )}
        </Card>

        <Card className="p-5 bg-[#00E6FF]/5 border border-[#00E6FF]/30">
          <p className="text-xs text-black/60 leading-relaxed">
            <strong className="text-black">Members only.</strong> Photos and recordings from this
            event are shared exclusively with registered AI Salon Tel Aviv community members.
            Use the <strong>Photos</strong> tab to upload your shots, and the{" "}
            <strong>Slideshow</strong> tab to play the community slideshow.
          </p>
        </Card>
      </aside>
    </div>
  );
}
