"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Upload,
  Trash2,
  Download,
  FileText,
  Presentation as PresentationIcon,
  Image as ImageIcon,
  Loader2,
  FileBox,
  Mic,
  Clock,
  User,
  Link2,
} from "lucide-react";

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
};

type AgendaItem = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  type: string;
  speaker: Speaker | null;
};

type PresentationFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  title: string | null;
  description: string | null;
  createdAt: string;
  uploader: { id: string; name: string | null; email: string };
  speakers: { id: string; name: string; role: string | null; company: string | null }[];
  agendaItem: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    type: string;
  } | null;
};

type Props = {
  event: {
    id: string;
    slug: string;
    title: string;
    speakers: Speaker[];
    agenda: AgendaItem[];
  };
  me: { id: string; email: string; name: string | null; role: string };
  isAdmin: boolean;
};

type ViewMode = "session" | "presenter" | "all";

const ACCEPTED_EXTS = ".pdf,.ppt,.pptx,.key,.odp,.doc,.docx,.odt,.txt,.md,.csv,.rtf,.jpg,.jpeg,.png,.webp,.gif,.heic,.avif";

// ---------------- File-type helpers ----------------

function fileKind(mimeType: string, fileName: string): "pdf" | "slides" | "doc" | "image" | "other" {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mimeType.includes("powerpoint") ||
    mimeType.includes("presentation") ||
    mimeType.includes("keynote") ||
    ["ppt", "pptx", "key", "odp"].includes(ext)
  )
    return "slides";
  if (
    mimeType.includes("msword") ||
    mimeType.includes("wordprocessing") ||
    mimeType.includes("opendocument.text") ||
    ["doc", "docx", "odt", "rtf", "txt", "md", "csv"].includes(ext)
  )
    return "doc";
  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "avif"].includes(ext))
    return "image";
  return "other";
}

function FileKindIcon({ kind, className }: { kind: ReturnType<typeof fileKind>; className?: string }) {
  if (kind === "pdf") return <FileText className={className} />;
  if (kind === "slides") return <PresentationIcon className={className} />;
  if (kind === "image") return <ImageIcon className={className} />;
  if (kind === "doc") return <FileText className={className} />;
  return <FileBox className={className} />;
}

