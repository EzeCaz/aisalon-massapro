"use client";

import { useEffect, useState, useCallback } from "react";
import { TestimonialCard, Testimonial } from "./testimonial-card";
import { TestimonialForm, AttachmentOption, EventOption } from "./testimonial-form";
import { Loader2, MessageSquareHeart } from "lucide-react";

type Props = {
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
  /** API query params (besides what we already derive from eventId). */
  scope?: "community" | "event" | "speaker" | "session";
  /** Default sort: "recent" | "top" | "oldest" */
  defaultSort?: "recent" | "top" | "oldest";
  /** Hide the form (e.g. on admin moderation page). */
  hideForm?: boolean;
  /** Compact mode for the form (no header). */
  compactForm?: boolean;
};

/**
 * TestimonialFeed — fetches & displays testimonials, with a create form
 * at the top. Used on:
 *   - /testimonials (community feed, no scope)
 *   - /events/[slug] "Testimonials" tab (event-scoped)
 *   - /admin/testimonials (admin moderation, hideForm=true)
 */
export function TestimonialFeed({
  meId,
  isAdmin,
  eventId,
  eventSlug,
  speakers = [],
  agendaItems = [],
  eventsCatalog = [],
  scope,
  defaultSort = "recent",
  hideForm = false,
  compactForm = false,
}: Props) {
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

  return (
    <div className="space-y-6">
      {!hideForm && (
        <TestimonialForm
          meId={meId}
          eventId={eventId}
          eventSlug={eventSlug}
          speakers={speakers}
          agendaItems={agendaItems}
          eventsCatalog={eventsCatalog}
          onCreated={fetchItems}
          compact={compactForm}
        />
      )}

      {/* Sort toggle */}
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

      {/* Items */}
      {loading ? (
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
            Be the first to share one{eventId ? " for this event" : ""}!
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
