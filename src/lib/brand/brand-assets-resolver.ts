/**
 * Brand-aware asset URL resolver.
 *
 * Cazhype onboarding funnel (2026-09-29): the existing mockups + login
 * page + chapter landing + admin dashboard all pulled visual assets
 * (logo, hero banner, favicon, email logo, mascot, brand book) from
 * either:
 *   - Hardcoded AIS blob URLs in src/app/admin/mockups/shared/brand-assets.ts
 *   - The static BRANDS constant in src/lib/brand/brand-config.ts
 *   - The SiteSetting / ChapterSetting key-value override layer
 *
 * None of them read from the `Brand` DB row's asset columns. So when a
 * new brand like "cazhype" is approved with partial assets, the app has
 * no way to surface those assets — it just keeps showing the AIS / Coma
 * visuals, which leaks the wrong brand identity to the new community.
 *
 * This module closes that gap. It exposes ONE function:
 *
 *   resolveBrandAssets(brandSlug) → BrandAssets
 *
 * Resolution order per asset (logo / heroBanner / favicon / emailLogo /
 * mascot / brandBook):
 *   1. Brand DB row column (e.g. Brand.logoUrl)     — admin-uploaded
 *   2. Static BRANDS[brandSlug].* (brand-config.ts) — code-level defaults
 *   3. BRANDS.coma.*  (the parent platform)         — "show Coma theme
 *      images not uploaded yet" per user spec
 *   4. Hardcoded fallback strings                  — last-resort
 *
 * SERVER-ONLY. Uses the Prisma client. Client components should call
 * /api/brand-assets/[brandSlug] which wraps this resolver.
 */

import { db } from "@/lib/db";
import {
  BRANDS,
  FALLBACK_DEFAULT_BRAND,
  isBrandSlug,
  type BrandSlug,
} from "./brand-config";

// ── Types ────────────────────────────────────────────────────────────────

export interface BrandAssets {
  /** Canonical slug ("cazhype" | "coma" | "aisalon" | ...). */
  slug: string;
  /** Display name ("Cazhype"). */
  displayName: string;
  /** Status of the Brand row — DRAFT (uses parent's branding) | ACTIVE. */
  status: "DRAFT" | "ACTIVE";
  /** Parent brand slug (null for Coma — root brand). */
  parentBrandSlug: string | null;
  /** Brand palette (hex strings). */
  palette: {
    primary: string;
    accent: string;
    secondary: string;
    gradient: string;
  };
  /** All 6 brand asset URLs (never null — falls back to Coma defaults). */
  assets: {
    logoUrl: string;
    heroBannerUrl: string;
    faviconUrl: string;
    emailLogoUrl: string;
    mascotImageUrl: string;
    brandBookUrl: string;
  };
  /** Mascot metadata (nullable — only set if the brand supplied them). */
  mascot: {
    name: string | null;
    backstory: string | null;
  };
  /** Login copy templates (filled). */
  loginCopy: {
    eyebrow: string;
    headline: string;
    subtitle: string;
    formHeading: string;
    formSubheading: string;
    footerCredit: string;
  };
  /**
   * Per-asset provenance: which resolution layer provided the URL.
   * Useful for the onboarding hub UI — to show "✓ uploaded by you" vs
   * "✗ using Coma fallback — upload your own".
   */
  provenance: Record<AssetKey, "brand-row" | "brand-config" | "coma-fallback" | "hardcoded">;
  /** Whether the Brand row exists in the DB at all. */
  dbRowExists: boolean;
}

export type AssetKey =
  | "logoUrl"
  | "heroBannerUrl"
  | "faviconUrl"
  | "emailLogoUrl"
  | "mascotImageUrl"
  | "brandBookUrl";

export const ASSET_KEYS: AssetKey[] = [
  "logoUrl",
  "heroBannerUrl",
  "faviconUrl",
  "emailLogoUrl",
  "mascotImageUrl",
  "brandBookUrl",
];

