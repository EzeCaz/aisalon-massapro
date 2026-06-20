"use client";

import { useState, useMemo, useRef, useEffect } from "react";
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
} from "lucide-react";

type LinkedSpeaker = {
  id: string;
  name: string;
  topic: string | null;
  event: { id: string; title: string; slug: string };
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
  role: string;
  createdAt: string;
  tags: { id: string; label: string; color: string | null }[];
  _count: { images: number };
  speakers: LinkedSpeaker[];
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
};

export function AdminMembersTable({ members, events, allSpeakers }: Props) {
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const matchSearch =
        !q ||
        m.email.toLowerCase().includes(q) ||
        (m.name || "").toLowerCase().includes(q) ||
        (m.company || "").toLowerCase().includes(q) ||
        m.tags.some((t) => t.label.toLowerCase().includes(q));
      const matchApplied = !filterApplied || m.appliedFor === filterApplied;
      const matchInvited = !filterInvited || m.invitedToSpeak === "Yes";
      const matchLinked = !filterLinked || m.speakers.length > 0;
      return matchSearch && matchApplied && matchInvited && matchLinked;
    });
  }, [members, search, filterApplied, filterInvited, filterLinked]);

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
      toast.success(
        data.created
          ? `Created speaker profile on ${data.speaker.event.title}`
          : `Already a speaker on ${data.speaker.event.title}`,
        { id: t }
      );
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Search + filters */}
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
        <span className="text-xs text-black/40 ml-auto">
          {filtered.length} of {members.length} members
        </span>
      </div>

      {/* Bulk action bar (only visible when rows are selected) */}
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

      {/* Table */}
      <div className="border border-black/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-black/60 text-xs uppercase tracking-wider">
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
                      if (allVisibleSelected) clearSelection();
                      else selectAllVisible();
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
                  <>
                    <tr
                      key={m.id}
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
                          onCheckedChange={() => toggleSelect(m.id)}
                          aria-label={`Select ${m.name || m.email}`}
                          className="data-[state=checked]:bg-[#FF005A] data-[state=checked]:border-[#FF005A]"
                        />
                      </td>
                      <td
                        className="px-2 py-3 text-black/40 cursor-pointer"
                        onClick={() => toggleExpanded(m.id)}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td
                        className="px-4 py-3 cursor-pointer"
                        onClick={() => toggleExpanded(m.id)}
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
                            <div className="font-semibold text-black truncate flex items-center gap-1.5">
                              {m.name || m.email.split("@")[0]}
                              {m.role === "ADMIN" && (
                                <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase bg-[#FF005A] text-white px-1.5 py-0.5 rounded">
                                  <Shield className="h-2.5 w-2.5" /> Admin
                                </span>
                              )}
                              {m.importSource && (
                                <span
                                  title={`Imported from ${m.importSource} on ${m.importedAt ? new Date(m.importedAt).toLocaleString() : ""}`}
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
                            </div>
                            <div className="text-xs text-black/50 truncate">{m.email}</div>
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
                          <TagDialog
                            member={m}
                            pending={pending === m.id}
                            onSave={(tags) => saveTags(m.id, tags)}
                          />
                          <LinkSpeakerDialog
                            member={m}
                            allSpeakers={allSpeakers}
                            pending={pending === m.id}
                            onLink={(sid) => linkSpeaker(m.id, sid)}
                          />
                          <ConvertToSpeakerDialog
                            member={m}
                            events={events}
                            pending={pending === m.id}
                            onConvert={(payload) => convertToSpeaker(m.id, payload)}
                          />
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${m.id}-detail`} className="bg-black/[0.02]">
                        <td></td>
                        <td colSpan={6} className="px-4 py-4">
                          <MemberDetail member={m} />
                        </td>
                      </tr>
                    )}
                  </>
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
    </div>
  );
}

function MemberDetail({ member }: { member: Member }) {
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
            label="Email"
            value={
              <a href={`mailto:${member.email}`} className="text-[#004F98] hover:underline">
                {member.email}
              </a>
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
            value={new Date(member.importedAt).toLocaleString()}
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
                  {ev.title} ({new Date(ev.startsAt).toLocaleDateString()})
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
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
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
          accounts will be deleted, and their data (tags, photos, presentations,
          messages, speaker links, bio, interests) will be combined into the
          primary. Nothing is erased.
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
              messages are all reassigned to the primary.
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
