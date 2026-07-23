"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TestimonialCard, Testimonial } from "./testimonial-card";
import { TestimonialForm, AttachmentOption, EventOption, ChapterOption } from "./testimonial-form";
import { Loader2, MessageSquareHeart, LogIn } from "lucide-react";

type Props = {
  /** Empty string when anonymous (public view). Real user id when signed in. */
  meId: string;
  isAdmin: boolean;
  /** Pre-attach the form to a specific event (event detail tab). */
  eventId?: string;
  eventSlug?: string;
  /** Pass to populate the form's speaker dropdown. */
  speakers?: AttachmentOption[];
  /** Pass to populate the form's session dropdown. */
  agendaItems?: AttachmentOption[];
  /** Catalog of all events — used by the community testimonials page so
   *  the form can offer all 4 scope chips (community / event / speaker / session). */
  eventsCatalog?: EventOption[];
  /** Catalog of all chapters — used by the community testimonials page so
   *  the form can show a chapter picker ABOVE the event picker. */
  chapters?: ChapterOption[];
  /** Slug of the chapter to pre-select (auto-recognized from URL ?chapter=). */
  defaultChapterSlug?: string;
  /** When the form is locked to an event (event-tab mode), the event's
   *  chapter name is shown as a read-only badge. */
  lockedChapterName?: string;
  /** API query params (besides what we already derive from eventId). */
  scope?: "community" | "event" | "speaker" | "session";
  /** Default sort: "recent" | "top" | "oldest" */
  defaultSort?: "recent" | "top" | "oldest";
  /** Hide the form (e.g. on admin moderation page). */
  hideForm?: boolean;
  /** Compact mode for the form (no header). */
  compactForm?: boolean;
  /** Show the form ABOVE the feed (default = true). Set false to flip
   *  the order — useful on the public event page where the existing
   *  testimonials should appear on top and the form below. */
  formOnTop?: boolean;
  /**
   * Event context — used by the share button on each card to compose
   * a curated event-branded message ("I had an amazing time on this
   * great AI Salon event about <title>, at <venue>, join the community.")
   * and to attach the event's profile picture as the share image.
   * Pass only when this feed is scoped to a specific event.
   */
  eventContext?: {
    title: string;
    venue: string | null;
    mainImageUrl: string | null;
  };
};

/**
 * TestimonialFeed — fetches & displays testimonials, with a create form
 * at the top (or bottom, controlled by `formOnTop`). Used on:
 *   - /testimonials (community feed, public read — form only for signed-in members)
 *   - /e/[slug] (public event page — existing testimonials on top, form below)
 *   - /events/[slug] "Testimonials" tab (event-scoped, form on top)
 *   - /admin/testimonials (admin moderation, hideForm=true)
 *
 * When meId is empty (anonymous visitor), the form is replaced by a
 * "Sign in to share your story" call-to-action. The feed itself is
 * fully readable.
 */
export function TestimonialFeed({
  meId,
  isAdmin,
  eventId,
  eventSlug,
  speakers = [],
  agendaItems = [],
  eventsCatalog = [],
  chapters = [],
  defaultChapterSlug,
  lockedChapterName,
  scope,
  defaultSort = "recent",
  hideForm = false,
  compactForm = false,
  formOnTop = true,
  eventContext,
}: Props) {
  const isAnonymous = !meId;
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"recent" | "top" | "oldest">(defaultSort);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (eventId) params.set("eventId", eventId);
      if (scope === "community") params.set("scope", "community");
      params.set("sort", sort);
      params.set("limit", "100");
      const res = await fetch(`/api/testimonials?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.testimonials || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [eventId, scope, sort]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // The form / sign-in CTA block. Rendered once, then placed either
  // above or below the feed depending on `formOnTop`.
  const formBlock = !hideForm && (
    isAnonymous ? (
      <div className="rounded-xl border border-[#FF005A]/25 bg-gradient-to-br from-[#FF005A]/5 to-[#820A7D]/5 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-base font-bold text-black mb-1">
            Share your story
          </h3>
          <p className="text-sm text-black/70">
            Sign in as a community member to post a testimonial — add a photo, pick a rating, and tell us what made the evening special.
          </p>
        </div>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/testimonials")}`}
          className="inline-flex items-center gap-2 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-2.5 text-sm hover:bg-[#FF005A]/90 ais-lift whitespace-nowrap"
        >
          <LogIn className="h-4 w-4" />
          Sign in to post
        </Link>
      </div>
    ) : (
      <TestimonialForm
        meId={meId}
        eventId={eventId}
        eventSlug={eventSlug}
        speakers={speakers}
        agendaItems={agendaItems}
        eventsCatalog={eventsCatalog}
        chapters={chapters}
        defaultChapterSlug={defaultChapterSlug}
        lockedChapterName={lockedChapterName}
        onCreated={fetchItems}
        compact={compactForm}
      />
    )
  );

  const sortToggle = (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-widest text-black/80">
        {items.length} testimonial{items.length === 1 ? "" : "s"}
      </span>
      <div className="ml-auto inline-flex border border-black/15 rounded-md overflow-hidden text-xs">
        {(["recent", "top", "oldest"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSort(s)}
            className={`px-2.5 py-1 font-semibold transition-colors ${
              sort === s
                ? "bg-black text-white"
                : "bg-white text-black/80 hover:bg-black/5"
            }`}
          >
            {s === "recent" ? "Recent" : s === "top" ? "Top" : "Oldest"}
          </button>
        ))}
      </div>
    </div>
  );

  const itemsList = loading ? (
    <div className="flex items-center justify-center py-12 text-black/80">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      Loading testimonials…
    </div>
  ) : error ? (
    <div className="rounded-lg border border-[#FF005A]/30 bg-[#FF005A]/5 p-4 text-sm text-[#FF005A]">
      Couldn&apos;t load testimonials: {error}
    </div>
  ) : items.length === 0 ? (
    <div className="rounded-lg border border-dashed border-black/15 p-8 text-center">
      <MessageSquareHeart className="h-8 w-8 mx-auto text-black/20 mb-2" />
      <p className="text-sm font-semibold text-black/80">
        No testimonials yet
      </p>
      <p className="text-xs text-black/80 mt-1">
        {isAnonymous
          ? "Check back soon — community stories will appear here."
          : `Be the first to share one${eventId ? " for this event" : ""}!`}
      </p>
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map((t) => (
        <TestimonialCard
          key={t.id}
          testimonial={t}
          meId={meId}
          isAdmin={isAdmin}
          onChanged={fetchItems}
          eventContext={eventContext}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {formOnTop && formBlock}
      {sortToggle}
      {itemsList}
      {!formOnTop && formBlock}
    </div>
  );
}
