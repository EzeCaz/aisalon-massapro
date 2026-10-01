/**
 * Centralized brand-asset URL constants for the AI Salon mockups.
 *
 * PER USER SPEC 2026-08-02: Two logo variants are now available — a "light
 * theme" logo (for light/white canvas backgrounds) and a "dark theme" logo
 * (for dark canvas backgrounds). Each mockup's `brandingAsset.theme` field
 * controls which one is rendered.
 *
 * The same URLs are also used as the global brand defaults (see
 * `src/lib/site-settings.ts`) and may be overridden per chapter via the
 * ChapterSetting table (see `src/lib/chapter-brand-images.ts`).
 */

/**
 * The AI Salon logo variant designed for LIGHT-theme canvases
 * (white/light backgrounds). Rendered when `brandingAsset.theme === "light"`.
 * This is the "logo for light theme" per the user spec — i.e. the logo
 * variant that looks correct on a light/white background.
 */
export const BRAND_LOGO_LIGHT_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png";

/**
 * The AI Salon logo variant designed for DARK-theme canvases
 * (dark backgrounds). Rendered when `brandingAsset.theme === "dark"`.
 * This is the "logo for dark themes" per the user spec — i.e. the logo
 * variant that looks correct on a dark background.
 */
export const BRAND_LOGO_DARK_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785506059156-4chc96.png";

/**
 * Global favicon URL (used as the SiteSetting default for `favicon`).
 * PER USER SPEC 2026-08-02: applies to all chapters and countries unless
 * a chapter-level override exists in ChapterSetting.
 */
export const BRAND_FAVICON_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393850874-uwkddr.webp";

/**
 * Global login hero image URL (used as the SiteSetting default for
 * `loginHero`). PER USER SPEC 2026-08-02: applies to all chapters and
 * countries unless a chapter-level override exists.
 */
export const BRAND_LOGIN_HERO_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785654449284-sqq083.png";

/**
 * Tel Aviv chapter — login hero override.
 * PER USER SPEC 2026-08-02: Tel Aviv has its own login hero distinct from
 * the global default.
 */
export const TEL_AVIV_LOGIN_HERO_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393632010-jeorqc.png";

/**
 * Tel Aviv chapter — login banner override.
 * PER USER SPEC 2026-08-02: Tel Aviv has its own login banner distinct
 * from the global default.
 */
export const TEL_AVIV_LOGIN_BANNER_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg";

/**
 * Resolve a brandingAsset's effective imageUrl based on its `theme` field.
 *
 * Resolution order:
 *   1. If `imageUrl` is explicitly set on the brandingAsset, use it as-is
 *      (admin override — highest priority).
 *   2. If `brandSlug` is provided AND is NOT "aisalon", return the Coma
 *      logo URL (for non-AIS brands, the AIS hardcoded URLs are wrong).
 *   3. Else if `theme === "light"`, use BRAND_LOGO_LIGHT_URL.
 *   4. Else if `theme === "dark"`, use BRAND_LOGO_DARK_URL.
 *   5. Else (no theme, no imageUrl), fall back to the dark logo (the
 *      "new" AI Salon logo per TSK-0035, previously the default across
 *      all mockups).
 *
 * @param brandingAsset — the per-mockup-element override (unchanged API)
 * @param fallbackUrl — legacy fallback (defaults to BRAND_LOGO_DARK_URL)
 * @param brandSlug — optional brand slug. When "aisalon" or null/undefined,
 *                   the legacy AIS URLs are used (layers 3-4). When any
 *                   other slug ("coma", "ch", "cazhype", ...), the Coma
 *                   logo is used instead (so non-AIS brands don't get the
 *                   AIS meerkat hardcoded logo). Issue 6 fix (2026-09-30).
 */
export function resolveBrandingImageUrl(
  brandingAsset: { imageUrl?: string; theme?: "light" | "dark" } | undefined,
  fallbackUrl: string = BRAND_LOGO_DARK_URL,
  brandSlug?: string | null,
): string {
  // Layer 1: explicit admin override
  if (brandingAsset?.imageUrl) return brandingAsset.imageUrl;

  // Layer 2: brand-aware fallback. For non-AIS brands, use the Coma logo
  // instead of the AIS hardcoded URLs. This fixes the issue where every
  // mockup canvas showed the AIS meerkat logo for cazhype (and any other
  // non-AIS brand) even after the brand admin uploaded their own logo.
  // The brandingAsset.imageUrl layer above handles the "brand has uploaded
  // a logo" case (set by buildSampleData). This layer handles the
  // "brandingAsset has no imageUrl but the brand isn't AIS" case — which
  // happens when the editor loads from localStorage (old cached state
  // without the imageUrl field set by buildSampleData).
  if (brandSlug && brandSlug !== "aisalon") {
    // Non-AIS brand with no explicit imageUrl → use the Coma logo as the
    // placeholder. The brand admin can override per-mockup via the
    // "Edit images" mode in the editor.
    return COMA_LOGO_FALLBACK_URL;
  }

  // Layer 3-4: legacy AIS default (theme-based logo)
  if (brandingAsset?.theme === "light") return BRAND_LOGO_LIGHT_URL;
  if (brandingAsset?.theme === "dark") return BRAND_LOGO_DARK_URL;
  return fallbackUrl;
}

