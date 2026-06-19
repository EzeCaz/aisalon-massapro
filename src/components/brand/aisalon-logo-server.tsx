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
        <MeerkatMarkServer className="h-[1em] w-[1em] mr-[0.15em]" />
        <span className="text-[1em]">ais</span>
      </span>
    );
  }

  if (variant === "stacked" || variant === "stacked-tagline") {
    return (
      <span className={cn("inline-flex flex-col items-start leading-[0.9]", text, className)}>
        <MeerkatMarkServer className="h-[1em] w-[1em] mb-[0.2em]" />
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
      <span className="inline-flex items-baseline">
        <MeerkatMarkServer className="h-[1em] w-[1em] mr-[0.2em]" />
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
 * page (including the login page). Falls back to the AIS GRADIENT
 * polyhedron SVG only if the image fails to load.
 */
export function MeerkatMarkServer({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative inline-block align-middle", className)}
      aria-hidden="true"
      role="presentation"
    >
      <Image
        src="/images/falafel-meerkat.png"
        alt="AI Salon Falafel Meerkat"
        fill
        sizes="(max-width: 768px) 32px, 40px"
        className="object-contain"
        priority
      />
    </span>
  );
}
