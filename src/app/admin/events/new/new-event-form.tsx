"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Save, Sparkles, ClipboardPaste } from "lucide-react";

/**
 * NewEventForm — admin form for creating a new Event via
 * POST /api/admin/events.
 *
 * On success the user is redirected to /events/<slug> so they can
 * immediately add speakers, agenda, images, etc.
 *
 * FEATURE: AI Event Extraction
 *   At the top of the form, the admin can paste raw event content
 *   (LinkedIn post, marketing copy, email, etc.) and click "Extract
 *   fields with AI". The content is sent to /api/admin/events/extract
 *   which uses an LLM to pull out title/subtitle/dates/venue/description/
 *   takeaways/intended-for/RSVP URL + a list of speakers. The event
 *   fields auto-populate the form; speakers are shown as a preview list
 *   (they can be added manually after the event is created, since each
 *   speaker requires an event ID).
 */
export function NewEventForm() {
  const router = useRouter();

  const [title, setTitle] = React.useState("");
  const [subtitle, setSubtitle] = React.useState("");
  const [chapter, setChapter] = React.useState("Tel Aviv");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [venue, setVenue] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("Tel Aviv");
  const [country, setCountry] = React.useState("ISR");
  const [mapUrl, setMapUrl] = React.useState("");
  const [wazeUrl, setWazeUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [takeaways, setTakeaways] = React.useState("");
  const [intendedFor, setIntendedFor] = React.useState("");
  const [rsvpUrl, setRsvpUrl] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // ---- AI Extraction state ----
  const [rawText, setRawText] = React.useState("");
  const [extracting, setExtracting] = React.useState(false);
  const [extractedSpeakers, setExtractedSpeakers] = React.useState<
    Array<{
      name: string;
      company: string | null;
      position: string | null;
      topic: string | null;
      bio: string | null;
      abstract: string | null;
      startTime: string | null;
      endTime: string | null;
    }>
  >([]);
  const [extractionWarnings, setExtractionWarnings] = React.useState<string[]>([]);
  const [showExtractPanel, setShowExtractPanel] = React.useState(false);

  // Auto-fill endsAt to start + 2 hours when startsAt changes and endsAt
  // is empty (the most common case). The datetime-local string is naive
  // (no TZ), so we add 2 hours directly to the wall-clock components —
  // no Date object needed (which would drag in browser TZ).
  React.useEffect(() => {
    if (startsAt && !endsAt) {
      // startsAt is "YYYY-MM-DDTHH:MM" — parse parts, add 2h, reformat.
      const m = startsAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
      if (m) {
        const [, y, mo, d, h, mi] = m;
        const endHour = (parseInt(h, 10) + 2) % 24;
        const dayBump = parseInt(h, 10) + 2 >= 24 ? 1 : 0;
        // If we rolled past midnight, bump the day. (Month/year rollover
        // is rare for 2h bump but technically possible at month-end —
        // handled by Date arithmetic for correctness.)
        if (dayBump) {
          const dt = new Date(
            parseInt(y, 10),
            parseInt(mo, 10) - 1,
            parseInt(d, 10) + 1,
            endHour,
            parseInt(mi, 10)
          );
          const pad = (n: number) => String(n).padStart(2, "0");
          setEndsAt(
            `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
          );
        } else {
          setEndsAt(`${y}-${mo}-${d}T${String(endHour).padStart(2, "0")}:${mi}`);
        }
      }
    }
  }, [startsAt, endsAt]);

  /**
   * Convert an ISO 8601 string to "YYYY-MM-DDTHH:MM" interpreted in
   * Asia/Jerusalem (event timezone). See event-editor.tsx for the
   * full rationale — short version: the admin form must show
   * wall-clock time in the event's city, NOT the browser's local TZ.
   */
  function isoToLocalInput(iso: string | null | undefined): string {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
      return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
    } catch {
      return "";
    }
  }

  /**
   * Convert "YYYY-MM-DDTHH:MM" (Asia/Jerusalem wall-clock) → UTC ISO.
   * Mirrors `fromLocalDatetimeInput` in admin-agenda-tab.tsx.
   */
  function localInputToUtcIso(local: string): string {
    if (!local) return new Date(0).toISOString();
    const asIfUtc = new Date(local + ":00Z");
    if (isNaN(asIfUtc.getTime())) return new Date(local).toISOString();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      timeZoneName: "shortOffset",
    }).formatToParts(asIfUtc);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
    const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    let offsetMinutes = 0;
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const hours = parseInt(match[2], 10);
      const minutes = match[3] ? parseInt(match[3], 10) : 0;
      offsetMinutes = sign * (hours * 60 + minutes);
    }
    return new Date(asIfUtc.getTime() - offsetMinutes * 60000).toISOString();
  }

  async function handleExtract() {
    if (!rawText.trim()) {
      toast.error("Paste some event content first");
      return;
    }
    setExtracting(true);
    const t = toast.loading("Extracting event fields with AI…");
    try {
      const res = await fetch("/api/admin/events/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const e = data.event || {};
      // Auto-populate form fields — only overwrite if the LLM returned a value,
      // so the admin can pre-fill some fields manually before extracting.
      if (e.title) setTitle(e.title);
      if (e.subtitle) setSubtitle(e.subtitle);
      if (e.venue) setVenue(e.venue);
      if (e.address) setAddress(e.address);
      if (e.city) setCity(e.city);
      if (e.country) setCountry(e.country);
      if (e.mapUrl) setMapUrl(e.mapUrl);
      if (e.wazeUrl) setWazeUrl(e.wazeUrl);
      if (e.description) setDescription(e.description);
      if (e.takeaways) setTakeaways(e.takeaways);
      if (e.intendedFor) setIntendedFor(e.intendedFor);
      if (e.rsvpUrl) setRsvpUrl(e.rsvpUrl);
      const localStart = isoToLocalInput(e.startsAt);
      const localEnd = isoToLocalInput(e.endsAt);
      if (localStart) setStartsAt(localStart);
      if (localEnd) setEndsAt(localEnd);

      setExtractedSpeakers(data.speakers || []);
      setExtractionWarnings(data.warnings || []);
      toast.success(
        `Extracted ${Object.keys(e).filter((k) => e[k]).length} fields${data.speakers?.length ? ` + ${data.speakers.length} speakers` : ""}. Review and edit before saving.`,
        { id: t, duration: 6000 }
      );
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    } finally {
      setExtracting(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startsAt || !endsAt) {
      toast.error("Title, start time, and end time are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          chapter: chapter.trim() || "Tel Aviv",
          slug: slug.trim() || null,
          venue: venue.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          mapUrl: mapUrl.trim() || null,
          wazeUrl: wazeUrl.trim() || null,
          startsAt: localInputToUtcIso(startsAt),
          endsAt: localInputToUtcIso(endsAt),
          description: description.trim() || null,
          takeaways: takeaways.trim() || null,
          intendedFor: intendedFor.trim() || null,
          rsvpUrl: rsvpUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to create event");
        return;
      }
      const d = await res.json();
      toast.success("Event created");
      router.push(`/events/${d.event.slug}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to create event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* ---- AI Extraction Panel ---- */}
      <fieldset className="rounded-lg border border-[#820A7D]/30 bg-[#820A7D]/5 p-5">
        <legend className="px-2 text-sm font-bold text-[#820A7D] flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> AI Event Extractor
        </legend>
        {!showExtractPanel ? (
          <button
            type="button"
            onClick={() => setShowExtractPanel(true)}
            className="inline-flex items-center gap-2 rounded-md bg-[#820A7D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#820A7D]/90"
          >
            <ClipboardPaste className="h-4 w-4" /> Paste event content to auto-fill
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-black/80">
              Paste the full event description (LinkedIn post, marketing copy, email —
              including speaker bios and agenda). The AI will extract title, dates, venue,
              description, takeaways, intended audience, RSVP link, and a list of speakers.
              All fields below will be auto-populated — review and edit before saving.
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={8}
              placeholder="Paste event content here — including title, date, venue, agenda, speaker bios, etc."
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExtract}
                disabled={extracting || !rawText.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-[#820A7D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#820A7D]/90 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {extracting ? "Extracting…" : "Extract fields with AI"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExtractPanel(false);
                  setRawText("");
                  setExtractedSpeakers([]);
                  setExtractionWarnings([]);
                }}
                className="text-xs text-black/50 hover:text-black/70 underline"
              >
                Hide
              </button>
            </div>

            {extractionWarnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>Warnings:</strong>
                <ul className="list-disc ml-5 mt-1 space-y-0.5">
                  {extractionWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {extractedSpeakers.length > 0 && (
              <div className="rounded-md border border-black/10 bg-white p-3">
                <div className="text-xs font-bold uppercase tracking-widest text-black/80 mb-2">
                  Extracted speakers ({extractedSpeakers.length}) — add them after event creation
                </div>
                <ul className="space-y-2">
                  {extractedSpeakers.map((s, i) => (
                    <li key={i} className="text-xs border-l-2 border-[#FF005A]/40 pl-2">
                      <div className="font-semibold text-black">
                        {s.name}
                        {s.position && <span className="text-black/80"> · {s.position}</span>}
                        {s.company && <span className="text-black/80"> · {s.company}</span>}
                      </div>
                      {s.topic && <div className="text-black/70 mt-0.5">Topic: {s.topic}</div>}
                      {s.bio && (
                        <div className="text-black/50 mt-0.5 line-clamp-2">{s.bio}</div>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-[0.65rem] text-black/80 mt-2">
                  After creating the event, go to the event page → Speakers tab → add each
                  speaker manually (the extracted info above will be visible on this page
                  until you navigate away).
                </p>
              </div>
            )}
          </div>
        )}
      </fieldset>

      <Section title="Basics" required>
        <Field label="Event title *" full>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. AI Salon #12 — RAG in production"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Subtitle" full>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="One-line hook shown under the title"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Chapter">
          <input
            type="text"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Slug (optional — auto-generated if blank)">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="ai-salon-12-rag"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Starts at *">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Ends at *">
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
      </Section>

      <Section title="Venue">
        <Field label="Venue name">
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. The Stage"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Address">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="City">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Country (ISO code)">
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Map URL" full>
          <input
            type="url"
            value={mapUrl}
            onChange={(e) => setMapUrl(e.target.value)}
            placeholder="https://maps.google.com/…"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Waze URL" full hint="Waze deep-link or search URL">
          <input
            type="url"
            value={wazeUrl}
            onChange={(e) => setWazeUrl(e.target.value)}
            placeholder="https://waze.com/ul?q=…"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
      </Section>

      <Section title="Content">
        <Field label="Description / about" full>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Long-form description of the event"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="What you'll take home" full>
          <textarea
            value={takeaways}
            onChange={(e) => setTakeaways(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="This event is built for" full>
          <textarea
            value={intendedFor}
            onChange={(e) => setIntendedFor(e.target.value)}
            rows={2}
            placeholder="e.g. AI engineers, founders, product builders"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="External RSVP URL" full>
          <input
            type="url"
            value={rsvpUrl}
            onChange={(e) => setRsvpUrl(e.target.value)}
            placeholder="https://lu.ma/… (leave blank to use in-app RSVP)"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
      </Section>

      <div className="flex items-center gap-2 pt-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-semibold text-black hover:bg-black/5"
        >
          <ArrowLeft className="h-4 w-4" />
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-[#FF005A] px-5 py-2 text-sm font-semibold text-white hover:bg-[#FF005A]/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Creating…" : "Create event"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-black/10 bg-white p-5">
      <legend className="px-2 text-sm font-bold text-black">
        {title}
        {required ? <span className="text-[#FF005A] ml-1">*</span> : null}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  children,
  full,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  hint?: string;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-semibold text-black/80 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[0.65rem] text-black/80 mt-1">{hint}</span>}
    </label>
  );
}