// Coma logo URL for non-AIS fallback. Uses the Coma brand-config logo.
const COMA_LOGO_FALLBACK_URL = "/brand/coma/logo.png";

// ── Brand-aware asset resolution (cazhype onboarding funnel, 2026-09-29) ──
//
// The constants above are hardcoded AIS URLs. When a new brand (cazhype,
// danone, hitechai, ...) is provisioned via /onboarding/[brandSlug],
// mockups should pull the brand's own logo/hero/mascot URLs from the
// Brand DB row instead of always rendering AIS visuals.
//
// This export adds a brand-aware resolver that mockup canvases can opt
// into. Existing callers keep working — only callers that pass a
// `brandAssets` context switch behavior. This is a backward-compatible
// bridge so we can migrate canvases one at a time without a big-bang.
//
// Resolution rule (when brandAssets is provided):
//   1. brandingAsset.imageUrl (admin override on a specific mockup element)
//   2. brandAssets.assets.<role>Url (the brand's uploaded asset)
//   3. BRAND_LOGO_LIGHT_URL / BRAND_LOGO_DARK_URL (legacy AIS default)
//
// `role` maps the brandingAsset's role to the Brand DB column:
//   - "logo"  → brandAssets.assets.logoUrl
//   - "hero"  → brandAssets.assets.heroBannerUrl
//   - "mascot"→ brandAssets.assets.mascotImageUrl
//   - default → use the theme-based logo URL (existing behavior)
//
// See src/lib/brand/brand-assets-resolver.ts for the BrandAssets shape
// and src/app/onboarding/[brandSlug]/page.tsx for the admin upload flow.

import type { BrandAssets as ResolvedBrandAssets } from "@/lib/brand/brand-assets-resolver";

export type BrandAssetRole = "logo" | "hero" | "mascot" | "favicon" | "emailLogo";

/**
 * Resolve a brandingAsset's image URL with optional brand-DB context.
 *
 * @param brandingAsset — the per-mockup-element override (unchanged API)
 * @param opts — optional { brandAssets, role } — pass to make the resolver
 *              brand-aware; omit to get the legacy AIS-only behavior
 */
export function resolveBrandingImageUrlBrand(
  brandingAsset: { imageUrl?: string; theme?: "light" | "dark" } | undefined,
  opts: {
    brandAssets?: ResolvedBrandAssets;
    role?: BrandAssetRole;
  } = {},
): string {
  // Layer 1: per-element admin override
  if (brandingAsset?.imageUrl) return brandingAsset.imageUrl;

  // Layer 2: brand-DB asset (only if brandAssets is passed + role maps)
  if (opts.brandAssets && opts.role) {
    const brandUrl = (() => {
      switch (opts.role) {
        case "logo":
          return opts.brandAssets.assets.logoUrl;
        case "hero":
          return opts.brandAssets.assets.heroBannerUrl;
        case "mascot":
          return opts.brandAssets.assets.mascotImageUrl;
        case "favicon":
          return opts.brandAssets.assets.faviconUrl;
        case "emailLogo":
          return opts.brandAssets.assets.emailLogoUrl;
      }
    })();
    if (brandUrl) return brandUrl;
  }

  // Layer 3: legacy AIS default (theme-based logo)
  if (brandingAsset?.theme === "light") return BRAND_LOGO_LIGHT_URL;
  if (brandingAsset?.theme === "dark") return BRAND_LOGO_DARK_URL;
  return BRAND_LOGO_DARK_URL;
}

/**
 * Whether a brand's mascot should render on a given mockup.
 * Returns false when the brand has no mascot (so the canvas can skip
 * the mascot block entirely instead of rendering an empty square).
 */
export function hasMascot(brandAssets?: ResolvedBrandAssets): boolean {
  return !!brandAssets && !!brandAssets.assets.mascotImageUrl;
}

