import { cn } from "@/lib/utils";

/**
 * Brand logo wordmark — used by the brand-aware login page and other
 * brand surfaces. Server-safe (no "use client").
 *
 * This is a TEXT-BASED wordmark (no SVG asset) — it renders the brand's
 * wordmark string with the brand's primary color, plus optional tagline.
 *
 * Why text-based:
 *   - Both current brands ("aisalon" and "coma") have simple lowercase
 *     wordmarks that don't need custom SVG paths.
 *   - A text wordmark is resolution-independent, themeable, and trivially
 *     localizable.
 *   - When a brand graduates to a custom SVG logo (e.g. a polyhedron mark
 *     for AIS), we add an optional `markSrc` prop that renders an <Image>
 *     before the wordmark — same pattern as AiSalonLogoServer.
 *
 * Variants:
 *   - "horizontal"        — mark + wordmark on one line (no tagline)
 *   - "horizontal-tagline" — mark + wordmark on one line, tagline below
 *   - "stacked"           — mark on top, wordmark stacked vertically below
 *
 * Colors:
 *   - "black"  — dark backgrounds (login left panel uses dark bg)
 *   - "white"  — light backgrounds (login right panel uses white bg)
 *
 * The brand's gradient is exposed via the `withGradient` prop, which
 * wraps the wordmark in a span with `background: <gradient>` +
 * `background-clip: text` for a colored wordmark.
 */

type Variant = "horizontal" | "horizontal-tagline" | "stacked";
type Color = "black" | "white";

type Props = {
  /** Brand wordmark text (e.g. "aisalon", "coma"). */
  wordmark: string;
  /** Brand tagline (shown when variant includes "-tagline"). */
  tagline?: string;
  /** Visual variant. */
  variant?: Variant;
  /** Text color — black for dark bg, white for light bg. */
  color?: Color;
  /** Optional CSS class for outer span. */
  className?: string;
  /** When true, the wordmark uses the brand's gradient as text color. */
  withGradient?: boolean;
  /** Inline gradient CSS (used only when withGradient is true). */
  gradient?: string;
  /** Font size scale multiplier (1 = default, 1.2 = 20% larger). */
  scale?: number;
};

export function BrandLogo({
  wordmark,
  tagline,
  variant = "horizontal",
  color = "black",
  className,
  withGradient = false,
  gradient,
  scale = 1,
}: Props) {
  const textColor = color === "white" ? "text-white" : "text-black";
  const subColor = color === "white" ? "text-white/70" : "text-black/70";
  const fontSize = `${1.6 * scale}em`;
  const taglineSize = `${0.42 * scale}em`;

  if (variant === "stacked") {
    return (
      <span
        className={cn(
          "inline-flex flex-col items-start leading-[0.9]",
          textColor,
          className
        )}
      >
        <span
          className="font-extrabold tracking-tight lowercase"
          style={{ fontSize }}
        >
          {wordmark}
        </span>
        {tagline && (
          <span
            className={cn(
              "mt-[0.6em] font-semibold uppercase tracking-[0.15em]",
              subColor
            )}
            style={{ fontSize: taglineSize }}
          >
            {tagline}
          </span>
        )}
      </span>
    );
  }

  // horizontal + horizontal-tagline share the same wordmark row
  return (
    <span
      className={cn(
        "inline-flex flex-col items-start leading-none",
        textColor,
        className
      )}
    >
      <span className="inline-flex items-end">
        <span
          className="font-extrabold tracking-tight lowercase"
          style={
            withGradient && gradient
              ? {
                  fontSize,
                  backgroundImage: gradient,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  WebkitTextFillColor: "transparent",
                }
              : { fontSize }
          }
        >
          {wordmark}
        </span>
      </span>
      {variant === "horizontal-tagline" && tagline && (
        <span
          className={cn(
            "mt-[0.45em] pl-[0.1em] font-semibold uppercase tracking-[0.18em]",
            subColor
          )}
          style={{ fontSize: taglineSize }}
        >
          {tagline}
        </span>
      )}
    </span>
  );
}

/**
 * BrandGradientText — wraps children in a span that uses the brand's
 * gradient as the text color. Used for highlight phrases in headlines
 * (e.g. the "AI builders" or "community builders" phrase in the H1).
 *
 * Server-safe (no "use client").
 */
export function BrandGradientText({
  gradient,
  children,
  className,
}: {
  gradient: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("font-extrabold", className)}
      style={{
        backgroundImage: gradient,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
      }}
    >
      {children}
    </span>
  );
}
