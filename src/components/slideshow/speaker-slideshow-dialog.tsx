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

export type SpeakerImage = {
  id: string;
  fileUrl: string;
  fileName: string;
  caption: string | null;
  slideOrder?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  speakerName: string;
  images: SpeakerImage[];
  /** Used to call /api/images/reorder — required to persist new order. */
  eventSlug: string;
  /** Optional: called after a successful reorder so the parent can refresh. */
  onReordered?: () => void;
  /**
   * Optional: the image ID to display first when the dialog opens.
   * Used by the agenda tab — clicking a specific thumbnail opens the
   * slideshow directly on that image instead of always starting at
   * index 0. Falls back to the first image when not provided or when
   * the ID is not found in `images`.
   */
  startImageId?: string | null;
};

const SLIDE_DURATION_MS = 2000;

/**
 * SpeakerSlideshowDialog — modal slideshow for a single speaker's photos.
 *
 * Opens when the user clicks the "Pictures" thumbnail on an agenda item
 * (or the "N photos" button on a speaker card). Replaces the old
 * `PicturesPreviewDialog` which was just a static grid of links.
 *
 * Features:
 *  - Full slideshow player (play / pause / prev / next / filmstrip)
 *  - Keyboard navigation (← / → / space)
 *  - Reorder dialog (drag-and-drop or ↑ / ↓ arrows) that persists the
 *    new slide order via /api/images/reorder (reuses the event-scoped
 *    endpoint — only the IDs passed in are updated, so per-speaker
 *    ordering works correctly even when other speakers' images share
 *    the same slideOrder values).
 */
export function SpeakerSlideshowDialog({
  open,
  onOpenChange,
  speakerName,
  images: initialImages,
  eventSlug,
  onReordered,
  startImageId,
}: Props) {
  const [images, setImages] = useState<SpeakerImage[]>(initialImages);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);

  // Re-sync when the dialog re-opens with fresh images.
  // If `startImageId` is provided and matches one of the images, jump
  // straight to that image — this is what makes the agenda tab "click a
  // thumbnail, see that specific picture in the slideshow" UX work.
  useEffect(() => {
    if (open) {
      setImages(initialImages);
      let startIdx = 0;
      if (startImageId) {
        const found = initialImages.findIndex((i) => i.id === startImageId);
        if (found >= 0) startIdx = found;
      }
      setCurrentIdx(startIdx);
      setPlaying(false);
    }
  }, [open, initialImages, startImageId]);

  // Auto-advance
  useEffect(() => {
    if (!playing || images.length === 0) return;
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % images.length);
    }, SLIDE_DURATION_MS);
    return () => clearInterval(timer);
  }, [playing, images.length]);

  // Keyboard nav (only when dialog is open)
  useEffect(() => {
    if (!open) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, images.length]);

  const prev = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIdx((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);
  const next = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIdx((i) => (i + 1) % images.length);
  }, [images.length]);

  async function saveOrder(newOrder: SpeakerImage[]) {
    const t = toast.loading("Saving order…");
    try {
      const res = await fetch("/api/images/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventSlug,
          orderedIds: newOrder.map((i) => i.id),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Slideshow order saved", { id: t });
      setImages(newOrder);
      setReorderOpen(false);
      onReordered?.();
    } catch (e) {
      toast.error("Failed to save order", { id: t });
    }
  }

  const current = images[currentIdx];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[#FF005A]" />
            Pictures of {speakerName}&apos;s session
            <span className="text-xs font-normal text-black/40 ml-1">
              ({images.length} photo{images.length === 1 ? "" : "s"})
            </span>
          </DialogTitle>
        </DialogHeader>

        {images.length === 0 ? (
          <div className="text-center py-12 text-sm text-black/50">
            No pictures linked to this speaker yet.
          </div>
        ) : (
          <>
            {/* Player */}
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden group">
              <img
                key={current.id}
                src={current.fileUrl}
                alt={current.caption || current.fileName}
                className="absolute inset-0 h-full w-full object-contain"
              />
              <div className="absolute top-0 inset-x-0 h-1 ais-gradient opacity-80" />
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    {current.caption && (
                      <p className="text-sm font-medium line-clamp-1">
                        {current.caption}
                      </p>
                    )}
                    <p className="text-[0.65rem] text-white/60 font-mono">
                      {currentIdx + 1} / {images.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={prev}
                      className="rounded-full bg-white/10 hover:bg-white/20 p-1.5 transition-colors"
                      title="Previous (←)"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPlaying((p) => !p)}
                      className="rounded-full bg-white text-black hover:bg-white/90 p-2 transition-colors"
                      title={playing ? "Pause (space)" : "Play (space)"}
                    >
                      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={next}
                      className="rounded-full bg-white/10 hover:bg-white/20 p-1.5 transition-colors"
                      title="Next (→)"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
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
                Auto-advance every <strong>2s</strong> · ← / → keys ·{" "}
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
          </>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Reusable reorder dialog — same pattern as slideshow-tab.tsx but accepts
// SpeakerImage[] (a slimmer shape) instead of the full ImageItem.
function ReorderDialog({
  open,
  onOpenChange,
  images,
  onSave,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  images: SpeakerImage[];
  onSave: (newOrder: SpeakerImage[]) => void;
  children: React.ReactNode;
}) {
  const [local, setLocal] = useState<SpeakerImage[]>(images);
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
          <DialogTitle>Reorder this speaker&apos;s slideshow</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/60 -mt-2">
          Drag rows to reorder, or use the ↑ / ↓ arrows. Click <strong>Save order</strong> to apply
          — this updates the order for anyone viewing this speaker&apos;s slideshow from the agenda.
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
  img: SpeakerImage;
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
        className="cursor-grab active:cursor-grabbing text-black/30 hover:text-black/60 p-1"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="text-xs font-mono text-black/40 w-6 text-center">{idx + 1}</div>
      <div className="flex-shrink-0 w-14 h-10 rounded overflow-hidden bg-black/5">
        <img src={img.fileUrl} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-black truncate">
          {img.caption || img.fileName}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => onMove(-1)}
          disabled={idx === 0}
          className="text-black/40 hover:text-black disabled:opacity-20 p-0.5"
          aria-label="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={idx === total - 1}
          className="text-black/40 hover:text-black disabled:opacity-20 p-0.5"
          aria-label="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
