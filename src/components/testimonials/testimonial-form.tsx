"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Star, ImagePlus, X, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

export type AttachmentOption = {
  id: string;
  label: string;
};

/**
 * ChapterOption — used by the community testimonials page to let users
 * pick which chapter an event belongs to BEFORE picking the event itself.
 * Mirrors the Chapter model: id, slug, name, optional city + flag.
 */
export type ChapterOption = {
  id: string;
  slug: string;
  name: string;
  city?: string | null;
  flagEmoji?: string | null;
};

/**
 * EventOption — used by the community testimonials page to let users
 * pick which event they're writing about (the event-tab form doesn't
 * need this because the event is already known).
 *
 * `chapterId` is included so the form can filter the event dropdown by
 * the chapter the user picked above (community mode only).
 */
export type EventOption = {
  id: string;
  slug: string;
  title: string;
  /** The chapter this event belongs to — used to filter by selected chapter. */
  chapterId?: string | null;
  /** Speakers belonging to this event (for the "A speaker" picker). */
  speakers: AttachmentOption[];
  /** Agenda items belonging to this event (for the "A session" picker). */
  agendaItems: AttachmentOption[];
};

type Props = {
  meId: string;
  /** Optional pre-selected event. Pass to lock the form to "about this event". */
  eventId?: string;
  eventSlug?: string;
  /** Optional list of speakers (event-scoped) the user can attach to. */
  speakers?: AttachmentOption[];
  /** Optional list of agenda items (event-scoped) the user can attach to. */
  agendaItems?: AttachmentOption[];
  /**
   * Catalog of all events — used by the community testimonials page
   * so the user can pick any event (and then any speaker/session in it).
   * Ignored when `eventId` is set (event-tab form is already locked).
   */
  eventsCatalog?: EventOption[];
  /**
   * Catalog of all chapters — used by the community testimonials page
   * so the user can pick a chapter BEFORE picking an event. The event
   * dropdown is then filtered to the selected chapter.
   *
   * Ignored when `eventId` is set (event-tab form is locked to the
   * event's chapter — shown as a read-only badge via `lockedChapterName`).
   */
  chapters?: ChapterOption[];
  /**
   * Slug of the chapter to pre-select on first render. The community
   * testimonials page passes the `?chapter=slug` URL param here so the
   * chapter is auto-recognized from the URL the user landed on.
   */
  defaultChapterSlug?: string;
  /**
   * When the form is locked to an event (event-tab mode), the event's
   * chapter is shown as a read-only badge. Pass the chapter's display
   * name (e.g. "Tel Aviv") here. Ignored in community mode.
   */
  lockedChapterName?: string;
  /** Called after a successful create. Parent should refetch the list. */
  onCreated?: () => void;
  /** Compact mode: hides the header (useful when embedding in a tab). */
  compact?: boolean;
};

/**
 * TestimonialForm — lets a signed-in user post a testimonial.
 * Supports attaching to event / speaker / agenda-item, picking a star
 * rating, choosing the "experience date", and attaching an image.
 *
 * Two modes:
 *  - Event-locked (eventId provided): the form is about a specific
 *    event. All 4 scope chips show. The chapter is shown as a
 *    read-only badge (lockedChapterName) since it's determined by
 *    the event.
 *  - Community (no eventId, eventsCatalog provided): the user can
 *    pick "🌍 Community" (no event), OR pick a chapter → event →
 *    speaker/session. The chapter picker sits ABOVE the event picker
 *    per the product spec ("when selecting the event or session,
 *    must have the chapter selection above").
 */
