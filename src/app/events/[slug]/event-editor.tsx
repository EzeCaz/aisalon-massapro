"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Loader2,
  Plus,
  X,
  Users,
  Star,
  Calendar,
  MapPin,
  FileText,
  Sparkles,
} from "lucide-react";

// ----------------------------- TYPES -----------------------------

type CoHost = {
  id: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    photoUrl: string | null;
    image: string | null;
    company: string | null;
    role: string;
  };
};

type EventData = {
  id: string;
  title: string;
  subtitle: string | null;
  chapter: string;
  venue: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  mapUrl: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
  description: string | null;
  takeaways: string | null;
  intendedFor: string | null;
  rsvpUrl: string | null;
  coverImage?: string | null;
  mainImageId: string | null;
  mainImage?: { id: string; fileUrl: string } | null;
};

type Member = {
  id: string;
  email: string;
  name: string | null;
  photoUrl: string | null;
  image: string | null;
  company: string | null;
  role: string;
};

type Props = {
  event: EventData;
  coHosts: CoHost[];
  // All members (excluding admins) — used in the "add co-host" picker
  members: Member[];
  // Whether the current user can edit (admin or co-host)
  canEdit: boolean;
  // Whether the current user can manage co-hosts (admin or co-host)
  canManageCoHosts: boolean;
  // Called when the event is updated successfully (parent can refresh)
  onUpdated?: () => void;
};

// ----------------------------- HELPERS -----------------------------

