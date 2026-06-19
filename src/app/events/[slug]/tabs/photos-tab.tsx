"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
// (Select component not currently used in this tab)
import {
  Upload,
  Trash2,
  Link2,
  X,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Tag,
  RotateCw,
  RotateCcw,
} from "lucide-react";

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
};

type ImageItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  caption: string | null;
  slideOrder: number;
  width: number | null;
  height: number | null;
  uploader: { id: string; name: string | null; email: string };
  speakers: { id: string; name: string; role: string | null; company: string | null }[];
};

type Props = {
  event: {
    id: string;
    slug: string;
    title: string;
    speakers: Speaker[];
  };
  me: { id: string; email: string; name: string | null; role: string };
  isAdmin: boolean;
};

export function PhotosTab({ event, me, isAdmin }: Props) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${event.slug}/images`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setImages(data.images);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load images");
    } finally {
      setLoading(false);
    }
  }, [event.slug]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(images.map((i) => i.id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function handleUpload(files: FileList | null, caption?: string) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const total = fileList.length;

    // Upload ONE FILE PER REQUEST to avoid hitting Vercel's 4.5 MB
    // serverless function body limit. Even with sharp resizing on the
    // server, the incoming multipart body must arrive in full before
    // any processing happens, so a batch of 6 modern phone photos
    // (each 3–5 MB before server-side resize) will easily exceed the
    // limit. Uploading one at a time also gives per-file progress and
    // partial success (one bad file doesn't kill the whole batch).
    const t = toast.loading(`Uploading 1/${total} …`);
    let success = 0;
    const failures: { name: string; reason: string }[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      toast.loading(`Uploading ${i + 1}/${total} — ${file.name}`, { id: t });
      const fd = new FormData();
      fd.append("files", file);
      if (caption) fd.append("caption", caption);
      try {
        const res = await fetch(`/api/events/${event.slug}/images`, {
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
      toast.success(`Uploaded ${success} photo${success === 1 ? "" : "s"}`, { id: t });
    } else if (success === 0) {
      toast.error(
        `All ${total} photo${total === 1 ? "" : "s"} failed: ${failures[0].reason}`,
        { id: t }
      );
    } else {
      toast.warning(
        `${success}/${total} uploaded. ${failures.length} failed — first failure: ${failures[0].name} (${failures[0].reason})`,
        { id: t, duration: 8000 }
      );
    }
    setUploadOpen(false);
    await loadImages();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    const t = toast.loading("Deleting…");
    try {
      const res = await fetch(`/api/images/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Photo deleted", { id: t });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadImages();
    } catch (e) {
      toast.error("Delete failed", { id: t });
    }
  }

  async function handleSingleLink(imageId: string, speakerIds: string[]) {
    const t = toast.loading("Linking speaker…");
    try {
      const res = await fetch(`/api/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerIds }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Linked", { id: t });
      await loadImages();
    } catch (e) {
      toast.error("Link failed", { id: t });
    }
  }

  async function handleBulkLink(speakerIds: string[]) {
    if (selected.size === 0) return;
    const t = toast.loading(`Linking ${selected.size} photo${selected.size === 1 ? "" : "s"}…`);
    try {
      const res = await fetch("/api/images/bulk-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageIds: Array.from(selected),
          speakerIds,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Linked ${selected.size} photo${selected.size === 1 ? "" : "s"}`, { id: t });
      setBulkLinkOpen(false);
      clearSelection();
      await loadImages();
    } catch (e) {
      toast.error("Bulk link failed", { id: t });
    }
  }

  async function handleRotate(imageIds: string[], direction: "cw" | "ccw") {
    if (imageIds.length === 0) return;
    const label = direction === "cw" ? "clockwise" : "counter-clockwise";
    const t = toast.loading(
      `Rotating ${imageIds.length} photo${imageIds.length === 1 ? "" : "s"} ${label}…`
    );
    try {
      const res = await fetch("/api/images/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds, direction }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      const data = await res.json();
      toast.success(
        `Rotated ${data.rotated.length} photo${data.rotated.length === 1 ? "" : "s"}${
          data.skipped.length > 0 ? ` (${data.skipped.length} skipped)` : ""
        }`,
        { id: t }
      );
      await loadImages();
    } catch (e) {
      toast.error((e as Error).message || `Rotate failed`, { id: t });
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <UploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            onUpload={handleUpload}
          >
            <Button size="sm" className="bg-black hover:bg-black/90">
              <Upload className="h-4 w-4 mr-1.5" /> Upload photos
            </Button>
          </UploadDialog>

          {selected.size > 0 && (
            <>
              <Badge variant="secondary" className="bg-[#FF005A]/10 text-[#FF005A]">
                {selected.size} selected
              </Badge>
              <BulkLinkDialog
                open={bulkLinkOpen}
                onOpenChange={setBulkLinkOpen}
                speakers={event.speakers}
                onSubmit={handleBulkLink}
              >
                <Button size="sm" variant="outline" className="border-[#004F98] text-[#004F98]">
                  <Link2 className="h-4 w-4 mr-1.5" /> Link to speaker
                </Button>
              </BulkLinkDialog>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRotate(Array.from(selected), "cw")}
                title="Rotate selected 90° clockwise"
                className="border-black/20"
              >
                <RotateCw className="h-4 w-4 mr-1.5" /> Rotate CW
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRotate(Array.from(selected), "ccw")}
                title="Rotate selected 90° counter-clockwise"
                className="border-black/20"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" /> Rotate CCW
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                <X className="h-4 w-4 mr-1.5" /> Clear
              </Button>
            </>
          )}
          {images.length > 0 && selected.size === 0 && (
            <Button size="sm" variant="ghost" onClick={selectAll} className="text-black/60">
              Select all
            </Button>
          )}
        </div>

        <div className="text-xs text-black/40">
          {images.length} photo{images.length === 1 ? "" : "s"} · Click any photo to select it
        </div>
      </div>

      {/* Help banner */}
      {images.length === 0 && !loading && (
        <Card className="p-8 border-2 border-dashed border-black/15 bg-white text-center">
          <ImageIcon className="h-10 w-10 mx-auto text-black/30 mb-3" />
          <h3 className="font-bold text-black mb-1">No photos yet</h3>
          <p className="text-sm text-black/60 mb-4">
            Be the first to upload photos from <strong>{event.title}</strong>. All community
            members can upload and view.
          </p>
          <UploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            onUpload={handleUpload}
          >
            <Button className="bg-black hover:bg-black/90">
              <Upload className="h-4 w-4 mr-1.5" /> Upload photos
            </Button>
          </UploadDialog>
        </Card>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-square bg-black/5 animate-pulse rounded-md" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {images.map((img) => (
            <PhotoCard
              key={img.id}
              image={img}
              speakers={event.speakers}
              selected={selected.has(img.id)}
              onToggle={() => toggleSelect(img.id)}
              onDelete={() => handleDelete(img.id)}
              onLink={(sids) => handleSingleLink(img.id, sids)}
              onRotate={(dir) => handleRotate([img.id], dir)}
              canManage={isAdmin || img.uploader.id === me.id}
              uploaderName={img.uploader.name || img.uploader.email}
            />
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
      />
    </div>
  );
}

function PhotoCard({
  image,
  speakers,
  selected,
  onToggle,
  onDelete,
  onLink,
  onRotate,
  canManage,
  uploaderName,
}: {
  image: ImageItem;
  speakers: Speaker[];
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onLink: (speakerIds: string[]) => void;
  onRotate: (direction: "cw" | "ccw") => void;
  canManage: boolean;
  uploaderName: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [pendingSpeakers, setPendingSpeakers] = useState<Set<string>>(
    new Set(image.speakers.map((s) => s.id))
  );

  function toggleSpeaker(id: string) {
    setPendingSpeakers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-md border-2 bg-black/5 cursor-pointer transition-all ${
        selected ? "border-[#FF005A] ring-2 ring-[#FF005A]/30" : "border-transparent hover:border-black/20"
      }`}
      onClick={onToggle}
    >
      <img
        src={image.fileUrl}
        alt={image.caption || image.fileName}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />

      {/* Top-left checkbox */}
      <div className="absolute top-1.5 left-1.5 z-10">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="bg-white/80 border-black/30 data-[state=checked]:bg-[#FF005A] data-[state=checked]:border-[#FF005A] data-[state=checked]:text-white"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Top-right actions (admin or owner only) */}
      {canManage && (
        <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRotate("ccw");
            }}
            className="rounded-md bg-white/90 hover:bg-white p-1.5 text-black"
            title="Rotate 90° counter-clockwise"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRotate("cw");
            }}
            className="rounded-md bg-white/90 hover:bg-white p-1.5 text-black"
            title="Rotate 90° clockwise"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
            <DialogTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="rounded-md bg-white/90 hover:bg-white p-1.5 text-black"
                title="Link to speaker"
              >
                <Tag className="h-3.5 w-3.5" />
              </button>
            </DialogTrigger>
            <DialogContent onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>Link photo to speaker(s)</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-black/60">
                Tag which speaker(s) this photo is from. This helps organize the community gallery
                by agenda.
              </p>
              <div className="space-y-2 max-h-72 overflow-y-auto ais-scroll">
                {speakers
                  .filter((s) => s.name !== "Ezequiel Sznaider")
                  .map((s) => (
                    <label
                      key={s.id}
                      className="flex items-start gap-3 p-2 rounded-md hover:bg-black/5 cursor-pointer"
                    >
                      <Checkbox
                        checked={pendingSpeakers.has(s.id)}
                        onCheckedChange={() => toggleSpeaker(s.id)}
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{s.name}</div>
                        {s.role && <div className="text-xs text-black/60">{s.role}</div>}
                        {s.company && <div className="text-xs text-black/40">{s.company}</div>}
                      </div>
                    </label>
                  ))}
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    onLink(Array.from(pendingSpeakers));
                    setLinkOpen(false);
                  }}
                  className="bg-black hover:bg-black/90"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Save links
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded-md bg-white/90 hover:bg-white p-1.5 text-[#FF005A]"
            title="Delete photo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Bottom gradient + speaker tags */}
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none">
        {image.speakers.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {image.speakers.slice(0, 2).map((s) => (
              <span
                key={s.id}
                className="text-[0.55rem] font-semibold uppercase tracking-wide bg-[#00E6FF] text-black px-1.5 py-0.5 rounded"
              >
                {s.name.split(" ")[0]}
              </span>
            ))}
            {image.speakers.length > 2 && (
              <span className="text-[0.55rem] font-semibold text-white">
                +{image.speakers.length - 2}
              </span>
            )}
          </div>
        ) : (
          <div className="text-[0.6rem] text-white/70 truncate">by {uploaderName}</div>
        )}
      </div>
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onUpload,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpload: (files: FileList | null, caption?: string) => void;
  children: React.ReactNode;
}) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setFiles(null);
    setCaption("");
    setUploading(false);
  }

  async function submit() {
    if (!files || files.length === 0) return;
    setUploading(true);
    await onUpload(files, caption || undefined);
    setUploading(false);
    reset();
    onOpenChange(false);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload photos</DialogTitle>
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
              dragOver ? "border-[#FF005A] bg-[#FF005A]/5" : "border-black/15 hover:border-black/30"
            }`}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => setFiles(e.target.files)}
            />
            <Upload className="h-8 w-8 mx-auto text-black/40 mb-2" />
            {files && files.length > 0 ? (
              <div>
                <div className="font-semibold text-black">
                  {files.length} file{files.length === 1 ? "" : "s"} selected
                </div>
                <div className="text-xs text-black/60 mt-1">
                  {Array.from(files)
                    .slice(0, 3)
                    .map((f) => f.name)
                    .join(", ")}
                  {files.length > 3 && ` +${files.length - 3} more`}
                </div>
                <div className="text-xs text-[#004F98] mt-2 underline">Change selection</div>
              </div>
            ) : (
              <div>
                <div className="font-semibold text-black">Drop photos here or click to browse</div>
                <div className="text-xs text-black/60 mt-1">
                  JPG, PNG, WebP, HEIC — each file uploaded separately so you can pick as many as you want.
                  Files over ~4 MB may fail to upload.
                </div>
              </div>
            )}
          </label>

          <Input
            placeholder="Optional caption (applied to all selected photos)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
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

function BulkLinkDialog({
  open,
  onOpenChange,
  speakers,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  speakers: Speaker[];
  onSubmit: (speakerIds: string[]) => void;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelected(new Set());
        onOpenChange(v);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link selected photos to speaker(s)</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/60">
          Tag these photos with one or more speakers from the agenda. Existing speaker links on
          these photos will be replaced.
        </p>
        <div className="space-y-2 max-h-72 overflow-y-auto ais-scroll">
          {speakers
            .filter((s) => s.name !== "Ezequiel Sznaider")
            .map((s) => (
              <label
                key={s.id}
                className="flex items-start gap-3 p-2 rounded-md hover:bg-black/5 cursor-pointer"
              >
                <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                <div className="flex-1">
                  <div className="font-semibold text-sm">{s.name}</div>
                  {s.role && <div className="text-xs text-black/60">{s.role}</div>}
                  {s.company && <div className="text-xs text-black/40">{s.company}</div>}
                </div>
              </label>
            ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => onSubmit(Array.from(selected))}
            disabled={selected.size === 0}
            className="bg-[#004F98] hover:bg-[#004F98]/90"
          >
            <Link2 className="h-4 w-4 mr-1.5" /> Link to {selected.size} speaker
            {selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