export function TestimonialForm({
  meId,
  eventId,
  eventSlug,
  speakers = [],
  agendaItems = [],
  eventsCatalog = [],
  chapters = [],
  defaultChapterSlug,
  lockedChapterName,
  onCreated,
  compact = false,
}: Props) {
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [eventDate, setEventDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [scope, setScope] = useState<"community" | "event" | "speaker" | "session">(
    eventId ? "event" : "community"
  );
  // For community mode: the chapter the user picked from the dropdown.
  // Auto-recognized from `defaultChapterSlug` (URL ?chapter=) on mount.
  const [pickedChapterId, setPickedChapterId] = useState<string>("");
  // For community mode: the event the user picked from the catalog.
  const [pickedEventId, setPickedEventId] = useState<string>("");
  const [speakerId, setSpeakerId] = useState<string>("");
  const [agendaItemId, setAgendaItemId] = useState<string>("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-recognize chapter from defaultChapterSlug on mount. This is
  // how the community testimonials page passes the `?chapter=slug` URL
  // param through so the chapter is pre-selected when the user lands.
  useEffect(() => {
    if (!defaultChapterSlug) return;
    const match = chapters.find((c) => c.slug === defaultChapterSlug);
    if (match) setPickedChapterId(match.id);
  }, [defaultChapterSlug, chapters]);

  const charsLeft = useMemo(() => 2000 - body.length, [body]);

  // Events filtered by the picked chapter. In community mode, the
  // event dropdown only shows events that belong to the selected
  // chapter. When no chapter is selected, all events show (the user
  // can pick any event — the chapter picker is a convenience filter,
  // not a hard requirement).
  const filteredEvents = useMemo(() => {
    if (!pickedChapterId) return eventsCatalog;
    return eventsCatalog.filter((e) => e.chapterId === pickedChapterId);
  }, [eventsCatalog, pickedChapterId]);

  // Resolve the "active" event id — either the locked one or the
  // user-picked one. Used to decide which speakers/sessions to show.
  const activeEventId = eventId || pickedEventId;
  const activeEvent = eventsCatalog.find((e) => e.id === activeEventId);
  const activeSpeakers = eventId ? speakers : activeEvent?.speakers ?? [];
  const activeAgendaItems = eventId ? agendaItems : activeEvent?.agendaItems ?? [];

  // Locked chapter display name (event-tab mode). Callers pass the
  // event's chapter name via lockedChapterName. We don't fall back to
  // the chapters catalog here because event-tab mode doesn't need
  // the catalog (the event is already known, no chapter picker).
  const lockedChapterDisplay = lockedChapterName;

  function pickImage(file: File | null) {
    setImage(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  }

  function reset() {
    setBody("");
    setRating(5);
    setEventDate(new Date().toISOString().slice(0, 10));
    setScope(eventId ? "event" : "community");
    setPickedEventId("");
    setSpeakerId("");
    setAgendaItemId("");
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit() {
    if (body.trim().length < 3) {
      toast.error("Please write at least a few words.");
      return;
    }
    if (body.length > 2000) {
      toast.error("Testimonial is too long (max 2000 characters).");
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("body", body.trim());
      fd.append("rating", String(rating));
      fd.append("eventDate", new Date(eventDate).toISOString());
      if (scope === "event" || scope === "speaker" || scope === "session") {
        if (activeEventId) fd.append("eventId", activeEventId);
      }
      if (scope === "speaker" && speakerId) {
        fd.append("speakerId", speakerId);
      }
      if (scope === "session" && agendaItemId) {
        fd.append("agendaItemId", agendaItemId);
      }
      if (image) fd.append("image", image);

      const res = await fetch("/api/testimonials", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      toast.success("Thanks for sharing your testimonial!");
      reset();
      onCreated?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Determine whether to show the chapter picker (community mode) ----
  // Show only when ALL of:
  //   - not in event-locked mode (eventId not set)
  //   - scope is something other than "community" (community scope has
  //     no event, so chapter picker is irrelevant)
  //   - chapters catalog has at least one chapter to pick from
  const showChapterPicker =
    !eventId && scope !== "community" && chapters.length > 0;

  return (
    <div
      className={`rounded-2xl border border-black/10 bg-white p-5 ${
        compact ? "" : "shadow-sm"
      }`}
    >
      {!compact && (
        <div className="mb-4">
          <h3 className="text-base font-extrabold text-black">
            Share your testimonial
          </h3>
          <p className="text-xs text-black/50 mt-0.5">
            Tell the community what you loved — about a speaker, an event, a
            session, or just the vibe. Add a photo, pick a rating, and post.
          </p>
        </div>
      )}

      {/* Scope selector — community / event / speaker / session */}
      <div className="mb-4">
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1.5">
          About
        </label>
        <div className="flex flex-wrap gap-1.5">
          <ScopeChip
            active={scope === "community"}
            onClick={() => setScope("community")}
            label="🌍 Community"
          />
          {/* Event chip — show when:
              (a) event is locked (event-tab form), OR
              (b) community mode AND there's at least one event in the catalog. */}
          {(eventId || eventsCatalog.length > 0) && (
            <ScopeChip
              active={scope === "event"}
              onClick={() => setScope("event")}
              label="📍 This event"
            />
          )}
          {(eventId || eventsCatalog.length > 0) && (
            <ScopeChip
              active={scope === "speaker"}
              onClick={() => setScope("speaker")}
              label="🎤 A speaker"
            />
          )}
          {(eventId || eventsCatalog.length > 0) && (
            <ScopeChip
              active={scope === "session"}
              onClick={() => setScope("session")}
              label="🗓 A session"
            />
          )}
        </div>
      </div>

      {/* Chapter row — two variants:
          - Event-locked mode (eventId set): read-only badge showing the
            event's chapter. Filled automatically, no user interaction.
          - Community mode (no eventId, scope != "community"): dropdown
            so the user picks a chapter BEFORE picking an event. Sits
            ABOVE the event picker per the product spec. */}
      {(eventId || showChapterPicker) && (
        <div className="mb-4">
          <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1">
            Chapter
          </label>
          {eventId ? (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 px-3 py-1.5 text-xs font-semibold text-[#FF005A]">
              <Lock className="h-3 w-3" />
              {lockedChapterDisplay || lockedChapterName || "Chapter"}
              <span className="text-[0.6rem] font-normal text-black/50 ml-1">
                auto-filled from event
              </span>
            </div>
          ) : (
            <select
              value={pickedChapterId}
              onChange={(e) => {
                setPickedChapterId(e.target.value);
                // Reset event/speaker/session picks when the chapter
                // changes — the previously picked event may not belong
                // to the new chapter.
                setPickedEventId("");
                setSpeakerId("");
                setAgendaItemId("");
              }}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="">📍 All chapters</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.flagEmoji ? `${c.flagEmoji} ` : ""}
                  {c.name}
                  {c.city ? ` — ${c.city}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Event picker — only in community mode (no locked eventId)
          and only when scope is not "community". */}
      {!eventId && scope !== "community" && eventsCatalog.length > 0 && (
        <div className="mb-4">
          <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1">
            Which event?
          </label>
          <select
            value={pickedEventId}
            onChange={(e) => {
              setPickedEventId(e.target.value);
              // Reset speaker/session picks when the event changes.
              setSpeakerId("");
              setAgendaItemId("");
            }}
            className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
          >
            <option value="">Pick an event…</option>
            {filteredEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          {pickedChapterId && filteredEvents.length === 0 && (
            <p className="mt-1 text-[0.65rem] text-black/50">
              No events in this chapter yet — try another chapter.
            </p>
          )}
        </div>
      )}

      {/* Speaker picker */}
      {scope === "speaker" && activeSpeakers.length > 0 && (
        <div className="mb-4">
          <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1">
            Speaker
          </label>
          <select
            value={speakerId}
            onChange={(e) => setSpeakerId(e.target.value)}
            className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
          >
            <option value="">Pick a speaker…</option>
            {activeSpeakers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Agenda picker */}
      {scope === "session" && activeAgendaItems.length > 0 && (
        <div className="mb-4">
          <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1">
            Session
          </label>
          <select
            value={agendaItemId}
            onChange={(e) => setAgendaItemId(e.target.value)}
            className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
          >
            <option value="">Pick a session…</option>
            {activeAgendaItems.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Rating */}
      <div className="mb-4">
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1.5">
          Rating
        </label>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => {
            const value = i + 1;
            const active = (hoverRating || rating) >= value;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHoverRating(value)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(value)}
                className="p-0.5"
                title={`${value} star${value > 1 ? "s" : ""}`}
              >
                <Star
                  className={`h-6 w-6 transition-colors ${
                    active
                      ? "fill-[#FFAC30] text-[#FFAC30]"
                      : "text-black/15 hover:text-black/30"
                  }`}
                />
              </button>
            );
          })}
          <span className="ml-2 text-xs text-black/50">
            {rating}/5
          </span>
        </div>
      </div>

      {/* Event date */}
      <div className="mb-4">
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1">
          When did this happen?
        </label>
        <Input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="h-9"
        />
      </div>

      {/* Body */}
      <div className="mb-4">
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1">
          Your quote
        </label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share what made it special…"
          rows={4}
          maxLength={2000}
          className="resize-y"
        />
        <div className="mt-1 text-right text-[0.65rem] text-black/80">
          {charsLeft} characters left
        </div>
      </div>

      {/* Image */}
      <div className="mb-4">
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1.5">
          Photo (optional)
        </label>
        {imagePreview ? (
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Preview"
              className="h-32 w-auto rounded-lg border border-black/10 object-cover"
            />
            <button
              type="button"
              onClick={() => pickImage(null)}
              className="absolute -top-2 -right-2 bg-[#FF005A] text-white rounded-full p-1 shadow-md hover:bg-[#FF005A]/90"
              title="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 border border-dashed border-black/20 rounded-lg text-xs text-black/50 hover:border-[#FF005A] hover:text-[#FF005A] hover:bg-[#FF005A]/5"
          >
            <ImagePlus className="h-4 w-4" />
            Add a photo
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            pickImage(f);
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={reset} disabled={saving}>
          Clear
        </Button>
        <Button
          size="sm"
          onClick={submit}
          disabled={saving || body.trim().length < 3}
          className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white gap-1.5"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Posting…
            </>
          ) : (
            "Post testimonial"
          )}
        </Button>
      </div>
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-colors ${
        active
          ? "bg-[#FF005A] text-white"
          : "bg-black/5 text-black/80 hover:bg-black/10"
      }`}
    >
      {label}
    </button>
  );
}
