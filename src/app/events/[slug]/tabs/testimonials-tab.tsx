"use client";

import { TestimonialFeed } from "@/components/testimonials/testimonial-feed";
import { AttachmentOption } from "@/components/testimonials/testimonial-form";

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  topic: string | null;
};

type AgendaItem = {
  id: string;
  startsAt: string;
  title: string;
  type: string;
  speaker: Speaker | null;
};

type Props = {
  event: {
    id: string;
    slug: string;
    title: string;
    venue?: string | null;
    mainImage?: { id: string; fileUrl: string; caption: string | null } | null;
    speakers: Speaker[];
    agenda: AgendaItem[];
  };
  me: { id: string; email: string; name: string | null; role: string };
  isAdmin: boolean;
};

/**
 * EventTestimonialsTab — embeds the TestimonialFeed scoped to this event.
 * Passes the event's speakers + agenda items so the create-form's
 * "A speaker" / "A session" pickers are populated.
 *
 * Also passes `eventContext` (title + venue + mainImage) through to the
 * feed → card so that the share button on each testimonial uses the
 * curated event-branded message + the event's profile picture.
 */
export function TestimonialsTab({ event, me, isAdmin }: Props) {
  // Build the speaker picker options — show name + company for context.
  const speakerOptions: AttachmentOption[] = event.speakers.map((s) => ({
    id: s.id,
    label: `${s.name}${s.company ? ` · ${s.company}` : ""}${s.topic ? ` — ${s.topic}` : ""}`,
  }));

  // Build the agenda picker options — show time + title.
  const agendaOptions: AttachmentOption[] = event.agenda.map((a) => {
    const time = new Date(a.startsAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return {
      id: a.id,
      label: `${time} · ${a.title}`,
    };
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/10 bg-[#FF005A]/5 p-4">
        <h3 className="text-sm font-bold text-black">
          Testimonials for {event.title}
        </h3>
        <p className="text-xs text-black/80 mt-1">
          Share what you took away from this event — a speaker&apos;s talk, a
          specific session, or the event as a whole. Photos welcome.
        </p>
      </div>
      <TestimonialFeed
        meId={me.id}
        isAdmin={isAdmin}
        eventId={event.id}
        eventSlug={event.slug}
        speakers={speakerOptions}
        agendaItems={agendaOptions}
        defaultSort="recent"
        compactForm
        // Pass the event context for the share-button branding
        // (curated message + event profile picture).
        eventContext={{
          title: event.title,
          venue: event.venue ?? null,
          mainImageUrl: event.mainImage?.fileUrl ?? null,
        }}
      />
    </div>
  );
}
