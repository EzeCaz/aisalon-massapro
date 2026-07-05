"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  ExternalLink,
  Save,
  Loader2,
  RefreshCcw,
  Plus,
  Trash2,
  Pencil,
  X,
  Search,
  Users,
  Mic2,
  FileText,
  CalendarDays,
  Settings,
  Upload,
  Check,
  Ticket,
  CheckCircle2,
  Clock,
  Download,
} from "lucide-react";
import { AdminAgendaTab } from "@/app/events/[slug]/tabs/admin-agenda-tab";

// ------------------------------------------------------------------
// Types — shared between this file, admin-event-manager.tsx, and the
// server component /admin/event/page.tsx. Plain JSON-serializable rows.
// ------------------------------------------------------------------

export type AdminEventRow = {
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
  startsAt: string;
  endsAt: string;
  description: string | null;
  takeaways: string | null;
  intendedFor: string | null;
  rsvpUrl: string | null;
  mainImage: { id: string; fileUrl: string } | null;
  coHosts: Array<{
    id: string;
    user: { id: string; email: string; name: string | null; role: string };
  }>;
  _count: {
    images: number;
    speakers: number;
    agenda: number;
    coHosts: number;
    rsvps: number;
  };
};

export type AdminMemberRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  photoUrl: string | null;
  image: string | null;
  company: string | null;
};

type Props = {
  event: AdminEventRow;
  members: AdminMemberRow[];
  onBack: () => void;
};

/**
 * EventManagerPanel — the inline management panel that opens when the
 * admin picks an event from the "Manage event" list. Renders a sticky
 * sub-tab bar with five sections:
 *
 *   1. Details       — editable form (title, dates, venue, description…)
 *   2. Sessions      — reuses <AdminAgendaTab> from the event page
 *   3. Speakers      — list, add, edit, delete speakers for this event
 *   4. Presentations — list + upload + delete presentation files
 *   5. Co-hosts      — pick from members, add/remove, write EventCoHost
 *
 * Each section is its own component below so the file stays readable.
 */
