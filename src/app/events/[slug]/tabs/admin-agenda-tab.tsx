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
  Users,
  Search,
  X,
  UserPlus,
  ImageIcon,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  topic: string | null;
  photoUrl?: string | null;
};

type Panelist = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  topic: string | null;
  photoUrl: string | null;
};

type SlimImage = {
  id: string;
  fileUrl: string;
  fileName: string;
  caption: string | null;
  slideOrder?: number;
};

type AgendaItem = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  description: string | null;
  type: string;
  speaker: Speaker | null;
  panelists?: Panelist[];
  // Per-item main image — used as a fallback when the session's
  // speaker (or panelists) have no linked images. Null = no main image set.
  mainImage?: SlimImage | null;
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
  BREAK: "bg-black/5 text-black/80 border-black/10",
  NETWORKING: "bg-[#820A7D]/10 text-[#820A7D] border-[#820A7D]/30",
  FAST_PITCH: "bg-[#FFAC30]/10 text-[#FFAC30] border-[#FFAC30]/30",
  PANEL: "bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]/30",
};

const typeLabel: Record<string, string> = {
  TALK: "Talk",
  FAST_PITCH: "Fast Pitch",
  WELCOME: "Welcome",
  BREAK: "Break",
  NETWORKING: "Networking",
  PANEL: "Panel",
};