export const ASSET_LABELS: Record<AssetKey, string> = {
  logoUrl: "Logo (square mark)",
  heroBannerUrl: "Hero banner (login left panel)",
  faviconUrl: "Favicon (browser tab)",
  emailLogoUrl: "Email header logo",
  mascotImageUrl: "Mascot image",
  brandBookUrl: "Brand book (PDF/Figma link)",
};

export const ASSET_HINTS: Record<AssetKey, string> = {
  logoUrl: "Square PNG, 512×512 recommended, transparent background.",
  heroBannerUrl: "Wide PNG, 1600×900 recommended, transparent or brand-color background.",
  faviconUrl: "32×32 PNG or ICO, or 256×256 PNG (auto-resized by browser).",
  emailLogoUrl: "Wide PNG, 600×120 recommended, transparent background.",
  mascotImageUrl: "Square PNG, 800×800 recommended, transparent background.",
  brandBookUrl: "URL to your style guide (PDF, Figma, or DOC).",
};

// ── Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve all brand assets for a given brand slug.
 *
 * The resolution chain (per asset):
 *   1. Brand DB row column (e.g. Brand.logoUrl)     — admin-uploaded
 *   2. Static BRANDS[brandSlug].* (brand-config.ts) — code-level defaults
 *   3. BRANDS.coma.*  (the parent platform)         — "show Coma theme
 *      images not uploaded yet" per user spec
 *   4. Hardcoded fallback strings                  — last-resort
 *
 * Falls back gracefully at every layer. NEVER throws — always returns
 * a usable BrandAssets object (worst case: all-provenance "coma-fallback").
 *
 * @param brandSlug - lowercase brand slug ("cazhype")
 */
