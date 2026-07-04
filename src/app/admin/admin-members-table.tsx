"use client";

import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { MEMBER_TAG_CATALOG, tagColor } from "@/lib/tags";
import { PhotoUploadField } from "@/components/ais/photo-upload-field";
import {
  ASSIGNABLE_ROLES,
  isSuperAdminEmail,
  ROLES,
  roleBadgeClass,
  roleLabel,
  type Role,
} from "@/lib/permissions";
import {
  Shield,
  Search,
  Tag as TagIcon,
  Link2,
  UserPlus,
  ChevronDown,
  ChevronRight,
  Mail,
  Phone,
  Linkedin,
  Briefcase,
  FileText,
  Megaphone,
  Calendar,
  CheckCircle2,
  ExternalLink,
  X,
  ListChecks,
  Loader2,
  Merge as MergeIcon,
  AlertTriangle,
  ArrowRight,
  Table as TableIcon,
  LayoutGrid,
  Plus,
  Trash2,
  Edit3,
  Save,
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  Archive,
  KeyRound,
  Eye,
  EyeOff,
  Mail as MailIcon,
} from "lucide-react";
import { formatDateTimeTlv, formatDateTlv } from "@/lib/datetime-tlv";

type LinkedSpeaker = {
  id: string;
  name: string;
  topic: string | null;
  event: { id: string; title: string; slug: string };
};

type SecondaryEmail = {
  id: string;
  email: string;
  label: string | null;
  createdAt: string;
};

type Member = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  photoUrl?: string | null;
  bio?: string | null;
  company?: string | null;
  companyUrl?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  // Imported-only fields (admin-only)
  mobile?: string | null;
  interestedIn?: string | null;
  profileCategories?: string | null;
  appliedFor?: string | null;
  invitedToSpeak?: string | null;
  importSource?: string | null;
  importedAt?: string | null;
  onboardedAt?: string | null;
  role: string;
  createdAt: string;
  tags: { id: string; label: string; color: string | null }[];
  _count: { images: number };
  speakers: LinkedSpeaker[];
  secondaryEmails: SecondaryEmail[];
};

type EventRow = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
};

type SpeakerRow = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  topic: string | null;
  event: { id: string; title: string; slug: string; startsAt: string };
  user: { id: string; email: string } | null;
};

type Props = {
  members: Member[];
  events: EventRow[];
  allSpeakers: SpeakerRow[];
  /** Email of the currently-signed-in admin (for self-demotion block). */
  currentUserEmail?: string;
  /** Role of the currently-signed-in admin (drives role dropdown visibility). */
  currentUserRole?: string;
};

