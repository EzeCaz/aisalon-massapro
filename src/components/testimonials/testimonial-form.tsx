"use client";

import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Star, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type AttachmentOption = {
  id: string;
  label: string;
};

/**
 * EventOption — used by the community testimonials page to let users
 * pick which event they're writing about (the event-tab form doesn't
 * need this because the event is already known).
 */
export type EventOption = {
  id: string;
  slug: string;
  title: string;
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
 *    event. All 4 scope chips show.
 *  - Community (no eventId, eventsCatalog provided): the user can
 *    pick "🌍 Community" (no event), OR pick any event from the
 *    catalog → then speakers/sessions become pickable.
 */
export function TestimonialForm({
  meId,
  eventId,
  eventSlug,
  speakers = [],
  agendaItems = [],
  eventsCatalog = [],
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
  // For community mode: the event the user picked from the catalog.
  const [pickedEventId, setPickedEventId] = useState<string>("");
  const [speakerId, setSpeakerId] = useState<string>("");
  const [agendaItemId, setAgendaItemId] = useState<string>("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const charsLeft = useMemo(() => 2000 - body.length, [body]);

  // Resolve the "active" event id — either the locked one or the
  // user-picked one. Used to decide which speakers/sessions to show.
  const activeEventId = eventId || pickedEventId;
  const activeEvent = eventsCatalog.find((e) => e.id === activeEventId);
  const activeSpeakers = eventId ? speakers : activeEvent?.speakers ?? [];
  const activeAgendaItems = eventId ? agendaItems : activeEvent?.agendaItems ?? [];

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
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1.5">
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

      {/* Event picker — only in community mode (no locked eventId)
          and only when scope is not "community". */}
      {!eventId && scope !== "community" && eventsCatalog.length > 0 && (
        <div className="mb-4">
          <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
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
            {eventsCatalog.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Speaker picker */}
      {scope === "speaker" && activeSpeakers.length > 0 && (
        <div className="mb-4">
          <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
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
          <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
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
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1.5">
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
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
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
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
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
        <div className="mt-1 text-right text-[0.65rem] text-black/40">
          {charsLeft} characters left
        </div>
      </div>

      {/* Image */}
      <div className="mb-4">
        <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1.5">
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
          : "bg-black/5 text-black/60 hover:bg-black/10"
      }`}
    >
      {label}
    </button>
  );
}
