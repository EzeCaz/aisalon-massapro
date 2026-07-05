"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";

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
  const sub = color === "white" ? "text-white/70" : "text-black/80";

  if (variant === "monogram") {
    return (
      <span className={cn("inline-flex items-baseline font-extrabold tracking-tight", text, className)}>
        <MeerkatMark height="1em" className="mr-[0.15em]" />
        <span className="text-[1em]">ais</span>
      </span>
    );
  }

  if (variant === "stacked" || variant === "stacked-tagline") {
    return (
      <span className={cn("inline-flex flex-col items-start leading-[0.9]", text, className)}>
        <MeerkatMark height="1.4em" className="mb-[0.2em]" />
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
      <span className="inline-flex items-end">
        <MeerkatMark height="1.5em" className="mr-[0.2em]" />
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
 * MeerkatMark — renders the actual Falafel Meerkat mascot.
 * Per AI Salon Tel Aviv chapter brief, this is the brand mark shown
 * top-left on every page (including login).
 *
 * The source JPG is 624 × 1686 (a tall portrait). We pass the intrinsic
 * dimensions to next/image; CSS scaling is done via inline `height` (in
 * `em`, relative to the parent's font-size) so the natural aspect ratio
 * is preserved.
 *
 * IMPORTANT — inline styles (rather than Tailwind `h-[1.5em]` classes)
 * are intentional: on slow mobile connections there is a brief window
 * where the HTML has loaded but the Tailwind CSS chunk has not. During
 * that window, an <img> with width=624 height=1686 would otherwise
 * render at its natural size and cover the entire mobile screen.
 * Inline `height` + `max-width` styles are honoured immediately, before
 * CSS arrives, so the mark stays small.
 */
export function MeerkatMark({
  className,
  height = "1.5em",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <Image
      src="/images/falafel-meerkat.jpg"
      alt="AI Salon Falafel Meerkat"
      width={624}
      height={1686}
      className={cn("object-contain align-middle", className)}
      style={{
        // Inline styles = bulletproof against CSS-not-yet-loaded flashes.
        // The `em` unit resolves relative to the parent's font-size, which
        // is set on the outer logo span (e.g. text-[1.6rem]).
        height,
        width: "auto",
        maxWidth: "100%",
        display: "inline-block",
        verticalAlign: "middle",
      }}
      priority
      unoptimized
    />
  );
}
