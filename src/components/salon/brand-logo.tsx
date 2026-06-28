"use client";

import Image from "next/image";

/**
 * AI Salon brand logo — the official mark from the brand book.
 * Replaces the legacy "ai" text-in-gradient placeholder.
 *
 * Renders as a square logo at the requested size. Aspect ratio is 1:1
 * (source is 1278×1280). Pass `className` to override sizing/rounding.
 *
 * Default sizes:
 *   - size="sm" → 24px (h-6 w-6)
 *   - size="md" → 28px (h-7 w-7) — default, matches the legacy w-7 h-7 lockup
 *   - size="lg" → 40px (h-10 w-10)
 *   - size="xl" → 56px (h-14 w-14)
 */
export function BrandLogo({
  size = "md",
  className,
  alt = "AI Salon logo",
  priority = false,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  alt?: string;
  priority?: boolean;
}) {
  const dimension =
    size === "sm" ? 24 :
    size === "md" ? 28 :
    size === "lg" ? 40 :
    /* xl */ 56;

  return (
    <Image
      src="/brand/aisalon-logo.webp"
      alt={alt}
      width={dimension}
      height={dimension}
      priority={priority}
      className={className ?? "rounded-md object-contain"}
      aria-hidden={alt === "AI Salon logo" ? undefined : undefined}
    />
  );
}