export function EventManagerPanel({ event, members, onBack }: Props) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 justify-between pb-4 border-b border-black/10">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-black/50 hover:text-black/80 mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to event list
          </button>
          <h2 className="text-xl font-extrabold text-black line-clamp-2">
            {event.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-black/50">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {fmt(event.startsAt, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              {" · "}
              {fmtTime(event.startsAt)}–{fmtTime(event.endsAt)}
            </span>
            {event.venue && <span>· {event.venue}</span>}
            <span>· {event.chapter}</span>
          </div>
        </div>
        <Link
          href={`/e/${event.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-3 py-1.5 text-xs font-semibold text-black hover:bg-black/5 whitespace-nowrap"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View public page
        </Link>
      </div>

      {/* Sub-tabs */}
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="bg-black/5 p-1 h-auto flex-wrap">
          <SectionTrigger value="details" icon={Settings} label="Details" />
          <SectionTrigger value="agenda" icon={CalendarDays} label={`Sessions (${event._count.agenda})`} />
          <SectionTrigger value="speakers" icon={Mic2} label={`Speakers (${event._count.speakers})`} />
          <SectionTrigger value="presentations" icon={FileText} label="Presentations" />
          <SectionTrigger value="cohosts" icon={Users} label={`Co-hosts (${event._count.coHosts})`} />
          <SectionTrigger value="registrations" icon={Ticket} label={`Registrations (${event._count.rsvps ?? 0})`} />
        </TabsList>

        <TabsContent value="details" className="mt-5">
          <DetailsSection event={event} />
        </TabsContent>
        <TabsContent value="agenda" className="mt-5">
          <AgendaSection event={event} />
        </TabsContent>
        <TabsContent value="speakers" className="mt-5">
          <SpeakersSection event={event} />
        </TabsContent>
        <TabsContent value="presentations" className="mt-5">
          <PresentationsSection event={event} />
        </TabsContent>
        <TabsContent value="cohosts" className="mt-5">
          <CoHostsSection event={event} members={members} />
        </TabsContent>
        <TabsContent value="registrations" className="mt-5">
          <RegistrationsSection event={event} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------
// Shared bits
// ------------------------------------------------------------------

function SectionTrigger({
  value,
  icon: Icon,
  label,
}: {
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="data-[state=active]:bg-white data-[state=active]:text-[#FF005A] data-[state=active]:shadow-sm rounded-md px-3 py-2 text-sm font-semibold"
    >
      <Icon className="h-3.5 w-3.5 mr-1.5" />
      {label}
    </TabsTrigger>
  );
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    ...opts,
  }).format(new Date(iso));
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Convert ISO to "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
function isoToLocalInput(iso: string): string {
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

/** Convert "YYYY-MM-DDTHH:mm" (Asia/Jerusalem wall clock) to ISO UTC. */
function localInputToIso(local: string): string {
  const date = new Date(local + ":00Z");
  if (isNaN(date.getTime())) return new Date(local).toISOString();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  let offsetMinutes = 0;
  if (match) {
    const sign = match[1] === "+" ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = match[3] ? parseInt(match[3], 10) : 0;
    offsetMinutes = sign * (hours * 60 + minutes);
  }
  return new Date(date.getTime() - offsetMinutes * 60000).toISOString();
}

function SectionCard({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-black/10 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-black">{title}</h3>
          {description && (
            <p className="text-xs text-black/50 mt-0.5">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ==================================================================
// 1. DETAILS — editable form for event title, dates, venue, etc.
// ==================================================================

function DetailsSection({ event }: { event: AdminEventRow }) {
  const [form, setForm] = React.useState({
    title: event.title,
    subtitle: event.subtitle || "",
    chapter: event.chapter,
    slug: event.slug,
    startsAt: isoToLocalInput(event.startsAt),
    endsAt: isoToLocalInput(event.endsAt),
    venue: event.venue || "",
    address: event.address || "",
    city: event.city || "",
    country: event.country || "",
    mapUrl: event.mapUrl || "",
    description: event.description || "",
    takeaways: event.takeaways || "",
    intendedFor: event.intendedFor || "",
    rsvpUrl: event.rsvpUrl || "",
  });
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  // If the parent re-renders with a fresh event (e.g. after re-fetching
  // the events list), reset the form to match — but only when the user
  // hasn't started editing.
  React.useEffect(() => {
    if (!dirty) {
      setForm({
        title: event.title,
        subtitle: event.subtitle || "",
        chapter: event.chapter,
        slug: event.slug,
        startsAt: isoToLocalInput(event.startsAt),
        endsAt: isoToLocalInput(event.endsAt),
        venue: event.venue || "",
        address: event.address || "",
        city: event.city || "",
        country: event.country || "",
        mapUrl: event.mapUrl || "",
        description: event.description || "",
        takeaways: event.takeaways || "",
        intendedFor: event.intendedFor || "",
        rsvpUrl: event.rsvpUrl || "",
      });
    }
  }, [event, dirty]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.startsAt || !form.endsAt) {
      toast.error("Start and end times are required");
      return;
    }
    setSaving(true);
    const t = toast.loading("Saving event details…");
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          subtitle: form.subtitle.trim() || null,
          chapter: form.chapter.trim() || "Tel Aviv",
          slug: form.slug.trim() || null,
          startsAt: localInputToIso(form.startsAt),
          endsAt: localInputToIso(form.endsAt),
          venue: form.venue.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          mapUrl: form.mapUrl.trim() || null,
          description: form.description.trim() || null,
          takeaways: form.takeaways.trim() || null,
          intendedFor: form.intendedFor.trim() || null,
          rsvpUrl: form.rsvpUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      toast.success("Event details saved", { id: t });
      setDirty(false);
    } catch (e) {
      toast.error((e as Error).message || "Save failed", { id: t });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Event details"
      description="Edit the event's title, dates, venue, and content. Changes go live immediately on the public event page."
      actions={
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#FF005A]/90 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Title *" full>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Subtitle" full>
          <input
            type="text"
            value={form.subtitle}
            onChange={(e) => update("subtitle", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Chapter">
          <input
            type="text"
            value={form.chapter}
            onChange={(e) => update("chapter", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Slug (URL)">
          <input
            type="text"
            value={form.slug}
            onChange={(e) => update("slug", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Starts at *">
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => update("startsAt", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Ends at *">
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => update("endsAt", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Venue name">
          <input
            type="text"
            value={form.venue}
            onChange={(e) => update("venue", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Address">
          <input
            type="text"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="City">
          <input
            type="text"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Country (ISO code)">
          <input
            type="text"
            value={form.country}
            onChange={(e) => update("country", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Map URL" full>
          <input
            type="url"
            value={form.mapUrl}
            onChange={(e) => update("mapUrl", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="Description / about" full>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="What you'll take home" full>
          <textarea
            rows={2}
            value={form.takeaways}
            onChange={(e) => update("takeaways", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="This event is built for" full>
          <textarea
            rows={2}
            value={form.intendedFor}
            onChange={(e) => update("intendedFor", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
        <Field label="External RSVP URL" full>
          <input
            type="url"
            value={form.rsvpUrl}
            onChange={(e) => update("rsvpUrl", e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </Field>
      </div>
    </SectionCard>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-semibold text-black/80 mb-1">{label}</span>
      {children}
    </label>
  );
}

// ==================================================================
// 2. AGENDA / SESSIONS — reuses the existing <AdminAgendaTab> component
// ==================================================================

function AgendaSection({ event }: { event: AdminEventRow }) {
  // The AdminAgendaTab component expects a `speakers` field on the
  // event (used as a fallback if the global speakers fetch fails).
  // We pass an empty array — the component fetches the global speakers
  // database itself on mount, which is the source of truth.
  const eventForAgenda = React.useMemo(
    () => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      speakers: [],
    }),
    [event]
  );

  return (
    <SectionCard
      title="Sessions & agenda"
      description="Add talks, fast pitch sessions, breaks, and other agenda items. Each item can have a linked speaker and an attached presentation file."
    >
      <AdminAgendaTab event={eventForAgenda} onAgendaChanged={() => {}} />
    </SectionCard>
  );
}

// ==================================================================
// 3. SPEAKERS — list, add, edit, delete speakers for this event
// ==================================================================

type SpeakerRow = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  topic: string | null;
  photoUrl: string | null;
  contactEmail: string | null;
  order: number;
};

function SpeakersSection({ event }: { event: AdminEventRow }) {
  const [speakers, setSpeakers] = React.useState<SpeakerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/speakers", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      // The /api/admin/speakers response returns ALL speakers across ALL
      // events, each with an `event` relation. Filter to just this event.
      const filtered: SpeakerRow[] = (data.speakers || [])
        .filter((s: any) => s.event?.id === event.id)
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          role: s.role ?? null,
          company: s.company ?? null,
          bio: s.bio ?? null,
          topic: s.topic ?? null,
          photoUrl: s.photoUrl ?? null,
          contactEmail: s.contactEmail ?? null,
          order: s.order ?? 0,
        }));
      filtered.sort((a, b) => a.order - b.order);
      setSpeakers(filtered);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load speakers");
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(s: SpeakerRow) {
    if (!confirm(`Remove ${s.name} from this event?`)) return;
    const t = toast.loading("Removing speaker…");
    try {
      const res = await fetch(`/api/admin/speakers/${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Removed", { id: t });
      await load();
    } catch (e) {
      toast.error("Remove failed", { id: t });
    }
  }

  return (
    <SectionCard
      title="Speakers"
      description="Speakers attached to this event. Add new ones, edit their bio / topic, link them to platform user accounts (enables in-app chat), or remove them."
      actions={
        <>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5"
            title="Reload"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#FF005A]/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Add speaker
          </button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-black/5 animate-pulse rounded-md" />
          ))}
        </div>
      ) : speakers.length === 0 ? (
        <div className="text-center py-8 text-sm text-black/80">
          <Mic2 className="h-8 w-8 mx-auto text-black/30 mb-2" />
          No speakers attached to this event yet. Click &ldquo;Add speaker&rdquo; to add the first one.
        </div>
      ) : (
        <div className="space-y-2">
          {speakers.map((s) => (
            <SpeakerRowItem key={s.id} speaker={s} onSaved={load} onDeleted={() => handleDelete(s)} />
          ))}
        </div>
      )}

      {addOpen && (
        <AddSpeakerDialog
          eventId={event.id}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}
    </SectionCard>
  );
}

