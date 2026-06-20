"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Rocket,
  Plus,
  Trash2,
  Edit3,
  Loader2,
  Clock,
  Mic,
  FileText,
  AlertCircle,
  RefreshCcw,
} from "lucide-react";

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  topic: string | null;
};

type AgendaItem = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  description: string | null;
  type: string;
  speaker: Speaker | null;
  _count: { presentations: number };
};

type Props = {
  event: {
    id: string;
    slug: string;
    title: string;
    startsAt: string;
    endsAt: string;
    speakers: Speaker[];
  };
  onAgendaChanged?: () => void;
};

type SpeakerMode = "existing" | "new" | "none";

const ACCEPTED_EXTS =
  ".pdf,.ppt,.pptx,.key,.odp,.doc,.docx,.odt,.txt,.md,.csv,.rtf,.jpg,.jpeg,.png,.webp,.gif";

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function toLocalDatetimeInput(iso: string): string {
  // Convert ISO to Asia/Jerusalem local time for <input type="datetime-local">
  const d = new Date(iso);
  // Intl.formatToParts gives us the components in the target timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fromLocalDatetimeInput(local: string): string {
  // local is "YYYY-MM-DDTHH:mm" in Asia/Jerusalem local time.
  // We need to convert it to a UTC ISO string.
  //
  // Approach: use Intl.DateTimeFormat to get the timezone offset for
  // Asia/Jerusalem on the given date (Israel uses UTC+2 in winter,
  // UTC+3 in summer due to DST). Then subtract the offset from the
  // local time to get UTC.
  //
  // We do this by formatting the same wall-clock time as if it were
  // UTC, then asking Intl for what Asia/Jerusalem's offset is on that
  // date, then adjusting.
  const date = new Date(local + ":00Z"); // treat as UTC first to get a stable Date object
  if (isNaN(date.getTime())) {
    // Fallback: just return the local string as ISO (server will interpret as UTC)
    return new Date(local).toISOString();
  }

  // Get Asia/Jerusalem's offset (in minutes) for this date
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
  // tzName looks like "GMT+3" or "GMT+2" or "GMT-5:30"
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  let offsetMinutes = 0;
  if (match) {
    const sign = match[1] === "+" ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = match[3] ? parseInt(match[3], 10) : 0;
    offsetMinutes = sign * (hours * 60 + minutes);
  }

  // The user picked a wall-clock time in Israel. To convert to UTC,
  // subtract the offset (e.g. 15:00 IDT = 12:00 UTC, since IDT is +3).
  const utc = new Date(date.getTime() - offsetMinutes * 60000);
  return utc.toISOString();
}

const typeColor: Record<string, string> = {
  WELCOME: "bg-[#00E6FF]/10 text-[#007E72] border-[#00E6FF]/30",
  TALK: "bg-[#FF005A]/10 text-[#FF005A] border-[#FF005A]/30",
  BREAK: "bg-black/5 text-black/60 border-black/10",
  NETWORKING: "bg-[#820A7D]/10 text-[#820A7D] border-[#820A7D]/30",
  FAST_PITCH: "bg-[#FFAC30]/10 text-[#FFAC30] border-[#FFAC30]/30",
};

const typeLabel: Record<string, string> = {
  TALK: "Talk",
  FAST_PITCH: "Fast Pitch",
  WELCOME: "Welcome",
  BREAK: "Break",
  NETWORKING: "Networking",
};

