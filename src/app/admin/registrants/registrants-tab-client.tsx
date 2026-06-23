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
  Edit3,
  Save,
  Loader2,
  Upload,
  FileSpreadsheet,
  AlertCircle,
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
  // Edit-registrant state — opens the EditRegistrantDialog when the
  // name cell or the Edit button is clicked. Lets the admin edit the
  // name, email, and status of an existing RSVP.
  const [editingRsvp, setEditingRsvp] = React.useState<Rsvp | null>(null);
  // Bulk-import state — opens the ImportRegistrantsDialog when the
  // Import CSV/XLS button is clicked. Lets the admin upload a
  // spreadsheet of registrants to bulk-import for the selected event.
  const [importOpen, setImportOpen] = React.useState(false);
  // Track which event the import dialog should target. Default to the
  // currently-selected eventFilter, or the first event if "ALL".
  const [importEventId, setImportEventId] = React.useState<string>("");
  const [editOpen, setEditOpen] = React.useState(false);

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

  function openEditDialog(rsvp: Rsvp) {
    setEditingRsvp(rsvp);
    setEditOpen(true);
  }

  const handleEditSaved = (updated: Rsvp) => {
    setRsvps((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setEditOpen(false);
    setEditingRsvp(null);
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
          onClick={() => {
            // Default the import dialog to the currently-selected event,
            // or the first event if "ALL" is selected.
            setImportEventId(
              eventFilter !== "ALL" ? eventFilter : events[0]?.id || ""
            );
            setImportOpen(true);
          }}
          disabled={events.length === 0}
          className="inline-flex items-center gap-2 rounded-md border border-[#007E72] text-[#007E72] bg-white font-semibold px-3 py-2 text-sm hover:bg-[#007E72]/5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Upload className="h-4 w-4" />
          Import CSV/XLS
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
                      {/* Clickable name — opens the edit dialog */}
                      <button
                        type="button"
                        onClick={() => openEditDialog(r)}
                        className="font-semibold text-black hover:text-[#FF005A] hover:underline underline-offset-2 text-left"
                        title="Click to edit registrant info"
                      >
                        {r.name || r.email}
                      </button>
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
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDialog(r)}
                          title="Edit registrant"
                          className="inline-flex items-center gap-1 rounded-md border border-[#FF005A]/40 text-[#FF005A] px-2.5 py-1.5 text-xs font-semibold hover:bg-[#FF005A]/5"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(r.id)}
                          title="Remove"
                          className="rounded p-1.5 text-red-600/70 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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

      {/* Edit modal — opens when the registrant name or Edit button is clicked */}
      <EditRegistrantDialog
        open={editOpen}
        rsvp={editingRsvp}
        onSaved={handleEditSaved}
        onClose={() => {
          setEditOpen(false);
          setEditingRsvp(null);
        }}
      />

      {/* Import modal — bulk-import registrants from CSV/XLS */}
      <ImportRegistrantsDialog
        open={importOpen}
        events={events}
        defaultEventId={importEventId}
        onOpenChange={setImportOpen}
        onImported={() => {
          setImportOpen(false);
          // Reload to surface the new RSVPs in the table.
          window.location.reload();
        }}
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

// ---------------------------------------------------------------------------
// EditRegistrantDialog — opens when the admin clicks a registrant name
// or the "Edit" button on a row. Lets the admin edit the name, email,
// and status of an existing RSVP. Email changes re-link the RSVP to a
// platform user if one exists with the new email (handled server-side).
// ---------------------------------------------------------------------------

function EditRegistrantDialog({
  open,
  rsvp,
  onSaved,
  onClose,
}: {
  open: boolean;
  rsvp: Rsvp | null;
  onSaved: (updated: Rsvp) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState("GOING");
  const [saving, setSaving] = React.useState(false);

  // Sync form state whenever the rsvp changes (i.e. dialog re-opens
  // for a different RSVP).
  React.useEffect(() => {
    if (rsvp) {
      setName(rsvp.name || "");
      setEmail(rsvp.email);
      setStatus(rsvp.status);
    }
  }, [rsvp]);

  if (!rsvp) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrants/${rsvp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim(),
          status,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to save");
        return;
      }
      const data = await res.json();
      toast.success("Registrant updated");
      onSaved(data.rsvp);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-[#FF005A]" />
            Edit registrant
          </DialogTitle>
          <DialogDescription>
            Update the name, email, or RSVP status. Changing the email
            re-links the RSVP to a platform user if one matches.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          {/* Read-only event — the RSVP can't be moved to a different
              event after creation. */}
          <div className="rounded-md bg-black/[0.03] p-3 text-xs text-black/70 space-y-1">
            <div>
              <strong>Event:</strong> {rsvp.event.title}
            </div>
            <div>
              <strong>Registered:</strong>{" "}
              {new Date(rsvp.createdAt).toLocaleString()}
            </div>
            <div>
              <strong>Source:</strong>{" "}
              <span className="font-mono">{rsvp.source}</span>
            </div>
            {rsvp.user && (
              <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700 mt-1">
                linked user · {rsvp.user.email}
              </div>
            )}
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-black/60 mb-1">
              Name (optional)
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              placeholder="Display name"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-black/60 mb-1">
              Email *
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-black/60 mb-1">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
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
              className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#FF005A]/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ImportRegistrantsDialog — bulk-import event registrants from CSV/XLS.
//
// Lets the admin pick an event + a spreadsheet file, then POSTs both to
// /api/admin/registrants/bulk-import. Shows a result summary (inserted /
// updated / skipped / errors) and a download-template link.
// ---------------------------------------------------------------------------
function ImportRegistrantsDialog({
  open,
  events,
  defaultEventId,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  events: EventOption[];
  defaultEventId: string;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [eventId, setEventId] = React.useState<string>(defaultEventId);
  const [uploading, setUploading] = React.useState(false);
  const [result, setResult] = React.useState<{
    inserted: number;
    updated: number;
    skipped: number;
    totalRows: number;
    filename: string;
    eventTitle: string;
    errors: Array<{ row: number; reason: string }>;
  } | null>(null);

  // Keep the dialog's selected event in sync when the toolbar passes a
  // new defaultEventId (e.g. when the admin changes the event filter and
  // then clicks Import).
  React.useEffect(() => {
    if (defaultEventId) setEventId(defaultEventId);
  }, [defaultEventId]);

  const handleUpload = async () => {
    if (!file || !eventId) return;
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("eventId", eventId);
      const res = await fetch("/api/admin/registrants/bulk-import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Import failed");
        return;
      }
      setResult(data);
      toast.success(
        `Imported ${data.inserted} new, updated ${data.updated}, skipped ${data.skipped}`
      );
    } catch (err) {
      toast.error(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setFile(null);
      setResult(null);
      if (result && result.inserted + result.updated > 0) {
        onImported();
        return;
      }
    }
    onOpenChange(v);
  };

  const downloadTemplate = () => {
    window.location.href = "/api/admin/registrants/import-template";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[#007E72]" />
            Import registrants from CSV / XLS
          </DialogTitle>
        </DialogHeader>

        {!result && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-black/70 mb-1">
                Target event
              </label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-sm text-black/70">
              Upload a{" "}
              <code className="px-1 py-0.5 bg-black/5 rounded">.csv</code>,{" "}
              <code className="px-1 py-0.5 bg-black/5 rounded">.xls</code>, or{" "}
              <code className="px-1 py-0.5 bg-black/5 rounded">.xlsx</code> file.
              Each row becomes an RSVP for the selected event. The only required
              column is <strong>email</strong>.
            </p>

            <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 text-xs text-black/70">
              <div className="font-semibold mb-1 text-black">Supported columns</div>
              <code className="block whitespace-pre-wrap">
                email (required), name, status (GOING|MAYBE|NOT_GOING), source
                (IMPORT|MANUAL|EVENT_PAGE)
              </code>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#007E72] file:text-white file:font-semibold hover:file:bg-[#007E72]/90 cursor-pointer"
              />
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-black/5"
              >
                <Download className="h-3.5 w-3.5" /> CSV template
              </button>
            </div>

            {file && (
              <div className="text-xs text-black/60">
                Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-black/10">
              <button
                type="button"
                onClick={() => handleClose(false)}
                disabled={uploading}
                className="rounded-md px-3 py-2 text-sm font-semibold text-black/60 hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || !eventId || uploading}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#007E72] text-white font-semibold px-4 py-2 text-sm hover:bg-[#007E72]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> Import
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-center">
                <div className="text-2xl font-bold text-emerald-700">
                  {result.inserted}
                </div>
                <div className="text-[0.7rem] uppercase tracking-wide text-emerald-700/70">
                  New
                </div>
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">
                  {result.updated}
                </div>
                <div className="text-[0.7rem] uppercase tracking-wide text-blue-700/70">
                  Updated
                </div>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center">
                <div className="text-2xl font-bold text-amber-700">
                  {result.skipped}
                </div>
                <div className="text-[0.7rem] uppercase tracking-wide text-amber-700/70">
                  Skipped
                </div>
              </div>
            </div>

            <div className="text-xs text-black/60">
              File: <strong>{result.filename}</strong> · Event:{" "}
              <strong>{result.eventTitle}</strong> · {result.totalRows} rows
              processed
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 max-h-48 overflow-y-auto">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-2">
                  <AlertCircle className="h-4 w-4" />
                  First {result.errors.length} issue
                  {result.errors.length === 1 ? "" : "s"} (of {result.skipped}{" "}
                  skipped):
                </div>
                <ul className="text-[0.7rem] text-amber-900 space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      <strong>Row {e.row}:</strong> {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-black/10">
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="rounded-md bg-[#007E72] text-white font-semibold px-4 py-2 text-sm hover:bg-[#007E72]/90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