export function AdminAgendaTab({ event, onAgendaChanged }: Props) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  // Event-wide image roster — fetched once on mount and shared with every
  // EditAgendaItemDialog so the admin can pick a per-item main image.
  // We intentionally don't gate this on canManageEvent because the
  // AdminAgendaTab is only rendered for managers (see event-tabs.tsx).
  const [eventImages, setEventImages] = useState<SlimImage[]>([]);

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

  // Load the event's images once — used by EditAgendaItemDialog's main
  // image picker. We pull the full list (not paginated) because the
  // gallery is typically a few hundred photos at most, and we want to
  // give the admin the full set to choose from.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(event.slug)}/images`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const imgs: SlimImage[] = (data.images ?? []).map((i: Record<string, unknown>) => ({
          id: String(i.id),
          fileUrl: String(i.fileUrl),
          fileName: String(i.fileName ?? ""),
          caption: (i.caption as string | null) ?? null,
          slideOrder: typeof i.slideOrder === "number" ? (i.slideOrder as number) : undefined,
        }));
        setEventImages(imgs);
      } catch {
        // silent — main image picker will just show "no images available"
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event.slug]);

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
          <p className="text-sm text-black/80 mb-4">
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
              eventImages={eventImages}
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
  eventImages,
  onDelete,
  onSaved,
}: {
  item: AgendaItem;
  event: Props["event"];
  eventImages: SlimImage[];
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
            <span
              className={`text-[0.65rem] font-semibold inline-flex items-center gap-1 ${
                item.type === "PANEL" ? "text-[#7C3AED]" : "text-black/70"
              }`}
            >
              <Mic className="h-3 w-3" />
              {item.type === "PANEL" ? (
                <>
                  <span className="font-bold">Moderator:</span>
                  {item.speaker.name}
                  {item.speaker.role && (
                    <span className="text-[#7C3AED]/60 font-normal">· {item.speaker.role}</span>
                  )}
                </>
              ) : (
                <>
                  {item.speaker.name}
                  {item.speaker.role && <span className="text-black/80">· {item.speaker.role}</span>}
                </>
              )}
            </span>
          )}
          {item.type === "PANEL" &&
            item.panelists &&
            item.panelists.length > 0 && (
              <span className="text-[0.65rem] font-semibold text-[#7C3AED] inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {item.panelists.length} panelist{item.panelists.length === 1 ? "" : "s"}:
                <span className="text-[#7C3AED]/80 font-normal">
                  {item.panelists.map((p) => p.name).join(" · ")}
                </span>
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
          eventImages={eventImages}
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

  // Panelist picker state (only used when type === "PANEL")
  const [panelistIds, setPanelistIds] = useState<string[]>([]);
  const [newPanelists, setNewPanelists] = useState<
    Array<{
      name: string;
      role: string;
      company: string;
      topic: string;
      bio: string;
      contactEmail: string;
    }>
  >([]);

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
    setPanelistIds([]);
    setNewPanelists([]);
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
    // PANEL validation: at least 1 panelist (existing pick OR new panelist with a name)
    if (type === "PANEL") {
      const validNewPanelists = newPanelists.filter((p) => p.name.trim().length > 0);
      if (panelistIds.length === 0 && validNewPanelists.length === 0) {
        toast.error("Panel items require at least 1 panelist — pick from the roster or add a new one below.");
        return;
      }
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

    // Panel form fields (only when type === PANEL)
    if (type === "PANEL") {
      const validNewPanelists = newPanelists
        .filter((p) => p.name.trim().length > 0)
        .map((p) => ({
          name: p.name.trim(),
          role: p.role.trim() || undefined,
          company: p.company.trim() || undefined,
          topic: p.topic.trim() || undefined,
          bio: p.bio.trim() || undefined,
          contactEmail: p.contactEmail.trim() || undefined,
        }));
      formData.append("panelistIds", JSON.stringify(panelistIds));
      formData.append("newPanelists", JSON.stringify(validNewPanelists));
    }

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
      {/* max-w-5xl matches the EditAgendaItemDialog so the create + edit
          flows feel symmetric. Wide enough for the Type/Title grid + the
          panelist picker (which stacks two-column inputs inside) without
          horizontal scrolling on standard laptop widths. */}
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto ais-scroll">
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
                <SelectItem value="PANEL">👥 Panel</SelectItem>
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
                  : type === "PANEL"
                  ? "e.g. Panel: The future of generative AI in production"
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
          <p className="text-[0.65rem] text-black/80 -mt-2">
            Times are in Tel Aviv (Asia/Jerusalem) timezone.
          </p>

          {/* Speaker */}
          <div className="border-t border-black/10 pt-4">
            <Label className="text-xs font-semibold text-black/70">
              {type === "PANEL" ? "Panel Moderator (optional)" : "Speaker"}
            </Label>
            {type === "PANEL" && (
              <div className="mt-1 mb-2 p-2 rounded-md bg-[#7C3AED]/5 border border-[#7C3AED]/20 text-[0.7rem] text-[#7C3AED] flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  The moderator is the single lead speaker who facilitates the panel. They are
                  NOT auto-added to the panelist list below — pick them here, then add the other
                  panelists in the section further down.
                </span>
              </div>
            )}
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

          {/* Panelists (PANEL only) */}
          {type === "PANEL" && (
            <PanelistsPicker
              eventId={event.id}
              existingSpeakers={existingSpeakers}
              panelistIds={panelistIds}
              setPanelistIds={setPanelistIds}
              newPanelists={newPanelists}
              setNewPanelists={setNewPanelists}
            />
          )}

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
                  <FileText className="h-6 w-6 mx-auto text-black/80 mb-1" />
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
            disabled={
              saving ||
              !title.trim() ||
              !startsAt ||
              (type === "PANEL" &&
                panelistIds.length === 0 &&
                newPanelists.filter((p) => p.name.trim().length > 0).length === 0)
            }
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
  eventImages,
  onSaved,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: AgendaItem;
  event: Props["event"];
  // Event-wide image roster — used by the per-item main image picker.
  // Fetched once in AdminAgendaTab and threaded down through AgendaItemRow.
  eventImages: SlimImage[];
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
  // Per-item main image — null means "no main image". Initialized from
  // item.mainImage (loaded by the GET /api/admin/agenda include). The
  // value is the EventImage id, or "__none__" for the "no main image"
  // sentinel (mirrors the speakerId pattern above).
  const [mainImageId, setMainImageId] = useState<string>(
    item.mainImage?.id || "__none__"
  );
  const [saving, setSaving] = useState(false);

  // Panelist picker state (PANEL only) — initialized from item.panelists
  const [panelistIds, setPanelistIds] = useState<string[]>(
    (item.panelists ?? []).map((p) => p.id)
  );
  const [newPanelists, setNewPanelists] = useState<
    Array<{
      name: string;
      role: string;
      company: string;
      topic: string;
      bio: string;
      contactEmail: string;
    }>
  >([]);

  async function submit() {
    if (!title.trim() || !startsAt) {
      toast.error("Title and start time are required");
      return;
    }
    if (type === "PANEL") {
      const validNewPanelists = newPanelists.filter((p) => p.name.trim().length > 0);
      if (panelistIds.length === 0 && validNewPanelists.length === 0) {
        toast.error("Panel items require at least 1 panelist — pick from the roster or add a new one below.");
        return;
      }
    }
    setSaving(true);
    const t = toast.loading("Saving…");
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        type,
        startsAt: fromLocalDatetimeInput(startsAt),
        endsAt: endsAt ? fromLocalDatetimeInput(endsAt) : null,
        speakerId: speakerId === "__none__" ? null : speakerId,
        // Always send mainImageId so we can both set and clear it. The
        // server treats null as "remove the per-item main image pointer"
        // and validates any non-null id belongs to this event.
        mainImageId: mainImageId === "__none__" ? null : mainImageId,
      };
      // Always send panelistIds when type is PANEL (so we can sync the m:n),
      // OR when the user switched FROM Panel to something else (so we can
      // clear the panelists). We send an empty array in the latter case.
      if (type === "PANEL" || (type !== "PANEL" && (item.panelists?.length ?? 0) > 0)) {
        body.panelistIds = type === "PANEL" ? panelistIds : [];
        if (type === "PANEL") {
          body.newPanelists = newPanelists
            .filter((p) => p.name.trim().length > 0)
            .map((p) => ({
              name: p.name.trim(),
              role: p.role.trim() || undefined,
              company: p.company.trim() || undefined,
              topic: p.topic.trim() || undefined,
              bio: p.bio.trim() || undefined,
              contactEmail: p.contactEmail.trim() || undefined,
            }));
        } else {
          body.newPanelists = [];
        }
      }
      const res = await fetch(`/api/admin/agenda/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  // Resolve the currently-selected main image object (for the preview
  // thumbnail next to the picker). null when "— No main image —" is picked
  // or when the id no longer matches an image in the event roster (e.g.
  // image was deleted after the agenda item was last saved).
  const selectedMainImage =
    mainImageId === "__none__"
      ? null
      : eventImages.find((i) => i.id === mainImageId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {/* max-w-5xl (was max-w-4xl, originally max-w-2xl). Widened again
          because the main-image picker row + the Start/End datetime row
          were still triggering horizontal scrolling on 1280px-ish laptop
          widths once the PanelistsPicker + new-panelist two-column inner
          grids were added. max-w-5xl = 64rem = 1024px gives every grid
          column enough room to breathe without forcing the user to scroll
          sideways to reach the Save button. */}
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto ais-scroll">
        <DialogHeader>
          <DialogTitle>Edit agenda item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Row: Type | Title (2-col on md+) */}
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
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
                  <SelectItem value="PANEL">👥 Panel</SelectItem>
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
            <Label className="text-xs font-semibold text-black/70">
              {type === "PANEL" ? "Panel Moderator (optional)" : "Speaker"}
            </Label>
            {type === "PANEL" && (
              <div className="mt-1 mb-2 p-2 rounded-md bg-[#7C3AED]/5 border border-[#7C3AED]/20 text-[0.7rem] text-[#7C3AED] flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  The moderator is the single lead speaker who facilitates the panel. They are
                  NOT auto-added to the panelist list below — pick them here, then add the other
                  panelists in the section further down.
                </span>
              </div>
            )}
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

          {/* ──────────────────────────────────────────────────────────
              Per-item main image picker.
              The selected image is shown as a fallback on the public
              agenda tab when the session's speaker (or panelists) have
              no linked photos. Lets the admin pick ANY image from the
              event gallery (no per-speaker restriction) so it works for
              break / fast-pitch entries that don't have a speaker too.
              ────────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3">
            <Label className="text-xs font-semibold text-black/70 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-[#FF005A]" />
              Main image (fallback)
              <span className="font-normal text-black/50">
                — shown when this session has no speaker photos
              </span>
            </Label>
            {eventImages.length === 0 ? (
              <p className="text-[0.7rem] text-black/50 mt-2">
                No images uploaded for this event yet. Upload some on the Photos tab first.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
                <div>
                  <Select value={mainImageId} onValueChange={setMainImageId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="__none__">— No main image —</SelectItem>
                      {eventImages.map((img) => (
                        <SelectItem key={img.id} value={img.id}>
                          {img.caption || img.fileName || "(untitled image)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[0.65rem] text-black/50 mt-1.5">
                    Tip: upload photos on the Photos tab, then tag them to speakers — those
                    speaker-tagged photos are shown automatically and take priority over this
                    fallback. This picker is for sessions without speaker photos.
                  </p>
                </div>
                {/* Live preview of the selected image. Stays blank when
                    "— No main image —" is selected or when the id is stale. */}
                <div className="w-full md:w-40 aspect-video rounded-md overflow-hidden border border-black/10 bg-black/5 flex items-center justify-center">
                  {selectedMainImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedMainImage.fileUrl}
                      alt={selectedMainImage.caption || selectedMainImage.fileName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-black/40">
                      <ImageIcon className="h-6 w-6" />
                      <span className="text-[0.6rem]">No image</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Panelists (PANEL only) */}
          {type === "PANEL" && (
            <PanelistsPicker
              eventId={event.id}
              existingSpeakers={event.speakers}
              panelistIds={panelistIds}
              setPanelistIds={setPanelistIds}
              newPanelists={newPanelists}
              setNewPanelists={setNewPanelists}
            />
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={
              saving ||
              !title.trim() ||
              !startsAt ||
              (type === "PANEL" &&
                panelistIds.length === 0 &&
                newPanelists.filter((p) => p.name.trim().length > 0).length === 0)
            }
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

// ---------------- Panelists Picker (PANEL agenda items) ----------------

type GlobalSpeaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  topic: string | null;
  photoUrl: string | null;
  event: { id: string; title: string };
};

function PanelistsPicker({
  eventId,
  existingSpeakers,
  panelistIds,
  setPanelistIds,
  newPanelists,
  setNewPanelists,
}: {
  eventId: string;
  existingSpeakers: Speaker[];
  panelistIds: string[];
  setPanelistIds: (v: string[]) => void;
  newPanelists: Array<{
    name: string;
    role: string;
    company: string;
    topic: string;
    bio: string;
    contactEmail: string;
  }>;
  setNewPanelists: (v: Array<{
    name: string;
    role: string;
    company: string;
    topic: string;
    bio: string;
    contactEmail: string;
  }>) => void;
}) {
  const [globalSpeakers, setGlobalSpeakers] = useState<GlobalSpeaker[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [search, setSearch] = useState("");

  // Lazy-load the global speaker roster the first time the user picks PANEL.
  // Cross-event speakers are filtered to exclude this event's own speakers
  // (they're already shown via existingSpeakers).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingRoster(true);
      try {
        const res = await fetch("/api/admin/speakers");
        if (!res.ok) return;
        const data = await res.json();
        const speakers: GlobalSpeaker[] = (data.speakers ?? [])
          .filter((s: GlobalSpeaker & { event?: { id: string } }) => s.event?.id !== eventId)
          .map((s: GlobalSpeaker) => ({
            id: s.id,
            name: s.name,
            role: s.role,
            company: s.company,
            topic: s.topic,
            photoUrl: s.photoUrl,
            event: { id: s.event.id, title: s.event.title },
          }));
        if (!cancelled) setGlobalSpeakers(speakers);
      } catch (e) {
        console.error("[PanelistsPicker] failed to load global speakers", e);
      } finally {
        if (!cancelled) setLoadingRoster(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function toggle(id: string) {
    if (panelistIds.includes(id)) {
      setPanelistIds(panelistIds.filter((x) => x !== id));
    } else {
      setPanelistIds([...panelistIds, id]);
    }
  }

  function addNewPanelist() {
    setNewPanelists([
      ...newPanelists,
      { name: "", role: "", company: "", topic: "", bio: "", contactEmail: "" },
    ]);
  }

  function removeNewPanelist(idx: number) {
    setNewPanelists(newPanelists.filter((_, i) => i !== idx));
  }

  function updateNewPanelist(idx: number, field: "name" | "role" | "company" | "topic" | "bio" | "contactEmail", value: string) {
    setNewPanelists(
      newPanelists.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  }

  // Filter cross-event roster by live search
  const searchLower = search.trim().toLowerCase();
  const filteredCrossEvent = searchLower
    ? globalSpeakers.filter((s) => {
        const haystack = [
          s.name,
          s.role || "",
          s.company || "",
          s.event.title,
        ].join(" ").toLowerCase();
        return haystack.includes(searchLower);
      })
    : globalSpeakers;

  const pickedCount =
    panelistIds.length + newPanelists.filter((p) => p.name.trim().length > 0).length;

  return (
    <div className="border-t border-black/10 pt-4">
      <div className="rounded-lg border border-[#7C3AED]/30 bg-[#7C3AED]/5 p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#7C3AED]" />
            <Label className="text-xs font-bold text-[#7C3AED]">
              Panelists <span className="text-[#FF005A]">*</span>
            </Label>
          </div>
          <span className="text-[0.65rem] font-semibold text-[#7C3AED]/80 bg-[#7C3AED]/10 px-2 py-0.5 rounded-full">
            {pickedCount} picked
          </span>
        </div>
        <p className="text-[0.7rem] text-black/80 leading-snug">
          Pick panelists from this event&apos;s roster or from other events (cross-event picks are
          auto-cloned into this event on save). You can also add brand-new panelists below. The
          moderator picked above is NOT auto-added here — if they&apos;re also a panelist, pick
          them again in this list.
        </p>

        {/* Search box (only meaningful for cross-event roster) */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black/80" />
          <Input
            placeholder="Search speakers from other events by name, role, company, or event…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 text-xs h-8"
          />
        </div>

        {/* Scrollable checkbox list */}
        <div className="max-h-64 overflow-y-auto ais-scroll border border-black/10 rounded-md bg-white divide-y divide-black/5">
          {/* This event's speakers */}
          {existingSpeakers.length > 0 && (
            <div className="p-2">
              <div className="text-[0.6rem] font-bold uppercase tracking-wider text-black/80 px-1 pb-1 sticky top-0 bg-white">
                This event&apos;s speakers ({existingSpeakers.length})
              </div>
              <div className="space-y-0.5">
                {existingSpeakers.map((s) => (
                  <PanelistRow
                    key={s.id}
                    speaker={{
                      id: s.id,
                      name: s.name,
                      role: s.role,
                      company: s.company,
                      topic: s.topic,
                      photoUrl: s.photoUrl ?? null,
                    }}
                    checked={panelistIds.includes(s.id)}
                    onToggle={() => toggle(s.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Cross-event speakers */}
          <div className="p-2">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-black/80 px-1 pb-1 sticky top-0 bg-white">
              Speakers from other events ({loadingRoster ? "loading…" : filteredCrossEvent.length})
            </div>
            {loadingRoster ? (
              <div className="flex items-center gap-2 text-xs text-black/50 p-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading global speaker roster…
              </div>
            ) : filteredCrossEvent.length === 0 ? (
              <div className="text-xs text-black/50 italic p-2">
                {searchLower
                  ? "No cross-event speakers match your search."
                  : "No other-event speakers yet. Once you add speakers to other events, they will appear here."}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredCrossEvent.map((s) => (
                  <PanelistRow
                    key={s.id}
                    speaker={{
                      id: s.id,
                      name: s.name,
                      role: s.role,
                      company: s.company,
                      topic: s.topic,
                      photoUrl: s.photoUrl,
                    }}
                    eventTitle={s.event.title}
                    checked={panelistIds.includes(s.id)}
                    onToggle={() => toggle(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* New panelists (inline forms) */}
        {newPanelists.length > 0 && (
          <div className="space-y-2">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#7C3AED]">
              New panelists ({newPanelists.length})
            </div>
            {newPanelists.map((p, idx) => (
              <div
                key={idx}
                className="relative p-2.5 rounded-md border border-[#7C3AED]/20 bg-white space-y-2"
              >
                <button
                  type="button"
                  onClick={() => removeNewPanelist(idx)}
                  className="absolute top-1.5 right-1.5 p-0.5 rounded text-black/80 hover:text-[#FF005A] hover:bg-[#FF005A]/10"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <Input
                  placeholder="Panelist name *"
                  value={p.name}
                  onChange={(e) => updateNewPanelist(idx, "name", e.target.value)}
                  className="text-xs h-8"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Role (e.g. CTO)"
                    value={p.role}
                    onChange={(e) => updateNewPanelist(idx, "role", e.target.value)}
                    className="text-xs h-8"
                  />
                  <Input
                    placeholder="Company"
                    value={p.company}
                    onChange={(e) => updateNewPanelist(idx, "company", e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
                <Input
                  placeholder="Topic / focus area (optional)"
                  value={p.topic}
                  onChange={(e) => updateNewPanelist(idx, "topic", e.target.value)}
                  className="text-xs h-8"
                />
                <Textarea
                  placeholder="Short bio (optional)"
                  value={p.bio}
                  onChange={(e) => updateNewPanelist(idx, "bio", e.target.value)}
                  rows={2}
                  className="text-xs"
                />
                <Input
                  type="email"
                  placeholder="Contact email (optional — auto-links to platform user for in-app chat)"
                  value={p.contactEmail}
                  onChange={(e) => updateNewPanelist(idx, "contactEmail", e.target.value)}
                  className="text-xs h-8"
                />
              </div>
            ))}
          </div>
        )}

        {/* Add new panelist button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addNewPanelist}
          className="w-full border-dashed border-[#7C3AED]/40 text-[#7C3AED] hover:bg-[#7C3AED]/5 hover:text-[#7C3AED]"
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add new panelist
        </Button>
      </div>
    </div>
  );
}

function PanelistRow({
  speaker,
  eventTitle,
  checked,
  onToggle,
}: {
  speaker: {
    id: string;
    name: string;
    role: string | null;
    company: string | null;
    topic: string | null;
    photoUrl: string | null;
  };
  eventTitle?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const initials = speaker.name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <label
      className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-colors ${
        checked ? "bg-[#7C3AED]/10" : "hover:bg-black/5"
      }`}
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} className="border-[#7C3AED]/40 data-[state=checked]:bg-[#7C3AED] data-[state=checked]:border-[#7C3AED]" />
      <Avatar className="h-6 w-6 flex-shrink-0">
        <AvatarImage src={speaker.photoUrl || undefined} alt={speaker.name} />
        <AvatarFallback className="text-[0.6rem] bg-[#7C3AED]/10 text-[#7C3AED]">
          {initials || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-black truncate">
          {speaker.name}
          {speaker.role && (
            <span className="text-black/50 font-normal"> · {speaker.role}</span>
          )}
        </div>
        <div className="text-[0.6rem] text-black/80 truncate">
          {speaker.company && <span>{speaker.company}</span>}
          {speaker.company && eventTitle && <span> · </span>}
          {eventTitle && <span className="italic">from &quot;{eventTitle}&quot;</span>}
        </div>
      </div>
    </label>
  );
}
