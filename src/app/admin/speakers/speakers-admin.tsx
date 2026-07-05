"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Mic2,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Link2,
  Unlink,
  Loader2,
  Calendar,
  MapPin,
  Mail,
  Building2,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Save,
  UserCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types — mirror exactly what the server component + GET /api/admin/speakers/full
// return. Keep these in sync with the Prisma query in page.tsx and route.ts.
// ---------------------------------------------------------------------------
type AgendaItemSummary = {
  id: string;
  title: string;
  type: string;
  startsAt: string;
  endsAt: string | null;
};

type LinkedUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
} | null;

type EventSummary = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  venue: string | null;
  _count: { speakers: number; agenda: number };
};

type Speaker = {
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
  event: { id: string; title: string; slug: string; startsAt: string; venue: string | null };
  user: LinkedUser;
  agendaItems: AgendaItemSummary[];
  _count: { images: number; presentations: number; messages: number };
};

type Props = {
  initialSpeakers: Speaker[];
  initialEvents: EventSummary[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AGENDA_TYPE_LABELS: Record<string, string> = {
  TALK: "Talk",
  BREAK: "Break",
  NETWORKING: "Networking",
  FAST_PITCH: "Fast Pitch",
  WELCOME: "Welcome",
};

const AGENDA_TYPE_COLOR: Record<string, string> = {
  TALK: "#004F98",
  BREAK: "#9CA3AF",
  NETWORKING: "#007E72",
  FAST_PITCH: "#FF005A",
  WELCOME: "#820A7D",
};

/**
 * Group speakers by "person". Two speakers are the same person if they
 * share the same (lowercased) contactEmail. Speakers without an email
 * are each their own group.
 *
 * Returns a map: groupKey -> Speaker[]
 */
function groupSpeakersByPerson(speakers: Speaker[]): Map<string, Speaker[]> {
  const groups = new Map<string, Speaker[]>();
  for (const s of speakers) {
    const key = s.contactEmail?.trim().toLowerCase() || `__no_email__:${s.id}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function SpeakersAdmin({ initialSpeakers, initialEvents }: Props) {
  const [speakers, setSpeakers] = useState<Speaker[]>(initialSpeakers);
  const [events] = useState<EventSummary[]>(initialEvents);
  const [search, setSearch] = useState("");
  const [filterEventId, setFilterEventId] = useState<string>("all");
  const [filterLinked, setFilterLinked] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Edit dialog state
  const [editing, setEditing] = useState<Speaker | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // New-speaker dialog
  const [createOpen, setCreateOpen] = useState(false);

  // Clone-to-event dialog (driven from inside the edit dialog)
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneTarget, setCloneTarget] = useState<string>("");

  // Link-to-session dialog (also from inside edit dialog)
  const [linkAgendaOpen, setLinkAgendaOpen] = useState(false);
  const [agendaItemsForEvent, setAgendaItemsForEvent] = useState<
    Array<{ id: string; title: string; type: string; startsAt: string; endsAt: string | null; speaker: { id: string; name: string } | null }>
  >([]);
  const [linkAgendaLoading, setLinkAgendaLoading] = useState(false);
  const [linkAgendaSelected, setLinkAgendaSelected] = useState<string>("");

  // Group speakers by person
  const grouped = useMemo(() => groupSpeakersByPerson(speakers), [speakers]);

  // Filter groups by search / event / linked
  const visibleGroupEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result: Array<[string, Speaker[]]> = [];
    for (const [key, list] of grouped.entries()) {
      // Apply per-speaker filters first
      const filtered = list.filter((s) => {
        const matchSearch =
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.company || "").toLowerCase().includes(q) ||
          (s.role || "").toLowerCase().includes(q) ||
          (s.topic || "").toLowerCase().includes(q) ||
          (s.contactEmail || "").toLowerCase().includes(q) ||
          (s.user?.email || "").toLowerCase().includes(q) ||
          s.event.title.toLowerCase().includes(q);
        const matchEvent = filterEventId === "all" || s.eventId === filterEventId;
        const matchLinked = !filterLinked || s.userId !== null;
        return matchSearch && matchEvent && matchLinked;
      });
      if (filtered.length === 0) continue;
      result.push([key, filtered]);
    }
    // Sort groups by most-recent event date (descending)
    result.sort((a, b) => {
      const aMax = Math.max(...a[1].map((s) => new Date(s.event.startsAt).getTime()));
      const bMax = Math.max(...b[1].map((s) => new Date(s.event.startsAt).getTime()));
      return bMax - aMax;
    });
    return result;
  }, [grouped, search, filterEventId, filterLinked]);

  // ----- Data refresh -----
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/speakers/full", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSpeakers(data.speakers as Speaker[]);
    } catch (e) {
      console.error("Failed to refresh speakers:", e);
    }
  }, []);

  // ----- Group expand/collapse -----
  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ----- Edit dialog handlers -----
  function openEdit(s: Speaker) {
    setEditing(s);
    setEditOpen(true);
  }

  async function saveEdit(patch: Record<string, unknown>) {
    if (!editing) return;
    const t = toast.loading("Saving speaker…");
    try {
      const res = await fetch(`/api/admin/speakers/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.success("Speaker updated", { id: t });
      await refresh();
      // Update the local "editing" snapshot so the dialog stays in sync
      const updated = await fetch(`/api/admin/speakers/full`, { cache: "no-store" });
      if (updated.ok) {
        const refreshed = await updated.json();
        const me = (refreshed.speakers as Speaker[]).find((x) => x.id === editing.id);
        if (me) setEditing(me);
      }
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    }
  }

  async function deleteSpeaker(s: Speaker) {
    if (!confirm(`Delete "${s.name}" from "${s.event.title}"?\n\nThis cannot be undone. The speaker will be removed from this event, but linked sessions will remain (their speaker slot will be cleared).`)) {
      return;
    }
    const t = toast.loading("Deleting speaker…");
    try {
      const res = await fetch(`/api/admin/speakers/${s.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      toast.success("Speaker deleted", { id: t });
      setEditOpen(false);
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    }
  }

  async function cloneToEvent(targetEventId: string) {
    if (!editing) return;
    if (!targetEventId) {
      toast.error("Pick a target event first");
      return;
    }
    const t = toast.loading("Cloning speaker to event…");
    try {
      const res = await fetch(`/api/admin/speakers/${editing.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetEventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.success("Speaker cloned to event", { id: t });
      setCloneOpen(false);
      setCloneTarget("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    }
  }

  // ----- Agenda link / unlink -----
  async function openLinkAgenda() {
    if (!editing) return;
    setLinkAgendaOpen(true);
    setLinkAgendaLoading(true);
    setLinkAgendaSelected("");
    try {
      const res = await fetch(`/api/admin/agenda?eventId=${editing.eventId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgendaItemsForEvent(data.items || []);
    } catch (e) {
      toast.error("Failed to load agenda: " + (e as Error).message, { duration: 8000 });
      setLinkAgendaOpen(false);
    } finally {
      setLinkAgendaLoading(false);
    }
  }

  async function confirmLinkAgenda() {
    if (!editing || !linkAgendaSelected) {
      toast.error("Pick a session first");
      return;
    }
    const t = toast.loading("Linking session…");
    try {
      const res = await fetch(`/api/admin/speakers/${editing.id}/link-agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agendaItemId: linkAgendaSelected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.success("Session linked", { id: t });
      setLinkAgendaOpen(false);
      setLinkAgendaSelected("");
      await refresh();
      // Update the editing snapshot
      const updated = await fetch(`/api/admin/speakers/full`, { cache: "no-store" });
      if (updated.ok) {
        const refreshed = await updated.json();
        const me = (refreshed.speakers as Speaker[]).find((x) => x.id === editing.id);
        if (me) setEditing(me);
      }
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    }
  }

  async function unlinkAgenda(agendaItemId: string) {
    if (!editing) return;
    const t = toast.loading("Unlinking session…");
    try {
      const res = await fetch(`/api/admin/speakers/${editing.id}/unlink-agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agendaItemId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      toast.success("Session unlinked", { id: t });
      await refresh();
      // Update the editing snapshot
      const updated = await fetch(`/api/admin/speakers/full`, { cache: "no-store" });
      if (updated.ok) {
        const refreshed = await updated.json();
        const me = (refreshed.speakers as Speaker[]).find((x) => x.id === editing.id);
        if (me) setEditing(me);
      }
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    }
  }

  // ----- Stats -----
  const stats = useMemo(() => {
    const totalSpeakers = speakers.length;
    const uniquePeople = grouped.size;
    const totalEvents = events.length;
    const linkedUsers = speakers.filter((s) => s.userId !== null).length;
    return { totalSpeakers, uniquePeople, totalEvents, linkedUsers };
  }, [speakers, grouped, events]);

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Speaker rows" value={stats.totalSpeakers} accent="#FF005A" />
        <StatCard label="Unique people" value={stats.uniquePeople} accent="#00E6FF" />
        <StatCard label="Events" value={stats.totalEvents} accent="#007E72" />
        <StatCard label="Linked users" value={stats.linkedUsers} accent="#820A7D" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/80" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, event, email…"
            className="pl-9"
          />
        </div>
        <Select value={filterEventId} onValueChange={setFilterEventId}>
          <SelectTrigger className="w-full sm:w-[260px]">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title} · {fmtDate(e.startsAt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={filterLinked ? "default" : "outline"}
          onClick={() => setFilterLinked((v) => !v)}
          className="whitespace-nowrap"
        >
          <UserCheck className="h-4 w-4 mr-1" />
          {filterLinked ? "Linked only" : "All"}
        </Button>
        <Button onClick={() => setCreateOpen(true)} className="whitespace-nowrap">
          <Plus className="h-4 w-4 mr-1" />
          New speaker
        </Button>
      </div>

      {/* Empty state */}
      {visibleGroupEntries.length === 0 && (
        <Card className="p-8 text-center bg-white border border-black/10">
          <Mic2 className="h-8 w-8 mx-auto mb-2 text-black/30" />
          <p className="text-sm text-black/80">
            No speakers match your filters. Try clearing the search or creating a new speaker.
          </p>
        </Card>
      )}

      {/* Speaker groups */}
      <div className="space-y-2">
        {visibleGroupEntries.map(([key, list]) => {
          const expanded = expandedGroups.has(key);
          const primary = list[0];
          const hasMultiple = list.length > 1;
          // For group header, use the most-recent event's speaker as "primary"
          const sortedByDateDesc = [...list].sort(
            (a, b) =>
              new Date(b.event.startsAt).getTime() - new Date(a.event.startsAt).getTime()
          );
          const head = sortedByDateDesc[0];
          const totalSessions = list.reduce((acc, s) => acc + s.agendaItems.length, 0);

          return (
            <Card key={key} className="border border-black/10 bg-white overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => hasMultiple && toggleGroup(key)}
                className={`w-full text-left p-4 flex items-center gap-4 ${
                  hasMultiple ? "hover:bg-black/[0.02] cursor-pointer" : "cursor-default"
                }`}
              >
                {hasMultiple ? (
                  expanded ? (
                    <ChevronDown className="h-4 w-4 text-black/80 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-black/80 flex-shrink-0" />
                  )
                ) : (
                  <span className="w-4 flex-shrink-0" />
                )}
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={head.photoUrl || undefined} alt={head.name} />
                  <AvatarFallback className="bg-[#FF005A]/10 text-[#FF005A] text-xs font-bold">
                    {initials(head.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-black text-sm flex items-center gap-2">
                    <span className="truncate">{head.name}</span>
                    {hasMultiple && (
                      <Badge variant="outline" className="text-[0.55rem] uppercase tracking-wider flex-shrink-0">
                        {list.length} events
                      </Badge>
                    )}
                    {head.userId && (
                      <Badge className="text-[0.55rem] uppercase tracking-wider bg-[#007E72] text-white hover:bg-[#007E72]/90 flex-shrink-0">
                        Linked
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-black/50">
                    {head.role && <span>{head.role}</span>}
                    {head.company && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {head.company}
                      </span>
                    )}
                    {head.contactEmail && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {head.contactEmail}
                      </span>
                    )}
                    {totalSessions > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {totalSessions} session{totalSessions === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-black/80 flex-shrink-0">
                  <span>Most recent</span>
                  <span className="font-semibold text-black/80">{fmtDate(head.event.startsAt)}</span>
                </div>
              </button>

              {/* Expanded list of speaker rows (one per event) */}
              {hasMultiple && expanded && (
                <div className="border-t border-black/5 divide-y divide-black/5">
                  {sortedByDateDesc.map((s) => (
                    <SpeakerRow
                      key={s.id}
                      speaker={s}
                      onEdit={() => openEdit(s)}
                    />
                  ))}
                </div>
              )}

              {/* Single-event group — render the row inline */}
              {!hasMultiple && (
                <div className="border-t border-black/5">
                  <SpeakerRow speaker={head} onEdit={() => openEdit(head)} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ---------------- Edit Speaker Dialog ---------------- */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={editing.photoUrl || undefined} alt={editing.name} />
                    <AvatarFallback className="bg-[#FF005A]/10 text-[#FF005A] text-xs font-bold">
                      {initials(editing.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{editing.name}</span>
                </DialogTitle>
                <p className="text-xs text-black/50 mt-1">
                  Editing speaker at{" "}
                  <Link
                    href={`/events/${editing.event.slug}`}
                    className="font-semibold text-[#FF005A] hover:underline"
                    target="_blank"
                  >
                    {editing.event.title}
                  </Link>{" "}
                  · {fmtDate(editing.event.startsAt)}
                </p>
              </DialogHeader>

              <SpeakerEditForm
                key={editing.id + editing.updatedAt}
                speaker={editing}
                onSave={saveEdit}
                onDelete={() => deleteSpeaker(editing)}
                onCloneClick={() => setCloneOpen(true)}
                onLinkAgendaClick={openLinkAgenda}
                onUnlinkAgenda={unlinkAgenda}
                allEvents={events}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------------- Clone to Event Dialog ---------------- */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone speaker to another event</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-black/80">
            Creates a new Speaker row on the target event with the same name, role, company, bio,
            topic, photo, contact email, and linked user. The original speaker remains unchanged.
          </p>
          {editing && (
            <div className="my-3">
              <Label className="text-xs">Target event</Label>
              <Select value={cloneTarget} onValueChange={setCloneTarget}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Pick an event…" />
                </SelectTrigger>
                <SelectContent>
                  {events
                    .filter((e) => e.id !== editing.eventId)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.title} · {fmtDate(e.startsAt)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={() => cloneToEvent(cloneTarget)} disabled={!cloneTarget}>
              <Copy className="h-4 w-4 mr-1" /> Clone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Link Agenda Item Dialog ---------------- */}
      <Dialog open={linkAgendaOpen} onOpenChange={setLinkAgendaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link to a session</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-black/80">
            Pick an agenda item from <strong>{editing?.event.title}</strong>. Sessions already
            linked to other speakers can be reassigned to this speaker.
          </p>
          {linkAgendaLoading ? (
            <div className="py-6 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-black/80" />
            </div>
          ) : agendaItemsForEvent.length === 0 ? (
            <div className="py-6 text-center text-sm text-black/50">
              No agenda items on this event yet. Add some from the event page first.
            </div>
          ) : (
            <div className="my-3 space-y-1 max-h-[300px] overflow-y-auto">
              {agendaItemsForEvent.map((item) => {
                const isMine = editing && item.speaker?.id === editing.id;
                const isTaken = item.speaker && !isMine;
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-2 p-2 rounded border cursor-pointer text-sm ${
                      linkAgendaSelected === item.id
                        ? "border-[#FF005A] bg-[#FF005A]/5"
                        : "border-black/10 hover:bg-black/[0.02]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="agendaItem"
                      checked={linkAgendaSelected === item.id}
                      onChange={() => setLinkAgendaSelected(item.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-black flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[0.55rem] uppercase tracking-wider"
                          style={{
                            color: AGENDA_TYPE_COLOR[item.type] || "#6B7280",
                            borderColor: AGENDA_TYPE_COLOR[item.type] || "#6B7280",
                          }}
                        >
                          {AGENDA_TYPE_LABELS[item.type] || item.type}
                        </Badge>
                        <span className="truncate">{item.title}</span>
                      </div>
                      <div className="text-xs text-black/50 mt-0.5">
                        {fmtTime(item.startsAt)}
                        {item.endsAt ? ` – ${fmtTime(item.endsAt)}` : ""}
                      </div>
                      {isTaken && (
                        <div className="text-xs text-amber-600 mt-0.5">
                          ⚠ Currently linked to <strong>{item.speaker!.name}</strong> — will be reassigned
                        </div>
                      )}
                      {isMine && (
                        <div className="text-xs text-[#007E72] mt-0.5">
                          ✓ Already linked to this speaker
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={confirmLinkAgenda} disabled={!linkAgendaSelected}>
              <Link2 className="h-4 w-4 mr-1" /> Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Create Speaker Dialog ---------------- */}
      <CreateSpeakerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        events={events}
        onCreated={async () => {
          setCreateOpen(false);
          await refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speaker row (inside a group)
// ---------------------------------------------------------------------------
function SpeakerRow({
  speaker,
  onEdit,
}: {
  speaker: Speaker;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 pl-12 hover:bg-black/[0.02]">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-black/80">
          <Link
            href={`/events/${speaker.event.slug}`}
            className="inline-flex items-center gap-1 font-semibold text-[#004F98] hover:underline"
            target="_blank"
          >
            <Calendar className="h-3 w-3" />
            {speaker.event.title}
          </Link>
          <span className="text-black/30">·</span>
          <span>{fmtDate(speaker.event.startsAt)}</span>
          {speaker.event.venue && (
            <>
              <span className="text-black/30">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {speaker.event.venue}
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {speaker.topic && (
            <span className="text-xs text-black/70 italic">"{speaker.topic}"</span>
          )}
          {speaker.agendaItems.length > 0 && (
            <Badge variant="outline" className="text-[0.55rem] uppercase tracking-wider">
              {speaker.agendaItems.length} session{speaker.agendaItems.length === 1 ? "" : "s"}
            </Badge>
          )}
          {speaker.user && (
            <Badge className="text-[0.55rem] uppercase tracking-wider bg-[#007E72] text-white hover:bg-[#007E72]/90">
              <UserCheck className="h-3 w-3 mr-1" />
              {speaker.user.email}
            </Badge>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onEdit} className="flex-shrink-0">
        <Pencil className="h-3 w-3 mr-1" /> Edit
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit form — editable fields, sessions list, clone button, delete button
// ---------------------------------------------------------------------------
function SpeakerEditForm({
  speaker,
  onSave,
  onDelete,
  onCloneClick,
  onLinkAgendaClick,
  onUnlinkAgenda,
  allEvents,
}: {
  speaker: Speaker;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
  onCloneClick: () => void;
  onLinkAgendaClick: () => void;
  onUnlinkAgenda: (agendaItemId: string) => Promise<void>;
  allEvents: EventSummary[];
}) {
  const [name, setName] = useState(speaker.name);
  const [role, setRole] = useState(speaker.role || "");
  const [company, setCompany] = useState(speaker.company || "");
  const [bio, setBio] = useState(speaker.bio || "");
  const [topic, setTopic] = useState(speaker.topic || "");
  const [photoUrl, setPhotoUrl] = useState(speaker.photoUrl || "");
  const [contactEmail, setContactEmail] = useState(speaker.contactEmail || "");
  const [saving, setSaving] = useState(false);

  // Reset local state when the speaker prop changes (after save)
  useEffect(() => {
    setName(speaker.name);
    setRole(speaker.role || "");
    setCompany(speaker.company || "");
    setBio(speaker.bio || "");
    setTopic(speaker.topic || "");
    setPhotoUrl(speaker.photoUrl || "");
    setContactEmail(speaker.contactEmail || "");
  }, [speaker]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        name,
        role: role.trim() || null,
        company: company.trim() || null,
        bio: bio.trim() || null,
        topic: topic.trim() || null,
        photoUrl: photoUrl.trim() || null,
        contactEmail: contactEmail.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 py-2">
      {/* --- Editable fields --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name *">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Topic / Talk title">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. The AI-Native CMO Blueprint" />
        </Field>
        <Field label="Role">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. AI Product Lead, Amdocs" />
        </Field>
        <Field label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Amdocs" />
        </Field>
        <Field label="Photo URL">
          <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Contact email (auto-links platform user)">
          <Input
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="speaker@example.com"
            type="email"
          />
        </Field>
      </div>

      <Field label="Bio">
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Short bio…"
        />
      </Field>

      {/* Save / Delete / Clone buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save changes
        </Button>
        <Button variant="outline" onClick={onCloneClick}>
          <Copy className="h-4 w-4 mr-1" /> Clone to another event
        </Button>
        <Button variant="destructive" onClick={onDelete} className="ml-auto">
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
      </div>

      {/* --- Linked platform user --- */}
      <div className="border-t border-black/10 pt-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-black/80 mb-2">
          Linked platform user
        </h4>
        {speaker.user ? (
          <div className="flex items-center gap-2 text-sm">
            <Avatar className="h-7 w-7">
              <AvatarImage src={speaker.user.image || undefined} alt={speaker.user.name || ""} />
              <AvatarFallback className="bg-[#007E72]/10 text-[#007E72] text-[0.6rem] font-bold">
                {initials(speaker.user.name || speaker.user.email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold text-black">{speaker.user.name || speaker.user.email}</div>
              <div className="text-xs text-black/50">{speaker.user.email}</div>
            </div>
            <Badge className="ml-2 bg-[#007E72] text-white hover:bg-[#007E72]/90 text-[0.55rem] uppercase tracking-wider">
              Auto-linked
            </Badge>
          </div>
        ) : (
          <p className="text-sm text-black/50">
            Not linked. Add a contact email above that matches a platform user's email to auto-link.
          </p>
        )}
      </div>

      {/* --- Sessions (agenda items) --- */}
      <div className="border-t border-black/10 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-black/80">
            Sessions at this event ({speaker.agendaItems.length})
          </h4>
          <Button size="sm" variant="outline" onClick={onLinkAgendaClick}>
            <Link2 className="h-3.5 w-3.5 mr-1" /> Link session
          </Button>
        </div>
        {speaker.agendaItems.length === 0 ? (
          <p className="text-sm text-black/50">
            Not yet linked to any sessions on this event. Click "Link session" to assign this speaker
            to a talk / fast pitch / networking slot in the agenda.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {speaker.agendaItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 p-2 rounded border border-black/10 bg-white text-sm"
              >
                <Badge
                  variant="outline"
                  className="text-[0.55rem] uppercase tracking-wider flex-shrink-0"
                  style={{
                    color: AGENDA_TYPE_COLOR[item.type] || "#6B7280",
                    borderColor: AGENDA_TYPE_COLOR[item.type] || "#6B7280",
                  }}
                >
                  {AGENDA_TYPE_LABELS[item.type] || item.type}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-black truncate">{item.title}</div>
                  <div className="text-xs text-black/50">
                    {fmtTime(item.startsAt)}
                    {item.endsAt ? ` – ${fmtTime(item.endsAt)}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => onUnlinkAgenda(item.id)}
                >
                  <Unlink className="h-3 w-3 mr-1" /> Unlink
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Stats / relations --- */}
      <div className="border-t border-black/10 pt-4 grid grid-cols-3 gap-2">
        <MiniStat icon={<ImageIcon className="h-3 w-3" />} label="Images" value={speaker._count.images} />
        <MiniStat icon={<FileText className="h-3 w-3" />} label="Presentations" value={speaker._count.presentations} />
        <MiniStat icon={<MessageSquare className="h-3 w-3" />} label="Messages" value={speaker._count.messages} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-black/80 mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border border-black/10 rounded p-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[0.6rem] uppercase tracking-widest text-black/80">
        {icon} {label}
      </div>
      <div className="text-lg font-bold text-black mt-0.5">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create-speaker dialog
// ---------------------------------------------------------------------------
function CreateSpeakerDialog({
  open,
  onOpenChange,
  events,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  events: EventSummary[];
  onCreated: () => void | Promise<void>;
}) {
  const [eventId, setEventId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [bio, setBio] = useState("");
  const [topic, setTopic] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEventId(events[0]?.id || "");
      setName(""); setRole(""); setCompany(""); setBio("");
      setTopic(""); setPhotoUrl(""); setContactEmail("");
    }
  }, [open, events]);

  async function handleCreate() {
    if (!eventId) { toast.error("Pick an event"); return; }
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const t = toast.loading("Creating speaker…");
    try {
      const res = await fetch(`/api/admin/speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          name: name.trim(),
          role: role.trim() || undefined,
          company: company.trim() || undefined,
          bio: bio.trim() || undefined,
          topic: topic.trim() || undefined,
          photoUrl: photoUrl.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.success("Speaker created", { id: t });
      await onCreated();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create new speaker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Field label="Event *">
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick an event…" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title} · {fmtDate(e.startsAt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            </Field>
            <Field label="Topic / Talk title">
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="The AI CMO Blueprint" />
            </Field>
            <Field label="Role">
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="CEO, Acme" />
            </Field>
            <Field label="Company">
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme" />
            </Field>
            <Field label="Photo URL">
              <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Contact email (auto-links platform user)">
              <Input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="speaker@example.com"
                type="email"
              />
            </Field>
          </div>
          <Field label="Bio">
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Short bio…" />
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleCreate} disabled={saving || !name.trim() || !eventId}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Create speaker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="border border-black/10 rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/80">
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 text-3xl font-extrabold text-black">{value}</div>
    </div>
  );
}