export function AdminMembersTable({
  members,
  events,
  allSpeakers,
  currentUserEmail,
  currentUserRole,
}: Props) {
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterApplied, setFilterApplied] = useState<string>("");
  const [filterInvited, setFilterInvited] = useState(false);
  const [filterLinked, setFilterLinked] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  // Secondary-email management state (used by ManageEmailsDialog)
  const [emailMember, setEmailMember] = useState<Member | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  // Edit-member state — opens the EditMemberDialog when a name is
  // clicked or the Edit button on a row is pressed.
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Bulk-import state — opens the ImportMembersDialog when the Import
  // CSV/XLS button in the toolbar is clicked. Lets the admin upload a
  // spreadsheet of members to bulk-import.
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const matchSearch =
        !q ||
        m.email.toLowerCase().includes(q) ||
        (m.name || "").toLowerCase().includes(q) ||
        (m.company || "").toLowerCase().includes(q) ||
        m.tags.some((t) => t.label.toLowerCase().includes(q)) ||
        m.secondaryEmails.some((e) => e.email.toLowerCase().includes(q));
      const matchApplied = !filterApplied || m.appliedFor === filterApplied;
      const matchInvited = !filterInvited || m.invitedToSpeak === "Yes";
      const matchLinked = !filterLinked || m.speakers.length > 0;
      return matchSearch && matchApplied && matchInvited && matchLinked;
    });
  }, [members, search, filterApplied, filterInvited, filterLinked]);

  // Secondary-email handlers — call the API and reload on success
  async function addSecondaryEmail(memberId: string, email: string, label: string) {
    const t = toast.loading("Adding email…");
    try {
      const res = await fetch(`/api/admin/members/${memberId}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.success("Email added.", { id: t });
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    }
  }

  async function removeSecondaryEmail(memberId: string, emailId: string) {
    const t = toast.loading("Removing email…");
    try {
      const res = await fetch(`/api/admin/members/${memberId}/emails/${emailId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      toast.success("Email removed.", { id: t });
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    }
  }

  function openEmailDialog(member: Member) {
    setEmailMember(member);
    setEmailOpen(true);
  }

  function openEditDialog(member: Member) {
    setEditMember(member);
    setEditOpen(true);
  }

  // When the filtered list changes, drop any selections that are no
  // longer visible — prevents accidentally bulk-editing hidden rows.
  useEffect(() => {
    setSelected((prev) => {
      const visibleIds = new Set(filtered.map((m) => m.id));
      const next = new Set<string>();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(filtered.map((m) => m.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((m) => selected.has(m.id));
  const someVisibleSelected =
    !allVisibleSelected && filtered.some((m) => selected.has(m.id));

  async function bulkSaveTags(addTags: string[], removeTags: string[]) {
    if (selected.size === 0) return;
    if (addTags.length === 0 && removeTags.length === 0) {
      toast.error("Pick at least one tag to add or remove");
      return;
    }
    setBulkPending(true);
    const t = toast.loading(
      `Updating tags on ${selected.size} member${selected.size === 1 ? "" : "s"}…`
    );
    try {
      const res = await fetch(`/api/admin/members/bulk-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: Array.from(selected),
          addTags,
          removeTags,
        }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          if (err?.error) msg = err.error;
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      toast.success(`Tags updated on ${data.updated} member${data.updated === 1 ? "" : "s"}`, { id: t });
      setBulkTagOpen(false);
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setBulkPending(false);
    }
  }

  async function bulkLinkSpeaker(speakerId: string | null) {
    if (selected.size === 0) return;
    if (!speakerId) {
      toast.error("Pick a speaker to link");
      return;
    }
    setBulkPending(true);
    const t = toast.loading(
      `Linking ${selected.size} member${selected.size === 1 ? "" : "s"} to speaker…`
    );
    const ids = Array.from(selected);
    let ok = 0;
    let fail = 0;
    // Sequential to avoid hammering the DB with parallel transactions.
    for (const id of ids) {
      try {
        const res = await fetch(`/api/admin/members/${id}/link-speaker`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speakerId }),
        });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    if (fail === 0) {
      toast.success(`Linked ${ok} member${ok === 1 ? "" : "s"} to speaker`, { id: t });
    } else if (ok === 0) {
      toast.error(`All ${fail} failed`, { id: t });
    } else {
      toast.warning(`${ok} linked, ${fail} failed`, { id: t, duration: 8000 });
    }
    setBulkLinkOpen(false);
    setBulkPending(false);
    window.location.reload();
  }

  async function bulkMerge(
    primaryId: string,
    secondaryIds: string[],
    confirmNameMismatch: boolean
  ) {
    if (secondaryIds.length === 0) return;
    setBulkPending(true);
    const t = toast.loading(
      `Merging ${secondaryIds.length} account${secondaryIds.length === 1 ? "" : "s"} into primary…`
    );
    try {
      const res = await fetch(`/api/admin/members/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryId,
          secondaryIds,
          confirmNameMismatch,
        }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          if (err?.error) msg = err.error;
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      toast.success(
        `Merged ${data.deletedCount} account${data.deletedCount === 1 ? "" : "s"} into primary. All data combined.`,
        { id: t, duration: 6000 }
      );
      setMergeOpen(false);
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    } finally {
      setBulkPending(false);
    }
  }

  async function saveTags(memberId: string, tags: string[]) {
    setPending(memberId);
    const t = toast.loading("Saving tags…");
    try {
      const res = await fetch(`/api/admin/members/${memberId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Tags updated", { id: t });
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setPending(null);
    }
  }

  async function linkSpeaker(memberId: string, speakerId: string | null) {
    setPending(memberId);
    const t = toast.loading(speakerId ? "Linking to speaker…" : "Unlinking…");
    try {
      const res = await fetch(`/api/admin/members/${memberId}/link-speaker`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success(speakerId ? "Linked to speaker" : "Unlinked", { id: t });
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setPending(null);
    }
  }

  async function convertToSpeaker(
    memberId: string,
    payload: { eventId: string; topic?: string; role?: string; bio?: string }
  ) {
    setPending(memberId);
    const t = toast.loading("Converting to speaker…");
    try {
      const res = await fetch(
        `/api/admin/members/${memberId}/convert-to-speaker`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      const data = await res.json();
      // Defensive: the API is supposed to include `event` on the speaker
      // payload, but older code paths or a future regression could omit
      // it. Use optional chaining + a fallback so we never throw
      // "Cannot read properties of undefined (reading 'title')" — that
      // exact error was reported when adding Eyal Rond as a speaker on
      // The Human AI event (the idempotency branch was missing the include).
      const eventTitle = data?.speaker?.event?.title ?? "the event";
      toast.success(
        data.created
          ? `Created speaker profile on ${eventTitle}`
          : `Already a speaker on ${eventTitle}`,
        { id: t }
      );
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setPending(null);
    }
  }

  async function archiveMember(member: Member) {
    if (!isSuperAdminEmail(currentUserEmail)) {
      toast.error("Only a Super Admin can archive members.");
      return;
    }
    if (isSuperAdminEmail(member.email)) {
      toast.error("Super Admins cannot be archived.");
      return;
    }
    if (member.email === currentUserEmail) {
      toast.error("You cannot archive your own account.");
      return;
    }
    const displayName = member.name || member.email;
    // Use window.confirm for the destructive action — it's the most
    // explicit "are you sure?" affordance available.
    const ok = window.confirm(
      `Archive ${displayName}?\n\n` +
        `They will be hidden from the main members list. Their data is ` +
        `preserved for audit and can be restored from the archive page ` +
        `(Super Admins only).`
    );
    if (!ok) return;
    setPending(member.id);
    const t = toast.loading(`Archiving ${displayName}…`);
    try {
      const res = await fetch(`/api/admin/members/${member.id}/archive`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      toast.success(`${displayName} archived.`, { id: t });
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Search + filters + view toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-black/30" />
          <Input
            placeholder="Search by name, email, company, tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <select
          value={filterApplied}
          onChange={(e) => setFilterApplied(e.target.value)}
          className="text-sm border border-black/15 rounded-md px-2 py-2 bg-white"
        >
          <option value="">All applied-for</option>
          <option value="Fast pitch">Fast pitch</option>
          <option value="Presentation/Lecure">Presentation/Lecture</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-black/70 cursor-pointer">
          <Checkbox
            checked={filterInvited}
            onCheckedChange={(v) => setFilterInvited(!!v)}
          />
          Invited to speak
        </label>
        <label className="flex items-center gap-1.5 text-xs text-black/70 cursor-pointer">
          <Checkbox
            checked={filterLinked}
            onCheckedChange={(v) => setFilterLinked(!!v)}
          />
          Linked to speaker
        </label>
        <Button
          size="sm"
          variant="outline"
          className="h-9 border-[#007E72] text-[#007E72] hover:bg-[#007E72]/5"
          onClick={() => setImportOpen(true)}
          title="Bulk-import members from a CSV or XLS file"
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Import CSV/XLS
        </Button>
        <span className="text-xs text-black/40 ml-auto">
          {filtered.length} of {members.length} members
        </span>
        {/* View toggle — Cards vs Table */}
        <div className="inline-flex border border-black/15 rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold transition-colors ${
              viewMode === "cards"
                ? "bg-black text-white"
                : "bg-white text-black/60 hover:bg-black/5"
            }`}
            title="Cards view (expandable rows)"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold transition-colors border-l border-black/10 ${
              viewMode === "table"
                ? "bg-black text-white"
                : "bg-white text-black/60 hover:bg-black/5"
            }`}
            title="Table view (all fields, horizontal scroll)"
          >
            <TableIcon className="h-3.5 w-3.5" /> Table
          </button>
        </div>
      </div>

      {/* Bulk action bar — only visible when rows are selected.
          The Merge button is ALWAYS shown (disabled when <2 selected)
          so admins can discover the feature without having to know
          they need to pick 2+ rows first. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-[#FF005A]/5 border border-[#FF005A]/20 rounded-md px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#FF005A]">
            <ListChecks className="h-4 w-4" />
            {selected.size} selected
          </span>
          <div className="h-4 w-px bg-black/10 mx-1" />
          {filtered.length > selected.size && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={selectAllVisible}
            >
              Select all {filtered.length} visible
            </Button>
          )}
          <BulkTagDialog
            open={bulkTagOpen}
            onOpenChange={setBulkTagOpen}
            pending={bulkPending}
            onSubmit={(add, remove) => bulkSaveTags(add, remove)}
          />
          <BulkLinkSpeakerDialog
            open={bulkLinkOpen}
            onOpenChange={setBulkLinkOpen}
            pending={bulkPending}
            allSpeakers={allSpeakers}
            count={selected.size}
            onSubmit={(sid) => bulkLinkSpeaker(sid)}
          />
          {/* Merge button — always rendered so it's discoverable.
              When <2 selected, it's disabled and shows a tooltip. */}
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size < 2}
            onClick={() => selected.size >= 2 && setMergeOpen(true)}
            title={
              selected.size < 2
                ? "Select 2 or more members to merge"
                : `Merge ${selected.size} selected members`
            }
            className="border-[#820A7D] text-[#820A7D] h-7 disabled:opacity-40 disabled:cursor-not-allowed disabled:border-black/15 disabled:text-black/40"
          >
            <MergeIcon className="h-3.5 w-3.5 mr-1" /> Merge{" "}
            {selected.size >= 2 ? `(${selected.size})` : ""}
          </Button>
          {selected.size >= 2 && (
            <MergeMembersDialog
              open={mergeOpen}
              onOpenChange={setMergeOpen}
              pending={bulkPending}
              selectedMembers={filtered.filter((m) => selected.has(m.id))}
              onMerge={(primaryId, secondaryIds, confirm) =>
                bulkMerge(primaryId, secondaryIds, confirm)
              }
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs ml-auto"
            onClick={clearSelection}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Tip showing how to merge when nothing is selected yet */}
      {selected.size === 0 && (
        <div className="flex items-center gap-2 text-[0.7rem] text-black/40 px-1">
          <MergeIcon className="h-3 w-3 text-[#820A7D]" />
          Tip: tick 2+ checkboxes on the left to enable Merge, Bulk edit tags, and Bulk link speaker.
        </div>
      )}

      {viewMode === "cards" ? (
        <CardsView
          filtered={filtered}
          expanded={expanded}
          selected={selected}
          allVisibleSelected={allVisibleSelected}
          someVisibleSelected={someVisibleSelected}
          pending={pending}
          allSpeakers={allSpeakers}
          events={events}
          canArchive={isSuperAdminEmail(currentUserEmail)}
          onToggleSelect={toggleSelect}
          onToggleExpanded={toggleExpanded}
          onSelectAllVisible={selectAllVisible}
          onClearSelection={clearSelection}
          onSaveTags={saveTags}
          onLinkSpeaker={linkSpeaker}
          onConvertToSpeaker={convertToSpeaker}
          onOpenEmailDialog={openEmailDialog}
          onOpenEditDialog={openEditDialog}
          onArchive={archiveMember}
        />
      ) : (
        <TableView
          filtered={filtered}
          selected={selected}
          allVisibleSelected={allVisibleSelected}
          someVisibleSelected={someVisibleSelected}
          canArchive={isSuperAdminEmail(currentUserEmail)}
          onToggleSelect={toggleSelect}
          onSelectAllVisible={selectAllVisible}
          onClearSelection={clearSelection}
          onOpenEmailDialog={openEmailDialog}
          onOpenEditDialog={openEditDialog}
          onArchive={archiveMember}
        />
      )}

      {/* Manage-emails dialog — controlled at the top level so any
          row can open it. */}
      <ManageEmailsDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        member={emailMember}
        onAdd={(email, label) =>
          emailMember && addSecondaryEmail(emailMember.id, email, label)
        }
        onRemove={(emailId) =>
          emailMember && removeSecondaryEmail(emailMember.id, emailId)
        }
      />

      {/* Edit-member dialog — opens when the member name or the Edit
          button on a row is clicked. Lets the admin edit the profile
          fields (name, bio, company, links, mobile, intake-form
          fields). Company name is a combobox — pick from existing or
          type a new one. */}
      <EditMemberDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        member={editMember}
        currentUserEmail={currentUserEmail}
        currentUserRole={currentUserRole}
        onArchive={archiveMember}
        onSaved={() => {
          setEditOpen(false);
          setEditMember(null);
          // Reload to reflect the updated row in both CardsView and
          // TableView. The EditMemberDialog already optimistically
          // patches local state, but a reload guarantees the row is
          // fresh from the server (incl. linked user, tags count,
          // etc.).
          window.location.reload();
        }}
      />
      <ImportMembersDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          setImportOpen(false);
          // Reload the admin page so the newly imported members show up
          // in the table (and the count "X of Y members" updates).
          window.location.reload();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardsView — the original expandable-row view (Member | Applied for |
// Linked speaker | Tags | Actions). Each row expands into a MemberDetail
// panel showing all the secondary fields, contact info, etc.
// ---------------------------------------------------------------------------

function CardsView({
  filtered,
  expanded,
  selected,
  allVisibleSelected,
  someVisibleSelected,
  pending,
  allSpeakers,
  events,
  canArchive,
  onToggleSelect,
  onToggleExpanded,
  onSelectAllVisible,
  onClearSelection,
  onSaveTags,
  onLinkSpeaker,
  onConvertToSpeaker,
  onOpenEmailDialog,
  onOpenEditDialog,
  onArchive,
}: {
  filtered: Member[];
  expanded: Set<string>;
  selected: Set<string>;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  pending: string | null;
  allSpeakers: SpeakerRow[];
  events: EventRow[];
  canArchive: boolean;
  onToggleSelect: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onSaveTags: (id: string, tags: string[]) => void;
  onLinkSpeaker: (id: string, sid: string | null) => void;
  onConvertToSpeaker: (
    id: string,
    payload: { eventId: string; topic?: string; role?: string; bio?: string }
  ) => void;
  onOpenEmailDialog: (m: Member) => void;
  onOpenEditDialog: (m: Member) => void;
  onArchive: (m: Member) => void;
}) {
  return (
    <div className="border border-black/10 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-black/60 text-xs uppercase tracking-wider sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-3 w-10">
                <Checkbox
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                      ? "indeterminate"
                      : false
                  }
                  onCheckedChange={() => {
                    if (allVisibleSelected) onClearSelection();
                    else onSelectAllVisible();
                  }}
                  aria-label="Select all visible"
                />
              </th>
              <th className="text-left px-2 py-3 w-8"></th>
              <th className="text-left px-4 py-3 font-bold">Member</th>
              <th className="text-left px-4 py-3 font-bold hidden md:table-cell">Applied for</th>
              <th className="text-left px-4 py-3 font-bold hidden lg:table-cell">Linked speaker</th>
              <th className="text-left px-4 py-3 font-bold">Tags</th>
              <th className="text-right px-4 py-3 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const isOpen = expanded.has(m.id);
              const isSelected = selected.has(m.id);
              return (
                <Fragment key={m.id}>
                  <tr
                    className={`border-t border-black/5 hover:bg-black/[0.02] ${
                      isSelected ? "bg-[#FF005A]/[0.04]" : ""
                    }`}
                  >
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(m.id)}
                        aria-label={`Select ${m.name || m.email}`}
                        className="data-[state=checked]:bg-[#FF005A] data-[state=checked]:border-[#FF005A]"
                      />
                    </td>
                    <td
                      className="px-2 py-3 text-black/40 cursor-pointer"
                      onClick={() => onToggleExpanded(m.id)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </td>
                    <td
                      className="px-4 py-3 cursor-pointer"
                      onClick={() => onToggleExpanded(m.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={m.photoUrl || m.image || undefined} alt={m.name || m.email} />
                          <AvatarFallback className="bg-black text-white text-xs font-bold">
                            {(m.name || m.email)
                              .split(/\s+|@/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((p) => p[0]?.toUpperCase())
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          {/* Clickable name — opens the edit dialog.
                              Stop propagation so the row expand toggle
                              doesn't also fire. */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenEditDialog(m);
                            }}
                            className="font-semibold text-black truncate flex items-center gap-1.5 text-left hover:text-[#FF005A] hover:underline underline-offset-2"
                            title="Click to edit member info"
                          >
                            {m.name || m.email.split("@")[0]}
                            {m.role === "ADMIN" && (
                              <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase bg-[#FF005A] text-white px-1.5 py-0.5 rounded">
                                <Shield className="h-2.5 w-2.5" /> Admin
                              </span>
                            )}
                            {m.importSource && (
                              <span
                                title={`Imported from ${m.importSource} on ${m.importedAt ? formatDateTimeTlv(m.importedAt) : ""}`}
                                className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase bg-[#00E6FF]/20 text-[#007E72] px-1.5 py-0.5 rounded"
                              >
                                <FileText className="h-2.5 w-2.5" /> Imported
                              </span>
                            )}
                            {m.invitedToSpeak === "Yes" && (
                              <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase bg-[#FFAC30]/20 text-[#8a5a00] px-1.5 py-0.5 rounded">
                                <Megaphone className="h-2.5 w-2.5" /> Invited
                              </span>
                            )}
                          </button>
                          <div className="text-xs text-black/50 truncate flex items-center gap-1">
                            <span>{m.email}</span>
                            {m.secondaryEmails && m.secondaryEmails.length > 0 && (
                              <span
                                className="inline-flex items-center text-[0.55rem] font-bold uppercase bg-[#820A7D]/10 text-[#820A7D] px-1 py-0.5 rounded"
                                title={m.secondaryEmails.map((e) => e.email).join(", ")}
                              >
                                +{m.secondaryEmails.length} email{m.secondaryEmails.length === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                          {m.company && (
                            <div className="text-[10px] text-black/40 truncate mt-0.5">
                              {m.company}
                              {m.companyUrl && (
                                <a
                                  href={m.companyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1 text-[#004F98] hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  ↗
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {m.appliedFor ? (
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            m.appliedFor === "Fast pitch"
                              ? "bg-[#FF005A]/10 text-[#FF005A]"
                              : "bg-[#004F98]/10 text-[#004F98]"
                          }`}
                        >
                          {m.appliedFor}
                        </span>
                      ) : (
                        <span className="text-xs text-black/30 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {m.speakers.length === 0 ? (
                        <span className="text-xs text-black/30 italic">Not linked</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {m.speakers.map((s) => (
                            <a
                              key={s.id}
                              href={`/events/${s.event.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[0.65rem] font-semibold bg-[#007E72]/10 text-[#007E72] px-1.5 py-0.5 rounded hover:bg-[#007E72]/20"
                              title={s.topic || s.name}
                            >
                              {s.event.title} · {s.name}
                              {s.topic ? ` · ${s.topic}` : ""}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1 max-w-[280px]">
                        {m.tags.length === 0 ? (
                          <span className="text-xs text-black/30 italic">No tags</span>
                        ) : (
                          m.tags.map((t) => (
                            <span
                              key={t.id}
                              className="ais-tag"
                              style={{
                                backgroundColor: `${t.color || tagColor(t.label)}20`,
                                color: t.color || tagColor(t.label),
                              }}
                            >
                              {t.label}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#FF005A]/40 text-[#FF005A] h-8"
                          onClick={() => onOpenEditDialog(m)}
                          title="Edit member info"
                        >
                          <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <TagDialog
                          member={m}
                          pending={pending === m.id}
                          onSave={(tags) => onSaveTags(m.id, tags)}
                        />
                        <LinkSpeakerDialog
                          member={m}
                          allSpeakers={allSpeakers}
                          pending={pending === m.id}
                          onLink={(sid) => onLinkSpeaker(m.id, sid)}
                        />
                        <ConvertToSpeakerDialog
                          member={m}
                          events={events}
                          pending={pending === m.id}
                          onConvert={(payload) => onConvertToSpeaker(m.id, payload)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#820A7D]/40 text-[#820A7D] h-8"
                          onClick={() => onOpenEmailDialog(m)}
                          title="Manage secondary emails"
                        >
                          <Mail className="h-3.5 w-3.5 mr-1" /> Emails
                          {m.secondaryEmails && m.secondaryEmails.length > 0 && (
                            <span className="ml-1 text-[0.6rem] font-bold bg-[#820A7D] text-white rounded-full h-4 min-w-4 px-1 inline-flex items-center justify-center">
                              {m.secondaryEmails.length}
                            </span>
                          )}
                        </Button>
                        {canArchive && !isSuperAdminEmail(m.email) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 h-8"
                            onClick={() => onArchive(m)}
                            title="Archive member (Super Admin only)"
                          >
                            <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-black/[0.02]">
                      <td></td>
                      <td colSpan={6} className="px-4 py-4">
                        <MemberDetail member={m} onOpenEmailDialog={onOpenEmailDialog} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-black/40 text-sm">
                  No members match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TableView — wide horizontal-scroll table showing EVERY field of every
// member at a glance. Designed for spreadsheets-style scanning / export.
// ---------------------------------------------------------------------------

function TableView({
  filtered,
  selected,
  allVisibleSelected,
  someVisibleSelected,
  canArchive,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  onOpenEmailDialog,
  onOpenEditDialog,
  onArchive,
}: {
  filtered: Member[];
  selected: Set<string>;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  canArchive: boolean;
  onToggleSelect: (id: string) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onOpenEmailDialog: (m: Member) => void;
  onOpenEditDialog: (m: Member) => void;
  onArchive: (m: Member) => void;
}) {
  return (
    <div className="border border-black/10 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-black/5 text-black/60 text-[0.65rem] uppercase tracking-wider sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-3 w-10 sticky left-0 bg-black/5 z-10">
                <Checkbox
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                      ? "indeterminate"
                      : false
                  }
                  onCheckedChange={() => {
                    if (allVisibleSelected) onClearSelection();
                    else onSelectAllVisible();
                  }}
                  aria-label="Select all visible"
                />
              </th>
              <th className="text-left px-3 py-3 font-bold sticky left-10 bg-black/5 z-10 min-w-[180px]">
                Member
              </th>
              <th className="text-left px-3 py-3 font-bold min-w-[220px]">All Emails</th>
              <th className="text-left px-3 py-3 font-bold min-w-[140px]">Company</th>
              <th className="text-left px-3 py-3 font-bold min-w-[120px]">Mobile</th>
              <th className="text-left px-3 py-3 font-bold min-w-[220px]">LinkedIn</th>
              <th className="text-left px-3 py-3 font-bold min-w-[240px]">Bio</th>
              <th className="text-left px-3 py-3 font-bold min-w-[200px]">Interested in</th>
              <th className="text-left px-3 py-3 font-bold min-w-[200px]">Profile categories</th>
              <th className="text-left px-3 py-3 font-bold min-w-[120px]">Applied for</th>
              <th className="text-left px-3 py-3 font-bold min-w-[100px]">Invited</th>
              <th className="text-left px-3 py-3 font-bold min-w-[140px]">Tags</th>
              <th className="text-left px-3 py-3 font-bold min-w-[180px]">Linked speaker</th>
              <th className="text-left px-3 py-3 font-bold min-w-[100px]">Photos</th>
              <th className="text-left px-3 py-3 font-bold min-w-[140px]">Import source</th>
              <th className="text-left px-3 py-3 font-bold min-w-[140px]">Imported at</th>
              <th className="text-left px-3 py-3 font-bold min-w-[140px]">Onboarded at</th>
              <th className="text-left px-3 py-3 font-bold min-w-[140px]">Created at</th>
              <th className="text-left px-3 py-3 font-bold min-w-[80px]">Role</th>
              <th className="text-left px-3 py-3 font-bold min-w-[80px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const isSelected = selected.has(m.id);
              return (
                <tr
                  key={m.id}
                  className={`border-t border-black/5 hover:bg-black/[0.02] ${
                    isSelected ? "bg-[#FF005A]/[0.04]" : ""
                  }`}
                >
                  <td className="px-3 py-2 sticky left-0 bg-white z-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect(m.id)}
                      aria-label={`Select ${m.name || m.email}`}
                      className="data-[state=checked]:bg-[#FF005A] data-[state=checked]:border-[#FF005A]"
                    />
                  </td>
                  <td className="px-3 py-2 sticky left-10 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        <AvatarImage src={m.photoUrl || m.image || undefined} alt={m.name || m.email} />
                        <AvatarFallback className="bg-black text-white text-[0.6rem] font-bold">
                          {(m.name || m.email)
                            .split(/\s+|@/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase())
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        {/* Clickable name — opens the edit dialog */}
                        <button
                          type="button"
                          onClick={() => onOpenEditDialog(m)}
                          className="font-semibold text-black truncate flex items-center gap-1 text-left hover:text-[#FF005A] hover:underline underline-offset-2"
                          title="Click to edit member info"
                        >
                          {m.name || m.email.split("@")[0]}
                          {/* Role badge — only shown for elevated roles
                              (Super Admin, Admin, Co-host). Members get
                              no badge to keep the card UI clean. */}
                          {(() => {
                            const r = (m.role || "MEMBER").toUpperCase();
                            if (r === "SUPER_ADMIN") return (
                              <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase bg-[#820A7D] text-white px-1.5 py-0.5 rounded">
                                <Shield className="h-2.5 w-2.5" /> SA
                              </span>
                            );
                            if (r === "ADMIN") return (
                              <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase bg-[#FF005A] text-white px-1.5 py-0.5 rounded">
                                <Shield className="h-2.5 w-2.5" /> Admin
                              </span>
                            );
                            if (r === "CO_HOST") return (
                              <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase bg-[#00E6FF]/20 text-[#007E72] border border-[#00E6FF]/40 px-1.5 py-0.5 rounded">
                                Co-host
                              </span>
                            );
                            return null;
                          })()}
                          {m.importSource && (
                            <span
                              title={`Imported from ${m.importSource}`}
                              className="text-[0.5rem] font-bold uppercase bg-[#00E6FF]/20 text-[#007E72] px-1 py-0.5 rounded"
                            >
                              IMP
                            </span>
                          )}
                        </button>
                        <div className="text-[0.65rem] text-black/50 truncate max-w-[180px]">
                          {m.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-black/80 font-medium">{m.email}</span>
                      <span className="text-[0.6rem] text-black/40 uppercase font-bold">primary</span>
                      {m.secondaryEmails && m.secondaryEmails.map((e) => (
                        <div key={e.id} className="flex items-center gap-1">
                          <span className="text-black/60">{e.email}</span>
                          {e.label && (
                            <span className="text-[0.55rem] uppercase font-bold text-[#820A7D]">
                              {e.label}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {m.company ? (
                      <div className="flex items-center gap-1">
                        <span>{m.company}</span>
                        {m.companyUrl && (
                          <a
                            href={m.companyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#004F98]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-black/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{m.mobile || <span className="text-black/30 italic">—</span>}</td>
                  <td className="px-3 py-2">
                    {m.linkedinUrl ? (
                      <a
                        href={m.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#004F98] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
                      </a>
                    ) : (
                      <span className="text-black/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[280px]">
                    {m.bio ? (
                      <div className="truncate text-black/60" title={m.bio}>
                        {m.bio.slice(0, 100)}
                        {m.bio.length > 100 ? "…" : ""}
                      </div>
                    ) : (
                      <span className="text-black/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.interestedIn ? (
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {m.interestedIn.split(",").map((s, i) => (
                          <span
                            key={i}
                            className="text-[0.6rem] font-medium bg-[#FF005A]/10 text-[#FF005A] px-1.5 py-0.5 rounded"
                          >
                            {s.trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-black/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.profileCategories ? (
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {m.profileCategories.split(",").map((s, i) => (
                          <span
                            key={i}
                            className="text-[0.6rem] font-medium bg-[#004F98]/10 text-[#004F98] px-1.5 py-0.5 rounded"
                          >
                            {s.trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-black/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.appliedFor ? (
                      <span
                        className={`text-[0.65rem] font-semibold px-1.5 py-0.5 rounded ${
                          m.appliedFor === "Fast pitch"
                            ? "bg-[#FF005A]/10 text-[#FF005A]"
                            : "bg-[#004F98]/10 text-[#004F98]"
                        }`}
                      >
                        {m.appliedFor}
                      </span>
                    ) : (
                      <span className="text-black/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.invitedToSpeak === "Yes" ? (
                      <span className="text-[0.65rem] font-semibold bg-[#FFAC30]/20 text-[#8a5a00] px-1.5 py-0.5 rounded">
                        Yes
                      </span>
                    ) : (
                      <span className="text-black/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.tags.length === 0 ? (
                      <span className="text-black/30 italic">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-w-[140px]">
                        {m.tags.map((t) => (
                          <span
                            key={t.id}
                            className="text-[0.6rem] font-medium px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: `${t.color || tagColor(t.label)}20`,
                              color: t.color || tagColor(t.label),
                            }}
                          >
                            {t.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.speakers.length === 0 ? (
                      <span className="text-black/30 italic">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {m.speakers.map((s) => (
                          <a
                            key={s.id}
                            href={`/events/${s.event.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[0.6rem] font-semibold text-[#007E72] hover:underline"
                            title={s.topic || s.name}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {s.event.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-black/60">{m._count.images}</td>
                  <td className="px-3 py-2 text-black/60">{m.importSource || "—"}</td>
                  <td className="px-3 py-2 text-black/60">
                    {m.importedAt ? formatDateTlv(m.importedAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-black/60">
                    {m.onboardedAt ? formatDateTlv(m.onboardedAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-black/60">
                    {m.createdAt ? formatDateTlv(m.createdAt) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[0.65rem] font-bold uppercase px-1.5 py-0.5 rounded ${
                        m.role === "ADMIN"
                          ? "bg-[#FF005A] text-white"
                          : "bg-black/5 text-black/60"
                      }`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#FF005A]/40 text-[#FF005A] h-7 text-[0.65rem]"
                        onClick={() => onOpenEditDialog(m)}
                        title="Edit member info"
                      >
                        <Edit3 className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#820A7D]/40 text-[#820A7D] h-7 text-[0.65rem]"
                        onClick={() => onOpenEmailDialog(m)}
                      >
                        <Mail className="h-3 w-3 mr-1" /> Emails
                      </Button>
                      {canArchive && !isSuperAdminEmail(m.email) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50 h-7 text-[0.65rem]"
                          onClick={() => onArchive(m)}
                          title="Archive member (Super Admin only)"
                        >
                          <Archive className="h-3 w-3 mr-1" /> Archive
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={20} className="px-4 py-8 text-center text-black/40 text-sm">
                  No members match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ManageEmailsDialog — add/remove secondary emails for a member.
// ---------------------------------------------------------------------------

function ManageEmailsDialog({
  open,
  onOpenChange,
  member,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: Member | null;
  onAdd: (email: string, label: string) => void;
  onRemove: (emailId: string) => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");

  // Reset the form whenever the dialog closes
  useEffect(() => {
    if (!open) {
      setNewEmail("");
      setNewLabel("");
    }
  }, [open]);

  if (!member) return null;

  const primaryEmail = member.email;
  const secondaries = member.secondaryEmails || [];
  const canSubmit =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()) &&
    newEmail.trim().toLowerCase() !== primaryEmail.toLowerCase() &&
    !secondaries.some((e) => e.email.toLowerCase() === newEmail.trim().toLowerCase());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onAdd(newEmail.trim().toLowerCase(), newLabel.trim());
    setNewEmail("");
    setNewLabel("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[#820A7D]" />
            Manage emails ·{" "}
            <span className="text-black/60 truncate">{member.name || member.email}</span>
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-black/60 -mt-2">
          The <strong>primary email</strong> is the account&rsquo;s identity and can&rsquo;t be
          changed here. <strong>Secondary emails</strong> allow the same person to sign in via
          a different inbox — useful when someone registered with Gmail but also wants to use
          their work email.
        </p>

        {/* Primary email (read-only) */}
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
            Primary email
          </div>
          <div className="flex items-center gap-2 rounded-md border border-black/10 bg-black/[0.02] px-3 py-2">
            <Mail className="h-3.5 w-3.5 text-black/40" />
            <span className="text-sm font-mono text-black/80">{primaryEmail}</span>
            <span className="ml-auto text-[0.55rem] font-bold uppercase bg-[#FF005A] text-white px-1.5 py-0.5 rounded">
              Primary
            </span>
          </div>
        </div>

        {/* Secondary emails list */}
        {secondaries.length > 0 && (
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Secondary emails ({secondaries.length})
            </div>
            <div className="space-y-1">
              {secondaries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2"
                >
                  <Mail className="h-3.5 w-3.5 text-black/40" />
                  <span className="text-sm font-mono text-black/80 truncate">{e.email}</span>
                  {e.label && (
                    <span className="text-[0.55rem] font-bold uppercase bg-[#820A7D]/10 text-[#820A7D] px-1.5 py-0.5 rounded">
                      {e.label}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(e.id)}
                    className="ml-auto inline-flex items-center gap-0.5 text-[0.65rem] font-semibold text-[#FF005A] hover:bg-[#FF005A]/5 rounded px-2 py-1"
                    title="Remove this secondary email"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add new secondary email */}
        <form onSubmit={handleSubmit} className="space-y-2 pt-2 border-t border-black/10">
          <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
            Add a secondary email
          </div>
          <Input
            type="email"
            placeholder="e.g. john@work.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
          <Input
            type="text"
            placeholder="Label (optional): Work, Personal, etc."
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            maxLength={40}
          />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Done
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="bg-[#820A7D] hover:bg-[#820A7D]/90"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add email
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// EditMemberDialog — opens when the admin clicks a member name or the
// "Edit" button on a row. Lets the admin edit all the profile fields
// (name, bio, company, links) AND the admin-only intake-form fields
// (mobile, interestedIn, profileCategories, appliedFor, invitedToSpeak).
//
// The company field is a combobox (HTML datalist) — the admin can
// either pick from the existing companies (loaded once from the API)
// OR type a new one. Whatever they type becomes the company value on
// save, so a brand-new company becomes immediately selectable for
// other members afterwards (the next time someone opens the dialog).
// ---------------------------------------------------------------------------

function EditMemberDialog({
  open,
  onOpenChange,
  member,
  currentUserEmail,
  currentUserRole,
  onSaved,
  onArchive,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: Member | null;
  /** Email of the currently-signed-in admin. Used to block self-demotion. */
  currentUserEmail?: string;
  /** Role of the currently-signed-in admin. Drives role-dropdown visibility. */
  currentUserRole?: string;
  onSaved: () => void;
  /** Archive handler — passed from the top-level AdminMembersTable. */
  onArchive?: (m: Member) => void;
}) {
  // Local form state — re-initialized whenever the member changes.
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [company, setCompany] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [mobile, setMobile] = useState("");
  const [interestedIn, setInterestedIn] = useState("");
  const [profileCategories, setProfileCategories] = useState("");
  const [appliedFor, setAppliedFor] = useState("");
  const [invitedToSpeak, setInvitedToSpeak] = useState("");
  // Live photo URL — kept in local state so it updates immediately when
  // the admin uploads a new photo via PhotoUploadField (without requiring
  // a full save). The parent table is refreshed via onSaved().
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // Role state — only editable by Super Admin. Initialized from member.role
  // and synced on member change. Persisted via the same PATCH endpoint.
  const [memberRole, setMemberRole] = useState<string>(ROLES.MEMBER);
  const [saving, setSaving] = useState(false);

  // Existing company names — fetched once on mount. Used to populate
  // the datalist so the admin can pick an existing company OR type a
  // brand-new one (the datalist is a suggestion list, not a closed
  // dropdown).
  const [existingCompanies, setExistingCompanies] = useState<string[]>([]);

  // ---- Super-Admin-only: credential management state ----
  // These are independent of the main profile-save flow — they hit a
  // separate endpoint (/api/admin/members/[id]/credentials) and don't
  // require the rest of the form to be saved first.
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credShowPassword, setCredShowPassword] = useState(false);
  const [credSendEmail, setCredSendEmail] = useState(false);
  const [credSaving, setCredSaving] = useState(false);

  // Reset form whenever the member changes (i.e. when the dialog opens
  // for a different member). We use useEffect so the form fields sync
  // even when the dialog is reused across members.
  useEffect(() => {
    if (member) {
      setName(member.name || "");
      setBio(member.bio || "");
      setCompany(member.company || "");
      setCompanyUrl(member.companyUrl || "");
      setLinkedinUrl(member.linkedinUrl || "");
      setPortfolioUrl(member.portfolioUrl || "");
      setMobile(member.mobile || "");
      setInterestedIn(member.interestedIn || "");
      setProfileCategories(member.profileCategories || "");
      setAppliedFor(member.appliedFor || "");
      setInvitedToSpeak(member.invitedToSpeak || "");
      setMemberRole(member.role || ROLES.MEMBER);
      setPhotoUrl(member.photoUrl ?? null);
      // Reset credential fields whenever the member changes — the email
      // field shows the current primary email as a starting point, and
      // the password field is always blank (we never re-display an
      // existing password — they're hashed, not recoverable).
      setCredEmail(member.email || "");
      setCredPassword("");
      setCredShowPassword(false);
      setCredSendEmail(false);
    }
  }, [member]);

  // Fetch existing companies on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/members/companies");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.companies)) {
          setExistingCompanies(data.companies);
        }
      } catch {
        // silent — the datalist just won't have suggestions
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!member) return null;

  const handleSave = async () => {
    if (!member) return;
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    // SELF-DEMENTION BLOCK — per user choice: Super Admins cannot change
    // their own role. This prevents accidental lockout (e.g. eze@massapro.com
    // demoting themselves to Member and losing the ability to undo it).
    // The server enforces this too, but we block here for UX clarity.
    const isSelf = currentUserEmail && member.email === currentUserEmail;
    const isSuperAdminTarget = isSuperAdminEmail(member.email);
    if (isSelf && isSuperAdminTarget && memberRole !== ROLES.SUPER_ADMIN) {
      toast.error("You cannot change your own Super Admin role. Ask another Super Admin to do it.");
      return;
    }
    setSaving(true);
    const t = toast.loading("Saving member…");
    try {
      // Only include role in the payload if the current user is a Super Admin
      // AND the target is not a Super Admin (Super Admin role is immutable).
      // The server double-checks both conditions, but we skip it client-side
      // too so non-Super-Admins don't accidentally send a role field.
      const isSuperAdminMe = isSuperAdminEmail(currentUserEmail);
      const payload: Record<string, string | null> = {
        name,
        bio,
        company,
        companyUrl,
        linkedinUrl,
        portfolioUrl,
        mobile,
        interestedIn,
        profileCategories,
        appliedFor,
        invitedToSpeak,
      };
      if (isSuperAdminMe && !isSuperAdminTarget) {
        payload.role = memberRole;
      }
      const res = await fetch(`/api/admin/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        // Include debug info in the error message so we can diagnose
        // authorization failures (the server attaches a `debug` object
        // to 403 responses with the caller's email, role, and which
        // checks passed/failed).
        const debug = d?.debug ? ` | debug: ${JSON.stringify(d.debug)}` : "";
        throw new Error(`${d?.error || `HTTP ${res.status}`}${debug}`);
      }
      toast.success(`Saved changes to ${name || member.email}`, { id: t });
      onSaved();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    } finally {
      setSaving(false);
    }
  };

  // ---- Super-Admin-only: save credentials (email + password) ----
  // Hits /api/admin/members/[id]/credentials — separate from the main
  // profile PATCH. Either field can be sent independently (partial
  // update). The endpoint is SUPER_ADMIN-only; we hide the UI section
  // entirely for non-Super-Admins so this handler only fires when the
  // current user is a Super Admin.
  const handleSaveCredentials = async () => {
    if (!member) return;
    const trimmedEmail = credEmail.trim();
    const emailChanged =
      trimmedEmail.length > 0 &&
      trimmedEmail.toLowerCase() !== member.email.toLowerCase();
    const passwordChanged = credPassword.length > 0;
    if (!emailChanged && !passwordChanged) {
      toast.info("Nothing to save — no email or password changes.");
      return;
    }
    if (passwordChanged && (credPassword.length < 6 || credPassword.length > 128)) {
      toast.error("Password must be 6–128 characters.");
      return;
    }
    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("New email is not a valid address.");
      return;
    }
    setCredSaving(true);
    const t = toast.loading("Updating credentials…");
    try {
      const payload: Record<string, unknown> = { sendEmail: credSendEmail };
      if (emailChanged) payload.email = trimmedEmail;
      if (passwordChanged) payload.password = credPassword;
      const res = await fetch(`/api/admin/members/${member.id}/credentials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      let msg = "Credentials updated";
      if (d?.warning) {
        msg = `Credentials updated — but: ${d.warning}`;
        toast.warning(msg, { id: t, duration: 8000 });
      } else if (credSendEmail && passwordChanged) {
        msg = `Password updated + emailed to ${d?.user?.email || trimmedEmail}`;
        toast.success(msg, { id: t });
      } else if (passwordChanged && !credSendEmail) {
        msg = "Password updated (NOT emailed — tell the user manually)";
        toast.success(msg, { id: t, duration: 6000 });
      } else if (emailChanged) {
        msg = `Email changed to ${d?.user?.email || trimmedEmail}`;
        toast.success(msg, { id: t });
      } else {
        toast.success(msg, { id: t });
      }
      // If email changed, clear the password field but keep the dialog
      // open so the admin can verify the new email rendered correctly.
      if (emailChanged && member) {
        // Reflect the new email on the member object so the dialog
        // header + other UI updates. (The parent will refetch via
        // onSaved() below, which gives a fully fresh Member.)
        member.email = d?.user?.email || trimmedEmail;
        setCredEmail(member.email);
      }
      setCredPassword("");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    } finally {
      setCredSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-[#FF005A]" />
            Edit member
          </DialogTitle>
          <p className="text-xs text-black/60 -mt-1">
            {member.email} · changes are saved instantly to the platform.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Profile section */}
          <div className="rounded-md border border-black/10 p-3 space-y-3">
            <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
              Profile
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  Display name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                  placeholder="e.g. Jane Cohen"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  Mobile
                </label>
                <input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                  placeholder="+972 …"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-black/60 mb-1">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                placeholder="Short bio — shown on the public profile + admin table."
              />
              <p className="text-[0.65rem] text-black/40 mt-0.5">
                {bio.length}/2000
              </p>
            </div>

            {/* Company — combobox (datalist). Lets the admin pick an
                existing company OR type a new one. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  list="existing-companies"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                  placeholder="Pick an existing company or type a new one"
                />
                <datalist id="existing-companies">
                  {existingCompanies.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className="text-[0.65rem] text-black/40 mt-0.5">
                  {existingCompanies.length === 0
                    ? "Loading existing companies…"
                    : `${existingCompanies.length} existing compan${existingCompanies.length === 1 ? "y" : "ies"} available — pick or type a new one.`}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  Company URL
                </label>
                <input
                  type="text"
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                  placeholder="https://company.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  LinkedIn URL
                </label>
                <input
                  type="text"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                  placeholder="https://www.linkedin.com/in/…"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  Portfolio URL
                </label>
                <input
                  type="text"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                  placeholder="https://your-portfolio.com"
                />
              </div>
            </div>
          </div>

          {/* Profile photo upload — admin can upload a photo that
              overrides the member's Google avatar. This photo is the
              one used by default on the mockup canvases (speaker-intro,
              meet-the-speaker, event-profile) when this member is a
              speaker on the chosen event. */}
          <PhotoUploadField
            photoUrl={photoUrl}
            uploadUrl={`/api/admin/members/${member.id}/photo`}
            onUploaded={(url) => {
              setPhotoUrl(url);
              // Don't call onSaved() here — that would close the dialog.
              // The parent table will refresh the next time it loads.
              // We DO update the local member object so a subsequent
              // "Save changes" includes the new photo.
              if (member) member.photoUrl = url;
            }}
          />

          {/* Intake-form section — admin-only fields from the
              spreadsheet import / onboarding form. */}
          <div className="rounded-md border border-[#00E6FF]/30 bg-[#00E6FF]/[0.03] p-3 space-y-3">
            <div className="text-[0.65rem] font-bold uppercase tracking-widest text-[#007E72]">
              Intake form (admin-only)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  Interested in
                </label>
                <input
                  type="text"
                  value={interestedIn}
                  onChange={(e) => setInterestedIn(e.target.value)}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                  placeholder="Comma-separated, e.g. Be a guest speaker, Want to pitch"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  Profile categories
                </label>
                <input
                  type="text"
                  value={profileCategories}
                  onChange={(e) => setProfileCategories(e.target.value)}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                  placeholder="Comma-separated, e.g. I am an entrepreneur, I am an investor"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  Applied for
                </label>
                <select
                  value={appliedFor}
                  onChange={(e) => setAppliedFor(e.target.value)}
                  className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                >
                  <option value="">— none —</option>
                  <option value="Fast pitch">Fast pitch</option>
                  <option value="Presentation/Lecure">Presentation/Lecture</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-black/60 mb-1">
                  Invited to speak
                </label>
                <select
                  value={invitedToSpeak}
                  onChange={(e) => setInvitedToSpeak(e.target.value)}
                  className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                >
                  <option value="">— no —</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>
          </div>

          {/* Role section — ONLY visible to Super Admins.
              Non-Super-Admins see the role as a read-only badge.
              Super Admins see a dropdown with ASSIGNABLE_ROLES
              (ADMIN, CO_HOST, MEMBER). SUPER_ADMIN is NOT in the
              dropdown — it can only be granted by editing the
              SUPER_ADMIN_EMAILS list in src/lib/permissions.ts.

              Self-demotion is blocked: a Super Admin editing their OWN
              member record sees the dropdown disabled with a note
              ("You cannot change your own role"). The server double-
              checks all these conditions. */}
          <div className="rounded-md border border-black/10 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
                Role &amp; permissions
              </div>
              {isSuperAdminEmail(member.email) && (
                <span
                  title="Super Admin status is hard-coded by email and cannot be changed via the UI."
                  className="text-[0.55rem] font-bold uppercase bg-[#820A7D] text-white px-1.5 py-0.5 rounded"
                >
                  Hard-coded
                </span>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-black/60 mb-1">
                Member type
              </label>
              {isSuperAdminEmail(currentUserEmail) ? (
                isSuperAdminEmail(member.email) ? (
                  // Super Admin editing another Super Admin (or themselves):
                  // role is locked. Show as disabled select with explanation.
                  <select
                    value={ROLES.SUPER_ADMIN}
                    disabled
                    className="w-full rounded-md border border-black/15 bg-black/5 px-3 py-2 text-sm cursor-not-allowed"
                  >
                    <option value={ROLES.SUPER_ADMIN}>Super Admin (locked)</option>
                  </select>
                ) : (
                  // Super Admin editing a non-Super-Admin: show the dropdown.
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value)}
                    className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                )
              ) : (
                // Non-Super-Admin: read-only display of current role.
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[0.65rem] font-bold uppercase px-2 py-1 rounded ${roleBadgeClass(member.role)}`}
                  >
                    {roleLabel(member.role)}
                  </span>
                  <span className="text-[0.65rem] text-black/40">
                    Only Super Admins can change roles.
                  </span>
                </div>
              )}
            </div>
            {isSuperAdminEmail(currentUserEmail) &&
              !isSuperAdminEmail(member.email) && (
                <p className="text-[0.65rem] text-black/50 leading-relaxed">
                  Super Admin status is granted only by editing the
                  <code className="bg-black/5 px-1 rounded mx-0.5">SUPER_ADMIN_EMAILS</code>
                  list in <code className="bg-black/5 px-1 rounded mx-0.5">src/lib/permissions.ts</code>
                  and re-deploying. It cannot be granted via this dialog.
                </p>
              )}
          </div>

          {/* ---- Super-Admin-only: Credentials section ----
              Lets the Super Admin change a member's primary email AND/OR
              set a new password (manually typed, not auto-generated).
              This is the fix for the "speaker can't log in" support case
              — the auto-emailed 8-char base64url password is fragile
              (email clients can mangle monospace text), so the admin
              can set a clean memorable password and tell the user
              verbally / via DM.

              Hidden entirely for non-Super-Admins. Hidden for Super
              Admin targets (their credentials are immutable via UI). */}
          {isSuperAdminEmail(currentUserEmail) &&
            !isSuperAdminEmail(member.email) && (
              <div className="rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[0.65rem] font-bold uppercase tracking-widest text-[#FF005A] flex items-center gap-1.5">
                    <KeyRound className="h-3 w-3" />
                    Credentials (Super Admin)
                  </div>
                  <span className="text-[0.55rem] font-bold uppercase bg-[#820A7D] text-white px-1.5 py-0.5 rounded">
                    Sensitive
                  </span>
                </div>

                <p className="text-[0.7rem] text-black/60 leading-relaxed">
                  Change this member&apos;s sign-in email or set a new password.
                  The previous primary email is automatically kept as a
                  secondary (so they can still sign in via the old inbox).
                  Passwords are hashed — we never display the current one.
                </p>

                {/* Email field */}
                <div>
                  <label className="block text-xs font-semibold text-black/60 mb-1">
                    Primary email
                  </label>
                  <div className="relative">
                    <MailIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black/40" />
                    <input
                      type="email"
                      value={credEmail}
                      onChange={(e) => setCredEmail(e.target.value)}
                      placeholder="member@example.com"
                      autoComplete="off"
                      className="w-full rounded-md border border-black/15 bg-white pl-8 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                    />
                  </div>
                  {credEmail.trim().toLowerCase() !== member.email.toLowerCase() && (
                    <p className="mt-1 text-[0.65rem] text-[#FF005A] font-semibold">
                      ↳ Will change primary email from <code className="bg-black/5 px-1 rounded">{member.email}</code>
                    </p>
                  )}
                </div>

                {/* Password field */}
                <div>
                  <label className="block text-xs font-semibold text-black/60 mb-1">
                    New password <span className="text-black/40 font-normal">(leave blank to keep current)</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black/40" />
                    <input
                      type={credShowPassword ? "text" : "password"}
                      value={credPassword}
                      onChange={(e) => setCredPassword(e.target.value)}
                      placeholder="Type a new password (6–128 chars)"
                      autoComplete="new-password"
                      className="w-full rounded-md border border-black/15 bg-white pl-8 pr-10 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
                    />
                    <button
                      type="button"
                      onClick={() => setCredShowPassword(!credShowPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black/80 p-1"
                      title={credShowPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {credShowPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  {credPassword && (
                    <p className="mt-1 text-[0.65rem] text-black/50">
                      {credPassword.length} chars {credPassword.length < 6 && "· too short (need 6+)"}
                    </p>
                  )}
                </div>

                {/* Email-the-password toggle */}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={credSendEmail}
                    onChange={(e) => setCredSendEmail(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-[0.7rem] text-black/70 leading-snug">
                    <strong>Email the new password to the user.</strong> Default
                    OFF — typically you tell them verbally / via DM (more
                    reliable than the email round-trip, which is the reason
                    this feature exists).
                  </span>
                </label>

                {/* Save button — separate from the main Save changes button */}
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSaveCredentials}
                    disabled={
                      credSaving ||
                      (!credEmail.trim() && !credPassword) ||
                      (credPassword.length > 0 && credPassword.length < 6) ||
                      (!!credEmail.trim() &&
                        credEmail.trim().toLowerCase() === member.email.toLowerCase() &&
                        !credPassword)
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#820A7D] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[#6a085f] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {credSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    Save credentials
                  </button>
                </div>
              </div>
            )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          {/* Archive button — Super Admin only, not for Super Admin targets,
              not for self. Uses the destructive style to signal finality. */}
          {isSuperAdminEmail(currentUserEmail) &&
            !isSuperAdminEmail(member.email) &&
            member.email !== currentUserEmail && (
              <Button
                type="button"
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 mr-auto"
                onClick={() => {
                  onOpenChange(false);
                  // Defer to next tick so this dialog closes before the
                  // confirm() prompt appears (otherwise the dialog overlays
                  // the confirm on some browsers).
                  setTimeout(() => onArchive?.(member), 50);
                }}
                title="Archive this member — hide from the active list. Can be restored from the archive page."
              >
                <Archive className="h-4 w-4 mr-1.5" />
                Archive member
              </Button>
            )}
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberDetail({ member, onOpenEmailDialog }: { member: Member; onOpenEmailDialog?: (m: Member) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      {/* Bio */}
      {member.bio && (
        <div className="md:col-span-2">
          <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
            Bio
          </div>
          <p className="text-black/70 whitespace-pre-line text-sm leading-relaxed">
            {member.bio}
          </p>
        </div>
      )}

      {/* Interested in */}
      {member.interestedIn && (
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
            Interested in
          </div>
          <div className="flex flex-wrap gap-1">
            {member.interestedIn
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s, i) => (
                <span
                  key={i}
                  className="text-xs font-medium bg-[#FF005A]/10 text-[#FF005A] px-2 py-0.5 rounded"
                >
                  {s}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Profile categories */}
      {member.profileCategories && (
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
            Profile categories
          </div>
          <div className="flex flex-wrap gap-1">
            {member.profileCategories
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s, i) => (
                <span
                  key={i}
                  className="text-xs font-medium bg-[#004F98]/10 text-[#004F98] px-2 py-0.5 rounded"
                >
                  {s}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Contact details */}
      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {member.mobile && (
          <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Mobile" value={member.mobile} />
        )}
        {member.email && (
          <DetailRow
            icon={<Mail className="h-3.5 w-3.5" />}
            label="Email (primary)"
            value={
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`mailto:${member.email}`} className="text-[#004F98] hover:underline">
                  {member.email}
                </a>
                {onOpenEmailDialog && (
                  <button
                    type="button"
                    onClick={() => onOpenEmailDialog(member)}
                    className="inline-flex items-center gap-0.5 text-[0.65rem] font-semibold text-[#820A7D] border border-[#820A7D]/30 rounded px-1.5 py-0.5 hover:bg-[#820A7D]/5"
                  >
                    <Plus className="h-2.5 w-2.5" /> Manage emails
                  </button>
                )}
              </div>
            }
          />
        )}
        {/* Secondary emails */}
        {member.secondaryEmails && member.secondaryEmails.length > 0 && (
          <DetailRow
            icon={<Mail className="h-3.5 w-3.5" />}
            label={`Secondary email${member.secondaryEmails.length === 1 ? "" : "s"}`}
            value={
              <div className="flex flex-wrap gap-1">
                {member.secondaryEmails.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1 text-xs bg-black/5 text-black/70 px-2 py-0.5 rounded"
                    title={e.label ? e.label : "Secondary email"}
                  >
                    {e.email}
                    {e.label && (
                      <span className="text-[0.6rem] uppercase font-bold text-black/40">
                        {e.label}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            }
          />
        )}
        {member.linkedinUrl && (
          <DetailRow
            icon={<Linkedin className="h-3.5 w-3.5" />}
            label="LinkedIn"
            value={
              <a
                href={member.linkedinUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#004F98] hover:underline inline-flex items-center gap-1"
              >
                {member.linkedinUrl!.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)}
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        )}
        {member.company && (
          <DetailRow
            icon={<Briefcase className="h-3.5 w-3.5" />}
            label="Company"
            value={member.company}
          />
        )}
        {member.appliedFor && (
          <DetailRow
            icon={<Megaphone className="h-3.5 w-3.5" />}
            label="Applied for"
            value={member.appliedFor}
          />
        )}
        {member.invitedToSpeak && (
          <DetailRow
            icon={<Megaphone className="h-3.5 w-3.5" />}
            label="Invited to speak"
            value={member.invitedToSpeak}
          />
        )}
        {member.importedAt && (
          <DetailRow
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Imported at"
            value={formatDateTimeTlv(member.importedAt)}
          />
        )}
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-black/40 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
          {label}
        </div>
        <div className="text-sm text-black/80 break-words">{value}</div>
      </div>
    </div>
  );
}

function TagDialog({
  member,
  pending,
  onSave,
}: {
  member: Member;
  pending: boolean;
  onSave: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(member.tags.map((t) => t.label))
  );

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelected(new Set(member.tags.map((t) => t.label)));
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-black/20 h-8">
          <TagIcon className="h-3.5 w-3.5 mr-1" /> Tags
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Manage tags · <span className="text-black/60">{member.name || member.email}</span>
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/60 -mt-2">
          Select one or more tags to assign to this member. Existing tags will be replaced.
        </p>
        <div className="space-y-1.5 max-h-80 overflow-y-auto ais-scroll">
          {MEMBER_TAG_CATALOG.map((t) => (
            <label
              key={t.label}
              className="flex items-start gap-3 p-2 rounded-md hover:bg-black/5 cursor-pointer"
            >
              <Checkbox
                checked={selected.has(t.label)}
                onCheckedChange={() => toggle(t.label)}
                style={{
                  backgroundColor: selected.has(t.label) ? t.color : undefined,
                  borderColor: t.color,
                }}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{t.label}</span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                    title={t.color}
                  />
                </div>
                {t.description && (
                  <div className="text-xs text-black/60">{t.description}</div>
                )}
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() => onSave(Array.from(selected))}
            className="bg-black hover:bg-black/90"
          >
            {pending ? "Saving…" : `Save ${selected.size} tag${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkSpeakerDialog({
  member,
  allSpeakers,
  pending,
  onLink,
}: {
  member: Member;
  allSpeakers: SpeakerRow[];
  pending: boolean;
  onLink: (speakerId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const linkedSpeakerIds = new Set(member.speakers.map((s) => s.id));

  const filtered = allSpeakers.filter((s) => {
    const q = search.toLowerCase();
    return (
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.topic || "").toLowerCase().includes(q) ||
      s.event.title.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-[#004F98] text-[#004F98] h-8">
          <Link2 className="h-3.5 w-3.5 mr-1" /> Link speaker
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Link <span className="text-black/60">{member.name || member.email}</span> to a speaker
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/60 -mt-2">
          Selecting a speaker links this user account to that speaker profile. The user can then
          chat with community members via the in-app inbox, and the speaker will appear with the
          user&apos;s photo in the agenda.
        </p>

        {member.speakers.length > 0 && (
          <div className="bg-[#007E72]/5 border border-[#007E72]/20 rounded-md p-2 text-xs">
            <div className="font-semibold text-[#007E72] mb-1">Currently linked to:</div>
            {member.speakers.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <span>
                  {s.event.title} · <strong>{s.name}</strong>
                  {s.topic ? ` — ${s.topic}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[#FF005A] hover:text-[#FF005A] hover:bg-[#FF005A]/10"
                  disabled={pending}
                  onClick={() => onLink(null)}
                >
                  Unlink
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-black/30" />
          <Input
            placeholder="Search speakers by name, topic, event…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="space-y-1 max-h-72 overflow-y-auto ais-scroll">
          {filtered.length === 0 ? (
            <div className="text-center text-black/40 text-sm py-8">
              No speakers found. Try a different search or use &quot;Convert to speaker&quot; below.
            </div>
          ) : (
            filtered.map((s) => {
              const isLinked = linkedSpeakerIds.has(s.id);
              const isTaken = s.user && s.user.id !== member.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded-md ${
                    isLinked ? "bg-[#007E72]/10" : "hover:bg-black/5"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {s.name}
                      {isLinked && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#007E72]" />
                      )}
                    </div>
                    <div className="text-xs text-black/60 truncate">
                      {s.event.title}
                      {s.topic ? ` · ${s.topic}` : ""}
                    </div>
                    {isTaken && (
                      <div className="text-[0.65rem] text-[#FF005A]">
                        Currently linked to {s.user!.email}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isLinked ? "outline" : "default"}
                    disabled={pending || isLinked}
                    onClick={() => onLink(s.id)}
                    className="h-7 shrink-0"
                  >
                    {isLinked ? "Linked" : "Link"}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertToSpeakerDialog({
  member,
  events,
  pending,
  onConvert,
}: {
  member: Member;
  events: EventRow[];
  pending: boolean;
  onConvert: (payload: {
    eventId: string;
    topic?: string;
    role?: string;
    bio?: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState(events[0]?.id || "");
  const [topic, setTopic] = useState("");
  const [role, setRole] = useState(member.company || "");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setEventId(events[0]?.id || "");
          setTopic("");
          setRole(member.company || "");
        }
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="bg-[#FF005A] hover:bg-[#FF005A]/90 h-8">
          <UserPlus className="h-3.5 w-3.5 mr-1" /> Make speaker
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Convert <span className="text-black/60">{member.name || member.email}</span> to a speaker
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/60 -mt-2">
          Creates a new speaker profile for this user on the chosen event. The user is automatically
          linked to the new speaker (so community members can chat with them in-platform). Their
          photo, name, company, and bio are copied from their user profile.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-black/60 uppercase tracking-wide">
              Event
            </label>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="mt-1 w-full border border-black/15 rounded-md px-3 py-2 bg-white text-sm"
            >
              {events.length === 0 && <option value="">No events available</option>}
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({formatDateTlv(ev.startsAt)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-black/60 uppercase tracking-wide">
              Talk topic (optional)
            </label>
            <Input
              placeholder="e.g. AI for medical devices"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-black/60 uppercase tracking-wide">
              Role / title (optional)
            </label>
            <Input
              placeholder="e.g. CEO, Acme"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1"
            />
            <p className="text-[0.7rem] text-black/40 mt-1">
              Defaults to the user&apos;s company. Will appear under their name in the agenda.
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending || !eventId}
            onClick={() =>
              onConvert({
                eventId,
                topic: topic.trim() || undefined,
                role: role.trim() || undefined,
              })
            }
            className="bg-[#FF005A] hover:bg-[#FF005A]/90"
          >
            {pending ? "Creating…" : "Create speaker profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * BulkTagDialog — add or remove tags across all selected members.
 *
 * Unlike the single-member TagDialog (which replaces all tags), this
 * dialog MERGES: tags checked under "Add" are added to each selected
 * user (no deduplication needed — the API uses Set semantics), and
 * tags checked under "Remove" are stripped from each selected user.
 *
 * The same tag can be in both lists (it's a no-op: add then remove
 * would leave it absent, but order is undefined; we just disallow it
 * on the client by toggling between the two states).
 */
function BulkTagDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: boolean;
  onSubmit: (addTags: string[], removeTags: string[]) => void;
}) {
  const [addTags, setAddTags] = useState<Set<string>>(new Set());
  const [removeTags, setRemoveTags] = useState<Set<string>>(new Set());

  function reset() {
    setAddTags(new Set());
    setRemoveTags(new Set());
  }

  function cycleTag(label: string) {
    // off -> add -> remove -> off
    // Compute next state from current refs synchronously.
    const isAdd = addTags.has(label);
    const isRemove = removeTags.has(label);
    if (isAdd) {
      // move add -> remove
      const aNext = new Set(addTags);
      aNext.delete(label);
      const rNext = new Set(removeTags);
      rNext.add(label);
      setAddTags(aNext);
      setRemoveTags(rNext);
    } else if (isRemove) {
      // remove -> off
      const rNext = new Set(removeTags);
      rNext.delete(label);
      setRemoveTags(rNext);
    } else {
      // off -> add
      const aNext = new Set(addTags);
      aNext.add(label);
      setAddTags(aNext);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-[#FF005A] text-[#FF005A] h-7">
          <TagIcon className="h-3.5 w-3.5 mr-1" /> Bulk edit tags
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk edit tags</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/60 -mt-2">
          Click each tag once to <strong className="text-[#007E72]">Add</strong> it to all selected
          members, click again to <strong className="text-[#FF005A]">Remove</strong> it from all
          selected members, click a third time to clear.
        </p>
        <div className="space-y-1.5 max-h-80 overflow-y-auto ais-scroll">
          {MEMBER_TAG_CATALOG.map((t) => {
            const isAdd = addTags.has(t.label);
            const isRemove = removeTags.has(t.label);
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => cycleTag(t.label)}
                className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${
                  isAdd
                    ? "bg-[#007E72]/10"
                    : isRemove
                    ? "bg-[#FF005A]/10"
                    : "hover:bg-black/5"
                }`}
              >
                <span
                  className={`h-4 w-4 rounded border flex items-center justify-center text-[0.6rem] font-bold ${
                    isAdd
                      ? "bg-[#007E72] border-[#007E72] text-white"
                      : isRemove
                      ? "bg-[#FF005A] border-[#FF005A] text-white"
                      : "border-black/20"
                  }`}
                >
                  {isAdd ? "+" : isRemove ? "−" : ""}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{t.label}</span>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                      title={t.color}
                    />
                  </div>
                  {t.description && (
                    <div className="text-xs text-black/60">{t.description}</div>
                  )}
                </div>
                <span
                  className={`text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded ${
                    isAdd
                      ? "bg-[#007E72] text-white"
                      : isRemove
                      ? "bg-[#FF005A] text-white"
                      : "bg-black/10 text-black/40"
                  }`}
                >
                  {isAdd ? "Add" : isRemove ? "Remove" : "—"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="text-xs text-black/50 bg-black/5 rounded-md px-3 py-2">
          <strong>Summary:</strong>{" "}
          {addTags.size === 0 && removeTags.size === 0 ? (
            <span className="italic text-black/40">No changes selected</span>
          ) : (
            <>
              {addTags.size > 0 && (
                <span className="text-[#007E72]">+{addTags.size} to add</span>
              )}
              {addTags.size > 0 && removeTags.size > 0 && <span className="mx-1">·</span>}
              {removeTags.size > 0 && (
                <span className="text-[#FF005A]">−{removeTags.size} to remove</span>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending || (addTags.size === 0 && removeTags.size === 0)}
            onClick={() => onSubmit(Array.from(addTags), Array.from(removeTags))}
            className="bg-black hover:bg-black/90"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Updating…
              </>
            ) : (
              <>
                <TagIcon className="h-4 w-4 mr-1.5" /> Apply to selected
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * BulkLinkSpeakerDialog — link all selected members to a single speaker.
 *
 * Picks one speaker from the global speakers list (across all events).
 * Useful for batching the "this set of users all presented at event X"
 * workflow.
 */
function BulkLinkSpeakerDialog({
  open,
  onOpenChange,
  pending,
  allSpeakers,
  count,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: boolean;
  allSpeakers: SpeakerRow[];
  count: number;
  onSubmit: (speakerId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  const filtered = allSpeakers.filter((s) => {
    const q = search.toLowerCase();
    return (
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.topic || "").toLowerCase().includes(q) ||
      s.event.title.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setSearch("");
          setPickedId(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-[#004F98] text-[#004F98] h-7">
          <Link2 className="h-3.5 w-3.5 mr-1" /> Bulk link speaker
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Link {count} member{count === 1 ? "" : "s"} to a speaker
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/60 -mt-2">
          Pick a speaker. Each selected member will be linked to that speaker profile (replacing any
          existing link to that speaker). Members can then chat with community members via the
          in-app inbox.
        </p>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-black/30" />
          <Input
            placeholder="Search speakers by name, topic, event…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="space-y-1 max-h-72 overflow-y-auto ais-scroll">
          {filtered.length === 0 ? (
            <div className="text-center text-black/40 text-sm py-8">
              No speakers found. Try a different search.
            </div>
          ) : (
            filtered.map((s) => {
              const isPicked = pickedId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPickedId(isPicked ? null : s.id)}
                  className={`w-full flex items-center justify-between gap-2 p-2 rounded-md text-left transition-colors ${
                    isPicked ? "bg-[#004F98]/10" : "hover:bg-black/5"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {s.name}
                      {isPicked && <CheckCircle2 className="h-3.5 w-3.5 text-[#004F98]" />}
                    </div>
                    <div className="text-xs text-black/60 truncate">
                      {s.event.title}
                      {s.topic ? ` · ${s.topic}` : ""}
                    </div>
                    {s.user && (
                      <div className="text-[0.65rem] text-black/40">
                        Currently linked to {s.user.email}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending || !pickedId}
            onClick={() => pickedId && onSubmit(pickedId)}
            className="bg-[#004F98] hover:bg-[#004F98]/90"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Linking…
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-1.5" /> Link to {count} member{count === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Merge members
// ---------------------------------------------------------------------------

/**
 * Check if two names are "similar" (could plausibly be the same person).
 * Mirrors the server-side check in /api/admin/members/merge/route.ts.
 */
function areNamesSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  // Use Unicode-aware regex (\p{L} = any letter, \p{N} = any number) so that
  // non-ASCII names (Hebrew, Arabic, Cyrillic, etc.) are NOT stripped out.
  // The previous /[^\w\s]/g only kept [A-Za-z0-9_] — Hebrew chars were
  // wiped, making identical Hebrew names look "not even close".
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  const ta = norm(a);
  const tb = norm(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta[0] === tb[0]) return true; // same first name
  const sa = new Set(ta);
  for (const t of tb) if (sa.has(t)) return true; // shared token
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al.length >= 3 && bl.includes(al)) return true; // substring
  if (bl.length >= 3 && al.includes(bl)) return true;
  return false;
}

function checkAllPairsSimilar(users: { name: string | null; email: string }[]) {
  const mismatchedPairs: { a: string; b: string }[] = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const a = users[i].name || users[i].email.split("@")[0];
      const b = users[j].name || users[j].email.split("@")[0];
      if (!areNamesSimilar(a, b)) {
        mismatchedPairs.push({ a, b });
      }
    }
  }
  return {
    similar: mismatchedPairs.length === 0,
    mismatchedPairs,
  };
}

/**
 * MergeMembersDialog — pick a primary, review the name-similarity check,
 * and merge all other selected accounts into the primary.
 *
 * Shows a red alert when names don't match ("the names are not even close,
 * are you sure to merge?") and requires explicit acknowledgement before
 * allowing the merge.
 */
function MergeMembersDialog({
  open,
  onOpenChange,
  pending,
  selectedMembers,
  onMerge,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: boolean;
  selectedMembers: Member[];
  onMerge: (
    primaryId: string,
    secondaryIds: string[],
    confirmNameMismatch: boolean
  ) => void;
}) {
  const [primaryId, setPrimaryId] = useState<string>(
    selectedMembers[0]?.id || ""
  );
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset state when the dialog opens
  useEffect(() => {
    if (open) {
      setPrimaryId(selectedMembers[0]?.id || "");
      setAcknowledged(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nameCheck = useMemo(
    () => checkAllPairsSimilar(selectedMembers),
    [selectedMembers]
  );

  const secondaryIds = selectedMembers
    .filter((m) => m.id !== primaryId)
    .map((m) => m.id);

  // Build a merge preview for the dialog
  const primary = selectedMembers.find((m) => m.id === primaryId);
  const allTagLabels = useMemo(() => {
    const set = new Set<string>();
    for (const m of selectedMembers) {
      for (const t of m.tags) set.add(t.label);
    }
    return Array.from(set);
  }, [selectedMembers]);

  const combinedBio = useMemo(() => {
    const parts: string[] = [];
    for (const m of selectedMembers) {
      if (!m.bio || !m.bio.trim()) continue;
      if (m.id === primaryId) {
        parts.push(m.bio);
      } else {
        parts.push(
          `— Merged from ${m.name || m.email} (${m.email}) —\n${m.bio.trim()}`
        );
      }
    }
    return parts.join("\n\n");
  }, [selectedMembers, primaryId]);

  const canMerge =
    !!primary &&
    secondaryIds.length > 0 &&
    (nameCheck.similar || acknowledged) &&
    !pending;

  function handleMerge() {
    if (!primary || secondaryIds.length === 0) return;
    onMerge(primary.id, secondaryIds, !nameCheck.similar && acknowledged);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setAcknowledged(false);
        }
        onOpenChange(v);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-[#820A7D] text-[#820A7D] h-7"
        >
          <MergeIcon className="h-3.5 w-3.5 mr-1" /> Merge ({selectedMembers.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MergeIcon className="h-5 w-5 text-[#820A7D]" />
            Merge {selectedMembers.length} members into one
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-black/60 -mt-2">
          Pick the <strong>primary account</strong> to keep. All other selected
          accounts will be deleted, and <strong>all their information will be
          transferred to the primary member&apos;s account</strong> — tags,
          photos, presentations, messages, speaker links, bio, interests, and
          login emails (attached as secondary emails so the user can still sign
          in with any of their old addresses). Nothing is erased.
        </p>

        {/* Name similarity check */}
        {nameCheck.similar ? (
          <div className="flex items-start gap-2 bg-[#007E72]/5 border border-[#007E72]/20 rounded-md px-3 py-2 text-xs text-[#007E72]">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Names look similar.</strong> All selected names appear to
              belong to the same person. You can proceed with the merge.
            </div>
          </div>
        ) : (
          <div className="bg-[#FF005A]/5 border border-[#FF005A]/30 rounded-md p-3 space-y-2">
            <div className="flex items-start gap-2 text-sm text-[#FF005A]">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <strong>The names are not even close.</strong> Are you sure you
                want to merge?
              </div>
            </div>
            <div className="text-xs text-black/60 pl-7">
              These name pairs don&apos;t look like the same person:
              <ul className="mt-1 space-y-0.5">
                {nameCheck.mismatchedPairs.slice(0, 4).map((p, i) => (
                  <li key={i} className="font-mono">
                    &ldquo;{p.a}&rdquo; vs &ldquo;{p.b}&rdquo;
                  </li>
                ))}
                {nameCheck.mismatchedPairs.length > 4 && (
                  <li className="italic">
                    +{nameCheck.mismatchedPairs.length - 4} more pair
                    {nameCheck.mismatchedPairs.length - 4 === 1 ? "" : "s"}
                  </li>
                )}
              </ul>
            </div>
            <label className="flex items-start gap-2 text-xs text-black/80 cursor-pointer pl-7">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(!!v)}
                className="data-[state=checked]:bg-[#FF005A] data-[state=checked]:border-[#FF005A] mt-0.5"
              />
              <span>
                I understand the names don&apos;t match — these may be different
                people. Merge anyway.
              </span>
            </label>
          </div>
        )}

        {/* Primary account picker */}
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1.5">
            Primary account (the one to keep)
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto ais-scroll border border-black/10 rounded-md p-1">
            {selectedMembers.map((m) => {
              const isPrimary = m.id === primaryId;
              return (
                <label
                  key={m.id}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer ${
                    isPrimary ? "bg-[#820A7D]/10" : "hover:bg-black/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="merge-primary"
                    checked={isPrimary}
                    onChange={() => setPrimaryId(m.id)}
                    className="h-4 w-4 accent-[#820A7D]"
                  />
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={m.photoUrl || m.image || undefined}
                      alt={m.name || m.email}
                    />
                    <AvatarFallback className="bg-black text-white text-[0.6rem] font-bold">
                      {(m.name || m.email)
                        .split(/\s+|@/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {m.name || m.email.split("@")[0]}
                      {m.role === "ADMIN" && (
                        <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase bg-[#FF005A] text-white px-1.5 py-0.5 rounded">
                          <Shield className="h-2.5 w-2.5" /> Admin
                        </span>
                      )}
                      {m.importSource && (
                        <span className="text-[0.55rem] font-bold uppercase bg-[#00E6FF]/20 text-[#007E72] px-1.5 py-0.5 rounded">
                          Imported
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-black/50 truncate">{m.email}</div>
                  </div>
                  {isPrimary && (
                    <span className="text-[0.6rem] font-bold uppercase text-[#820A7D] shrink-0">
                      Keeps account
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Merge preview */}
        {primary && (
          <div className="bg-black/[0.02] border border-black/10 rounded-md p-3 space-y-2 text-xs">
            <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
              Merge preview
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="text-black/40">Tags (combined)</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {allTagLabels.length === 0 ? (
                    <span className="italic text-black/30">No tags</span>
                  ) : (
                    allTagLabels.map((label) => (
                      <span
                        key={label}
                        className="ais-tag"
                        style={{
                          backgroundColor: `${tagColor(label)}20`,
                          color: tagColor(label),
                        }}
                      >
                        {label}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="text-black/40">Will be deleted</div>
                <div className="mt-1 text-black/70">
                  {secondaryIds.length} account
                  {secondaryIds.length === 1 ? "" : "s"}:{" "}
                  {selectedMembers
                    .filter((m) => m.id !== primaryId)
                    .map((m) => m.email)
                    .join(", ")}
                </div>
              </div>
            </div>

            {combinedBio && (
              <div>
                <div className="text-black/40">Bio (combined)</div>
                <div className="mt-1 max-h-32 overflow-y-auto ais-scroll text-black/70 whitespace-pre-line border-l-2 border-black/10 pl-2">
                  {combinedBio.length > 400
                    ? combinedBio.slice(0, 400) + "…"
                    : combinedBio}
                </div>
              </div>
            )}

            <div className="text-[0.65rem] text-black/40 pt-1 border-t border-black/10">
              Single-value fields (name, photo, LinkedIn, company, mobile,
              password) keep the primary&apos;s value when set, otherwise the
              first non-null value from the secondaries. Email always stays the
              primary&apos;s. Speaker links, photos, presentations, and direct
              messages are all reassigned to the primary. Each merged
              account&apos;s email (and any secondary emails on it) is attached
              to the primary as a secondary email, so the user can still sign
              in with any of their old addresses.
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={!canMerge}
            onClick={handleMerge}
            className="bg-[#820A7D] hover:bg-[#820A7D]/90"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Merging…
              </>
            ) : (
              <>
                <MergeIcon className="h-4 w-4 mr-1.5" />
                Merge {secondaryIds.length} into{" "}
                {primary?.name || primary?.email.split("@")[0] || "primary"}
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ImportMembersDialog — bulk-import members from a CSV or XLS file.
//
// Uploads the file to /api/admin/members/bulk-import (multipart/form-data),
// shows a result summary (inserted / updated / skipped / errors), and offers
// a download link for the CSV template. After a successful import, the dialog
// calls onImported() which triggers a page reload so the new rows appear.
// ---------------------------------------------------------------------------
function ImportMembersDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    totalRows: number;
    filename: string;
    errors: Array<{ row: number; reason: string }>;
  } | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/members/bulk-import", {
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
      // Reset on close
      setFile(null);
      setResult(null);
      if (result && result.inserted + result.updated > 0) {
        onImported();
      }
    }
    onOpenChange(v);
  };

  const downloadTemplate = () => {
    window.location.href = "/api/admin/members/import-template";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[#007E72]" />
            Import members from CSV / XLS
          </DialogTitle>
        </DialogHeader>

        {!result && (
          <div className="space-y-4">
            <p className="text-sm text-black/70">
              Upload a <code className="px-1 py-0.5 bg-black/5 rounded">.csv</code>,{" "}
              <code className="px-1 py-0.5 bg-black/5 rounded">.xls</code>, or{" "}
              <code className="px-1 py-0.5 bg-black/5 rounded">.xlsx</code> file.
              Each row becomes (or updates) a member. The only required column is{" "}
              <strong>email</strong>.
            </p>

            <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 text-xs text-black/70">
              <div className="font-semibold mb-1 text-black">Supported columns</div>
              <code className="block whitespace-pre-wrap">
                name, email, company, companyUrl, linkedinUrl, portfolioUrl, bio,
                mobile, interestedIn, profileCategories, appliedFor, invitedToSpeak
              </code>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={(el) => {
                  // Keep a ref so we can reset the file input value after upload
                  (el as HTMLInputElement | null)?.setAttribute(
                    "accept",
                    ".csv,.xls,.xlsx"
                  );
                }}
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#007E72] file:text-white file:font-semibold hover:file:bg-[#007E72]/90 cursor-pointer"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={downloadTemplate}
                type="button"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> CSV template
              </Button>
            </div>

            {file && (
              <div className="text-xs text-black/60">
                Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-black/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleClose(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[#007E72] hover:bg-[#007E72]/90 text-white"
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-1.5" /> Import
                  </>
                )}
              </Button>
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
              File: <strong>{result.filename}</strong> · {result.totalRows} rows
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
              <Button
                size="sm"
                className="bg-[#007E72] hover:bg-[#007E72]/90 text-white"
                onClick={() => handleClose(false)}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
