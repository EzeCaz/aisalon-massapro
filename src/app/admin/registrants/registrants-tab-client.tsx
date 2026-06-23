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
  UserPlus,
  SearchCheck,
  Link2,
  X,
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

/**
 * Lightweight member type for the "Add to existing member" picker.
 * Loaded once from /api/admin/members when the picker opens.
 */
type MemberOption = {
  id: string;
  email: string;
  name: string | null;
  mobile: string | null;
  company: string | null;
};

/**
 * Suggested match from the find-members endpoint. Used by the
 * "Look for members" bulk action.
 */
type MemberSuggestion = {
  userId: string;
  name: string | null;
  email: string;
  mobile: string | null;
  company: string | null;
  score: number;
  reasons: string[];
};

type FindMembersResult = {
  rsvpId: string;
  rsvpEmail: string;
  rsvpName: string | null;
  rsvpEventTitle: string;
  suggestions: MemberSuggestion[];
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

  // ---- Bulk selection state ----
  // Set of RSVP IDs that are currently checked. We use a Set for O(1)
  // toggle. The "select all" checkbox in the header toggles all rows
  // in the current filtered view.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // ---- "Add to existing member" dialog state ----
  // Opens when the admin clicks "Link to member" on a single unlinked
  // registrant row. Shows a searchable picker of ALL members, with the
  // most likely matches surfaced at the top via client-side scoring.
  const [linkRsvp, setLinkRsvp] = React.useState<Rsvp | null>(null);
  const [linkOpen, setLinkOpen] = React.useState(false);

  // ---- "Look for members" bulk action state ----
  // Opens when the admin clicks "Look for members" in the toolbar.
  // Calls /api/admin/registrants/find-members for all unlinked RSVPs,
  // shows a review dialog with suggested matches, then bulk-links them.
  const [findOpen, setFindOpen] = React.useState(false);
  const [findLoading, setFindLoading] = React.useState(false);
  const [findResults, setFindResults] = React.useState<FindMembersResult[]>([]);
  // Map of rsvpId -> selected suggestion userId (the admin's picks)
  const [findPicks, setFindPicks] = React.useState<Record<string, string>>({});

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      // If everything is already selected, clear. Otherwise select all filtered.
      if (prev.size === filtered.length && filtered.every((r) => prev.has(r.id))) {
        return new Set();
      }
      return new Set(filtered.map((r) => r.id));
    });
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someFilteredSelected = filtered.some((r) => selected.has(r.id));

  function openLinkDialog(rsvp: Rsvp) {
    setLinkRsvp(rsvp);
    setLinkOpen(true);
  }

  async function handleLinkMember(rsvpId: string, userId: string) {
    try {
      const res = await fetch(`/api/admin/registrants/${rsvpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Update local state so the "linked user" badge appears immediately
      setRsvps((prev) =>
        prev.map((r) => (r.id === rsvpId ? { ...r, user: data.rsvp.user, userId: data.rsvp.user?.id || null } : r))
      );
      toast.success("Registrant linked to member");
      setLinkOpen(false);
      setLinkRsvp(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function openFindMembersDialog() {
    setFindOpen(true);
    setFindLoading(true);
    setFindResults([]);
    setFindPicks({});
    try {
      // Pass the currently-selected unlinked RSVPs if any are selected,
      // otherwise process ALL unlinked RSVPs.
      const selectedUnlinked = filtered.filter(
        (r) => !r.userId && selected.has(r.id)
      );
      const body =
        selectedUnlinked.length > 0
          ? { rsvpIds: selectedUnlinked.map((r) => r.id) }
          : {};
      const res = await fetch("/api/admin/registrants/find-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFindResults(data.results || []);
      // Pre-select the top suggestion for each RSVP (admin can change)
      const initialPicks: Record<string, string> = {};
      for (const r of data.results || []) {
        if (r.suggestions && r.suggestions.length > 0) {
          initialPicks[r.rsvpId] = r.suggestions[0].userId;
        }
      }
      setFindPicks(initialPicks);
    } catch (e) {
      toast.error((e as Error).message);
      setFindOpen(false);
    } finally {
      setFindLoading(false);
    }
  }

  async function applyFindMembersLinks() {
    const links = Object.entries(findPicks).map(([rsvpId, userId]) => ({
      rsvpId,
      userId,
    }));
    if (links.length === 0) {
      toast.error("No matches selected to apply");
      return;
    }
    setFindLoading(true);
    try {
      const res = await fetch("/api/admin/registrants/bulk-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      toast.success(
        `Linked ${data.linked} registrant${data.linked === 1 ? "" : "s"} to members${
          data.errors?.length ? ` (${data.errors.length} errors)` : ""
        }`
      );
      setFindOpen(false);
      // Reload to reflect the new links in the table
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFindLoading(false);
    }
  }

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
          onClick={openFindMembersDialog}
          disabled={findLoading}
          title="Find likely member matches for all unlinked registrants (or selected unlinked ones)"
          className="inline-flex items-center gap-2 rounded-md border border-[#820A7D] text-[#820A7D] bg-white font-semibold px-3 py-2 text-sm hover:bg-[#820A7D]/5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <SearchCheck className="h-4 w-4" />
          Look for members
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

      {/* Selection indicator bar — only visible when rows are selected */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-[#820A7D]/30 bg-[#820A7D]/5 px-3 py-2 text-sm">
          <div className="text-[#820A7D]">
            <strong>{selected.size}</strong> registrant{selected.size === 1 ? "" : "s"} selected
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openFindMembersDialog}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#820A7D] text-[#820A7D] bg-white px-2.5 py-1 text-xs font-semibold hover:bg-[#820A7D]/10"
            >
              <SearchCheck className="h-3.5 w-3.5" /> Find members for selected
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-black/50 hover:text-black/70 hover:bg-black/5"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-md border border-black/10 bg-white p-8 text-center text-sm text-black/50">
          No registrants match your filters.
        </div>
      ) : (
        <div className="rounded-md border border-black/10 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-black/60 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-3 font-bold w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected;
                    }}
                    onChange={toggleSelectAll}
                    aria-label="Select all registrants"
                    className="h-4 w-4 cursor-pointer accent-[#FF005A]"
                  />
                </th>
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
                const isSelected = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-black/5 hover:bg-black/[0.015] ${isSelected ? "bg-[#FF005A]/[0.04]" : ""}`}
                  >
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(r.id)}
                        aria-label={`Select ${r.name || r.email}`}
                        className="h-4 w-4 cursor-pointer accent-[#FF005A]"
                      />
                    </td>
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
                          <Link2 className="h-3 w-3" /> linked to {r.user.name || r.user.email}
                        </span>
                      ) : (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700">
                          unlinked
                        </span>
                      )}
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
                        {!r.user && (
                          <button
                            type="button"
                            onClick={() => openLinkDialog(r)}
                            title="Link to an existing member account"
                            className="inline-flex items-center gap-1 rounded-md border border-[#820A7D]/40 text-[#820A7D] px-2.5 py-1.5 text-xs font-semibold hover:bg-[#820A7D]/5"
                          >
                            <UserPlus className="h-3.5 w-3.5" /> Add to member
                          </button>
                        )}
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

      {/* Link-to-member modal — opens when "Add to member" is clicked on
          an unlinked registrant row. Lets the admin pick from all members. */}
      <LinkToMemberDialog
        open={linkOpen}
        rsvp={linkRsvp}
        onLink={handleLinkMember}
        onClose={() => {
          setLinkOpen(false);
          setLinkRsvp(null);
        }}
      />

      {/* Find-members modal — bulk action. Shows suggested matches for
          all unlinked RSVPs (or selected unlinked ones), lets the admin
          review and apply all links in one go. */}
      <FindMembersDialog
        open={findOpen}
        loading={findLoading}
        results={findResults}
        picks={findPicks}
        onPicksChange={setFindPicks}
        onApply={applyFindMembersLinks}
        onClose={() => setFindOpen(false)}
      />
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

