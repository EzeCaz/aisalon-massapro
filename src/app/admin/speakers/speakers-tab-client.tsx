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
  Pencil,
  Trash2,
  ExternalLink,
  Link2,
  Unlink,
  Search,
} from "lucide-react";
import { PhotoUploadField } from "@/components/ais/photo-upload-field";
import { formatDateTlv } from "@/lib/datetime-tlv";
import {
  CountryChapterScopeFilter,
  type ScopeFilterCountry,
  type ScopeFilterChapter,
} from "@/components/ais/country-chapter-scope-filter";
import { BulkAssignScopeDialog } from "@/components/ais/bulk-assign-scope-dialog";

type SpeakerEvent = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  chapterRef?: { id: string; country: { name: string; code: string; flagEmoji?: string | null } | null } | null;
};

type SpeakerUser = {
  id: string;
  email: string;
  name: string | null;
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
  chapterId?: string | null;
  event: SpeakerEvent;
  user: SpeakerUser | null;
  _count: { images: number; presentations: number; messages: number };
};

type EventOption = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  _count: { speakers: number };
};

type UserOption = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export function SpeakersTabClient({
  speakers: initialSpeakers,
  events,
  users,
  allCountries,
  allChapters,
  isSuperAdmin,
}: {
  speakers: Speaker[];
  events: EventOption[];
  users: UserOption[];
  allCountries?: ScopeFilterCountry[];
  allChapters?: ScopeFilterChapter[];
  isSuperAdmin?: boolean;
}) {
  const [speakers, setSpeakers] = React.useState<Speaker[]>(initialSpeakers);
  const [search, setSearch] = React.useState("");
  const [eventFilter, setEventFilter] = React.useState<string>("ALL");
  const [editing, setEditing] = React.useState<Speaker | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  // V7: scope filter (Super Admin only)
  const [scopeFilter, setScopeFilter] = React.useState<{ countryId: string; chapterId: string }>({
    countryId: "",
    chapterId: "",
  });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkScopeOpen, setBulkScopeOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    return speakers.filter((s) => {
      if (eventFilter !== "ALL" && s.eventId !== eventFilter) return false;
      // V7 scope filter
      if (scopeFilter.chapterId) {
        if ((s.chapterId ?? undefined) !== scopeFilter.chapterId) return false;
      } else if (scopeFilter.countryId) {
        // Match by country code on the event's chapterRef OR by the speaker's chapterId
        const country = allCountries?.find((c) => c.id === scopeFilter.countryId);
        const evCode = s.event?.chapterRef?.country?.code;
        const spChapterCountry = allChapters?.find((c) => c.id === s.chapterId)?.countryId;
        if (country && evCode !== country.code && spChapterCountry !== scopeFilter.countryId) return false;
      }
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const eventTitle = s.event?.title ?? "";
      return (
        s.name.toLowerCase().includes(q) ||
        (s.role || "").toLowerCase().includes(q) ||
        (s.company || "").toLowerCase().includes(q) ||
        (s.topic || "").toLowerCase().includes(q) ||
        (s.contactEmail || "").toLowerCase().includes(q) ||
        eventTitle.toLowerCase().includes(q)
      );
    });
  }, [speakers, search, eventFilter, scopeFilter, allCountries, allChapters]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(filtered.map((s) => s.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const handleSaved = (speaker: Speaker) => {
    setSpeakers((prev) => {
      const idx = prev.findIndex((s) => s.id === speaker.id);
      if (idx === -1) return [speaker, ...prev];
      const copy = [...prev];
      copy[idx] = speaker;
      return copy;
    });
    setEditing(null);
    setCreating(false);
    toast.success("Speaker saved");
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/speakers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to delete speaker");
        return;
      }
      setSpeakers((prev) => prev.filter((s) => s.id !== id));
      toast.success("Speaker removed");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete speaker");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* V7 scope filter (Super Admin only) */}
      {isSuperAdmin && allCountries && allChapters && allCountries.length > 0 && (
        <CountryChapterScopeFilter
          countries={allCountries}
          chapters={allChapters}
          value={scopeFilter}
          onChange={setScopeFilter}
        />
      )}

      {/* Bulk-action bar (Super Admin only) */}
      {isSuperAdmin && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 my-2 bg-[#820A7D]/5 border border-[#820A7D]/20 rounded-md px-3 py-2">
          <span className="text-sm font-semibold text-[#820A7D]">{selected.size} selected</span>
          <button
            type="button"
            onClick={selectAllVisible}
            className="text-xs font-semibold text-black/70 hover:text-black underline-offset-4 hover:underline"
          >
            Select all {filtered.length} visible
          </button>
          <BulkAssignScopeDialog
            entityType="speakers"
            selectedIds={Array.from(selected)}
            onClear={clearSelection}
            open={bulkScopeOpen}
            onOpenChange={setBulkScopeOpen}
          />
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-xs font-semibold text-[#FF005A] hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/80" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, topic, company, email, event…"
            className="w-full rounded-md border border-black/15 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </div>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
        >
          <option value="ALL">All events ({speakers.length})</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} ({formatDateTlv(ev.startsAt)})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={events.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-2 text-sm hover:bg-[#FF005A]/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add speaker
        </button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          No events exist yet. Create one first at{" "}
          <Link
            href="/admin/events/new"
            className="font-semibold underline-offset-4 hover:underline"
          >
            /admin/events/new
          </Link>
          .
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-black/10 bg-white p-8 text-center text-sm text-black/50">
          No speakers match your filters.
        </div>
      ) : (
        <div className="rounded-md border border-black/10 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-black/80 sticky top-0 z-10">
              <tr>
                {isSuperAdmin && <th className="w-8 px-2 py-3"></th>}
                <th className="text-left px-4 py-3 font-bold">Speaker</th>
                <th className="text-left px-4 py-3 font-bold">Topic / Role</th>
                <th className="text-left px-4 py-3 font-bold hidden md:table-cell">Event</th>
                <th className="text-left px-4 py-3 font-bold hidden lg:table-cell">Linked user</th>
                <th className="text-left px-4 py-3 font-bold hidden lg:table-cell">Contact</th>
                <th className="text-right px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className={`border-t border-black/5 ${selected.has(s.id) ? "bg-[#820A7D]/5" : "hover:bg-black/[0.015]"}`}>
                  {isSuperAdmin && (
                    <td className="px-2 py-3 text-center align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="h-3.5 w-3.5 accent-[#820A7D]"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {s.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.photoUrl}
                          alt={s.name}
                          className="h-9 w-9 rounded-full object-cover bg-black/5"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-[#FF005A]/10 text-[#FF005A] flex items-center justify-center text-xs font-bold">
                          {s.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <button
                          type="button"
                          onClick={() => setEditing(s)}
                          className="font-semibold text-black hover:text-[#FF005A] hover:underline underline-offset-2 text-left"
                          title="Click to edit speaker info"
                        >
                          {s.name}
                        </button>
                        {s.company ? (
                          <div className="text-xs text-black/50">{s.company}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {s.topic ? (
                      <div className="font-medium text-black/80">{s.topic}</div>
                    ) : (
                      <div className="text-black/30 italic">no topic</div>
                    )}
                    {s.role ? (
                      <div className="text-xs text-black/50">{s.role}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell align-top">
                    {s.event ? (
                      <Link
                        href={`/events/${s.event.slug}`}
                        className="inline-flex items-center gap-1 text-[#820A7D] hover:underline"
                        target="_blank"
                      >
                        {s.event.title}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-xs text-black/30 italic">no event</span>
                    )}
                    {s.event && (
                      <div className="text-xs text-black/50">
                        {formatDateTlv(s.event.startsAt)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell align-top">
                    {s.user ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <Link2 className="h-3 w-3" />
                        {s.user.email}
                      </span>
                    ) : (
                      <span className="text-xs text-black/80">not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell align-top text-xs">
                    {s.contactEmail ? (
                      <a
                        href={`mailto:${s.contactEmail}`}
                        className="text-black/70 hover:underline"
                      >
                        {s.contactEmail}
                      </a>
                    ) : (
                      <span className="text-black/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        title="Edit"
                        className="rounded p-1.5 text-black/80 hover:bg-black/5 hover:text-black"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(s.id)}
                        title="Delete"
                        className="rounded p-1.5 text-red-600/70 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      <SpeakerEditor
        open={creating || editing !== null}
        speaker={editing}
        events={events}
        users={users}
        onSaved={handleSaved}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      {/* Delete confirm */}
      <Dialog open={deletingId !== null} onOpenChange={(o) => !o && setDeletingId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove speaker?</DialogTitle>
            <DialogDescription>
              This permanently deletes the speaker and their related image /
              presentation / message records. This cannot be undone.
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
              Delete speaker
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Speaker editor modal ---------------- */

function SpeakerEditor({
  open,
  speaker,
  events,
  users,
  onSaved,
  onClose,
}: {
  open: boolean;
  speaker: Speaker | null;
  events: EventOption[];
  users: UserOption[];
  onSaved: (s: Speaker) => void;
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
  const [eventId, setEventId] = React.useState("");
  const [userId, setUserId] = React.useState<string>("");
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
    setContactEmail(speaker?.contactEmail || "");
    setEventId(speaker?.eventId || events[0]?.id || "");
    setUserId(speaker?.userId || "");
  }, [open, speaker, events]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!eventId) {
      toast.error("Please pick an event");
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
        userId: userId || null,
      };
      const res = isEdit
        ? await fetch(`/api/admin/speakers/${speaker!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/speakers", {
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
      onSaved(d.speaker);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save speaker");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit speaker" : "Add a new speaker"}</DialogTitle>
          <DialogDescription>
            Speakers show up on the event page roster. Linking to a user account
            enables two-way in-app chat between members and the speaker.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              />
            </Field>
            <Field label="Event *">
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                required
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({formatDateTlv(ev.startsAt)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Role / title">
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. AI Product Lead, Amdocs"
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              />
            </Field>
            <Field label="Company">
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              />
            </Field>
            <Field label="Topic / talk title" full>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Building RAG pipelines that ship"
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              />
            </Field>
            <Field label="Photo URL" full>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              />
            </Field>
            {/* Photo upload — admin can upload a square headshot that
                overrides the URL above. The upload endpoint stores it
                at /api/admin/speakers/[id]/photo and returns the new URL. */}
            {isEdit && speaker && (
              <div className="sm:col-span-2">
                <PhotoUploadField
                  photoUrl={photoUrl}
                  uploadUrl={`/api/admin/speakers/${speaker.id}/photo`}
                  onUploaded={(url) => setPhotoUrl(url ?? "")}
                />
              </div>
            )}
            <Field label="Contact email (auto-links to user)" full>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="speaker@example.com"
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              />
              <p className="text-xs text-black/50 mt-1">
                If a platform user with this email exists, the speaker is
                auto-linked so members can chat with them in-app.
              </p>
            </Field>
            <Field label="Explicit user link (override)" full>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              >
                <option value="">— auto-link from contact email —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                    {u.name ? ` (${u.name})` : ""}
                    {u.role === "ADMIN" ? " · ADMIN" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bio" full>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
              />
            </Field>
          </div>
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add speaker"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-semibold text-black/80 mb-1">{label}</span>
      {children}
    </label>
  );
}
