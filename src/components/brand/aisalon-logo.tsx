"use client";

import { cn } from "@/lib/utils";

type LogoProps = {
  variant?: "horizontal" | "stacked" | "horizontal-tagline" | "stacked-tagline" | "monogram";
  className?: string;
  /** Force a color — per brand book, logo is only ever black or white. */
  color?: "black" | "white";
  tagline?: boolean;
};

/**
 * AI Salon wordmark — strict per brand book:
 *  - always lowercase `aisalon` in the horizontal form
 *  - stacked form `ai` / `sa` / `lon`
 *  - monogram `ais` (small spaces only)
 *  - tagline `EMPOWERING AI CONNECTIONS` always BELOW logo, smaller, uppercase
 *  - logo color is only black or white (never red/cyan/accent)
 *
 * The mini Meerkat triangle mark preceding the wordmark evokes the brand's
 * low-poly mascot without needing a full illustration.
 */
export function AiSalonLogo({
  variant = "horizontal",
  className,
  color = "black",
  tagline: taglineProp,
}: LogoProps) {
  const tagline = taglineProp ?? variant.includes("tagline");
  const text = color === "white" ? "text-white" : "text-black";
  const sub = color === "white" ? "text-white/70" : "text-black/60";

  if (variant === "monogram") {
    return (
      <span className={cn("inline-flex items-baseline font-extrabold tracking-tight", text, className)}>
        <MeerkatMark className="h-[1em] w-[1em] mr-[0.15em]" />
        <span className="text-[1em]">ais</span>
      </span>
    );
  }

  if (variant === "stacked" || variant === "stacked-tagline") {
    return (
      <span className={cn("inline-flex flex-col items-start leading-[0.9]", text, className)}>
        <MeerkatMark className="h-[1em] w-[1em] mb-[0.2em]" />
        <span className="text-[1.6em] font-extrabold tracking-tight">ai</span>
        <span className="text-[1.6em] font-extrabold tracking-tight">sa</span>
        <span className="text-[1.6em] font-extrabold tracking-tight">lon</span>
        {tagline && (
          <span className={cn("mt-[0.6em] text-[0.45em] font-semibold uppercase tracking-[0.15em]", sub)}>
            Empowering AI Connections
          </span>
        )}
      </span>
    );
  }

  // horizontal / horizontal-tagline
  return (
    <span className={cn("inline-flex flex-col items-start leading-none", text, className)}>
      <span className="inline-flex items-baseline">
        <MeerkatMark className="h-[1em] w-[1em] mr-[0.2em]" />
        <span className="text-[1.6em] font-extrabold tracking-tight lowercase">aisalon</span>
      </span>
      {tagline && (
        <span className={cn("mt-[0.45em] pl-[1.2em] text-[0.42em] font-semibold uppercase tracking-[0.18em]", sub)}>
          Empowering AI Connections
        </span>
      )}
    </span>
  );
}

/**
 * MeerkatMark — a tiny geometric mark preceding the wordmark.
 * A low-poly triangle suggesting the Meerkat's ear/snout, in the AIS GRADIENT.
 * Not a full meerkat illustration — just enough to evoke the brand mascot.
 */
export function MeerkatMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <linearGradient id="ais-grad-mark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF005A" />
          <stop offset="40%" stopColor="#820A7D" />
          <stop offset="75%" stopColor="#004F98" />
          <stop offset="100%" stopColor="#00E6FF" />
        </linearGradient>
      </defs>
      {/* Stacked chevron pair (echoes the Sightbox/Meerkat polyhedron vibe) */}
      <polygon points="12,2 22,8 12,14 2,8" fill="url(#ais-grad-mark)" />
      <polygon points="12,14 22,20 12,22 2,20" fill="url(#ais-grad-mark)" opacity="0.7" />
    </svg>
  );
}