export async function resolveBrandAssets(
  brandSlug: string,
): Promise<BrandAssets> {
  const slug = brandSlug.toLowerCase();

  // Step 1: try the DB row
  let dbRow: {
    id: string;
    slug: string;
    displayName: string;
    status: string;
    primaryColor: string;
    accentColor: string;
    secondaryColor: string;
    gradient: string;
    heroBannerUrl: string | null;
    faviconUrl: string | null;
    logoUrl: string | null;
    emailLogoUrl: string | null;
    mascotImageUrl: string | null;
    mascotName: string | null;
    mascotBackstory: string | null;
    brandBookUrl: string | null;
    parentBrandId: string | null;
    loginEyebrowTemplate: string;
    loginHeadlineTemplate: string;
    loginSubtitle: string;
    loginFormHeading: string;
    loginFormSubheadingTemplate: string;
    footerCredit: string;
  } | null = null;

  try {
    dbRow = await db.brand.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        displayName: true,
        status: true,
        primaryColor: true,
        accentColor: true,
        secondaryColor: true,
        gradient: true,
        heroBannerUrl: true,
        faviconUrl: true,
        logoUrl: true,
        emailLogoUrl: true,
        mascotImageUrl: true,
        mascotName: true,
        mascotBackstory: true,
        brandBookUrl: true,
        parentBrandId: true,
        loginEyebrowTemplate: true,
        loginHeadlineTemplate: true,
        loginSubtitle: true,
        loginFormHeading: true,
        loginFormSubheadingTemplate: true,
        footerCredit: true,
      },
    });
  } catch (err) {
    // The Brand table might not exist in this sandbox DB snapshot.
    // Log and continue — we'll fall back entirely to brand-config.ts.
    console.warn(
      `[brand-assets-resolver] Brand table query failed for slug="${slug}":`,
      err instanceof Error ? err.message : err,
    );
  }

  // Step 2: get the parent brand slug (for the fallback chain)
  let parentSlug: string | null = null;
  if (dbRow?.parentBrandId) {
    try {
      const parent = await db.brand.findUnique({
        where: { id: dbRow.parentBrandId },
        select: { slug: true },
      });
      if (parent && isBrandSlug(parent.slug)) parentSlug = parent.slug;
    } catch {
      // ignore — fall back to "coma" below
    }
  }
  // Hard default: Coma is the platform root.
  const fallbackSlug: BrandSlug =
    parentSlug && isBrandSlug(parentSlug)
      ? parentSlug
      : FALLBACK_DEFAULT_BRAND; // "coma"

  // Step 3: code-level fallback brand configs
  const codeBrand = isBrandSlug(slug) ? BRANDS[slug] : undefined;
  const fallbackCodeBrand = BRANDS[fallbackSlug];
  const comaCodeBrand = BRANDS.coma;

  // Step 4: resolve each asset through the chain
  const resolveAsset = (
    key: AssetKey,
    dbValue: string | null,
    codeValue: string | undefined,
    fallbackCodeValue: string | undefined,
    hardcodedFallback: string,
  ): { url: string; provenance: BrandAssets["provenance"][AssetKey] } => {
    if (dbValue && dbValue.trim().length > 0) {
      return { url: dbValue, provenance: "brand-row" };
    }
    if (codeValue && codeValue.trim().length > 0) {
      return { url: codeValue, provenance: "brand-config" };
    }
    if (fallbackCodeValue && fallbackCodeValue.trim().length > 0) {
      return { url: fallbackCodeValue, provenance: "coma-fallback" };
    }
    return { url: hardcodedFallback, provenance: "hardcoded" };
  };

  // Map each asset key to its code-level config counterpart.
  // brand-config.ts uses different field names than the DB row, so we
  // bridge them explicitly here.
  const logoRes = resolveAsset(
    "logoUrl",
    dbRow?.logoUrl ?? null,
    codeBrand?.logo,
    fallbackCodeBrand?.logo,
    comaCodeBrand?.logo || "/brand/coma/logo.png",
  );
  const heroRes = resolveAsset(
    "heroBannerUrl",
    dbRow?.heroBannerUrl ?? null,
    codeBrand?.heroBanner,
    fallbackCodeBrand?.heroBanner,
    comaCodeBrand?.heroBanner || "",
  );
  const faviconRes = resolveAsset(
    "faviconUrl",
    dbRow?.faviconUrl ?? null,
    codeBrand?.favicon,
    fallbackCodeBrand?.favicon,
    comaCodeBrand?.favicon || "/favicon.ico",
  );
  // Note: brand-config.ts has no emailLogoUrl / mascotImageUrl / brandBookUrl
  // fields today (those are DB-only). So those three skip the "brand-config"
  // layer and fall straight from DB → coma-fallback → hardcoded.
  const emailLogoRes = resolveAsset(
    "emailLogoUrl",
    dbRow?.emailLogoUrl ?? null,
    undefined,
    fallbackCodeBrand?.logo, // email logo defaults to the brand's square logo
    comaCodeBrand?.logo || "/brand/coma/logo.png",
  );
  const mascotRes = resolveAsset(
    "mascotImageUrl",
    dbRow?.mascotImageUrl ?? null,
    undefined,
    undefined,
    "", // no hardcoded mascot — empty string means "no mascot, show wordmark"
  );
  const brandBookRes = resolveAsset(
    "brandBookUrl",
    dbRow?.brandBookUrl ?? null,
    undefined,
    undefined,
    "",
  );

  // Step 5: assemble the BrandAssets object
  const palette = {
    primary: dbRow?.primaryColor || codeBrand?.primaryColor || fallbackCodeBrand.primaryColor,
    accent: dbRow?.accentColor || codeBrand?.accentColor || fallbackCodeBrand.accentColor,
    secondary:
      dbRow?.secondaryColor || codeBrand?.secondaryColor || fallbackCodeBrand.secondaryColor,
    gradient: dbRow?.gradient || codeBrand?.gradient || fallbackCodeBrand.gradient,
  };

  // Login copy: prefer DB row, fall back to brand-config, fall back to Coma.
  const loginCopy = {
    eyebrow:
      dbRow?.loginEyebrowTemplate ||
      codeBrand?.loginEyebrowTemplate ||
      fallbackCodeBrand.loginEyebrowTemplate,
    headline:
      dbRow?.loginHeadlineTemplate ||
      codeBrand?.loginHeadlineTemplate ||
      fallbackCodeBrand.loginHeadlineTemplate,
    subtitle:
      dbRow?.loginSubtitle ||
      codeBrand?.loginSubtitle ||
      fallbackCodeBrand.loginSubtitle,
    formHeading:
      dbRow?.loginFormHeading ||
      codeBrand?.loginFormHeading ||
      fallbackCodeBrand.loginFormHeading,
    formSubheading:
      dbRow?.loginFormSubheadingTemplate ||
      codeBrand?.loginFormSubheadingTemplate ||
      fallbackCodeBrand.loginFormSubheadingTemplate,
    footerCredit:
      dbRow?.footerCredit || codeBrand?.footerCredit || fallbackCodeBrand.footerCredit,
  };

  return {
    slug,
    displayName: dbRow?.displayName || codeBrand?.displayName || fallbackCodeBrand.displayName,
    status: (dbRow?.status as "DRAFT" | "ACTIVE") || "DRAFT",
    parentBrandSlug: parentSlug,
    palette,
    assets: {
      logoUrl: logoRes.url,
      heroBannerUrl: heroRes.url,
      faviconUrl: faviconRes.url,
      emailLogoUrl: emailLogoRes.url,
      mascotImageUrl: mascotRes.url,
      brandBookUrl: brandBookRes.url,
    },
    mascot: {
      name: dbRow?.mascotName ?? null,
      backstory: dbRow?.mascotBackstory ?? null,
    },
    loginCopy,
    provenance: {
      logoUrl: logoRes.provenance,
      heroBannerUrl: heroRes.provenance,
      faviconUrl: faviconRes.provenance,
      emailLogoUrl: emailLogoRes.provenance,
      mascotImageUrl: mascotRes.provenance,
      brandBookUrl: brandBookRes.provenance,
    },
    dbRowExists: !!dbRow,
  };
}

