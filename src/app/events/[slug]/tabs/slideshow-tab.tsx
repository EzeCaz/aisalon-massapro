"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  RotateCcw,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Speaker = { id: string; name: string };
type ImageItem = {
  id: string;
  fileUrl: string;
  fileName: string;
  caption: string | null;
  slideOrder: number;
  speakers: { id: string; name: string }[];
};

type Props = {
  event: { id: string; slug: string; title: string };
};

const SLIDE_DURATION_MS = 1500; // 1.5 seconds per the brief

export function SlideshowTab({ event }: Props) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${event.slug}/images`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setImages(data.images);
      setCurrentIdx(0);
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

  // Auto-advance every 1.5s while playing
  useEffect(() => {
    if (!playing || images.length === 0) return;
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % images.length);
    }, SLIDE_DURATION_MS);
    return () => clearInterval(timer);
  }, [playing, images.length]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);

  const prev = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIdx((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);
  const next = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIdx((i) => (i + 1) % images.length);
  }, [images.length]);

  async function saveOrder(newOrder: ImageItem[]) {
    const t = toast.loading("Saving order…");
    try {
      const res = await fetch("/api/images/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventSlug: event.slug,
          orderedIds: newOrder.map((i) => i.id),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Slideshow order saved", { id: t });
      setImages(newOrder);
      setReorderOpen(false);
    } catch (e) {
      toast.error("Failed to save order", { id: t });
    }
  }

  if (loading) {
    return (
      <div className="aspect-video bg-black/5 rounded-lg animate-pulse" />
    );
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-16">
        <ImageIcon className="h-12 w-12 mx-auto text-black/30 mb-3" />
        <h3 className="font-bold text-black mb-1">No photos to slideshow yet</h3>
        <p className="text-sm text-black/80">
          Upload photos in the <strong>Photos</strong> tab first, then come back here to play
          the community slideshow.
        </p>
      </div>
    );
  }

  const current = images[currentIdx];

  return (
    <div className="space-y-4">
      {/* Player */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden group">
        {/* Current image */}
        <img
          key={current.id}
          src={current.fileUrl}
          alt={current.caption || current.fileName}
          className="absolute inset-0 h-full w-full object-contain"
        />

        {/* AIS GRADIENT top accent bar */}
        <div className="absolute top-0 inset-x-0 h-1 ais-gradient opacity-80" />

        {/* Bottom gradient + meta */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              {current.speakers.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {current.speakers.map((s) => (
                    <span
                      key={s.id}
                      className="text-[0.6rem] font-bold uppercase tracking-wide bg-[#00E6FF] text-black px-2 py-0.5 rounded"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
              {current.caption && (
                <p className="text-sm font-medium line-clamp-1">{current.caption}</p>
              )}
              <p className="text-[0.65rem] text-white/60 font-mono">
                {currentIdx + 1} / {images.length}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={prev}
                className="rounded-full bg-white/10 hover:bg-white/20 p-2 transition-colors"
                title="Previous (←)"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="rounded-full bg-white text-black hover:bg-white/90 p-2.5 transition-colors"
                title={playing ? "Pause (space)" : "Play (space)"}
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <button
                onClick={next}
                className="rounded-full bg-white/10 hover:bg-white/20 p-2 transition-colors"
                title="Next (→)"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {playing && (
          <div className="absolute top-1 left-0 right-0 h-0.5 bg-white/20">
            <div
              key={`${currentIdx}-${playing}`}
              className="h-full ais-gradient"
              style={{
                animation: `slide-progress ${SLIDE_DURATION_MS}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slide-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-black/50">
          Auto-advance every <strong>1.5s</strong> · Use ← / → keys or the arrows above ·{" "}
          <strong>Space</strong> to play/pause
        </div>
        <ReorderDialog
          open={reorderOpen}
          onOpenChange={setReorderOpen}
          images={images}
          onSave={saveOrder}
        >
          <Button size="sm" variant="outline" className="border-black/20">
            <GripVertical className="h-4 w-4 mr-1.5" /> Reorder slides
          </Button>
        </ReorderDialog>
      </div>

      {/* Filmstrip */}
      <div className="flex gap-1.5 overflow-x-auto ais-scroll p-1 -mx-1">
        {images.map((img, idx) => (
          <button
            key={img.id}
            onClick={() => setCurrentIdx(idx)}
            className={`flex-shrink-0 w-20 h-14 rounded overflow-hidden border-2 transition-all ${
              idx === currentIdx
                ? "border-[#FF005A] ring-2 ring-[#FF005A]/30"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            <img src={img.fileUrl} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ReorderDialog({
  open,
  onOpenChange,
  images,
  onSave,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  images: ImageItem[];
  onSave: (newOrder: ImageItem[]) => void;
  children: React.ReactNode;
}) {
  // Initialize local state from images, and reset whenever dialog opens.
  const [local, setLocal] = useState<ImageItem[]>(images);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLocal(images);
    setLastOpen(true);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLocal((items) => {
      const oldIdx = items.findIndex((i) => i.id === active.id);
      const newIdx = items.findIndex((i) => i.id === over.id);
      return arrayMove(items, oldIdx, newIdx);
    });
  }

  function move(id: string, dir: -1 | 1) {
    setLocal((items) => {
      const idx = items.findIndex((i) => i.id === id);
      const target = idx + dir;
      if (target < 0 || target >= items.length) return items;
      return arrayMove(items, idx, target);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reorder slideshow</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/80 -mt-2">
          Drag rows to reorder, or use the ↑ / ↓ arrows. Click <strong>Save order</strong> to
          apply changes — this updates the order for everyone viewing the slideshow.
        </p>
        <div className="max-h-[60vh] overflow-y-auto ais-scroll -mx-1 px-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={local.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-1.5">
                {local.map((img, idx) => (
                  <SortableRow
                    key={img.id}
                    img={img}
                    idx={idx}
                    total={local.length}
                    onMove={(dir) => move(img.id, dir)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLocal(images)}>
            <RotateCcw className="h-4 w-4 mr-1.5" /> Reset
          </Button>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => onSave(local)}
            className="bg-black hover:bg-black/90"
          >
            Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableRow({
  img,
  idx,
  total,
  onMove,
}: {
  img: ImageItem;
  idx: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: img.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-2 rounded-md border bg-white ${
        isDragging ? "border-[#FF005A] shadow-lg" : "border-black/10"
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-black/30 hover:text-black/80 p-1"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="text-xs font-mono text-black/80 w-6 text-center">{idx + 1}</div>
      <div className="flex-shrink-0 w-14 h-10 rounded overflow-hidden bg-black/5">
        <img src={img.fileUrl} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-black truncate">
          {img.caption || img.fileName}
        </div>
        {img.speakers.length > 0 && (
          <div className="text-[0.6rem] text-[#007E72] font-semibold uppercase tracking-wide">
            {img.speakers.map((s) => s.name).join(", ")}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => onMove(-1)}
          disabled={idx === 0}
          className="text-black/80 hover:text-black disabled:opacity-20 p-0.5"
          aria-label="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={idx === total - 1}
          className="text-black/80 hover:text-black disabled:opacity-20 p-0.5"
          aria-label="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
