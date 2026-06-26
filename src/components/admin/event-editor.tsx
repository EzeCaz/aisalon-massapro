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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  startsAt: string;
  endsAt: string;
  description: string | null;
  takeaways: string | null;
  intendedFor: string | null;
  rsvpUrl: string | null;
  coHosts: CoHost[];
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

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
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
  showBackButton = true,
  backHref = "/admin/events",
}: {
  event: EventForEditor;
  canDelete?: boolean;
  /** Whether the current viewer can add/remove co-hosts (Admin+ only). */
  canManageCoHosts?: boolean;
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
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          venue: venue.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          mapUrl: mapUrl.trim() || null,
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