// ── Helpers for client-side mockup components ─────────────────────────────

/**
 * Given a BrandAssets object, return the AI-Salon-style branding asset
 * URL map used by the mockup canvases (speaker-intro, meet-the-speaker,
 * agenda, event-profile).
 *
 * This bridges the new BrandAssets shape into the existing
 * `resolveBrandingImageUrl()` API in
 * `src/app/admin/mockups/shared/brand-assets.ts`.
 *
 * Client components can call this synchronously after fetching the
 * BrandAssets from /api/brand-assets/[brandSlug].
 */
export function toMockupBrandingUrls(assets: BrandAssets): {
  logoLightUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  loginHeroUrl: string;
  mascotUrl: string;
} {
  // For mockups, "logoLight" + "logoDark" both map to the brand's
  // logoUrl (the new funnel doesn't distinguish light/dark variants
  // yet — admin can upload two distinct files if needed in round 2).
  return {
    logoLightUrl: assets.assets.logoUrl,
    logoDarkUrl: assets.assets.logoUrl,
    faviconUrl: assets.assets.faviconUrl,
    loginHeroUrl: assets.assets.heroBannerUrl,
    mascotUrl: assets.assets.mascotImageUrl,
  };
}

/**
 * Whether a given asset is "owned" by the brand (uploaded to its Brand
 * row) vs. inherited from a fallback.
 *
 * Used by the onboarding hub to show "✓ uploaded" vs "⚠ using Coma
 * fallback — upload your own" badges per tile.
 */
export function isAssetOwned(
  assets: BrandAssets,
  key: AssetKey,
): boolean {
  return assets.provenance[key] === "brand-row";
}
