"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Heart,
  Share2,
  Star,
  Trash2,
  Sparkles,
  EyeOff,
  Calendar,
  Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";

export type Testimonial = {
  id: string;
  body: string;
  rating: number;
  imageUrl: string | null;
  eventDate: string;
  featured: boolean;
  hidden: boolean;
  likeCount: number;
  shareCount: number;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    email: string;
    photoUrl: string | null;
    image: string | null;
    company: string | null;
  };
  event: { id: string; title: string; slug: string } | null;
  speaker: { id: string; name: string; company: string | null; photoUrl: string | null } | null;
  agendaItem: { id: string; title: string } | null;
  likedByMe: boolean;
};

type Props = {
  testimonial: Testimonial;
  meId: string;
  isAdmin: boolean;
  onChanged?: () => void; // refetch callback after delete / like / share
};

/**
 * TestimonialCard — single testimonial display with:
 *   - 5-star rating
 *   - author avatar + name + company
 *   - optional image (click to enlarge in a dialog)
 *   - quote body
 *   - attachment context (event / speaker / session)
 *   - like button (toggles), share button (Web Share API + counter)
 *   - delete button (author or admin)
 *   - "featured" + "hidden" admin badges
 */
export function TestimonialCard({ testimonial: t, meId, isAdmin, onChanged }: Props) {
  const [liked, setLiked] = useState(t.likedByMe);
  const [likeCount, setLikeCount] = useState(t.likeCount);
  const [shareCount, setShareCount] = useState(t.shareCount);
  const [busy, setBusy] = useState(false);

  async function toggleLike() {
    setBusy(true);
    const prevLiked = liked;
    const prevCount = likeCount;
    // Optimistic update
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    try {
      const res = await fetch(`/api/testimonials/${t.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("like failed");
      const data = await res.json();
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    } catch {
      // Rollback
      setLiked(prevLiked);
      setLikeCount(prevCount);
      toast.error("Couldn't update like — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    const shareUrl = `${window.location.origin}/testimonials?t=${t.id}`;
    const shareText = `"${t.body.slice(0, 140)}${t.body.length > 140 ? "…" : ""}" — ${t.author.name || t.author.email}`;

    // Try the Web Share API first (mobile + some desktop browsers).
    if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
      try {
        await (navigator as Navigator).share({
          title: "AI Salon TLV — Testimonial",
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // User cancelled — don't bump the counter.
        return;
      }
    } else {
      // Fallback: copy link to clipboard.
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied to clipboard!");
      } catch {
        toast.error("Couldn't copy the link.");
        return;
      }
    }

    // Bump the share counter.
    try {
      const res = await fetch(`/api/testimonials/${t.id}/share`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareCount(data.shareCount);
      }
    } catch {
      // Counter is best-effort; don't surface errors.
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this testimonial? This can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/testimonials/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      toast.success("Testimonial deleted");
      onChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const authorName = t.author.name || t.author.email.split("@")[0];
  // Compute proper initials: first letter of each word (up to 2 words).
  // Falls back to the first 2 chars of the name when only one word is present.
  const authorInitials = authorName
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || authorName.slice(0, 2).toUpperCase();
  const authorAvatar = t.author.photoUrl || t.author.image;

  // Attachment context chip(s) — show what this testimonial is attached to.
  const attachments: { label: string; href?: string }[] = [];
  if (t.event) {
    attachments.push({
      label: `📍 ${t.event.title}`,
      href: `/events/${t.event.slug}`,
    });
  }
  if (t.speaker) {
    attachments.push({ label: `🎤 ${t.speaker.name}${t.speaker.company ? ` · ${t.speaker.company}` : ""}` });
  }
  if (t.agendaItem) {
    attachments.push({ label: `🗓 ${t.agendaItem.title}` });
  }
  if (attachments.length === 0) {
    attachments.push({ label: "🌍 Community" });
  }

  return (
    <div
      className={`relative rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md ${
        t.featured
          ? "border-[#FF005A]/40 ring-1 ring-[#FF005A]/20"
          : "border-black/10"
      }`}
    >
      {/* Featured / Hidden badges */}
      {(t.featured || t.hidden) && (
        <div className="absolute -top-2 left-4 flex gap-1">
          {t.featured && (
            <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase tracking-wider bg-[#FF005A] text-white px-1.5 py-0.5 rounded-full">
              <Sparkles className="h-2.5 w-2.5" /> Featured
            </span>
          )}
          {t.hidden && (
            <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase tracking-wider bg-black/60 text-white px-1.5 py-0.5 rounded-full">
              <EyeOff className="h-2.5 w-2.5" /> Hidden
            </span>
          )}
        </div>
      )}

      {/* Top row: author + date */}
      <div className="flex items-center gap-3 mb-3">
        {authorAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={authorAvatar}
            alt={authorName}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            className="h-9 w-9 rounded-full object-cover bg-black/5 flex-shrink-0"
            onError={(e) => {
              // If the image fails to load (e.g. expired Google URL, CORS),
              // hide it so the CSS-drawn initials fallback shows through.
              (e.currentTarget as HTMLImageElement).style.display = "none";
              const fb = (e.currentTarget.parentElement?.querySelector("[data-fallback]") as HTMLElement | null);
              if (fb) fb.style.display = "flex";
            }}
          />
        ) : null}
        {/* CSS-drawn initials fallback — hidden by default when an avatar image
            is present, shown when there's no image OR the image fails to load. */}
        <div
          data-fallback
          className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold bg-[#FF005A]/10 text-[#FF005A] flex-shrink-0 ${authorAvatar ? "hidden" : "flex"}`}
          aria-hidden={authorAvatar ? "true" : "false"}
        >
          {authorInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-black truncate">
            {authorName}
          </div>
          {t.author.company && (
            <div className="text-[0.7rem] text-black/50 truncate">
              {t.author.company}
            </div>
          )}
        </div>
        <div className="text-[0.65rem] text-black/40 text-right">
          <div className="flex items-center gap-0.5 justify-end">
            <Calendar className="h-2.5 w-2.5" />
            {new Date(t.eventDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <div className="mt-0.5">
            posted {timeAgo(t.createdAt)}
          </div>
        </div>
      </div>

      {/* Rating stars */}
      <div className="flex gap-0.5 mb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < t.rating
                ? "fill-[#FFAC30] text-[#FFAC30]"
                : "text-black/15"
            }`}
          />
        ))}
      </div>

      {/* Body quote */}
      <blockquote className="text-sm text-black/80 leading-relaxed whitespace-pre-wrap break-words">
        “{t.body}”
      </blockquote>

      {/* Optional image */}
      {t.imageUrl && (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="mt-3 block w-full rounded-lg overflow-hidden border border-black/10 hover:opacity-90 transition-opacity"
            >
              <img
                src={t.imageUrl}
                alt="Testimonial photo"
                className="w-full max-h-[300px] object-cover"
                loading="lazy"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <ImageIcon className="h-4 w-4 text-black/40" />
                {authorName}'s photo
              </DialogTitle>
            </DialogHeader>
            <img
              src={t.imageUrl}
              alt="Testimonial photo (full size)"
              className="w-full rounded-lg"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Attachment chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {attachments.map((a, i) =>
          a.href ? (
            <Link
              key={i}
              href={a.href}
              className="text-[0.65rem] font-medium bg-black/5 text-black/60 px-2 py-0.5 rounded-full hover:bg-black/10"
            >
              {a.label}
            </Link>
          ) : (
            <span
              key={i}
              className="text-[0.65rem] font-medium bg-black/5 text-black/60 px-2 py-0.5 rounded-full"
            >
              {a.label}
            </span>
          )
        )}
      </div>

      {/* Footer: actions */}
      <div className="mt-4 pt-3 border-t border-black/5 flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleLike}
          disabled={busy}
          className={`h-8 px-2 text-xs gap-1.5 ${
            liked ? "text-[#FF005A] hover:bg-[#FF005A]/10" : "text-black/60"
          }`}
        >
          <Heart
            className={`h-3.5 w-3.5 ${liked ? "fill-[#FF005A]" : ""}`}
          />
          {likeCount}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleShare}
          className="h-8 px-2 text-xs gap-1.5 text-black/60"
        >
          <Share2 className="h-3.5 w-3.5" />
          {shareCount > 0 ? shareCount : "Share"}
        </Button>

        {(t.author.id === meId || isAdmin) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={busy}
            className="h-8 px-2 text-xs gap-1.5 text-black/40 hover:text-[#FF005A] hover:bg-[#FF005A]/10 ml-auto"
            title={isAdmin && t.author.id !== meId ? "Admin: delete anyone's testimonial" : "Delete your testimonial"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
