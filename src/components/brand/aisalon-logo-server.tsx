import { cn } from "@/lib/utils";
import Image from "next/image";

type Variant = "horizontal" | "stacked" | "monogram" | "horizontal-tagline" | "stacked-tagline";
type Color = "black" | "white";

type Props = {
  variant?: Variant;
  className?: string;
  color?: Color;
  tagline?: boolean;
};

/**
 * Server-safe version of AiSalonLogo for use in RSC layouts.
 * (No "use client" so it can render on the server.)
 *
 * Per the AI Salon Tel Aviv chapter brief, the Falafel Meerkat mascot
 * (`/images/falafel-meerkat.png`) is the brand mark shown on the top-left
 * of every page (including login). It replaces the previous SVG polyhedron
 * mark while still pairing with the lowercase `aisalon` wordmark.
 */
export function AiSalonLogoServer({
  variant = "horizontal",
  className,
  color = "black",
  tagline: taglineProp,
}: Props) {
  const tagline = taglineProp ?? variant.includes("tagline");
  const text = color === "white" ? "text-white" : "text-black";
  const sub = color === "white" ? "text-white/70" : "text-black/60";

  if (variant === "monogram") {
    return (
      <span className={cn("inline-flex items-baseline font-extrabold tracking-tight", text, className)}>
        <MeerkatMarkServer height="1em" className="mr-[0.15em]" />
        <span className="text-[1em]">ais</span>
      </span>
    );
  }

  if (variant === "stacked" || variant === "stacked-tagline") {
    return (
      <span className={cn("inline-flex flex-col items-start leading-[0.9]", text, className)}>
        <MeerkatMarkServer height="1.4em" className="mb-[0.2em]" />
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

  return (
    <span className={cn("inline-flex flex-col items-start leading-none", text, className)}>
      <span className="inline-flex items-end">
        <MeerkatMarkServer height="1.5em" className="mr-[0.2em]" />
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
 * MeerkatMarkServer — renders the actual Falafel Meerkat PNG.
 * Used as the brand mark to the left of the `aisalon` wordmark on every
 * page (including the login page).
 *
 * NOTE: The source image is 624 × 1686 (a tall portrait). We pass the
 * intrinsic dimensions to next/image; CSS scaling is done via inline
 * `height` (in `em`, relative to the parent's font-size) so the natural
 * aspect ratio is preserved.
 *
 * IMPORTANT — inline styles (rather than Tailwind `h-[1.5em]` classes)
 * are intentional: on slow mobile connections there is a brief window
 * where the HTML has loaded but the Tailwind CSS chunk has not. During
 * that window, an <img> with width=624 height=1686 would otherwise
 * render at its natural size and cover the entire mobile screen.
 * Inline `height` + `max-width` styles are honoured immediately, before
 * CSS arrives, so the mark stays small.
 */
export function MeerkatMarkServer({
  className,
  height = "1.5em",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <Image
      src="/images/falafel-meerkat.png"
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
