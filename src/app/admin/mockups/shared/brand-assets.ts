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
 *   2. Else if `theme === "light"`, use BRAND_LOGO_LIGHT_URL.
 *   3. Else if `theme === "dark"`, use BRAND_LOGO_DARK_URL.
 *   4. Else (no theme, no imageUrl), fall back to the dark logo (the
 *      "new" AI Salon logo per TSK-0035, previously the default across
 *      all mockups).
 */
export function resolveBrandingImageUrl(
  brandingAsset: { imageUrl?: string; theme?: "light" | "dark" } | undefined,
  fallbackUrl: string = BRAND_LOGO_DARK_URL,
): string {
  if (brandingAsset?.imageUrl) return brandingAsset.imageUrl;
  if (brandingAsset?.theme === "light") return BRAND_LOGO_LIGHT_URL;
  if (brandingAsset?.theme === "dark") return BRAND_LOGO_DARK_URL;
  return fallbackUrl;
}