export function AdminAgendaTab({ event, onAgendaChanged }: Props) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/agenda?eventId=${event.id}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setItems(data.items);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load agenda");
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => {
    load();
  }, [load]);

  function notifyChanged() {
    onAgendaChanged?.();
  }

  async function handleDelete(item: AgendaItem) {
    const msg =
      item._count.presentations > 0
        ? `Delete "${item.title}"? This will also remove ${item._count.presentations} linked presentation file(s).`
        : `Delete "${item.title}"?`;
    if (!confirm(msg)) return;
    const t = toast.loading("Deleting…");
    try {
      const res = await fetch(`/api/admin/agenda/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Deleted", { id: t });
      await load();
      notifyChanged();
    } catch (e) {
      toast.error("Delete failed", { id: t });
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between pb-3 border-b border-black/10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-[#FFAC30]/15 text-[#FFAC30] flex items-center justify-center">
            <Rocket className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-black">Manage agenda</h3>
            <p className="text-xs text-black/50">
              Add fast pitch sessions, talks, and other items — with optional speakers and
              presentation files.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load} title="Reload">
            <RefreshCcw className="h-3.5 w-3.5" />
          </Button>
          <CreateAgendaItemDialog
            key={`create-${items.length}`}
            open={createOpen}
            onOpenChange={setCreateOpen}
            event={event}
            existingSpeakers={event.speakers}
            onCreated={() => {
              load();
              notifyChanged();
            }}
          >
            <Button size="sm" className="bg-[#FFAC30] hover:bg-[#FFAC30]/90 text-black">
              <Plus className="h-4 w-4 mr-1.5" /> Add agenda item
            </Button>
          </CreateAgendaItemDialog>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-black/5 animate-pulse rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-8 border-2 border-dashed border-black/15 bg-white text-center">
          <Rocket className="h-10 w-10 mx-auto text-black/30 mb-3" />
          <h3 className="font-bold text-black mb-1">No agenda items yet</h3>
          <p className="text-sm text-black/60 mb-4">
            Add the first agenda item to get started — talks, fast pitch sessions, breaks, etc.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <AgendaItemRow
              key={item.id}
              item={item}
              event={event}
              onDelete={() => handleDelete(item)}
              onSaved={() => {
                load();
                notifyChanged();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Agenda item row (with inline edit) ----------------

function AgendaItemRow({
  item,
  event,
  onDelete,
  onSaved,
}: {
  item: AgendaItem;
  event: Props["event"];
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const isFastPitch = item.type === "FAST_PITCH";

  return (
    <Card
      className={`p-3 border ${typeColor[item.type] || "bg-white border-black/10"} flex items-start gap-3`}
    >
      <div className="flex-shrink-0 text-center min-w-[70px] pt-1">
        <div className="font-mono text-xs font-bold text-black flex items-center justify-center gap-0.5">
          <Clock className="h-3 w-3" />
          {formatTime(item.startsAt)}
        </div>
        {item.endsAt && (
          <div className="font-mono text-[0.6rem] text-black/50">
            – {formatTime(item.endsAt)}
          </div>
        )}
      </div>
      <div className="h-10 w-px bg-black/15" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[0.55rem] font-bold uppercase tracking-wide bg-white/60 px-1.5 py-0.5 rounded">
            {typeLabel[item.type] || item.type}
          </span>
          {isFastPitch && (
            <span className="text-[0.55rem] font-bold uppercase tracking-wide bg-[#FFAC30] text-black px-1.5 py-0.5 rounded flex items-center gap-1">
              <Rocket className="h-2.5 w-2.5" /> Fast pitch
            </span>
          )}
          <div className="font-semibold text-sm text-black leading-snug flex-1 min-w-0">
            {item.title}
          </div>
        </div>
        {item.description && (
          <p className="text-xs text-black/70 mt-1 line-clamp-2">{item.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {item.speaker && (
            <span className="text-[0.65rem] font-semibold text-black/70 inline-flex items-center gap-1">
              <Mic className="h-3 w-3" />
              {item.speaker.name}
              {item.speaker.role && <span className="text-black/40">· {item.speaker.role}</span>}
            </span>
          )}
          {item._count.presentations > 0 && (
            <span className="text-[0.65rem] font-semibold text-[#007E72] inline-flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {item._count.presentations} file{item._count.presentations === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0">
        <EditAgendaItemDialog
          key={item.id}
          open={editOpen}
          onOpenChange={setEditOpen}
          item={item}
          event={event}
          onSaved={onSaved}
        >
          <button
            className="rounded-md bg-white/70 hover:bg-white p-1.5 text-black"
            title="Edit"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        </EditAgendaItemDialog>
        <button
          onClick={onDelete}
          className="rounded-md bg-white/70 hover:bg-[#FF005A]/10 p-1.5 text-[#FF005A]"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  );
}

// ---------------- Create dialog ----------------

function CreateAgendaItemDialog({
  open,
  onOpenChange,
  event,
  existingSpeakers,
  onCreated,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: Props["event"];
  existingSpeakers: Speaker[];
  onCreated: () => void;
  children: React.ReactNode;
}) {
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>("FAST_PITCH");
  const [startsAt, setStartsAt] = useState<string>(
    toLocalDatetimeInput(event.startsAt)
  );
  const [endsAt, setEndsAt] = useState<string>("");
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>("existing");
  const [speakerId, setSpeakerId] = useState<string>("");
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [newSpeakerRole, setNewSpeakerRole] = useState("");
  const [newSpeakerCompany, setNewSpeakerCompany] = useState("");
  const [newSpeakerBio, setNewSpeakerBio] = useState("");
  const [newSpeakerTopic, setNewSpeakerTopic] = useState("");
  const [newSpeakerContactEmail, setNewSpeakerContactEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [fileDescription, setFileDescription] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setType("FAST_PITCH");
    setStartsAt(toLocalDatetimeInput(event.startsAt));
    setEndsAt("");
    setSpeakerMode("existing");
    setSpeakerId("");
    setNewSpeakerName("");
    setNewSpeakerRole("");
    setNewSpeakerCompany("");
    setNewSpeakerBio("");
    setNewSpeakerTopic("");
    setNewSpeakerContactEmail("");
    setFile(null);
    setFileTitle("");
    setFileDescription("");
    setSaving(false);
  }

  async function submit() {
    if (!title.trim() || !startsAt) {
      toast.error("Title and start time are required");
      return;
    }
    if (speakerMode === "new" && !newSpeakerName.trim()) {
      toast.error("New speaker name is required");
      return;
    }

    // ---- Pre-flight file size check ----
    // Vercel's serverless body limit is 4.5 MB. The platform itself returns
    // a plain-text 413 "Request Entity Too Large" response that bypasses our
    // route handler entirely — so we catch the oversized file BEFORE the
    // fetch to give the user a friendly message.
    const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB safety margin
    if (file && file.size > MAX_FILE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      toast.error(
        `File is too large (${mb} MB). The maximum upload size is ~4 MB due to serverless limits. Please compress the file or use a smaller version.`,
        { duration: 6000 }
      );
      return;
    }

    setSaving(true);
    const t = toast.loading("Creating agenda item…");

    const formData = new FormData();
    formData.append("eventId", event.id);
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("type", type);
    formData.append("startsAt", fromLocalDatetimeInput(startsAt));
    if (endsAt) formData.append("endsAt", fromLocalDatetimeInput(endsAt));

    if (speakerMode === "existing" && speakerId) {
      formData.append("speakerId", speakerId);
    } else if (speakerMode === "new") {
      formData.append(
        "newSpeaker",
        JSON.stringify({
          name: newSpeakerName.trim(),
          role: newSpeakerRole.trim() || undefined,
          company: newSpeakerCompany.trim() || undefined,
          bio: newSpeakerBio.trim() || undefined,
          topic: newSpeakerTopic.trim() || undefined,
          contactEmail: newSpeakerContactEmail.trim() || undefined,
        })
      );
    }
    // speakerMode === "none" → don't append speakerId or newSpeaker

    if (file) {
      formData.append("file", file);
      if (fileTitle.trim()) formData.append("fileTitle", fileTitle.trim());
      if (fileDescription.trim())
        formData.append("fileDescription", fileDescription.trim());
    }

    try {
      const res = await fetch("/api/admin/agenda", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        // Safely parse the error response. The server normally returns JSON,
        // but Vercel's platform-level 413 returns plain text ("Request Entity
        // Too Large") which would throw on .json() — surfacing as the
        // confusing "Unexpected token 'R'…" error.
        let errMsg = `Request failed (HTTP ${res.status})`;
        try {
          const err = await res.json();
          if (err?.error) errMsg = err.error;
        } catch {
          if (res.status === 413) {
            errMsg =
              "The uploaded file is too large. Vercel limits each request to ~4.5 MB — please use a smaller file (under 4 MB).";
          } else {
            errMsg = `Request failed (HTTP ${res.status}). Please try again.`;
          }
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      const parts = [`Created "${data.agendaItem.title}"`];
      if (data.speaker) parts.push(`new speaker "${data.speaker.name}" added`);
      if (data.presentation) parts.push(`file "${data.presentation.fileName}" uploaded`);
      toast.success(parts.join(" · "), { id: t });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error((e as Error).message || "Failed to create agenda item", { id: t, duration: 6000 });
    } finally {
      setSaving(false);
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
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto ais-scroll">
        <DialogHeader>
          <DialogTitle>Add agenda item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type */}
          <div>
            <Label className="text-xs font-semibold text-black/70">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FAST_PITCH">🚀 Fast Pitch</SelectItem>
                <SelectItem value="TALK">🎤 Talk</SelectItem>
                <SelectItem value="WELCOME">👋 Welcome</SelectItem>
                <SelectItem value="BREAK">☕ Break</SelectItem>
                <SelectItem value="NETWORKING">🤝 Networking</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div>
            <Label className="text-xs font-semibold text-black/70">
              Title <span className="text-[#FF005A]">*</span>
            </Label>
            <Input
              className="mt-1"
              placeholder={
                type === "FAST_PITCH"
                  ? "e.g. Acme AI — Fraud detection for fintech"
                  : "e.g. Welcome by Ezequiel Sznaider"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs font-semibold text-black/70">Description</Label>
            <Textarea
              className="mt-1"
              rows={3}
              placeholder="Optional longer description — what the session is about, what attendees will learn, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-black/70">
                Start <span className="text-[#FF005A]">*</span>
              </Label>
              <Input
                type="datetime-local"
                className="mt-1"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-black/70">End</Label>
              <Input
                type="datetime-local"
                className="mt-1"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[0.65rem] text-black/40 -mt-2">
            Times are in Tel Aviv (Asia/Jerusalem) timezone.
          </p>

          {/* Speaker */}
          <div className="border-t border-black/10 pt-4">
            <Label className="text-xs font-semibold text-black/70">Speaker</Label>
            <div className="flex gap-1 mt-1 mb-2 bg-black/5 p-0.5 rounded-md w-fit">
              <button
                type="button"
                onClick={() => setSpeakerMode("existing")}
                className={`px-2.5 py-1 text-[0.7rem] font-semibold rounded transition-colors ${
                  speakerMode === "existing"
                    ? "bg-white text-black shadow-sm"
                    : "text-black/50 hover:text-black"
                }`}
              >
                Existing
              </button>
              <button
                type="button"
                onClick={() => setSpeakerMode("new")}
                className={`px-2.5 py-1 text-[0.7rem] font-semibold rounded transition-colors ${
                  speakerMode === "new"
                    ? "bg-white text-black shadow-sm"
                    : "text-black/50 hover:text-black"
                }`}
              >
                + New speaker
              </button>
              <button
                type="button"
                onClick={() => setSpeakerMode("none")}
                className={`px-2.5 py-1 text-[0.7rem] font-semibold rounded transition-colors ${
                  speakerMode === "none"
                    ? "bg-white text-black shadow-sm"
                    : "text-black/50 hover:text-black"
                }`}
              >
                None
              </button>
            </div>

            {speakerMode === "existing" && (
              <Select value={speakerId} onValueChange={setSpeakerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a speaker from the roster…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {existingSpeakers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.role ? ` — ${s.role}` : ""}
                      {s.company ? ` (${s.company})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {speakerMode === "new" && (
              <div className="space-y-2 p-3 bg-[#FFAC30]/5 border border-[#FFAC30]/20 rounded-md">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#FFAC30]">
                  <AlertCircle className="h-3.5 w-3.5" />
                  This speaker will be added to the event roster and visible on the agenda.
                </div>
                <Input
                  placeholder="Speaker name *"
                  value={newSpeakerName}
                  onChange={(e) => setNewSpeakerName(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Role (e.g. CEO)"
                    value={newSpeakerRole}
                    onChange={(e) => setNewSpeakerRole(e.target.value)}
                  />
                  <Input
                    placeholder="Company"
                    value={newSpeakerCompany}
                    onChange={(e) => setNewSpeakerCompany(e.target.value)}
                  />
                </div>
                <Input
                  placeholder="Talk / session topic (optional)"
                  value={newSpeakerTopic}
                  onChange={(e) => setNewSpeakerTopic(e.target.value)}
                />
                <Textarea
                  rows={2}
                  placeholder="Speaker bio (optional)"
                  value={newSpeakerBio}
                  onChange={(e) => setNewSpeakerBio(e.target.value)}
                />
                <Input
                  type="email"
                  placeholder="Contact email (optional — used to auto-link this speaker to a platform user so members can chat with them in-app)"
                  value={newSpeakerContactEmail}
                  onChange={(e) => setNewSpeakerContactEmail(e.target.value)}
                />
                {newSpeakerContactEmail.trim() && (
                  <p className="text-[0.65rem] text-black/50 leading-snug">
                    💬 If a user with this email exists on the platform, the speaker will be
                    auto-linked so community members can chat with them via the inbox.
                    Otherwise the speaker will fall back to the one-way email-relay flow.
                  </p>
                )}
              </div>
            )}

            {speakerMode === "none" && (
              <p className="text-xs text-black/50 italic">
                No speaker — useful for breaks, networking sessions, etc.
              </p>
            )}
          </div>

          {/* Presentation file */}
          <div className="border-t border-black/10 pt-4">
            <Label className="text-xs font-semibold text-black/70">
              Presentation file (optional)
            </Label>
            <label className="block border-2 border-dashed border-black/15 hover:border-black/30 rounded-lg p-4 text-center cursor-pointer transition-colors mt-1">
              <input
                type="file"
                accept={ACCEPTED_EXTS}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <div>
                  <div className="font-semibold text-sm text-black">{file.name}</div>
                  <div
                    className={`text-[0.65rem] mt-0.5 ${
                      file.size > 4 * 1024 * 1024
                        ? "text-[#FF005A] font-semibold"
                        : "text-black/50"
                    }`}
                  >
                    {(file.size / 1024).toFixed(1)} KB
                    {file.size > 4 * 1024 * 1024
                      ? " · ⚠ exceeds 4 MB limit — please pick a smaller file"
                      : " · click to change"}
                  </div>
                </div>
              ) : (
                <div>
                  <FileText className="h-6 w-6 mx-auto text-black/40 mb-1" />
                  <div className="text-sm font-medium text-black">
                    Drop a file or click to browse
                  </div>
                  <div className="text-[0.65rem] text-black/50 mt-0.5">
                    PDF, PPT, PPTX, Keynote, DOC, images · max 4 MB
                  </div>
                </div>
              )}
            </label>
            {file && (
              <div className="space-y-2 mt-2">
                <Input
                  placeholder="Display title (optional — defaults to filename)"
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                />
                <Input
                  placeholder="File description (optional)"
                  value={fileDescription}
                  onChange={(e) => setFileDescription(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={saving || !title.trim() || !startsAt}
            className="bg-[#FFAC30] hover:bg-[#FFAC30]/90 text-black"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1.5" /> Add to agenda
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Edit dialog (PATCH existing item) ----------------

function EditAgendaItemDialog({
  open,
  onOpenChange,
  item,
  event,
  onSaved,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: AgendaItem;
  event: Props["event"];
  onSaved: () => void;
  children: React.ReactNode;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || "");
  const [type, setType] = useState(item.type);
  const [startsAt, setStartsAt] = useState(toLocalDatetimeInput(item.startsAt));
  const [endsAt, setEndsAt] = useState(
    item.endsAt ? toLocalDatetimeInput(item.endsAt) : ""
  );
  const [speakerId, setSpeakerId] = useState(item.speaker?.id || "__none__");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || !startsAt) {
      toast.error("Title and start time are required");
      return;
    }
    setSaving(true);
    const t = toast.loading("Saving…");
    try {
      const res = await fetch(`/api/admin/agenda/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          type,
          startsAt: fromLocalDatetimeInput(startsAt),
          endsAt: endsAt ? fromLocalDatetimeInput(endsAt) : null,
          speakerId: speakerId === "__none__" ? null : speakerId,
        }),
      });
      if (!res.ok) {
        let errMsg = `Request failed (HTTP ${res.status})`;
        try {
          const err = await res.json();
          if (err?.error) errMsg = err.error;
        } catch {
          errMsg = `Request failed (HTTP ${res.status}). Please try again.`;
        }
        throw new Error(errMsg);
      }
      toast.success("Saved", { id: t });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Failed to save", { id: t });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto ais-scroll">
        <DialogHeader>
          <DialogTitle>Edit agenda item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-black/70">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FAST_PITCH">🚀 Fast Pitch</SelectItem>
                <SelectItem value="TALK">🎤 Talk</SelectItem>
                <SelectItem value="WELCOME">👋 Welcome</SelectItem>
                <SelectItem value="BREAK">☕ Break</SelectItem>
                <SelectItem value="NETWORKING">🤝 Networking</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold text-black/70">Title</Label>
            <Input
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs font-semibold text-black/70">Description</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-black/70">Start</Label>
              <Input
                type="datetime-local"
                className="mt-1"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-black/70">End</Label>
              <Input
                type="datetime-local"
                className="mt-1"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-black/70">Speaker</Label>
            <Select value={speakerId} onValueChange={setSpeakerId}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__none__">— No speaker —</SelectItem>
                {event.speakers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.role ? ` — ${s.role}` : ""}
                    {s.company ? ` (${s.company})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item._count.presentations > 0 && (
              <p className="text-[0.65rem] text-[#007E72] mt-1.5">
                💡 {item._count.presentations} presentation file
                {item._count.presentations === 1 ? "" : "s"} attached — manage them in the
                Presentations tab.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={saving || !title.trim() || !startsAt}
            className="bg-black hover:bg-black/90"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Edit3 className="h-4 w-4 mr-1.5" /> Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
