"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

/**
 * NewEventForm — admin form for creating a new Event via
 * POST /api/admin/events.
 *
 * On success the user is redirected to /events/<slug> so they can
 * immediately add speakers, agenda, images, etc.
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
  const [description, setDescription] = React.useState("");
  const [takeaways, setTakeaways] = React.useState("");
  const [intendedFor, setIntendedFor] = React.useState("");
  const [rsvpUrl, setRsvpUrl] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Auto-fill endsAt to start + 2 hours when startsAt changes and endsAt
  // is empty (the most common case).
  React.useEffect(() => {
    if (startsAt && !endsAt) {
      const start = new Date(startsAt);
      if (!isNaN(start.getTime())) {
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        // Format to "YYYY-MM-DDTHH:MM" for datetime-local input
        const pad = (n: number) => String(n).padStart(2, "0");
        setEndsAt(
          `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`
        );
      }
    }
  }, [startsAt, endsAt]);

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
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
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
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-semibold text-black/60 mb-1">{label}</span>
      {children}
    </label>
  );
}
