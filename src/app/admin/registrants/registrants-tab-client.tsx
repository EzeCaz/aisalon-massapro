"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  ExternalLink,
  Search,
  Download,
  CheckCircle2,
  HelpCircle,
  XCircle,
} from "lucide-react";

type RsvpEvent = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
};

type RsvpUser = {
  id: string;
  email: string;
  name: string | null;
};

type Rsvp = {
  id: string;
  eventId: string;
  email: string;
  name: string | null;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  event: RsvpEvent;
  user: RsvpUser | null;
};

type EventOption = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  _count: { rsvps: number };
};

const STATUS_META: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  GOING: {
    label: "Going",
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700",
  },
  MAYBE: {
    label: "Maybe",
    icon: HelpCircle,
    className: "bg-amber-50 text-amber-700",
  },
  NOT_GOING: {
    label: "Not going",
    icon: XCircle,
    className: "bg-red-50 text-red-700",
  },
};

export function RegistrantsTabClient({
  rsvps: initialRsvps,
  events,
}: {
  rsvps: Rsvp[];
  events: EventOption[];
}) {
  const [rsvps, setRsvps] = React.useState<Rsvp[]>(initialRsvps);
  const [search, setSearch] = React.useState("");
  const [eventFilter, setEventFilter] = React.useState<string>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [adding, setAdding] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    return rsvps.filter((r) => {
      if (eventFilter !== "ALL" && r.eventId !== eventFilter) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        r.email.toLowerCase().includes(q) ||
        (r.name || "").toLowerCase().includes(q) ||
        r.event.title.toLowerCase().includes(q)
      );
    });
  }, [rsvps, search, eventFilter, statusFilter]);

  const handleAdd = (rsvp: Rsvp) => {
    setRsvps((prev) => {
      const idx = prev.findIndex((r) => r.id === rsvp.id);
      if (idx === -1) return [rsvp, ...prev];
      const copy = [...prev];
      copy[idx] = rsvp;
      return copy;
    });
    setAdding(false);
  };

  const handleStatusChange = async (id: string, status: string) => {
    // Optimistic update
    setRsvps((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r))
    );
    try {
      const res = await fetch(`/api/admin/registrants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to update status");
        // Roll back by reloading from server
        return;
      }
      toast.success(`Status set to ${status}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/registrants/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to delete");
        return;
      }
      setRsvps((prev) => prev.filter((r) => r.id !== id));
      toast.success("Registrant removed");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Name", "Email", "Status", "Source", "Event", "Event date", "Registered at"],
      ...filtered.map((r) => [
        r.name || "",
        r.email,
        r.status,
        r.source,
        r.event.title,
        new Date(r.event.startsAt).toISOString(),
        new Date(r.createdAt).toISOString(),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, event…"
            className="w-full rounded-md border border-black/15 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </div>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
        >
          <option value="ALL">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} ({ev._count.rsvps})
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
        >
          <option value="ALL">All statuses</option>
          <option value="GOING">Going</option>
          <option value="MAYBE">Maybe</option>
          <option value="NOT_GOING">Not going</option>
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 rounded-md border border-black/15 bg-white text-black font-semibold px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Download className="h-4 w-4" />
          CSV
        </button>
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={events.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-2 text-sm hover:bg-[#FF005A]/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add registrant
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-black/10 bg-white p-8 text-center text-sm text-black/50">
          No registrants match your filters.
        </div>
      ) : (
        <div className="rounded-md border border-black/10 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-black/60">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Registrant</th>
                <th className="text-left px-4 py-3 font-bold hidden md:table-cell">Event</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-left px-4 py-3 font-bold hidden lg:table-cell">Source</th>
                <th className="text-left px-4 py-3 font-bold hidden lg:table-cell">Registered</th>
                <th className="text-right px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META.GOING;
                return (
                  <tr key={r.id} className="border-t border-black/5 hover:bg-black/[0.015]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-black">{r.name || r.email}</div>
                      <div className="text-xs text-black/50">{r.email}</div>
                      {r.user ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">
                          linked user
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell align-top">
                      <Link
                        href={`/events/${r.event.slug}`}
                        className="inline-flex items-center gap-1 text-[#820A7D] hover:underline"
                        target="_blank"
                      >
                        {r.event.title}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      <div className="text-xs text-black/50">
                        {new Date(r.event.startsAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <select
                        value={r.status}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold border-0 cursor-pointer ${meta.className}`}
                      >
                        <option value="GOING">Going</option>
                        <option value="MAYBE">Maybe</option>
                        <option value="NOT_GOING">Not going</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell align-top text-xs">
                      <span className="rounded-md bg-black/5 px-2 py-0.5 font-mono text-black/60">
                        {r.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell align-top text-xs text-black/60">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <button
                        type="button"
                        onClick={() => setDeletingId(r.id)}
                        title="Remove"
                        className="rounded p-1.5 text-red-600/70 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats summary */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <StatChip label="Total" value={filtered.length} accent="bg-black/5 text-black" />
        <StatChip
          label="Going"
          value={filtered.filter((r) => r.status === "GOING").length}
          accent="bg-emerald-50 text-emerald-700"
        />
        <StatChip
          label="Maybe"
          value={filtered.filter((r) => r.status === "MAYBE").length}
          accent="bg-amber-50 text-amber-700"
        />
        <StatChip
          label="Not going"
          value={filtered.filter((r) => r.status === "NOT_GOING").length}
          accent="bg-red-50 text-red-700"
        />
      </div>

      {/* Add modal */}
      <AddRegistrantDialog
        open={adding}
        events={events}
        onAdded={handleAdd}
        onClose={() => setAdding(false)}
      />

      {/* Delete confirm */}
      <Dialog open={deletingId !== null} onOpenChange={(o) => !o && setDeletingId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove registrant?</DialogTitle>
            <DialogDescription>
              This permanently deletes the RSVP. The person will need to
              re-register if they want to attend. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeletingId(null)}
              className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold text-black hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deletingId && handleDelete(deletingId)}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Remove registrant
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className={`rounded-md px-3 py-2 ${accent}`}>
      <div className="text-[0.65rem] font-bold uppercase tracking-widest opacity-70">
        {label}
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function AddRegistrantDialog({
  open,
  events,
  onAdded,
  onClose,
}: {
  open: boolean;
  events: EventOption[];
  onAdded: (r: Rsvp) => void;
  onClose: () => void;
}) {
  const [eventId, setEventId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState("GOING");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setEventId(events[0]?.id || "");
      setEmail("");
      setName("");
      setStatus("GOING");
    }
  }, [open, events]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !email.trim()) {
      toast.error("Event and email are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/registrants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          email: email.trim(),
          name: name.trim() || null,
          status,
          source: "MANUAL",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to add registrant");
        return;
      }
      const d = await res.json();
      onAdded(d.rsvp);
      toast.success("Registrant added");
    } catch (e) {
      console.error(e);
      toast.error("Failed to add registrant");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a registrant</DialogTitle>
          <DialogDescription>
            Manually add someone to an event's RSVP list. If their email
            matches a platform user, the RSVP will be linked to their account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-black/60 mb-1">Event *</span>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              required
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({new Date(ev.startsAt).toLocaleDateString()})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-black/60 mb-1">Email *</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="person@example.com"
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-black/60 mb-1">Name (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-black/60 mb-1">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            >
              <option value="GOING">Going</option>
              <option value="MAYBE">Maybe</option>
              <option value="NOT_GOING">Not going</option>
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
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
              className="rounded-md bg-[#FF005A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#FF005A]/90 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add registrant"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
