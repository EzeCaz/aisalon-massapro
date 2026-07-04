"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Plus,
  ExternalLink,
  Mail,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Users as UsersIcon,
  Loader2,
} from "lucide-react";

type EventRow = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
};

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  topic: string | null;
  bio: string | null;
  photoUrl: string | null;
  contactEmail: string | null;
  order: number;
  event: { id: string; title: string; slug: string; startsAt: string };
  user: { id: string; email: string; name: string | null } | null;
  _count: { images: number; presentations: number; messages: number };
};

type Props = {
  speakers: Speaker[];
  events: EventRow[];
};

export function SpeakersManager({ speakers, events }: Props) {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [list, setList] = useState<Speaker[]>(speakers);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((s) => {
      if (eventFilter && s.event.id !== eventFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.role || "").toLowerCase().includes(q) ||
        (s.company || "").toLowerCase().includes(q) ||
        (s.topic || "").toLowerCase().includes(q) ||
        (s.contactEmail || "").toLowerCase().includes(q)
      );
    });
  }, [list, search, eventFilter]);

  async function handleCreate(data: {
    eventId: string;
    name: string;
    role?: string;
    company?: string;
    bio?: string;
    topic?: string;
    photoUrl?: string;
    contactEmail?: string;
  }) {
    const t = toast.loading("Adding speaker…");
    try {
      const res = await fetch("/api/admin/speakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      // Prepend the new speaker to the list
      const newSpeaker: Speaker = {
        ...result.speaker,
        event: events.find((e) => e.id === data.eventId)!,
        user: null,
        _count: { images: 0, presentations: 0, messages: 0 },
      };
      setList((prev) => [newSpeaker, ...prev]);
      toast.success("Speaker added", { id: t });
      setAddOpen(false);
    } catch (e) {
      toast.error((e as Error).message || "Add failed", { id: t });
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
            <Input
              placeholder="Search by name, role, company, topic, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="text-sm border border-black/15 rounded-md px-2 py-2 bg-white"
          >
            <option value="">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <Badge variant="secondary" className="bg-black/5 text-black/60">
            {filtered.length} of {list.length}
          </Badge>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-[#FF005A] hover:bg-[#FF005A]/90">
          <Plus className="h-4 w-4 mr-1.5" /> Add speaker
        </Button>
      </div>

      {/* Speaker grid */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center border border-black/10">
          <UsersIcon className="h-10 w-10 mx-auto text-black/30 mb-3" />
          <p className="text-sm text-black/60">No speakers match your filters.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <Card key={s.id} className="p-4 border border-black/10 bg-white">
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={s.photoUrl || undefined} alt={s.name} />
                  <AvatarFallback className="bg-black text-white text-xs font-semibold">
                    {s.name.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-black text-sm">{s.name}</div>
                  {s.role && (
                    <div className="text-xs text-black/60">{s.role}</div>
                  )}
                  {s.company && (
                    <div className="text-xs text-black/40">{s.company}</div>
                  )}
                </div>
              </div>

              {s.topic && (
                <div className="mt-3 text-xs text-black/70 italic line-clamp-2">
                  &ldquo;{s.topic}&rdquo;
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.65rem] text-black/50">
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  {s._count.images}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {s._count.presentations}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {s._count.messages}
                </span>
                {s.user && (
                  <Badge variant="outline" className="text-[0.55rem] uppercase tracking-wider border-[#00E6FF] text-[#007E72] bg-[#00E6FF]/10">
                    Linked
                  </Badge>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-black/10 flex items-center justify-between">
                <Link
                  href={`/events/${s.event.slug}`}
                  className="text-xs text-[#004F98] font-semibold hover:underline inline-flex items-center gap-1"
                >
                  {s.event.title.length > 30 ? s.event.title.slice(0, 30) + "…" : s.event.title}
                  <ExternalLink className="h-3 w-3" />
                </Link>
                {s.contactEmail && (
                  <a
                    href={`mailto:${s.contactEmail}`}
                    className="text-xs text-black/50 hover:text-black"
                    title={s.contactEmail}
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddSpeakerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        events={events}
        onCreate={handleCreate}
      />
    </div>
  );
}

function AddSpeakerDialog({
  open,
  onOpenChange,
  events,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  events: EventRow[];
  onCreate: (data: {
    eventId: string;
    name: string;
    role?: string;
    company?: string;
    bio?: string;
    topic?: string;
    photoUrl?: string;
    contactEmail?: string;
  }) => Promise<void>;
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

  function reset() {
    setEventId("");
    setName("");
    setRole("");
    setCompany("");
    setBio("");
    setTopic("");
    setPhotoUrl("");
    setContactEmail("");
  }

  async function submit() {
    if (!eventId || !name.trim()) return;
    setSaving(true);
    await onCreate({
      eventId,
      name: name.trim(),
      role: role.trim() || undefined,
      company: company.trim() || undefined,
      bio: bio.trim() || undefined,
      topic: topic.trim() || undefined,
      photoUrl: photoUrl.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
    });
    setSaving(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a speaker</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/60">
          Add a speaker to an event. If the contact email matches a platform
          user, the speaker will be auto-linked (so members can chat with them
          in-platform). You can also link a user manually from the Members tab.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-semibold uppercase">Event *</Label>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="w-full text-sm border border-black/15 rounded-md px-2 py-2 bg-white"
            >
              <option value="">Select an event…</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ohad Barta" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase">Role</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="AI Product Lead, Amdocs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase">Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Amdocs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase">Contact email</Label>
            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="ohad@example.com" type="email" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-semibold uppercase">Topic / talk title</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="The AI CMO Playbook" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-semibold uppercase">Photo URL</Label>
            <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-semibold uppercase">Bio</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Short bio shown on the speaker card." />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={!eventId || !name.trim() || saving}
            className="bg-[#FF005A] hover:bg-[#FF005A]/90"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add speaker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