function SpeakerRowItem({
  speaker,
  onSaved,
  onDeleted,
}: {
  speaker: SpeakerRow;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({
    name: speaker.name,
    role: speaker.role || "",
    company: speaker.company || "",
    bio: speaker.bio || "",
    topic: speaker.topic || "",
    contactEmail: speaker.contactEmail || "",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setForm({
      name: speaker.name,
      role: speaker.role || "",
      company: speaker.company || "",
      bio: speaker.bio || "",
      topic: speaker.topic || "",
      contactEmail: speaker.contactEmail || "",
    });
  }, [speaker]);

  async function handleSave() {
    setSaving(true);
    const t = toast.loading("Saving…");
    try {
      const res = await fetch(`/api/admin/speakers/${speaker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role.trim() || null,
          company: form.company.trim() || null,
          bio: form.bio.trim() || null,
          topic: form.topic.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Failed");
      }
      toast.success("Saved", { id: t });
      setEditing(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Save failed", { id: t });
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-black/10 p-3 bg-white">
        {speaker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={speaker.photoUrl}
            alt={speaker.name}
            className="h-10 w-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-[#FF005A]/10 text-[#FF005A] font-bold flex items-center justify-center flex-shrink-0">
            {speaker.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-black text-sm">{speaker.name}</div>
          {(speaker.role || speaker.company) && (
            <div className="text-xs text-black/50">
              {[speaker.role, speaker.company].filter(Boolean).join(" · ")}
            </div>
          )}
          {speaker.topic && (
            <div className="text-xs text-black/70 mt-0.5 italic">&ldquo;{speaker.topic}&rdquo;</div>
          )}
          {speaker.bio && (
            <div className="text-xs text-black/50 mt-1 line-clamp-2">{speaker.bio}</div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-1.5 text-black/50 hover:bg-black/5 hover:text-black/80"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDeleted}
            className="rounded-md p-1.5 text-red-500/70 hover:bg-red-500/10 hover:text-red-600"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Name *"
          className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
        />
        <input
          type="text"
          value={form.contactEmail}
          onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
          placeholder="Contact email (auto-links to platform user)"
          className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
        />
        <input
          type="text"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          placeholder="Role (e.g. CEO, Acme)"
          className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
        />
        <input
          type="text"
          value={form.company}
          onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
          placeholder="Company"
          className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
        />
        <input
          type="text"
          value={form.topic}
          onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
          placeholder="Talk title / topic"
          className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40 sm:col-span-2"
        />
        <textarea
          rows={3}
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          placeholder="Bio"
          className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40 sm:col-span-2"
        />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#FF005A]/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddSpeakerDialog({
  eventId,
  onClose,
  onCreated,
}: {
  eventId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState({
    name: "",
    role: "",
    company: "",
    bio: "",
    topic: "",
    contactEmail: "",
  });
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const t = toast.loading("Adding speaker…");
    try {
      const res = await fetch("/api/admin/speakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          name: form.name.trim(),
          role: form.role.trim() || null,
          company: form.company.trim() || null,
          bio: form.bio.trim() || null,
          topic: form.topic.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Failed");
      }
      toast.success("Speaker added", { id: t });
      onCreated();
    } catch (e) {
      toast.error((e as Error).message || "Add failed", { id: t });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/10">
          <h3 className="text-sm font-bold text-black">Add speaker to this event</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-black/50 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Name *"
              className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              placeholder="Contact email (auto-links to platform user)"
              className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
            <input
              type="text"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="Role"
              className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
            <input
              type="text"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              placeholder="Company"
              className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
            <input
              type="text"
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              placeholder="Talk title / topic"
              className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40 sm:col-span-2"
            />
            <textarea
              rows={3}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="Bio"
              className="rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40 sm:col-span-2"
            />
          </div>
          <div className="flex items-center gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold text-black/70 hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#FF005A]/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add speaker
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================================================================
// 4. PRESENTATIONS — list + upload + delete presentation files
// ==================================================================

type PresentationRow = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  title: string | null;
  description: string | null;
  fileSize: number;
  createdAt: string;
  uploader: { name: string | null; email: string } | null;
  speakers: Array<{ id: string; name: string; role: string | null; company: string | null }>;
  agendaItem: {
    id: string;
    title: string;
    startsAt: string;
    type: string;
  } | null;
};

function PresentationsSection({ event }: { event: AdminEventRow }) {
  const [files, setFiles] = React.useState<PresentationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${event.slug}/presentations`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFiles(
        (data.presentations || []).map((p: any) => ({
          id: p.id,
          fileName: p.fileName,
          fileUrl: p.fileUrl,
          mimeType: p.mimeType,
          title: p.title ?? null,
          description: p.description ?? null,
          fileSize: p.fileSize ?? 0,
          createdAt: p.createdAt,
          uploader: p.uploader
            ? { name: p.uploader.name ?? null, email: p.uploader.email }
            : null,
          speakers: (p.speakers || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            role: s.role ?? null,
            company: s.company ?? null,
          })),
          agendaItem: p.agendaItem
            ? {
                id: p.agendaItem.id,
                title: p.agendaItem.title,
                startsAt: p.agendaItem.startsAt,
                type: p.agendaItem.type,
              }
            : null,
        }))
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to load presentations");
    } finally {
      setLoading(false);
    }
  }, [event.slug]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const t = toast.loading(`Uploading ${fileList.length} file(s)…`);
    try {
      const fd = new FormData();
      for (const f of Array.from(fileList)) fd.append("files", f);
      const res = await fetch(`/api/events/${event.slug}/presentations`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      toast.success(`Uploaded ${data.count} file(s)`, { id: t });
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Upload failed", { id: t });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(file: PresentationRow) {
    if (!confirm(`Delete "${file.fileName}"? This removes the file from Vercel Blob storage.`)) return;
    const t = toast.loading("Deleting…");
    try {
      const res = await fetch(`/api/presentations/${file.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Deleted", { id: t });
      await load();
    } catch (e) {
      toast.error("Delete failed", { id: t });
    }
  }

  return (
    <SectionCard
      title="Presentations & files"
      description="Slide decks, handouts, and other documents uploaded for this event. Linked to speakers and/or agenda items when applicable."
      actions={
        <>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5"
            title="Reload"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#FF005A]/90 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.ppt,.pptx,.key,.odp,.doc,.docx,.odt,.txt,.md,.csv,.rtf,.jpg,.jpeg,.png,.webp,.gif"
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
        </>
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-black/5 animate-pulse rounded-md" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 text-sm text-black/80">
          <FileText className="h-8 w-8 mx-auto text-black/30 mb-2" />
          No presentation files uploaded yet. Click &ldquo;Upload&rdquo; to add the first one.
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-md border border-black/10 p-3 bg-white"
            >
              <div className="h-9 w-9 rounded-md bg-[#FF005A]/10 text-[#FF005A] flex items-center justify-center flex-shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-black text-sm line-clamp-1">
                  {f.title || f.fileName}
                </div>
                <div className="text-xs text-black/50 line-clamp-1">
                  {f.fileName} · {formatBytes(f.fileSize)}
                  {f.uploader && ` · by ${f.uploader.name || f.uploader.email}`}
                </div>
                {f.agendaItem && (
                  <div className="text-[0.7rem] text-[#007E72] mt-0.5">
                    Linked to: {f.agendaItem.title}
                  </div>
                )}
                {f.speakers.length > 0 && (
                  <div className="text-[0.7rem] text-black/50 mt-0.5">
                    Speakers: {f.speakers.map((s) => s.name).join(", ")}
                  </div>
                )}
              </div>
              <a
                href={f.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1.5 text-black/50 hover:bg-black/5 hover:text-black/80"
                title="Open"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => handleDelete(f)}
                className="rounded-md p-1.5 text-red-500/70 hover:bg-red-500/10 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ==================================================================
// 5. CO-HOSTS — pick from members, add/remove EventCoHost rows
// ==================================================================

type CoHostRow = {
  id: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    photoUrl: string | null;
    image: string | null;
  };
  adder: { id: string; email: string; name: string | null } | null;
};

function CoHostsSection({
  event,
  members,
}: {
  event: AdminEventRow;
  members: AdminMemberRow[];
}) {
  const [cohosts, setCohosts] = React.useState<CoHostRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showPicker, setShowPicker] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/cohosts`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCohosts(data.cohosts || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load co-hosts");
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const existingIds = React.useMemo(
    () => new Set(cohosts.map((c) => c.user.id)),
    [cohosts]
  );

  const filteredMembers = React.useMemo(() => {
    return members.filter((m) => {
      const matchesSearch =
        !search.trim() ||
        (m.email || "").toLowerCase().includes(search.toLowerCase()) ||
        (m.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (m.company || "").toLowerCase().includes(search.toLowerCase());
      const notAlready = !existingIds.has(m.id);
      return matchesSearch && notAlready;
    });
  }, [members, search, existingIds]);

  async function handleAdd(userId: string) {
    const t = toast.loading("Adding co-host…");
    try {
      const res = await fetch(`/api/admin/events/${event.id}/cohosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Failed");
      }
      toast.success("Co-host added — they can now see the Manage Agenda tab on the event page", {
        id: t,
        duration: 5000,
      });
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Add failed", { id: t });
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} as a co-host of this event?`)) return;
    const t = toast.loading("Removing…");
    try {
      const res = await fetch(
        `/api/admin/events/${event.id}/cohosts/${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed");
      toast.success("Removed", { id: t });
      await load();
    } catch (e) {
      toast.error("Remove failed", { id: t });
    }
  }

  return (
    <SectionCard
      title="Co-hosts"
      description="Pick platform members to grant them admin-style access to this event's agenda, speakers, and presentations. Co-hosts see the “Manage Agenda” tab on the event page. They cannot manage other events."
      actions={
        <>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5"
            title="Reload"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#FF005A]/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Add co-host
          </button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 bg-black/5 animate-pulse rounded-md" />
          ))}
        </div>
      ) : cohosts.length === 0 ? (
        <div className="text-center py-8 text-sm text-black/80">
          <Users className="h-8 w-8 mx-auto text-black/30 mb-2" />
          No co-hosts assigned yet. Click &ldquo;Add co-host&rdquo; to grant a member admin-style access to this event.
        </div>
      ) : (
        <div className="space-y-2">
          {cohosts.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-black/10 p-3 bg-white"
            >
              <Avatar user={c.user} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-black text-sm">
                  {c.user.name || c.user.email}
                  {c.user.role === "ADMIN" && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-[#FF005A]/10 text-[#FF005A] px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider">
                      Admin
                    </span>
                  )}
                </div>
                <div className="text-xs text-black/50">{c.user.email}</div>
                {c.adder && (
                  <div className="text-[0.7rem] text-black/80 mt-0.5">
                    Added by {c.adder.name || c.adder.email}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(c.user.id, c.user.name || c.user.email)}
                className="rounded-md p-1.5 text-red-500/70 hover:bg-red-500/10 hover:text-red-600"
                title="Remove as co-host"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showPicker && (
        <CoHostPicker
          members={filteredMembers}
          search={search}
          onSearch={setSearch}
          onClose={() => setShowPicker(false)}
          onPick={(userId) => {
            handleAdd(userId);
          }}
        />
      )}
    </SectionCard>
  );
}

function Avatar({
  user,
}: {
  user: {
    photoUrl: string | null;
    image: string | null;
    name: string | null;
    email: string;
  };
}) {
  const src = user.photoUrl || user.image;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={user.name || user.email}
        className="h-9 w-9 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="h-9 w-9 rounded-full bg-[#00E6FF]/20 text-[#007E72] font-bold flex items-center justify-center flex-shrink-0 text-sm">
      {(user.name || user.email).charAt(0).toUpperCase()}
    </div>
  );
}

function CoHostPicker({
  members,
  search,
  onSearch,
  onClose,
  onPick,
}: {
  members: AdminMemberRow[];
  search: string;
  onSearch: (s: string) => void;
  onClose: () => void;
  onPick: (userId: string) => void;
}) {
  const [picking, setPicking] = React.useState<string | null>(null);

  async function handlePick(m: AdminMemberRow) {
    setPicking(m.id);
    // Wait for the parent's onPick → POST → toast; we just close after
    // a short delay so the user sees the row flash before the dialog
    // closes. The actual add happens in the parent.
    onPick(m.id);
    setTimeout(() => {
      setPicking(null);
      onClose();
    }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/10">
          <h3 className="text-sm font-bold text-black">Pick a member to add as co-host</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-black/50 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 border-b border-black/10">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black/80" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search by name, email, or company…"
              autoFocus
              className="w-full rounded-md border border-black/15 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
          </div>
        </div>
        <div className="overflow-auto flex-1 p-3">
          {members.length === 0 ? (
            <div className="text-center py-10 text-sm text-black/50">
              {search
                ? "No matching members."
                : "All members are already co-hosts of this event."}
            </div>
          ) : (
            <div className="space-y-1">
              {members.slice(0, 100).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handlePick(m)}
                  disabled={picking !== null}
                  className="w-full flex items-center gap-3 rounded-md p-2 text-left hover:bg-black/5 disabled:opacity-50"
                >
                  <Avatar user={m} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-black text-sm">
                      {m.name || m.email}
                    </div>
                    <div className="text-xs text-black/50">
                      {m.email}
                      {m.company && ` · ${m.company}`}
                    </div>
                  </div>
                  {picking === m.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#FF005A]" />
                  ) : (
                    <div className="inline-flex items-center gap-1 rounded-md bg-[#FF005A]/10 px-2 py-1 text-xs font-semibold text-[#FF005A]">
                      <Plus className="h-3 w-3" />
                      Add
                    </div>
                  )}
                </button>
              ))}
              {members.length > 100 && (
                <p className="text-center text-xs text-black/80 py-3">
                  Showing first 100 matches — narrow your search to see more.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================================================================
// 6. REGISTRATIONS — list of RSVPs + check-in codes for door staff
// ==================================================================

type RsvpRow = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  source: string;
  checkInCode: string | null;
  checkedInAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    company: string | null;
    photoUrl: string | null;
    image: string | null;
  } | null;
};

function RegistrationsSection({ event }: { event: AdminEventRow }) {
  const [rsvps, setRsvps] = React.useState<RsvpRow[]>([]);
  const [summary, setSummary] = React.useState({ total: 0, checkedIn: 0, pending: 0 });
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "checkedIn" | "pending">("all");
  const [search, setSearch] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/rsvps`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setRsvps(data.rsvps || []);
      setSummary(data.summary || { total: 0, checkedIn: 0, pending: 0 });
    } catch (e) {
      console.error(e);
      toast.error("Failed to load registrations");
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    return rsvps.filter((r) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "checkedIn"
            ? !!r.checkInCode
            : !r.checkInCode;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.name || "").toLowerCase().includes(q) ||
        (r.checkInCode || "").toLowerCase().includes(q) ||
        (r.user?.company || "").toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [rsvps, filter, search]);

  function exportCsv() {
    const rows = [
      ["Name", "Email", "Company", "Status", "Source", "Check-in code", "Checked in at", "Registered at"],
      ...filtered.map((r) => [
        r.name || r.user?.name || "",
        r.email,
        r.user?.company || "",
        r.status,
        r.source,
        r.checkInCode || "",
        r.checkedInAt ? fmt(r.checkedInAt, { dateStyle: "short", timeStyle: "short" }) : "",
        fmt(r.createdAt, { dateStyle: "short", timeStyle: "short" }),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${event.slug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <SectionCard
      title="Registrations & Check-ins"
      description="Everyone who registered via the public event page (/e/[slug]) is listed here. Check-in codes are shown for attendees who clicked “I'm here” on the day of the event — door staff can verify these at entry."
      actions={
        <>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rsvps.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5 disabled:opacity-40"
            title="Export CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5"
            title="Reload"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </>
      }
    >
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard label="Registered" value={summary.total} color="#FF005A" icon={<Ticket className="h-4 w-4" />} />
        <StatCard label="Checked in" value={summary.checkedIn} color="#007E72" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Pending" value={summary.pending} color="#004F98" icon={<Clock className="h-4 w-4" />} />
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 p-1 bg-black/5 rounded-md">
          {(["all", "checkedIn", "pending"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                filter === f ? "bg-white text-black shadow-sm" : "text-black/80 hover:text-black"
              }`}
            >
              {f === "all" ? "All" : f === "checkedIn" ? "Checked in" : "Pending"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black/80" />
          <input
            type="search"
            placeholder="Search by name, email, code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-black/15 bg-white pl-8 pr-3 py-1.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-black/80">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-black/80">
          <Ticket className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            {rsvps.length === 0
              ? "No registrations yet. Share the public event link to start collecting RSVPs."
              : "No registrations match your filter."}
          </p>
          {rsvps.length === 0 && (
            <a
              href={`/e/${event.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-[#FF005A] hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open public event page
            </a>
          )}
        </div>
      ) : (
        <div className="border border-black/10 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-black/80 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Attendee</th>
                <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Email</th>
                <th className="text-left px-3 py-2 font-semibold">Check-in code</th>
                <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.02]">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-black/5 flex-shrink-0 flex items-center justify-center text-xs font-bold text-black/50">
                        {r.user?.photoUrl || r.user?.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.user.photoUrl || r.user.image || ""}
                            alt={r.name || ""}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          (r.name || r.email).charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-black text-sm truncate">
                          {r.name || r.user?.name || r.email.split("@")[0]}
                        </div>
                        {r.user?.company && (
                          <div className="text-xs text-black/50 truncate">{r.user.company}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-black/80 hidden sm:table-cell font-mono">
                    {r.email}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.checkInCode ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#007E72]/10 px-2 py-1 text-xs font-mono font-bold text-[#007E72]">
                          <CheckCircle2 className="h-3 w-3" />
                          {r.checkInCode}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-black/30">— not checked in —</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-black/50 hidden md:table-cell">
                    {r.checkedInAt ? (
                      <div>
                        <div>Checked in</div>
                        <div className="font-mono">{fmt(r.checkedInAt, { dateStyle: "short", timeStyle: "short" })}</div>
                      </div>
                    ) : (
                      <div>
                        <div>Registered</div>
                        <div className="font-mono">{fmt(r.createdAt, { dateStyle: "short", timeStyle: "short" })}</div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Public link share box */}
      <div className="mt-5 rounded-md border border-[#00E6FF]/30 bg-[#00E6FF]/5 p-4 flex items-start gap-3">
        <ExternalLink className="h-4 w-4 text-[#007E72] flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-black mb-1">Public event page</div>
          <p className="text-xs text-black/80 mb-2">
            Share this link with your community. Anyone who visits can register; on the day of the event,
            they&apos;ll see a second button to check in and get their unique entry code.
          </p>
          <a
            href={`/e/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-[#004F98] hover:underline"
          >
            {`/e/${event.slug}`}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </SectionCard>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <div className="flex items-center gap-2 mb-1" style={{ color }}>
        {icon}
        <span className="text-[0.65rem] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-extrabold text-black">{value}</div>
    </div>
  );
}
