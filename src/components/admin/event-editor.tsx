"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Trash2,
  ExternalLink,
  UserMinus,
  Loader2,
  Users,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Mic,
  Plus,
  Pencil,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CoHostPicker, type MemberSearchResult } from "./co-host-picker";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CoHost = {
  id: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    photoUrl: string | null;
    company: string | null;
    role: string;
  };
  adder?: { id: string; name: string | null; email: string } | null;
};

/**
 * Speaker row scoped to a single event. Mirrors the Speaker type used in
 * /admin/speakers/speakers-tab-client.tsx but trimmed to just the fields
 * the EventEditor needs to render the roster + edit dialog.
 */
export type EventSpeaker = {
  id: string;
  eventId: string;
  name: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  topic: string | null;
  photoUrl: string | null;
  contactEmail: string | null;
  userId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; name: string | null } | null;
  _count: { images: number; presentations: number; messages: number };
};

export type EventForEditor = {
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
  coHosts: CoHost[];
  speakers: EventSpeaker[];
  _count: {
    images: number;
    speakers: number;
    agenda: number;
    rsvps: number;
    rsvpsGoing: number;
    checkedIn: number;
  };
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert an ISO date string to a `datetime-local` input value
 * ("YYYY-MM-DDTHH:mm") interpreted in the EVENT's timezone
 * (Asia/Jerusalem for the Tel Aviv chapter), NOT the browser's
 * local timezone.
 *
 * IMPORTANT — why we hard-code Asia/Jerusalem instead of using
 * the browser's local time:
 *   The admin form must always show the wall-clock time that the
 *   event happens at IN THE EVENT'S CITY. If we used browser-local
 *   time, an admin on a UTC server (or a VPN, or travelling) would
 *   see the wrong pre-filled value, save it back, and silently
 *   shift every event by hours. The mockups (speaker-intro /
 *   agenda-profile / meet-the-speaker) all hard-code Asia/Jerusalem
 *   for the same reason — this function keeps the source form
 *   consistent with them.
 *
 * Mirrors `toLocalDatetimeInput` in admin-agenda-tab.tsx so the
 * event start/end times and the agenda item times use the same
 * conversion. Without this, an admin could save an event start of
 * 18:00 IDT (15:00 UTC) but then see the agenda tab pre-fill
 * 18:00 IDT while the event details tab pre-fills 15:00 — leading
 * to the "3 hours ahead" mockup bug the user reported.
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
 * Convert a `datetime-local` input value ("YYYY-MM-DDTHH:mm")
 * interpreted in the EVENT's timezone (Asia/Jerusalem) back to a
 * UTC ISO string for storage.
 *
 * Mirrors `fromLocalDatetimeInput` in admin-agenda-tab.tsx so the
 * round-trip is symmetric. We compute the Asia/Jerusalem offset
 * (UTC+2 IST / UTC+3 IDT) at the given wall-clock date and subtract
 * it to get UTC.
 */
function localInputToUtcIso(local: string): string {
  if (!local) return new Date(0).toISOString();
  // Treat the wall-clock string as UTC first to get a stable Date obj.
  const asIfUtc = new Date(local + ":00Z");
  if (isNaN(asIfUtc.getTime())) {
    // Fallback: let the server interpret as UTC.
    return new Date(local).toISOString();
  }
  // Ask Intl for Asia/Jerusalem's offset on this date.
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
  // Wall-clock IDT 15:00 = UTC 12:00 (subtract +3h offset).
  const utc = new Date(asIfUtc.getTime() - offsetMinutes * 60000);
  return utc.toISOString();
}

/* ------------------------------------------------------------------ */
/*  Field                                                              */
/* ------------------------------------------------------------------ */

function Field({
  label,
  full,
  children,
  hint,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-semibold text-black/60 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[0.65rem] text-black/40 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-[#FF005A] focus:outline-none focus:ring-1 focus:ring-[#FF005A]/30";

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function EventEditor({
  event,
  canDelete = false,
  canManageCoHosts = false,
  canManageSpeakers = false,
  showBackButton = true,
  backHref = "/admin/events",
}: {
  event: EventForEditor;
  canDelete?: boolean;
  /** Whether the current viewer can add/remove co-hosts (Admin+ only). */
  canManageCoHosts?: boolean;
  /** Whether the current viewer can add/remove/edit speakers (Admin+ or
   *  CO_HOST of this event). Server enforces requireEventSpeakersEdit. */
  canManageSpeakers?: boolean;
  showBackButton?: boolean;
  backHref?: string;
}) {
  const router = useRouter();

  // ---- form state ----
  const [title, setTitle] = React.useState(event.title);
  const [subtitle, setSubtitle] = React.useState(event.subtitle || "");
  const [chapter, setChapter] = React.useState(event.chapter);
  const [slug, setSlug] = React.useState(event.slug);
  const [startsAt, setStartsAt] = React.useState(isoToLocalInput(event.startsAt));
  const [endsAt, setEndsAt] = React.useState(isoToLocalInput(event.endsAt));
  const [venue, setVenue] = React.useState(event.venue || "");
  const [address, setAddress] = React.useState(event.address || "");
  const [city, setCity] = React.useState(event.city || "");
  const [country, setCountry] = React.useState(event.country || "");
  const [mapUrl, setMapUrl] = React.useState(event.mapUrl || "");
  const [wazeUrl, setWazeUrl] = React.useState(event.wazeUrl || "");
  const [description, setDescription] = React.useState(event.description || "");
  const [takeaways, setTakeaways] = React.useState(event.takeaways || "");
  const [intendedFor, setIntendedFor] = React.useState(event.intendedFor || "");
  const [rsvpUrl, setRsvpUrl] = React.useState(event.rsvpUrl || "");

  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function handleSave() {
    if (!title.trim() || !startsAt || !endsAt) {
      toast.error("Title, start time, and end time are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          chapter: chapter.trim() || "Tel Aviv",
          slug: slug.trim() || undefined,
          startsAt: localInputToUtcIso(startsAt),
          endsAt: localInputToUtcIso(endsAt),
          venue: venue.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          mapUrl: mapUrl.trim() || null,
          wazeUrl: wazeUrl.trim() || null,
          description: description.trim() || null,
          takeaways: takeaways.trim() || null,
          intendedFor: intendedFor.trim() || null,
          rsvpUrl: rsvpUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Save failed" }));
        toast.error(data.error || "Save failed");
        return;
      }
      toast.success("Event updated");
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${event.title}"? This cannot be undone. All RSVPs, agenda items, speakers, images, and presentations attached to this event will be deleted.`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Delete failed" }));
        toast.error(data.error || "Delete failed");
        return;
      }
      toast.success("Event deleted");
      router.push("/admin/events");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {showBackButton && (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-xs font-semibold text-black/50 hover:text-black mb-2"
            >
              <ArrowLeft className="h-3 w-3" /> Back to events
            </Link>
          )}
          <h1 className="text-2xl font-extrabold text-black leading-tight">
            Edit event
          </h1>
          <p className="text-sm text-black/50 mt-1">
            {event.title} · <code className="text-[0.7rem] bg-black/5 px-1 py-0.5 rounded">{event.slug}</code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/events/${event.slug}`} target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> View event page
            </Button>
          </Link>
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5 bg-[#FF005A] hover:bg-[#D8004D] text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="RSVPs" value={event._count.rsvps} icon={<Users className="h-3.5 w-3.5" />} />
        <StatCard label="Going" value={event._count.rsvpsGoing} icon={<CheckCircle2 className="h-3.5 w-3.5" />} accent="green" />
        <StatCard label="Checked in" value={event._count.checkedIn} icon={<Ticket className="h-3.5 w-3.5" />} accent="pink" />
        <StatCard label="Speakers" value={event._count.speakers} icon={<Users className="h-3.5 w-3.5" />} />
        <StatCard label="Agenda items" value={event._count.agenda} icon={<Users className="h-3.5 w-3.5" />} />
        <StatCard label="Co-hosts" value={event.coHosts.length} icon={<Users className="h-3.5 w-3.5" />} />
      </div>

      {/* Edit form */}
      <Card className="p-6 bg-white border border-black/10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#FF005A] mb-4">
          Event details
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Event title *" full>
            <Input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Subtitle" full>
            <Input className={inputCls} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="One-line hook shown under the title" />
          </Field>
          <Field label="Chapter">
            <Input className={inputCls} value={chapter} onChange={(e) => setChapter(e.target.value)} />
          </Field>
          <Field label="Slug" hint="URL-safe identifier. Leave unchanged unless necessary — old links will break.">
            <Input className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} />
          </Field>
          <Field label="Starts at *">
            <Input type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends at *">
            <Input type="datetime-local" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
          <Field label="Venue name">
            <Input className={inputCls} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. The Stage" />
          </Field>
          <Field label="Address">
            <Input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="City">
            <Input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Country (ISO code)">
            <Input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="ISR" />
          </Field>
          <Field label="Map URL" full>
            <Input className={inputCls} value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} placeholder="https://maps.google.com/…" />
          </Field>
          <Field label="Waze URL" full hint="Waze deep-link or search URL (e.g. https://waze.com/ul?q=…)">
            <Input className={inputCls} value={wazeUrl} onChange={(e) => setWazeUrl(e.target.value)} placeholder="https://waze.com/ul?q=…" />
          </Field>
          <Field label="Description / about" full>
            <Textarea className={inputCls + " min-h-[120px]"} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Long-form description of the event" />
          </Field>
          <Field label="What you'll take home" full hint="One bullet per line (use -, *, or •)">
            <Textarea className={inputCls + " min-h-[80px]"} value={takeaways} onChange={(e) => setTakeaways(e.target.value)} />
          </Field>
          <Field label="This event is built for" full>
            <Textarea className={inputCls + " min-h-[60px]"} value={intendedFor} onChange={(e) => setIntendedFor(e.target.value)} placeholder="e.g. AI engineers, founders, product builders" />
          </Field>
          <Field label="External RSVP URL" full hint="Leave blank to use the in-app RSVP + check-in flow">
            <Input className={inputCls} value={rsvpUrl} onChange={(e) => setRsvpUrl(e.target.value)} placeholder="https://lu.ma/… (optional)" />
          </Field>
        </div>
      </Card>

      {/* Co-hosts manager */}
      <CoHostsManager eventId={event.id} initialCoHosts={event.coHosts} canManage={canManageCoHosts} />

      {/* Speakers manager — Super Admin / Admin / CO_HOST of this event */}
      <SpeakersManager
        eventId={event.id}
        eventSlug={event.slug}
        initialSpeakers={event.speakers}
        canManage={canManageSpeakers}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StatCard                                                           */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: "pink" | "green";
}) {
  const accentCls =
    accent === "pink"
      ? "text-[#FF005A]"
      : accent === "green"
      ? "text-[#007E72]"
      : "text-black/70";
  return (
    <Card className="p-3 border border-black/10 bg-white">
      <div className="flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-black/40">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-extrabold leading-none mt-1 ${accentCls}`}>
        {value}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  CoHostsManager                                                     */
/* ------------------------------------------------------------------ */

function CoHostsManager({
  eventId,
  initialCoHosts,
  canManage,
}: {
  eventId: string;
  initialCoHosts: CoHost[];
  canManage: boolean;
}) {
  const [coHosts, setCoHosts] = React.useState<CoHost[]>(initialCoHosts);
  const [adding, setAdding] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  async function handleAddByUserId(user: MemberSearchResult) {
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/co-hosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json().catch(() => ({ error: "Add failed" }));
      if (!res.ok) {
        toast.error(data.error || "Add failed");
        return;
      }
      toast.success(`${data.coHost.user.name || data.coHost.user.email} added as co-host`);
      setCoHosts((cur) => [...cur, data.coHost]);
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setAdding(false);
    }
  }

  async function handleAddByEmail(email: string) {
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/co-hosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({ error: "Add failed" }));
      if (!res.ok) {
        toast.error(data.error || "Add failed");
        return;
      }
      toast.success(`${data.coHost.user.name || data.coHost.user.email} added as co-host`);
      setCoHosts((cur) => [...cur, data.coHost]);
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} as a co-host of this event?`)) return;
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/co-hosts/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Remove failed" }));
        toast.error(data.error || "Remove failed");
        return;
      }
      toast.success("Co-host removed");
      setCoHosts((cur) => cur.filter((c) => c.user.id !== userId));
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card className="p-6 bg-white border border-black/10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#007E72]">
            <Users className="h-4 w-4" /> Co-hosts
          </h2>
          <p className="text-xs text-black/50 mt-1">
            Collaborators who can manage this event&apos;s agenda, speakers, images, and presentations.
          </p>
        </div>
        <Badge variant="outline" className="text-[0.65rem]">
          {coHosts.length} {coHosts.length === 1 ? "co-host" : "co-hosts"}
        </Badge>
      </div>

      {/* Add co-host */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-black/5">
          <CoHostPicker
            eventId={eventId}
            onPick={handleAddByUserId}
            onPickByEmail={handleAddByEmail}
            disabled={adding}
          />
          {adding && (
            <span className="inline-flex items-center gap-1.5 text-xs text-black/50">
              <Loader2 className="h-3 w-3 animate-spin" /> Adding…
            </span>
          )}
        </div>
      )}

      {/* Co-hosts list */}
      {coHosts.length === 0 ? (
        <div className="text-sm text-black/50 italic py-6 text-center">
          <AlertCircle className="h-5 w-5 mx-auto mb-2 text-black/30" />
          No co-hosts yet. Search for a member above to add one.
        </div>
      ) : (
        <ul className="space-y-2">
          {coHosts.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 p-3 rounded-md border border-black/10 bg-white hover:border-black/20 transition-colors"
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-black/5 flex-shrink-0">
                {(c.user.photoUrl || c.user.image) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.user.photoUrl || c.user.image || ""}
                    alt={c.user.name || c.user.email}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-black">
                  {c.user.name || "(no name)"}
                </div>
                <div className="text-xs text-black/50 truncate">{c.user.email}</div>
                {c.user.company && (
                  <div className="text-[0.65rem] text-black/40">{c.user.company}</div>
                )}
              </div>
              <Badge variant="outline" className="text-[0.6rem] uppercase tracking-wider">
                {c.user.role.replace("_", " ").toLowerCase()}
              </Badge>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                  onClick={() => handleRemove(c.user.id, c.user.name || c.user.email)}
                  disabled={removingId === c.user.id}
                >
                  {removingId === c.user.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserMinus className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  SpeakersManager                                                    */
/* ------------------------------------------------------------------ */

/**
 * SpeakersManager — per-event speaker roster + add/edit/remove UI.
 *
 * Renders inside the EventEditor on /admin/events/[id]. Reuses the
 * existing /api/admin/speakers endpoints (POST / GET / PATCH / DELETE).
 *
 * "Add speaker" flow:
 *   1. Admin types a name/email/company fragment into the autocomplete
 *      (CoHostPicker, re-used as a generic member picker).
 *   2. On pick, we POST /api/admin/speakers with the member's userId +
 *      pre-fill fields (name, photoUrl, company). The server auto-links
 *      the speaker to the user via userId.
 *   3. If no member matches, the admin can press Enter on a raw email —
 *      we open the full editor dialog pre-filled with that email so the
 *      admin can finish the rest of the form manually.
 *
 * "Edit speaker" flow: opens the same dialog pre-filled from the row.
 *
 * "Remove speaker" flow: confirms then DELETE /api/admin/speakers/[id].
 */
function SpeakersManager({
  eventId,
  eventSlug,
  initialSpeakers,
  canManage,
}: {
  eventId: string;
  eventSlug: string;
  initialSpeakers: EventSpeaker[];
  canManage: boolean;
}) {
  const [speakers, setSpeakers] = React.useState<EventSpeaker[]>(initialSpeakers);
  const [adding, setAdding] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [editingSpeaker, setEditingSpeaker] = React.useState<EventSpeaker | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);

  // Hide the entire SpeakersManager card when there are no speakers AND
  // the viewer can't manage them — avoids showing an empty "No speakers"
  // card on surfaces like the event page manage tab (where speaker
  // management is intentionally delegated to /admin/events/[id]).
  if (speakers.length === 0 && !canManage) {
    return null;
  }

  async function handleAddByUserId(user: MemberSearchResult) {
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          userId: user.id,
          name: user.name || user.email,
          photoUrl: user.photoUrl || user.image || null,
          company: user.company || null,
          contactEmail: user.email,
        }),
      });
      const data = await res.json().catch(() => ({ error: "Add failed" }));
      if (!res.ok) {
        toast.error(data.error || "Add failed");
        return;
      }
      toast.success(`${data.speaker?.name || "Speaker"} added to roster`);
      setSpeakers((cur) => [...cur, data.speaker]);
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setAdding(false);
    }
  }

  // When the admin presses Enter on a raw email (no autocomplete match),
  // open the full editor dialog pre-filled with that email so they can
  // fill in name/company/topic manually. This handles the case where the
  // speaker isn't a platform member yet.
  function handleAddByEmail(email: string) {
    setPendingEmail(email);
    setEditingSpeaker(null);
    setDialogOpen(true);
  }

  function handleEdit(speaker: EventSpeaker) {
    setPendingEmail(null);
    setEditingSpeaker(speaker);
    setDialogOpen(true);
  }

  async function handleRemove(speaker: EventSpeaker) {
    if (!confirm(`Remove "${speaker.name}" from this event's speaker roster?`)) return;
    setRemovingId(speaker.id);
    try {
      const res = await fetch(`/api/admin/speakers/${speaker.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Remove failed" }));
        toast.error(data.error || "Remove failed");
        return;
      }
      toast.success(`${speaker.name} removed from roster`);
      setSpeakers((cur) => cur.filter((s) => s.id !== speaker.id));
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setRemovingId(null);
    }
  }

  function handleSaved(saved: EventSpeaker) {
    setSpeakers((cur) => {
      const idx = cur.findIndex((s) => s.id === saved.id);
      if (idx === -1) return [...cur, saved];
      const copy = [...cur];
      copy[idx] = saved;
      // Keep roster sorted by `order` asc, then createdAt asc (matches the
      // server-side orderBy in /admin/speakers/page.tsx).
      copy.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
      return copy;
    });
    setDialogOpen(false);
    setEditingSpeaker(null);
    setPendingEmail(null);
  }

  return (
    <Card className="p-6 bg-white border border-black/10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#820A7D]">
            <Mic className="h-4 w-4" /> Speakers
          </h2>
          <p className="text-xs text-black/50 mt-1">
            Speakers on this event&apos;s roster. Pick a platform member to add them —
            they&apos;ll be linked automatically and members can chat with them in-app.
          </p>
        </div>
        <Badge variant="outline" className="text-[0.65rem]">
          {speakers.length} {speakers.length === 1 ? "speaker" : "speakers"}
        </Badge>
      </div>

      {/* Add speaker */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-black/5">
          <CoHostPicker
            eventId={eventId}
            onPick={handleAddByUserId}
            onPickByEmail={handleAddByEmail}
            disabled={adding}
          />
          {adding && (
            <span className="inline-flex items-center gap-1.5 text-xs text-black/50">
              <Loader2 className="h-3 w-3 animate-spin" /> Adding…
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setPendingEmail(null);
              setEditingSpeaker(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Manual entry
          </Button>
        </div>
      )}

      {/* Speakers list */}
      {speakers.length === 0 ? (
        <div className="text-sm text-black/50 italic py-6 text-center">
          <AlertCircle className="h-5 w-5 mx-auto mb-2 text-black/30" />
          No speakers yet. Search for a member above to add one, or use Manual entry.
        </div>
      ) : (
        <ul className="space-y-2">
          {speakers.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 p-3 rounded-md border border-black/10 bg-white hover:border-black/20 transition-colors"
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-[#FF005A]/10 flex-shrink-0 flex items-center justify-center text-[#FF005A] text-xs font-bold">
                {s.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.photoUrl}
                    alt={s.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  s.name.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-black truncate">{s.name}</div>
                <div className="text-xs text-black/50 truncate">
                  {s.role || "(no role)"}
                  {s.company ? `, ${s.company}` : ""}
                </div>
                {s.topic && (
                  <div className="text-[0.65rem] text-black/40 truncate">Topic: {s.topic}</div>
                )}
              </div>
              {s.user ? (
                <Badge className="text-[0.6rem] uppercase tracking-wider bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  linked
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[0.6rem] uppercase tracking-wider">
                  not linked
                </Badge>
              )}
              {canManage && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => handleEdit(s)}
                    title="Edit speaker"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                    onClick={() => handleRemove(s)}
                    disabled={removingId === s.id}
                    title="Remove from event"
                  >
                    {removingId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Quick link to the event page so the admin can preview the roster */}
      <div className="mt-4 pt-3 border-t border-black/5">
        <Link
          href={`/events/${eventSlug}`}
          target="_blank"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#820A7D] hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> View event page
        </Link>
      </div>

      {/* Editor dialog (add manual / edit existing) */}
      <SpeakerEditorDialog
        open={dialogOpen}
        speaker={editingSpeaker}
        eventId={eventId}
        pendingEmail={pendingEmail}
        canManage={canManage}
        onSaved={handleSaved}
        onClose={() => {
          setDialogOpen(false);
          setEditingSpeaker(null);
          setPendingEmail(null);
        }}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  SpeakerEditorDialog                                                */
/* ------------------------------------------------------------------ */

function SpeakerEditorDialog({
  open,
  speaker,
  eventId,
  pendingEmail,
  canManage,
  onSaved,
  onClose,
}: {
  open: boolean;
  speaker: EventSpeaker | null;
  eventId: string;
  pendingEmail: string | null;
  canManage: boolean;
  onSaved: (s: EventSpeaker) => void;
  onClose: () => void;
}) {
  const isEdit = speaker !== null;

  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Re-initialize whenever the dialog opens for a different speaker
  React.useEffect(() => {
    if (!open) return;
    setName(speaker?.name || "");
    setRole(speaker?.role || "");
    setCompany(speaker?.company || "");
    setBio(speaker?.bio || "");
    setTopic(speaker?.topic || "");
    setPhotoUrl(speaker?.photoUrl || "");
    setContactEmail(speaker?.contactEmail || pendingEmail || "");
  }, [open, speaker, pendingEmail]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        eventId,
        name: name.trim(),
        role: role.trim() || null,
        company: company.trim() || null,
        bio: bio.trim() || null,
        topic: topic.trim() || null,
        photoUrl: photoUrl.trim() || null,
        contactEmail: contactEmail.trim() || null,
      };
      const res = isEdit
        ? await fetch(`/api/admin/speakers/${speaker!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/admin/speakers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to save speaker");
        return;
      }
      const d = await res.json();
      toast.success(isEdit ? "Speaker updated" : "Speaker added");
      onSaved(d.speaker);
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) return null;

  const inputCls =
    "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-[#820A7D] focus:outline-none focus:ring-1 focus:ring-[#820A7D]/30";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit speaker" : "Add a new speaker"}</DialogTitle>
          <DialogDescription>
            Speakers show up on the event page roster. If the contact email matches a
            platform member, the speaker is auto-linked so members can chat with them in-app.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-black/60 mb-1">Name *</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-black/60 mb-1">
                Contact email
              </span>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="speaker@example.com"
                className={inputCls}
              />
              <span className="block text-[0.65rem] text-black/40 mt-1">
                Auto-links to a platform user with the same email.
              </span>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-black/60 mb-1">Role / title</span>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. VP Applied AI"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-black/60 mb-1">Company</span>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. AI21"
                className={inputCls}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold text-black/60 mb-1">
                Topic / talk title
              </span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Building RAG pipelines that ship"
                className={inputCls}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold text-black/60 mb-1">Photo URL</span>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://…"
                className={inputCls}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold text-black/60 mb-1">Bio</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className={inputCls}
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold text-black hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[#820A7D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6e0867] disabled:opacity-50"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add speaker"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
