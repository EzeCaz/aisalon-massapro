/**
 * Brand-aware metadata resolution.
 *
 * Phase 2 of the Coma brand-isolation project (Option A): every page's
 * browser-tab title, description, and OpenGraph/Twitter tags must reflect
 * the ACTIVE brand — "AI Salon Tel Aviv" for the AIS brand, "Coma Tel Aviv"
 * for the Coma brand — instead of the hard-coded AIS strings that leaked
 * to Coma users on every page.
 *
 * Resolution chain (matches the app's 4-layer brand chain):
 *   1. URL `?brand=<slug>` param (explicit override — sales demo mode)
 *   2. Request host header (coma.massapro.com → coma,
 *      aisalon.massapro.com → aisalon)
 *   3. BRAND_DEFAULT_SLUG env var, falling back to "aisalon"
 *
 * The host-based default is CORRECT for metadata because session cookies
 * are host-scoped: a Coma user's session only exists on coma.massapro.com,
 * so host and brand always agree in practice. The `?brand=` param covers
 * the anonymous demo case.
 *
 * USAGE:
 *   - Root layout: `const { brand, siteUrl, displayTitle } =
 *     await resolveBrandMetadata();` → drives metadataBase, default title,
 *     title template, description, OG, twitter.
 *   - Leaf pages: `export async function generateMetadata() {
 *     const { brand } = await resolveBrandMetadata();
 *     return { title: "Events" }; }` — the layout template appends the
 *     brand suffix ("Events — Coma Tel Aviv").
 *
 * SERVER-ONLY: reads next/headers — must not be imported by client
 * components.
 */

import { headers } from "next/headers";
import {
  resolveBrand,
  getEnvDefaultBrandSlug,
} from "@/lib/brand/resolve-brand";
import type { BrandConfig } from "@/lib/brand/brand-config";

export interface BrandMetadata {
  /** Resolved brand config for this request. */
  brand: BrandConfig;
  /**
   * Per-host site URL (e.g. "https://coma.massapro.com") — used as
   * metadataBase so OG/Twitter URLs resolve against the domain the
   * visitor is actually on, not a hard-coded AIS domain.
   */
  siteUrl: string;
  /**
   * Human brand + chapter display string, e.g. "AI Salon Tel Aviv" or
   * "Coma Tel Aviv" — the metadata title suffix used across the site.
   */
  displayTitle: string;
  /**
   * The brand's home city, humanized from defaultChapterSlug (e.g.
   * "Tel Aviv"). Lets callers embed the CITY in keywords/descriptions
   * without hard-coding it.
   */
  city: string;
}

/** Humanize a chapter slug: "tel-aviv" → "Tel Aviv", "mtl" → "Mtl". */
function humanizeChapterSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Resolve the active brand + per-host site URL for metadata generation.
 * Call inside generateMetadata() (server components only).
 */
export async function resolveBrandMetadata(
  urlBrandSlug?: string
): Promise<BrandMetadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  // Priority chain: explicit function arg → middleware-forwarded
  // `?brand=` header (set in src/middleware.ts) → host → env default.
  const headerBrandOverride = h.get("x-brand-override") ?? undefined;

  const brand = resolveBrand({
    urlBrandSlug: urlBrandSlug ?? headerBrandOverride,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  // Per-host metadataBase — falls back to the brand's canonical host when
  // headers are unavailable (e.g. static export edge cases).
  const siteUrl = host
    ? `${proto}://${host}`
    : brand.slug === "coma"
      ? "https://coma.massapro.com"
      : "https://aisalon.massapro.com";

  const city = humanizeChapterSlug(brand.defaultChapterSlug);
  const displayTitle = `${brand.displayName} ${city}`;

  return { brand, siteUrl, displayTitle, city };
}

/**
 * Brand-aware description for list/static pages. AIS keeps the original
 * community copy; Coma gets platform copy. Both stay accurate per brand.
 */
export function brandDescription(brand: BrandConfig): string {
  // CITY-AWARE (2026-09-18): the city derives from the brand's home
  // chapter (defaultChapterSlug) — no hard-coded "Tel Aviv", so a brand
  // whose home chapter changes (or any future brand with a different
  // home city) renders correct copy automatically.
  const city = humanizeChapterSlug(brand.defaultChapterSlug);
  if (brand.slug === "coma") {
    return `${brand.displayName} ${city} — the community operating system powering ${brand.displayName}'s ${city} chapter. ${brand.tagline}.`;
  }
  return `${brand.displayName} ${city} — the community platform for ${brand.displayName}'s ${city} chapter. ${brand.tagline}.`;
}