/** Convert an ISO string to a <input type="datetime-local"> value. */
function isoToLocalInput(iso: string): string {
  try {
    const d = new Date(iso);
    // format YYYY-MM-DDTHH:mm in LOCAL time (what datetime-local expects)
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

/** Convert a datetime-local value back to an ISO string. */
function localInputToISO(local: string): string {
  return new Date(local).toISOString();
}

// ----------------------------- COMPONENT -----------------------------

export function EventEditor({
  event,
  coHosts: initialCoHosts,
  members,
  canEdit,
  canManageCoHosts,
  onUpdated,
}: Props) {
  const [form, setForm] = useState({
    title: event.title,
    subtitle: event.subtitle || "",
    chapter: event.chapter,
    venue: event.venue || "",
    address: event.address || "",
    city: event.city || "",
    country: event.country || "",
    mapUrl: event.mapUrl || "",
    startsAt: isoToLocalInput(event.startsAt),
    endsAt: isoToLocalInput(event.endsAt),
    description: event.description || "",
    takeaways: event.takeaways || "",
    intendedFor: event.intendedFor || "",
    rsvpUrl: event.rsvpUrl || "",
  });
  const [saving, setSaving] = useState(false);
  const [coHosts, setCoHosts] = useState<CoHost[]>(initialCoHosts);
  const [addCoHostOpen, setAddCoHostOpen] = useState(false);

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!canEdit) return;
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.startsAt || !form.endsAt) {
      toast.error("Start and end times are required");
      return;
    }
    const startsAt = localInputToISO(form.startsAt);
    const endsAt = localInputToISO(form.endsAt);
    if (new Date(endsAt) < new Date(startsAt)) {
      toast.error("End time must be after start time");
      return;
    }

    setSaving(true);
    const t = toast.loading("Saving event…");
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          subtitle: form.subtitle,
          chapter: form.chapter,
          venue: form.venue,
          address: form.address,
          city: form.city,
          country: form.country,
          mapUrl: form.mapUrl,
          startsAt,
          endsAt,
          description: form.description,
          takeaways: form.takeaways,
          intendedFor: form.intendedFor,
          rsvpUrl: form.rsvpUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success("Event saved", { id: t });
      onUpdated?.();
    } catch (e) {
      toast.error((e as Error).message || "Save failed", { id: t });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCoHost(userId: string) {
    const t = toast.loading("Adding co-host…");
    try {
      const res = await fetch(`/api/admin/events/${event.id}/cohosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCoHosts((prev) =>
        prev.find((c) => c.user.id === userId) ? prev : [...prev, data.coHost]
      );
      toast.success("Co-host added", { id: t });
      setAddCoHostOpen(false);
    } catch (e) {
      toast.error((e as Error).message || "Add co-host failed", { id: t });
    }
  }

  async function handleRemoveCoHost(userId: string) {
    if (!confirm("Remove this co-host?")) return;
    const t = toast.loading("Removing…");
    try {
      const res = await fetch(
        `/api/admin/events/${event.id}/cohosts?userId=${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setCoHosts((prev) => prev.filter((c) => c.user.id !== userId));
      toast.success("Co-host removed", { id: t });
    } catch (e) {
      toast.error((e as Error).message || "Remove failed", { id: t });
    }
  }

  // Members that aren't already co-hosts — available in the picker
  const availableMembers = members.filter(
    (m) => !coHosts.some((c) => c.user.id === m.id) && m.role !== "ADMIN"
  );

  return (
    <div className="space-y-6">
      {/* Co-hosts panel */}
      {canManageCoHosts && (
        <Card className="p-5 border border-black/10 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#FF005A]" />
              <h3 className="font-bold text-black text-sm">Co-hosts</h3>
              <Badge variant="secondary" className="bg-[#FF005A]/10 text-[#FF005A]">
                {coHosts.length}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddCoHostOpen(true)}
              className="border-[#FF005A] text-[#FF005A] hover:bg-[#FF005A]/5"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Add co-host
            </Button>
          </div>
          <p className="text-xs text-black/60 mb-3">
            Co-hosts can edit this event's details, manage the agenda, upload
            and star photos, and add other co-hosts. They can't delete the event
            or access the platform-wide admin panel.
          </p>
          {coHosts.length === 0 ? (
            <p className="text-xs text-black/40 italic">
              No co-hosts yet. Add one to collaborate on event production.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {coHosts.map((c) => (
                <div
                  key={c.id}
                  className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white pl-1.5 pr-2 py-1"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={c.user.photoUrl || c.user.image || undefined} alt={c.user.name || c.user.email} />
                    <AvatarFallback className="bg-black text-white text-[0.6rem]">
                      {(c.user.name || c.user.email).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-semibold text-black">
                    {c.user.name || c.user.email.split("@")[0]}
                  </span>
                  {c.user.company && (
                    <span className="text-[0.65rem] text-black/50">· {c.user.company}</span>
                  )}
                  <button
                    onClick={() => handleRemoveCoHost(c.user.id)}
                    className="ml-1 rounded-full hover:bg-black/10 p-0.5 text-black/40 hover:text-[#FF005A]"
                    title="Remove co-host"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add co-host picker dialog */}
          <Dialog open={addCoHostOpen} onOpenChange={setAddCoHostOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a co-host</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-black/60">
                Pick a member to add as a co-host for{" "}
                <strong>{event.title}</strong>. They'll be able to edit event
                details, manage agenda, upload photos, and add other co-hosts.
              </p>
              <div className="max-h-80 overflow-y-auto ais-scroll space-y-1">
                {availableMembers.length === 0 ? (
                  <p className="text-sm text-black/50 text-center py-4">
                    All members are already co-hosts (or there are no eligible members).
                  </p>
                ) : (
                  availableMembers.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleAddCoHost(m.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-black/5 text-left transition-colors"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={m.photoUrl || m.image || undefined} alt={m.name || m.email} />
                        <AvatarFallback className="bg-black text-white text-[0.65rem]">
                          {(m.name || m.email).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-black">
                          {m.name || m.email.split("@")[0]}
                        </div>
                        <div className="text-xs text-black/50 truncate">{m.email}</div>
                      </div>
                      <Plus className="h-4 w-4 text-[#FF005A]" />
                    </button>
                  ))
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      )}

      {/* Main image preview */}
      {event.mainImage?.fileUrl && (
        <Card className="p-0 overflow-hidden border border-black/10">
          <div className="relative aspect-[16/9] bg-black/5">
            <img
              src={event.mainImage.fileUrl}
              alt="Event main picture"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute top-2 left-2 bg-[#FFAC30] text-black text-[0.6rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded shadow-md inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-black" /> Main picture
            </div>
          </div>
          <div className="p-3 text-xs text-black/60">
            Set from the Photos tab — click the star icon on any photo to mark
            it as this event's main picture.
          </div>
        </Card>
      )}

      {/* Editable form */}
      {canEdit ? (
        <Card className="p-6 border border-black/10 bg-white space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-black/60" />
            <h3 className="font-bold text-black text-sm">Event details</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Title" required>
              <Input
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="AI CMO Blueprint"
              />
            </Field>
            <Field label="Subtitle">
              <Input
                value={form.subtitle}
                onChange={(e) => setField("subtitle", e.target.value)}
                placeholder="A short tagline"
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Chapter">
              <Input
                value={form.chapter}
                onChange={(e) => setField("chapter", e.target.value)}
                placeholder="Tel Aviv"
              />
            </Field>
            <Field label="Country">
              <Input
                value={form.country}
                onChange={(e) => setField("country", e.target.value)}
                placeholder="ISR"
              />
            </Field>
            <Field label="City">
              <Input
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
                placeholder="Tel Aviv"
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Venue">
              <Input
                value={form.venue}
                onChange={(e) => setField("venue", e.target.value)}
                placeholder="Google for Startups Campus TLV"
              />
            </Field>
            <Field label="Address">
              <Input
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                placeholder="Yigal Alon 98, Tel Aviv"
              />
            </Field>
          </div>

          <Field label="Map URL">
            <Input
              value={form.mapUrl}
              onChange={(e) => setField("mapUrl", e.target.value)}
              placeholder="https://maps.google.com/..."
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Starts at" required>
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setField("startsAt", e.target.value)}
              />
            </Field>
            <Field label="Ends at" required>
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setField("endsAt", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Description / About">
            <Textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={4}
              placeholder="Long-form description shown on the Overview tab"
            />
          </Field>

          <Field label="Takeaways (what you'll take home)">
            <Textarea
              value={form.takeaways}
              onChange={(e) => setField("takeaways", e.target.value)}
              rows={3}
              placeholder="One takeaway per line — rendered as a bulleted list"
            />
          </Field>

          <Field label="Intended for">
            <Textarea
              value={form.intendedFor}
              onChange={(e) => setField("intendedFor", e.target.value)}
              rows={2}
              placeholder="This event is built for: CMOs, marketing leaders, AI builders..."
            />
          </Field>

          <Field label="External RSVP URL (optional)">
            <Input
              value={form.rsvpUrl}
              onChange={(e) => setField("rsvpUrl", e.target.value)}
              placeholder="https://lu.ma/..."
            />
          </Field>

          <div className="flex justify-end pt-2 border-t border-black/10">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-black hover:bg-black/90"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1.5" /> Save changes
                </>
              )}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6 border border-black/10 bg-white">
          <p className="text-sm text-black/60">
            You don't have edit permissions on this event. Only admins and
            co-hosts can edit event details.
          </p>
        </Card>
      )}
    </div>
  );
}

// ----------------------------- FIELD HELPER -----------------------------

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-black/70 uppercase tracking-wider">
        {label}
        {required && <span className="text-[#FF005A] ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
