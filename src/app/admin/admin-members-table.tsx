"use client";

import { useState, useMemo } from "react";
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

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

      {/* Table */}
      <div className="border border-black/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-black/60 text-xs uppercase tracking-wider">
              <tr>
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
                return (
                  <>
                    <tr
                      key={m.id}
                      className="border-t border-black/5 hover:bg-black/[0.02] cursor-pointer"
                      onClick={() => toggleExpanded(m.id)}
                    >
                      <td className="px-2 py-3 text-black/40">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-4 py-3">
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
                        <td colSpan={5} className="px-4 py-4">
                          <MemberDetail member={m} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-black/40 text-sm">
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
