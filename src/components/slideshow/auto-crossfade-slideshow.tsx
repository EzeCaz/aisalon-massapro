"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ImageIcon } from "lucide-react";

type SlideImage = {
  id: string;
  fileUrl: string;
  caption: string | null;
  fileName: string;
};

type Props = {
  images: SlideImage[];
  /** ms between slide advances (default 2500) */
  intervalMs?: number;
  /** ms crossfade transition duration (default 700) */
  transitionMs?: number;
  className?: string;
  /** Called when the user clicks anywhere on the slideshow */
  onClick?: () => void;
  /** Accessible label for the button */
  ariaLabel?: string;
  /** Show/hide the bottom-left "Pictures" label overlay (default true) */
  showLabel?: boolean;
};

/**
 * AutoCrossfadeSlideshow
 *
 * Renders all images as absolutely-positioned layers inside a single
 * `relative` container and crossfades between them by toggling each
 * layer's opacity. Matches the 700ms crossfade pattern the user pasted
 * as the design reference.
 *
 * - Auto-advances every `intervalMs` (default 2.5s)
 * - 700ms opacity transition between slides
 * - Pauses on hover
 * - Clicking anywhere calls `onClick` (typically opens the modal dialog)
 * - Shows a `1/N` counter top-right and an optional "Pictures" label bottom-left
 * - Falls back to a single static image when only one image is provided
 */
export function AutoCrossfadeSlideshow({
  images,
  intervalMs = 2500,
  transitionMs = 700,
  className = "",
  onClick,
  ariaLabel,
  showLabel = true,
}: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = images.length;

  // Reset index if images array changes (e.g. when navigating between sessions)
  useEffect(() => {
    setCurrentIdx(0);
  }, [images.map((i) => i.id).join(",")]);

  // Auto-advance with pause-on-hover
  useEffect(() => {
    if (paused || total <= 1) return;
    const timer = setInterval(() => {
      setCurrentIdx((i) => (i + 1) % total);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [paused, total, intervalMs]);

  const handleClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  // Empty state — no images at all
  if (total === 0) {
    return (
      <div
        className={`relative w-full h-full bg-black/5 flex items-center justify-center ${className}`}
      >
        <ImageIcon className="h-10 w-10 text-black/20" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel || "Open pictures"}
      className={`group relative block w-full h-full overflow-hidden text-left ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* All image layers — absolutely positioned, crossfade via opacity */}
      <div ref={containerRef} className="absolute inset-0">
        {images.map((img, idx) => (
          <img
            key={img.id}
            src={img.fileUrl}
            alt={img.caption || img.fileName}
            loading={idx === 0 ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-opacity ease-in-out"
            style={{
              transitionDuration: `${transitionMs}ms`,
              opacity: idx === currentIdx ? 1 : 0,
              zIndex: idx === currentIdx ? 10 : 1,
            }}
          />
        ))}
      </div>

      {/* Gradient overlay for legibility of counter + label */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0 pointer-events-none" />

      {/* "1 of N" counter — top-right */}
      {total > 1 && (
        <div className="absolute top-2 right-2 bg-black/75 text-white text-[0.65rem] font-bold px-2 py-0.5 rounded leading-none tabular-nums shadow-sm z-20">
          {currentIdx + 1}/{total}
        </div>
      )}

      {/* Slide indicators — bottom-center dots (only if more than 1 image) */}
      {total > 1 && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 z-20">
          {images.map((img, idx) => (
            <span
              key={img.id}
              className={`block h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIdx
                  ? "w-4 bg-white"
                  : "w-1.5 bg-white/50"
              }`}
            />
          ))}
        </div>
      )}

      {/* Label — bottom-left */}
      {showLabel && (
        <div className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 text-white text-xs font-semibold z-20">
          <ImageIcon className="h-3.5 w-3.5" />
          Pictures
        </div>
      )}
    </button>
  );
}
