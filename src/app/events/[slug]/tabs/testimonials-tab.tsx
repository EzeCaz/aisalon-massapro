"use client";

import { useState } from "react";
import { TestimonialFeed } from "@/components/testimonials/testimonial-feed";
import { AttachmentOption } from "@/components/testimonials/testimonial-form";
import { Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
    /** Optional venue name — used as the "{venue name}" placeholder in
     *  the share-to-social template message. */
    venue?: string | null;
    /** Optional main event image — used as the share image when the
     *  user clicks "Share to social". */
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
 * The form defaults to "This event" scope (the "Community" chip is
 * hidden entirely in event-tab mode — see testimonial-form.tsx).
 *
 * A "Share to social" button at the top lets the user share the event
 * to social platforms using the Web Share API. The shared message is:
 *   "I had an amazing time on this great AI Salon event about
 *    {event title}, at {venue}, join the community."
 * and the share image is the event's mainImage (when set).
 */
export function TestimonialsTab({ event, me, isAdmin }: Props) {
  const [sharing, setSharing] = useState(false);

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

  // The public event landing URL — used as the share URL so recipients
  // land on the public-facing event page (no auth wall).
  const publicEventUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/e/${event.slug}`
      : `/e/${event.slug}`;

  // Template message per spec:
  //   "I had an amazing time on this great AI Salon event about
  //    {event name}, at {venue name}, join the community."
  // Fall back to "the venue" when no venue is set so the sentence
  // still reads naturally.
  const shareText = `I had an amazing time on this great AI Salon event about ${event.title}, at ${event.venue || "the venue"}, join the community. ${publicEventUrl}`;

  const mainImageUrl = event.mainImage?.fileUrl || null;

  async function handleShare() {
    setSharing(true);
    try {
      // Try the Web Share API with the event's main image attached.
      // Supported on most mobile browsers + recent desktop Chrome/Edge.
      if (mainImageUrl && navigator.canShare) {
        try {
          // Fetch the image and turn it into a File so we can pass it
          // via navigator.share({ files }). This is the only way to
          // pre-populate the image that gets posted alongside the text
          // on platforms like WhatsApp / iMessage / X.
          const res = await fetch(mainImageUrl);
          const blob = await res.blob();
          const file = new File([blob], "ai-salon-event.jpg", {
            type: blob.type || "image/jpeg",
          });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: "AI Salon",
              text: shareText,
              files: [file],
            });
            return;
          }
        } catch {
          // If the fetch fails (CORS, network, etc.) fall through to
          // the text-only share path below — better than blocking the
          // share entirely.
        }
      }

      // Text-only Web Share (no image).
      if (navigator.share) {
        await navigator.share({
          title: "AI Salon",
          text: shareText,
        });
        return;
      }

      // Fallback for desktop browsers without Web Share: copy the
      // message to the clipboard and open the image in a new tab so
      // the user can manually attach it.
      try {
        await navigator.clipboard.writeText(shareText);
        toast.success("Message copied to clipboard — paste it into your post!");
        if (mainImageUrl) window.open(mainImageUrl, "_blank");
      } catch {
        // Final fallback: open the public event URL so the user can
        // at least grab the link.
        window.open(publicEventUrl, "_blank");
      }
    } catch (e) {
      // navigator.share throws AbortError when the user cancels the
      // share sheet — that's not a real error, so suppress it.
      const err = e as Error;
      if (err.name !== "AbortError") {
        toast.error(`Couldn't share: ${err.message}`);
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/10 bg-[#FF005A]/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-black">
            Testimonials for {event.title}
          </h3>
          <p className="text-xs text-black/80 mt-1">
            Share what you took away from this event — a speaker&apos;s talk, a
            specific session, or the event as a whole. Photos welcome.
          </p>
        </div>
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#FF005A] text-white font-semibold px-3 py-2 text-xs hover:bg-[#FF005A]/90 ais-lift whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
          title="Share this event to social media"
        >
          {sharing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sharing…
            </>
          ) : (
            <>
              <Share2 className="h-3.5 w-3.5" /> Share to social
            </>
          )}
        </button>
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
      />
    </div>
  );
}
