import * as React from "react";
import { AiSalonLogo } from "@/components/brand/aisalon-logo";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import { BrandLogo } from "@/components/brand/brand-logo";

/**
 * <BrandHeaderLogo /> — picks the right logo component for a brand.
 *
 * - AIS (`aisalon`): renders the legacy meerkat mascot + "aisalon" wordmark
 *   via `AiSalonLogo` (client) or `AiSalonLogoServer` (server). This
 *   preserves the existing AIS look on `/c/[slug]`, `/e/[slug]`, etc.
 * - Any other brand (Coma, future DB-branded brands): renders the generic
 *   text-based `BrandLogo` with the brand's wordmark + tagline. New
 *   brands created via the onboarding form fall into this branch by
 *   default — they get a clean lowercase wordmark until they upload a
 *   custom mark asset.
 *
 * Use `variant="server"` for Server Components (avoids the client-only
 * `AiSalonLogo` import).
 *
 * NOTE: `brand.slug` is typed as `string` (not `BrandSlug`) so this
 * component works with future DB-branded brands whose slugs aren't in
 * the static `BrandSlug` union ("aisalon" | "coma"). Any slug that's not
 * "aisalon" gets the text-wordmark branch.
 */
export type BrandHeaderBrand = {
  slug: string;
  wordmark: string;
  tagline: string;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  gradient?: string;
};

export function BrandHeaderLogo({
  brand,
  variant = "client",
  className,
  /** Render size scale — 1 = default (matches AIS legacy sizing). */
  scale = 1,
}: {
  brand: BrandHeaderBrand;
  variant?: "client" | "server";
  className?: string;
  scale?: number;
}) {
  if (brand.slug === "aisalon") {
    // Preserve the existing AIS look — meerkat mascot + lowercase
    // "aisalon" wordmark + tagline. Use the server-safe variant when
    // called from a Server Component.
    return variant === "server" ? (
      <AiSalonLogoServer
        variant="horizontal-tagline"
        className={className ?? "text-[1.05rem]"}
      />
    ) : (
      <span className={className}>
        <AiSalonLogo />
      </span>
    );
  }
  // Coma + any new brand created via the onboarding form: text wordmark
  // with the brand's primary color, tagline beneath.
  return (
    <BrandLogo
      wordmark={brand.wordmark}
      tagline={brand.tagline}
      variant="horizontal-tagline"
      color="black"
      className={className}
      scale={scale}
    />
  );
}
