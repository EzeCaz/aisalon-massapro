import { cn } from "@/lib/utils";

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

export function MeerkatMarkServer({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" role="presentation">
      <defs>
        <linearGradient id="ais-grad-mark-srv" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF005A" />
          <stop offset="40%" stopColor="#820A7D" />
          <stop offset="75%" stopColor="#004F98" />
          <stop offset="100%" stopColor="#00E6FF" />
        </linearGradient>
      </defs>
      <polygon points="12,2 22,8 12,14 2,8" fill="url(#ais-grad-mark-srv)" />
      <polygon points="12,14 22,20 12,22 2,20" fill="url(#ais-grad-mark-srv)" opacity="0.7" />
    </svg>
  );
}