function iconColors(kind: ReturnType<typeof fileKind>): string {
  switch (kind) {
    case "pdf":
      return "bg-[#FF005A]/10 text-[#FF005A] border-[#FF005A]/20";
    case "slides":
      return "bg-[#FFAC30]/10 text-[#FFAC30] border-[#FFAC30]/20";
    case "image":
      return "bg-[#00E6FF]/10 text-[#007E72] border-[#00E6FF]/30";
    case "doc":
      return "bg-[#004F98]/10 text-[#004F98] border-[#004F98]/20";
    default:
      return "bg-black/5 text-black/80 border-black/10";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

// ---------------- Component ----------------

export function PresentationsTab({ event, me, isAdmin }: Props) {
  const [files, setFiles] = useState<PresentationFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("session");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${event.slug}/presentations`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFiles(data.presentations);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load presentations");
    } finally {
      setLoading(false);
    }
  }, [event.slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(params: {
    files: FileList;
    title?: string;
    description?: string;
    speakerIds: string[];
    agendaItemId?: string;
  }) {
    const fileList = Array.from(params.files);
    const total = fileList.length;

    // Upload ONE FILE PER REQUEST to avoid hitting Vercel's 4.5 MB
    // serverless function body limit. Presentation files (PDF decks,
    // PPTX with embedded video, etc.) routinely exceed 4 MB each, so
    // batching multiple in one request will trip the limit.
    const t = toast.loading(`Uploading 1/${total} …`);
    let success = 0;
    const failures: { name: string; reason: string }[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      toast.loading(`Uploading ${i + 1}/${total} — ${file.name}`, { id: t });
      const fd = new FormData();
      fd.append("files", file);
      if (params.title) fd.append("title", params.title);
      if (params.description) fd.append("description", params.description);
      if (params.speakerIds.length > 0) {
        fd.append("speakerIds", JSON.stringify(params.speakerIds));
      }
      if (params.agendaItemId) fd.append("agendaItemId", params.agendaItemId);
      try {
        const res = await fetch(`/api/events/${event.slug}/presentations`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          let reason = `HTTP ${res.status}`;
          try {
            const err = await res.json();
            if (err?.error) reason = err.error;
          } catch {
            // platform-level 413 / HTML error page — keep the generic reason
          }
          failures.push({ name: file.name, reason });
        } else {
          success++;
        }
      } catch (e) {
        failures.push({
          name: file.name,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (failures.length === 0) {
      toast.success(`Uploaded ${success} file${success === 1 ? "" : "s"}`, { id: t });
    } else if (success === 0) {
      toast.error(
        `All ${total} file${total === 1 ? "" : "s"} failed: ${failures[0].reason}`,
        { id: t }
      );
    } else {
      toast.warning(
        `${success}/${total} uploaded. ${failures.length} failed — first failure: ${failures[0].name} (${failures[0].reason})`,
        { id: t, duration: 8000 }
      );
    }
    setUploadOpen(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    const t = toast.loading("Deleting…");
    try {
      const res = await fetch(`/api/presentations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("File deleted", { id: t });
      await load();
    } catch (e) {
      toast.error("Delete failed", { id: t });
    }
  }

  // Group files for the "by session" view
  const filesBySession = (() => {
    const groups = new Map<string, PresentationFile[]>();
    for (const f of files) {
      const key = f.agendaItem?.id || "__none__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    return groups;
  })();

  // Group files for the "by presenter" view
  const filesByPresenter = (() => {
    const groups = new Map<string, PresentationFile[]>();
    for (const f of files) {
      if (f.speakers.length === 0) {
        const key = "__none__";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(f);
        continue;
      }
      for (const sp of f.speakers) {
        if (!groups.has(sp.id)) groups.set(sp.id, []);
        groups.get(sp.id)!.push(f);
      }
    }
    return groups;
  })();

  // For "by session" view: order sessions by agenda order
  const sessionOrder = event.agenda.map((a) => a.id);
  const sortedSessionIds = Array.from(filesBySession.keys()).sort((a, b) => {
    if (a === "__none__") return 1;
    if (b === "__none__") return -1;
    return sessionOrder.indexOf(a) - sessionOrder.indexOf(b);
  });

  // For "by presenter" view: order by speaker.order
  const speakerOrder = event.speakers.map((s) => s.id);
  const sortedSpeakerIds = Array.from(filesByPresenter.keys()).sort((a, b) => {
    if (a === "__none__") return 1;
    if (b === "__none__") return -1;
    return speakerOrder.indexOf(a) - speakerOrder.indexOf(b);
  });

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <UploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            event={event}
            onUpload={handleUpload}
          >
            <Button size="sm" className="bg-black hover:bg-black/90">
              <Upload className="h-4 w-4 mr-1.5" /> Upload presentation
            </Button>
          </UploadDialog>

          {/* View mode switch */}
          <div className="inline-flex items-center bg-black/5 rounded-md p-0.5">
            <button
              onClick={() => setView("session")}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                view === "session"
                  ? "bg-white text-black shadow-sm"
                  : "text-black/50 hover:text-black"
              }`}
            >
              By Session
            </button>
            <button
              onClick={() => setView("presenter")}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                view === "presenter"
                  ? "bg-white text-black shadow-sm"
                  : "text-black/50 hover:text-black"
              }`}
            >
              By Presenter
            </button>
            <button
              onClick={() => setView("all")}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                view === "all"
                  ? "bg-white text-black shadow-sm"
                  : "text-black/50 hover:text-black"
              }`}
            >
              All
            </button>
          </div>
        </div>

        <div className="text-xs text-black/80">
          {files.length} file{files.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Help banner */}
      {files.length === 0 && !loading && (
        <Card className="p-8 border-2 border-dashed border-black/15 bg-white text-center">
          <FileBox className="h-10 w-10 mx-auto text-black/30 mb-3" />
          <h3 className="font-bold text-black mb-1">No presentations uploaded yet</h3>
          <p className="text-sm text-black/80 mb-4">
            Upload slide decks, PDFs, and handouts from <strong>{event.title}</strong>.
            Files can be tagged to specific sessions and presenters.
          </p>
          <UploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            event={event}
            onUpload={handleUpload}
          >
            <Button className="bg-black hover:bg-black/90">
              <Upload className="h-4 w-4 mr-1.5" /> Upload presentation
            </Button>
          </UploadDialog>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-black/5 animate-pulse rounded-md" />
          ))}
        </div>
      )}

      {/* ============== View: By Session ============== */}
      {!loading && view === "session" && files.length > 0 && (
        <div className="space-y-6">
          {sortedSessionIds.map((sid) => {
            const group = filesBySession.get(sid)!;
            if (sid === "__none__") {
              return (
                <section key={sid}>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-black/80 mb-2 flex items-center gap-2">
                    <FileBox className="h-3.5 w-3.5" /> General event files
                  </h3>
                  <div className="space-y-2">
                    {group.map((f) => (
                      <FileRow
                        key={f.id}
                        file={f}
                        me={me}
                        isAdmin={isAdmin}
                        onDelete={() => handleDelete(f.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            }
            const agItem = event.agenda.find((a) => a.id === sid);
            if (!agItem) return null;
            const speaker = agItem.speaker;
            return (
              <section key={sid}>
                <div className="flex flex-wrap items-baseline gap-2 mb-2 pb-1.5 border-b border-black/10">
                  <Clock className="h-3.5 w-3.5 text-black/80" />
                  <span className="font-mono text-xs text-black/80">
                    {formatTime(agItem.startsAt)}
                    {agItem.endsAt && ` – ${formatTime(agItem.endsAt)}`}
                  </span>
                  <h3 className="text-sm font-bold text-black flex-1 min-w-0">
                    {agItem.title}
                  </h3>
                  {speaker && (
                    <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wide bg-[#00E6FF]/20 text-[#007E72] px-2 py-0.5 rounded">
                      <Mic className="h-3 w-3" /> {speaker.name}
                    </span>
                  )}
                  <Badge variant="secondary" className="bg-black/5 text-black/80">
                    {group.length} file{group.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {group.map((f) => (
                    <FileRow
                      key={f.id}
                      file={f}
                      me={me}
                      isAdmin={isAdmin}
                      onDelete={() => handleDelete(f.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ============== View: By Presenter ============== */}
      {!loading && view === "presenter" && files.length > 0 && (
        <div className="space-y-6">
          {sortedSpeakerIds.map((sid) => {
            const group = filesByPresenter.get(sid)!;
            if (sid === "__none__") {
              return (
                <section key={sid}>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-black/80 mb-2 flex items-center gap-2">
                    <FileBox className="h-3.5 w-3.5" /> Files not linked to a presenter
                  </h3>
                  <div className="space-y-2">
                    {group.map((f) => (
                      <FileRow
                        key={f.id}
                        file={f}
                        me={me}
                        isAdmin={isAdmin}
                        onDelete={() => handleDelete(f.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            }
            const speaker = event.speakers.find((s) => s.id === sid);
            if (!speaker) return null;
            return (
              <section key={sid}>
                <div className="flex flex-wrap items-baseline gap-2 mb-2 pb-1.5 border-b border-black/10">
                  <User className="h-3.5 w-3.5 text-black/80" />
                  <h3 className="text-sm font-bold text-black">{speaker.name}</h3>
                  {speaker.role && (
                    <span className="text-xs text-black/80">
                      {speaker.role}
                      {speaker.company ? `, ${speaker.company}` : ""}
                    </span>
                  )}
                  {speaker.company && !speaker.role && (
                    <span className="text-xs text-black/80">{speaker.company}</span>
                  )}
                  <Badge variant="secondary" className="bg-black/5 text-black/80 ml-auto">
                    {group.length} file{group.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {group.map((f) => (
                    <FileRow
                      key={f.id}
                      file={f}
                      me={me}
                      isAdmin={isAdmin}
                      onDelete={() => handleDelete(f.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ============== View: All ============== */}
      {!loading && view === "all" && files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              me={me}
              isAdmin={isAdmin}
              onDelete={() => handleDelete(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- File row ----------------

function FileRow({
  file,
  me,
  isAdmin,
  onDelete,
}: {
  file: PresentationFile;
  me: { id: string; email: string; name: string | null; role: string };
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const kind = fileKind(file.mimeType, file.fileName);
  const canManage = isAdmin || file.uploader.id === me.id;
  const displayName = file.title || file.fileName;
  const uploaderName = file.uploader.name || file.uploader.email;

  return (
    <Card className="p-3 bg-white border border-black/10 hover:border-black/20 transition-colors">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`flex-shrink-0 h-12 w-12 rounded-md border flex items-center justify-center ${iconColors(
            kind
          )}`}
        >
          <FileKindIcon kind={kind} className="h-6 w-6" />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <a
              href={file.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sm text-black hover:text-[#004F98] hover:underline truncate"
              title={displayName}
            >
              {displayName}
            </a>
            {file.title && (
              <span className="text-[0.65rem] text-black/80 truncate font-mono">
                ({file.fileName})
              </span>
            )}
          </div>

          {file.description && (
            <p className="text-xs text-black/80 mt-0.5 line-clamp-2">{file.description}</p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[0.65rem] text-black/80 inline-flex items-center gap-1">
              <FileBox className="h-3 w-3" />
              {formatBytes(file.fileSize)}
            </span>
            <span className="text-[0.65rem] text-black/80">·</span>
            <span className="text-[0.65rem] text-black/80">
              Uploaded {formatDate(file.createdAt)} by {uploaderName}
            </span>
            {file.speakers.map((s) => (
              <span
                key={s.id}
                className="text-[0.6rem] font-bold uppercase tracking-wide bg-[#00E6FF]/20 text-[#007E72] px-1.5 py-0.5 rounded inline-flex items-center gap-1"
              >
                <Mic className="h-2.5 w-2.5" /> {s.name}
              </span>
            ))}
            {file.agendaItem && (
              <span className="text-[0.6rem] font-semibold uppercase tracking-wide bg-[#FF005A]/10 text-[#FF005A] px-1.5 py-0.5 rounded">
                {formatTime(file.agendaItem.startsAt)} · {file.agendaItem.title}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <a
            href={file.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-black/5 hover:bg-black/10 p-1.5 text-black"
            title="Open / download"
            download
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          {canManage && (
            <button
              onClick={onDelete}
              className="rounded-md bg-black/5 hover:bg-[#FF005A]/10 p-1.5 text-[#FF005A]"
              title="Delete file"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------- Upload dialog ----------------

function UploadDialog({
  open,
  onOpenChange,
  event,
  onUpload,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: {
    speakers: Speaker[];
    agenda: AgendaItem[];
  };
  onUpload: (params: {
    files: FileList;
    title?: string;
    description?: string;
    speakerIds: string[];
    agendaItemId?: string;
  }) => void;
  children: React.ReactNode;
}) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSpeakers, setSelectedSpeakers] = useState<Set<string>>(new Set());
  const [agendaItemId, setAgendaItemId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setFiles(null);
    setTitle("");
    setDescription("");
    setSelectedSpeakers(new Set());
    setAgendaItemId("");
    setUploading(false);
    setDragOver(false);
  }

  function toggleSpeaker(id: string) {
    setSelectedSpeakers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!files || files.length === 0) return;
    setUploading(true);
    await onUpload({
      files,
      title: title || undefined,
      description: description || undefined,
      speakerIds: Array.from(selectedSpeakers),
      agendaItemId: agendaItemId || undefined,
    });
    setUploading(false);
    reset();
    onOpenChange(false);
  }

  // If user picks an agenda item, auto-suggest its speaker (don't override existing selection)
  function onAgendaChange(value: string) {
    if (value === "__none__") {
      setAgendaItemId("");
      return;
    }
    setAgendaItemId(value);
    const item = event.agenda.find((a) => a.id === value);
    if (item?.speaker) {
      setSelectedSpeakers((prev) => {
        const next = new Set(prev);
        next.add(item.speaker!.id);
        return next;
      });
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload presentation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              setFiles(e.dataTransfer.files);
            }}
            className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-[#FF005A] bg-[#FF005A]/5"
                : "border-black/15 hover:border-black/30"
            }`}
          >
            <input
              type="file"
              accept={ACCEPTED_EXTS}
              multiple
              className="hidden"
              onChange={(e) => setFiles(e.target.files)}
            />
            <Upload className="h-8 w-8 mx-auto text-black/80 mb-2" />
            {files && files.length > 0 ? (
              <div>
                <div className="font-semibold text-black">
                  {files.length} file{files.length === 1 ? "" : "s"} selected
                </div>
                <div className="text-xs text-black/80 mt-1 max-h-24 overflow-y-auto ais-scroll">
                  {Array.from(files)
                    .map((f) => `${f.name} (${formatBytes(f.size)})`)
                    .join(", ")}
                </div>
                <div className="text-xs text-[#004F98] mt-2 underline">Change selection</div>
              </div>
            ) : (
              <div>
                <div className="font-semibold text-black">Drop files here or click to browse</div>
                <div className="text-xs text-black/80 mt-1">
                  PDF, PPT, PPTX, Keynote, DOC, images — up to 20 files
                </div>
              </div>
            )}
          </label>

          <Input
            placeholder="Optional title (defaults to filename)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Optional description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />

          {/* Session selector */}
          <div>
            <label className="text-xs font-semibold text-black/70 mb-1.5 block">
              Session (optional)
            </label>
            <Select value={agendaItemId || "__none__"} onValueChange={onAgendaChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an agenda item…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__none__">— General event file —</SelectItem>
                {event.agenda
                  .filter((a) => a.type === "TALK" || a.type === "WELCOME" || a.type === "FAST_PITCH")
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {formatTime(a.startsAt)} · {a.title}
                      {a.speaker ? ` — ${a.speaker.name}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Speaker selector */}
          <div>
            <label className="text-xs font-semibold text-black/70 mb-1.5 block flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" /> Presenters (optional)
            </label>
            <div className="space-y-1.5 max-h-44 overflow-y-auto ais-scroll border border-black/10 rounded-md p-2">
              {event.speakers
                .filter((s) => s.name !== "Ezequiel Sznaider")
                .map((s) => (
                  <label
                    key={s.id}
                    className="flex items-start gap-3 p-1.5 rounded-md hover:bg-black/5 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedSpeakers.has(s.id)}
                      onCheckedChange={() => toggleSpeaker(s.id)}
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{s.name}</div>
                      {s.role && <div className="text-xs text-black/80">{s.role}</div>}
                    </div>
                  </label>
                ))}
              {event.speakers.filter((s) => s.name !== "Ezequiel Sznaider").length === 0 && (
                <p className="text-xs text-black/80 italic p-2">No speakers configured.</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={!files || files.length === 0 || uploading}
            className="bg-black hover:bg-black/90"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1.5" /> Upload {files?.length || 0}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