// ---------------------------------------------------------------------------
// LinkToMemberDialog — pick an existing member to link an unlinked RSVP to.
// Shows ALL members in a searchable list. The most likely matches (based
// on email/name/mobile similarity) are surfaced at the top with a
// "Likely match" badge. The admin can also search/filter manually.
// ---------------------------------------------------------------------------

function LinkToMemberDialog({
  open,
  rsvp,
  onLink,
  onClose,
}: {
  open: boolean;
  rsvp: Rsvp | null;
  onLink: (rsvpId: string, userId: string) => void;
  onClose: () => void;
}) {
  const [members, setMembers] = React.useState<MemberOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [linking, setLinking] = React.useState<string | null>(null);

  // Load members when the dialog opens
  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/admin/members")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        setMembers(
          (data.members || []).map((m: MemberOption & { mobile?: string | null }) => ({
            id: m.id,
            email: m.email,
            name: m.name,
            mobile: m.mobile ?? null,
            company: m.company ?? null,
          }))
        );
      })
      .catch((e) => toast.error(`Failed to load members: ${e.message}`))
      .finally(() => setLoading(false));
  }, [open]);

  // Score each member by likelihood of being the same person as the RSVP.
  // This is a simplified client-side version of the server-side matching
  // algorithm in /api/admin/registrants/find-members.
  const scoredMembers = React.useMemo(() => {
    if (!rsvp) return [];
    const rsvpEmail = rsvp.email.toLowerCase();
    const rsvpName = (rsvp.name || "").toLowerCase().trim();
    const rsvpFirst = rsvpName.split(/\s+/)[0] || "";
    const rsvpDomain = rsvpEmail.split("@")[1] || "";

    return members
      .map((m) => {
        let score = 0;
        const reasons: string[] = [];
        const mEmail = m.email.toLowerCase();
        const mName = (m.name || "").toLowerCase().trim();
        const mFirst = mName.split(/\s+/)[0] || "";
        const mDomain = mEmail.split("@")[1] || "";

        if (mEmail === rsvpEmail) {
          score = 100;
          reasons.push("Exact email match");
        } else if (mName && mName === rsvpName) {
          score = 75;
          reasons.push("Exact name match");
        } else if (
          mDomain &&
          rsvpDomain &&
          mDomain === rsvpDomain &&
          !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(mDomain)
        ) {
          score = 40;
          reasons.push(`Same email domain (@${mDomain})`);
        } else if (rsvpFirst && mFirst && rsvpFirst === mFirst) {
          score = 15;
          reasons.push(`Same first name (${rsvpFirst})`);
        }

        return { ...m, score, reasons };
      })
      .filter((m) => m.score >= 15 || !query); // when searching, show all matches
  }, [members, rsvp, query]);

  // Sort: highest score first, then by name. When the user is searching
  // (query is non-empty), filter by the query AND sort by score (so likely
  // matches still bubble up even within search results).
  const displayedMembers = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? scoredMembers.filter(
          (m) =>
            m.email.toLowerCase().includes(q) ||
            (m.name || "").toLowerCase().includes(q) ||
            (m.company || "").toLowerCase().includes(q)
        )
      : scoredMembers;
    return [...filtered].sort((a, b) => {
      // Likely matches (score >= 15) always come first, sorted by score
      if (a.score >= 15 && b.score >= 15) return b.score - a.score;
      if (a.score >= 15) return -1;
      if (b.score >= 15) return 1;
      // Then alphabetical by name
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }, [scoredMembers, query]);

  const likelyMatches = displayedMembers.filter((m) => m.score >= 15);
  const otherMembers = displayedMembers.filter((m) => m.score < 15);

  async function handlePick(m: MemberOption) {
    if (!rsvp) return;
    setLinking(m.id);
    onLink(rsvp.id, m.id);
    setLinking(null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[#820A7D]" />
            Add to existing member
          </DialogTitle>
          <DialogDescription>
            Link this registrant to an existing member account. The most
            likely matches are shown at the top based on email, name, and
            mobile similarity.
          </DialogDescription>
        </DialogHeader>

        {rsvp && (
          <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 text-sm">
            <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Registrant
            </div>
            <div className="font-semibold text-black">{rsvp.name || rsvp.email}</div>
            <div className="text-xs text-black/60">{rsvp.email}</div>
            <div className="text-xs text-black/50 mt-0.5">
              RSVP for <strong>{rsvp.event.title}</strong>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all members by name, email, or company…"
            className="w-full rounded-md border border-black/15 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-black/50">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading members…
            </div>
          ) : displayedMembers.length === 0 ? (
            <div className="text-center py-8 text-sm text-black/50">
              {query ? "No members match your search." : "No members found."}
            </div>
          ) : (
            <>
              {likelyMatches.length > 0 && (
                <div className="text-[0.65rem] font-bold uppercase tracking-widest text-[#820A7D] pt-2 pb-1 px-1">
                  Likely matches ({likelyMatches.length})
                </div>
              )}
              {likelyMatches.map((m) => (
                <MemberPickerRow
                  key={m.id}
                  member={m}
                  likely
                  onPick={() => handlePick(m)}
                  disabled={linking !== null}
                  busy={linking === m.id}
                />
              ))}
              {otherMembers.length > 0 && (
                <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 pt-3 pb-1 px-1">
                  All members ({otherMembers.length})
                </div>
              )}
              {otherMembers.slice(0, 200).map((m) => (
                <MemberPickerRow
                  key={m.id}
                  member={m}
                  likely={false}
                  onPick={() => handlePick(m)}
                  disabled={linking !== null}
                  busy={linking === m.id}
                />
              ))}
              {otherMembers.length > 200 && (
                <div className="text-center py-3 text-xs text-black/40">
                  Showing first 200 — refine your search to see more.
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberPickerRow({
  member,
  likely,
  onPick,
  disabled,
  busy,
}: {
  member: MemberOption & { score?: number; reasons?: string[] };
  likely: boolean;
  onPick: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
        likely
          ? "border-[#820A7D]/30 bg-[#820A7D]/5 hover:bg-[#820A7D]/10"
          : "border-black/10 bg-white hover:bg-black/[0.02]"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-black text-sm truncate">
            {member.name || member.email}
          </div>
          <div className="text-xs text-black/60 truncate">{member.email}</div>
          {member.company && (
            <div className="text-[0.65rem] text-black/50 truncate mt-0.5">{member.company}</div>
          )}
          {likely && member.reasons && member.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {member.reasons.map((r, i) => (
                <span
                  key={i}
                  className="text-[0.6rem] font-semibold bg-[#820A7D]/10 text-[#820A7D] px-1.5 py-0.5 rounded"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {likely && (
            <span className="text-[0.6rem] font-bold uppercase bg-[#820A7D] text-white px-1.5 py-0.5 rounded">
              Likely
            </span>
          )}
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#820A7D]" />
          ) : (
            <Link2 className="h-4 w-4 text-black/40" />
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// FindMembersDialog — bulk action. Shows suggested matches for all
// unlinked RSVPs (or selected unlinked ones). The admin reviews each
// suggestion, can change the pick or skip, then applies all in one go.
// ---------------------------------------------------------------------------

function FindMembersDialog({
  open,
  loading,
  results,
  picks,
  onPicksChange,
  onApply,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  results: FindMembersResult[];
  picks: Record<string, string>;
  onPicksChange: (next: Record<string, string>) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const withSuggestions = results.filter((r) => r.suggestions.length > 0);
  const noSuggestions = results.filter((r) => r.suggestions.length === 0);
  const pickedCount = Object.keys(picks).length;

  function setPick(rsvpId: string, userId: string | null) {
    const next = { ...picks };
    if (userId === null) delete next[rsvpId];
    else next[rsvpId] = userId;
    onPicksChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchCheck className="h-4 w-4 text-[#820A7D]" />
            Look for members
          </DialogTitle>
          <DialogDescription>
            Suggested member matches for {results.length} unlinked registrant
            {results.length === 1 ? "" : "s"}. Review each suggestion, change
            the pick if needed, then apply.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-black/50">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Finding likely
            member matches…
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 text-sm text-black/50">
            No unlinked registrants found. Every registrant is already linked
            to a member account.
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-3">
              {withSuggestions.length > 0 && (
                <div className="text-[0.65rem] font-bold uppercase tracking-widest text-[#820A7D] pt-1 px-1">
                  With likely matches ({withSuggestions.length})
                </div>
              )}
              {withSuggestions.map((r) => (
                <div
                  key={r.rsvpId}
                  className="rounded-md border border-black/10 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-black text-sm">
                        {r.rsvpName || r.rsvpEmail}
                      </div>
                      <div className="text-xs text-black/60 truncate">{r.rsvpEmail}</div>
                      <div className="text-[0.65rem] text-black/50 mt-0.5">
                        RSVP for <strong>{r.rsvpEventTitle}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {r.suggestions.map((s) => {
                      const isPicked = picks[r.rsvpId] === s.userId;
                      return (
                        <label
                          key={s.userId}
                          className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors ${
                            isPicked
                              ? "border-[#820A7D] bg-[#820A7D]/5"
                              : "border-black/10 bg-white hover:bg-black/[0.02]"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`rsvp-${r.rsvpId}`}
                            checked={isPicked}
                            onChange={() => setPick(r.rsvpId, s.userId)}
                            className="mt-0.5 h-4 w-4 cursor-pointer accent-[#820A7D]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-black text-sm">
                                {s.name || s.email}
                              </span>
                              <span className="text-[0.6rem] font-bold uppercase bg-[#820A7D]/10 text-[#820A7D] px-1.5 py-0.5 rounded">
                                {s.score}% match
                              </span>
                            </div>
                            <div className="text-xs text-black/60 truncate">{s.email}</div>
                            {s.company && (
                              <div className="text-[0.65rem] text-black/50 truncate">
                                {s.company}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {s.reasons.map((reason, i) => (
                                <span
                                  key={i}
                                  className="text-[0.6rem] text-black/50 bg-black/5 px-1.5 py-0.5 rounded"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                    <label className="flex items-center gap-2 text-xs text-black/50 px-2.5 py-1 cursor-pointer">
                      <input
                        type="radio"
                        name={`rsvp-${r.rsvpId}`}
                        checked={!picks[r.rsvpId]}
                        onChange={() => setPick(r.rsvpId, null)}
                        className="h-4 w-4 cursor-pointer accent-black/40"
                      />
                      Skip — don&apos;t link this registrant
                    </label>
                  </div>
                </div>
              ))}

              {noSuggestions.length > 0 && (
                <>
                  <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 pt-3 px-1">
                    No likely matches found ({noSuggestions.length})
                  </div>
                  <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 text-xs text-black/60">
                    {noSuggestions.length} registrant
                    {noSuggestions.length === 1 ? "" : "s"} had no member
                    matches above the similarity threshold. You can still
                    link them manually via the &quot;Add to member&quot;
                    button on each row.
                    <details className="mt-2">
                      <summary className="cursor-pointer text-black/50 hover:text-black/70">
                        Show list
                      </summary>
                      <ul className="mt-1 space-y-0.5">
                        {noSuggestions.map((r) => (
                          <li key={r.rsvpId}>
                            {r.rsvpName || r.rsvpEmail}{" "}
                            <span className="text-black/40">({r.rsvpEmail})</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-black/10">
              <div className="text-xs text-black/60">
                <strong className="text-[#820A7D]">{pickedCount}</strong> of{" "}
                {withSuggestions.length} registrant
                {withSuggestions.length === 1 ? "" : "s"} selected for linking
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold text-black hover:bg-black/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onApply}
                  disabled={pickedCount === 0 || loading}
                  className="inline-flex items-center gap-2 rounded-md bg-[#820A7D] text-white font-semibold px-4 py-2 text-sm hover:bg-[#820A7D]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Link {pickedCount > 0 ? pickedCount : ""} registrant
                  {pickedCount === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
