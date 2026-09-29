/**
 * Brand-aware mockup default URLs.
 *
 * Per user spec 2026-09-30:
 *   - All mockups still hardcode AIS imagery (the falafel-meerkat mascot,
 *     the AIS hero, the AIS logos for sponsors). When a non-AIS brand
 *     (Coma, Cazhype, etc.) is the active brand, these still render AIS
 *     visuals — which is wrong.
 *   - The fix: every mockup surface should default to **Coma** branding
 *     for any brand that isn't AIS. AIS keeps its existing visuals
 *     permanently (it's the grandfathered white-label).
 *   - When a brand uploads its own assets via /onboarding/[brandSlug],
 *     the mockups should switch from the Coma placeholder to the brand's
 *     uploaded assets (logo, hero, mascot) — for all mockups and all
 *     styles.
 *
 * This module centralizes that resolution. Sample-data files call
 * `getMockupDefaults(brandAssets)` to get the right URLs per brand,
 * and canvases call `resolveMockupBrandingUrl()` per image element
 * to layer the admin's per-element override on top.
 *
 * Resolution rule (per image):
 *   1. Per-element admin override (brandingAsset.imageUrl on the mockup
 *      data — the admin clicked "Edit images" and picked a new image)
 *   2. Brand's uploaded asset (brandAssets.assets.<key>Url — uploaded
 *      via the onboarding hub)
 *   3. AIS visual (only if brandSlug === "aisalon") — AIS keeps its
 *      grandfathered imagery permanently
 *   4. Coma visual (the platform parent brand — every other brand
 *      defaults here until they upload their own)
 *
 * Server-only. Reads from brand-config.ts (static) + accepts a
 * BrandAssets object (resolved from the Brand DB row by the caller).
 * Client components receive the resolved URLs via props.
 */

import { BRANDS } from "@/lib/brand/brand-config";
import type { BrandAssets as ResolvedBrandAssets } from "@/lib/brand/brand-assets-resolver";

// ── Static AIS + Coma constants (lifted from brand-config.ts) ────────────
// We mirror them here so mockup sample-data files can import them without
// a circular dependency on brand-assets.ts (which itself imports from
// brand-assets-resolver).

/** AIS logo for light-theme canvases (legacy, kept for AIS only). */
export const AIS_LOGO_LIGHT_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png";

/** AIS logo for dark-theme canvases (legacy, kept for AIS only). */
export const AIS_LOGO_DARK_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785506059156-4chc96.png";

/** AIS favicon. */
export const AIS_FAVICON_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393850874-uwkddr.webp";

/** AIS login hero image (square mascot panel). */
export const AIS_LOGIN_HERO_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785654449284-sqq083.png";

/** AIS Tel Aviv chapter login hero. */
export const AIS_TEL_AVIV_LOGIN_HERO_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393632010-jeorqc.png";

/** AIS Tel Aviv chapter login banner. */
export const AIS_TEL_AVIV_LOGIN_BANNER_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg";

/** AIS mascot (falafel meerkat). */
export const AIS_MASCOT_URL = "https://aisalon.massapro.com/images/falafel-meerkat.png";

/** AIS Tel Aviv skyline (used by agenda-profile + meet-the-speaker hero). */
export const AIS_TLV_SKYLINE_URL = "https://aisalon.massapro.com/images/TLV-2.jpg";

// ── Coma static fallback URLs (mirror brand-config.ts → BRANDS.coma) ─────

const COMA_BRAND = BRANDS.coma;
export const COMA_LOGO_URL = COMA_BRAND.logo || "/brand/coma/logo.png";
export const COMA_HERO_BANNER_URL = COMA_BRAND.heroBanner;
export const COMA_FAVICON_URL = COMA_BRAND.favicon || "/brand/coma/favicon-32.png";
export const COMA_LOGIN_HERO_URL = COMA_BRAND.heroBanner;
// Coma has no mascot — see hasComaMascot() below.
export const COMA_MASCOT_URL = ""; // empty = no mascot block
// Coma has no Tel-Aviv skyline either; reuse hero banner as the
// generic "city skyline" fallback for non-AIS brands.
export const COMA_CITY_SKYLINE_URL = COMA_BRAND.heroBanner;

// ── Resolution helpers ──────────────────────────────────────────────────

/**
 * Which set of brand defaults applies for a given brand slug.
 * AIS keeps its hardcoded visuals; every other brand defaults to Coma.
 */
function isAisBrand(brandSlug: string | undefined | null): boolean {
  return (brandSlug ?? "").toLowerCase() === "aisalon";
}

/**
 * The full set of mockup-relevant default URLs for a given brand.
 *
 * Sample-data files call this once at the top to populate the JSON
 * document. Canvases then call resolveMockupBrandingUrl() per image
 * element to layer admin overrides on top.
 *
 * @param brandAssets — the brand's resolved asset state (from
 *   resolveBrandAssets(brandSlug)). When provided, the brand's
 *   uploaded assets take precedence over AIS/Coma defaults.
 * @param brandSlug — explicit override (e.g. from ?brand= URL param).
 *   If omitted, falls back to brandAssets.slug. If both are null,
 *   defaults to Coma.
 */
export interface MockupDefaults {
  /** The active brand's slug ("cazhype" | "coma" | "aisalon" | ...). */
  slug: string;
  /** Display name ("Cazhype" | "Coma" | "AI Salon"). */
  displayName: string;
  /** Whether this brand is AIS (legacy visuals preserved). */
  isAis: boolean;
  /** Primary logo URL — used for sponsor logos, "in collaboration with" strips. */
  logoUrl: string;
  /** Hero banner — wide login-page hero. */
  heroBannerUrl: string;
  /** Login hero — square mascot panel. */
  loginHeroUrl: string;
  /** Favicon (browser tab). */
  faviconUrl: string;
  /** Mascot URL (empty string = no mascot block). */
  mascotUrl: string;
  /** City skyline URL — TLV skyline for AIS, generic hero for others. */
  citySkylineUrl: string;
  /** Speaker photo placeholder URL — what fills empty speaker slots. */
  speakerPhotoPlaceholderUrl: string;
  /** Sponsor logo placeholder — used for empty sponsor slots. */
  sponsorLogoPlaceholderUrl: string;
  /** Brand palette (hex strings + CSS gradient). */
  palette: {
    primary: string;
    accent: string;
    secondary: string;
    gradient: string;
  };
}

export function getMockupDefaults(
  brandAssets: ResolvedBrandAssets | null,
  brandSlug?: string | null,
): MockupDefaults {
  // Effective brand slug: explicit override > brandAssets.slug > "coma" fallback
  const effectiveSlug =
    (brandSlug && brandSlug.trim()) ||
    brandAssets?.slug ||
    "coma";
  const isAis = isAisBrand(effectiveSlug);

  // Step 1: resolve the per-asset URL through the chain:
  //   brand-row (uploaded) > AIS-default (if AIS) > Coma-default > empty
  const pickAsset = (
    brandRowUrl: string | undefined,
    aisUrl: string,
    comaUrl: string,
  ): string => {
    if (brandRowUrl && brandRowUrl.trim()) return brandRowUrl;
    if (isAis) return aisUrl;
    return comaUrl;
  };

  const brandRow = brandAssets?.assets;
  const logoUrl = pickAsset(brandRow?.logoUrl, AIS_LOGO_DARK_URL, COMA_LOGO_URL);
  const heroBannerUrl = pickAsset(
    brandRow?.heroBannerUrl,
    AIS_LOGIN_HERO_URL,
    COMA_HERO_BANNER_URL,
  );
  const loginHeroUrl = pickAsset(
    brandRow?.heroBannerUrl,
    AIS_TEL_AVIV_LOGIN_HERO_URL,
    COMA_LOGIN_HERO_URL,
  );
  const faviconUrl = pickAsset(brandRow?.faviconUrl, AIS_FAVICON_URL, COMA_FAVICON_URL);

  // Mascot: only render if the brand has one uploaded OR the brand is AIS.
  // Coma has no mascot → empty string → canvas skips the mascot block.
  let mascotUrl = "";
  if (brandRow?.mascotImageUrl && brandRow.mascotImageUrl.trim()) {
    mascotUrl = brandRow.mascotImageUrl;
  } else if (isAis) {
    mascotUrl = AIS_MASCOT_URL;
  }
  // else: empty (no mascot for Coma or non-AIS brands without an uploaded mascot)

  // City skyline: AIS uses the TLV skyline; everyone else uses their hero
  // banner as a generic "city" placeholder (the brand's uploaded hero IS
  // the closest visual they have to a "city skyline" until they upload
  // a chapter-specific city image).
  const citySkylineUrl = isAis
    ? AIS_TLV_SKYLINE_URL
    : heroBannerUrl;

  // Speaker photo placeholder: AIS uses the TLV login banner (legacy);
  // everyone else uses their brand hero banner.
  const speakerPhotoPlaceholderUrl = isAis
    ? AIS_TEL_AVIV_LOGIN_BANNER_URL
    : heroBannerUrl;

  // Sponsor logo placeholder: AIS uses its own logo; everyone else uses
  // their brand logo (so an empty sponsor slot shows the brand's mark
  // instead of AIS's).
  const sponsorLogoPlaceholderUrl = logoUrl;

  // Palette: prefer brand-row → AIS-static (if AIS) → Coma-static.
  const palette = {
    primary: brandAssets?.palette.primary || (isAis ? "#004F98" : COMA_BRAND.primaryColor),
    accent: brandAssets?.palette.accent || (isAis ? "#00E6FF" : COMA_BRAND.accentColor),
    secondary:
      brandAssets?.palette.secondary || (isAis ? "#FF005A" : COMA_BRAND.secondaryColor),
    gradient:
      brandAssets?.palette.gradient || (isAis
        ? "conic-gradient(from 180deg at 50% 50%, #FF005A, #820A7D, #004F98, #00E6FF, #FF005A)"
        : COMA_BRAND.gradient),
  };

  return {
    slug: effectiveSlug,
    displayName: brandAssets?.displayName || (isAis ? "AI Salon" : COMA_BRAND.displayName),
    isAis,
    logoUrl,
    heroBannerUrl,
    loginHeroUrl,
    faviconUrl,
    mascotUrl,
    citySkylineUrl,
    speakerPhotoPlaceholderUrl,
    sponsorLogoPlaceholderUrl,
    palette,
  };
}

/**
 * Per-image resolver — used by canvases when rendering a specific image
 * element (e.g. a sponsor logo, the hero, the mascot).
 *
 * Layer 1: explicit per-element override (brandingAsset.imageUrl on the
 *   mockup data — the admin clicked "Edit images" and picked a new image)
 * Layer 2: brand's uploaded asset (brandAssets.assets.<role>Url)
 * Layer 3: AIS visual (only if isAis)
 * Layer 4: Coma visual (default for non-AIS brands)
 *
 * @param brandingAsset — the per-element override on the mockup data
 * @param role — which Brand DB column this slot maps to
 * @param defaults — the pre-computed MockupDefaults for the brand
 */
export function resolveMockupBrandingUrl(
  brandingAsset: { imageUrl?: string } | undefined,
  role: "logo" | "hero" | "mascot" | "favicon" | "emailLogo" | "loginHero",
  defaults: MockupDefaults,
): string {
  // Layer 1: explicit admin override
  if (brandingAsset?.imageUrl && brandingAsset.imageUrl.trim()) {
    return brandingAsset.imageUrl;
  }
  // Layer 2-4: fall back to the pre-computed defaults for the role
  switch (role) {
    case "logo":
      return defaults.logoUrl;
    case "hero":
      return defaults.heroBannerUrl;
    case "loginHero":
      return defaults.loginHeroUrl;
    case "favicon":
      return defaults.faviconUrl;
    case "emailLogo":
      return defaults.logoUrl;
    case "mascot":
      return defaults.mascotUrl;
  }
}

/**
 * Whether the mascot block should render on a given mockup. False when
 * the brand has no mascot (Coma, or any non-AIS brand without an
 * uploaded mascot) — so canvases can skip the mascot block entirely
 * instead of rendering an empty image square.
 */
export function shouldRenderMascot(defaults: MockupDefaults): boolean {
  return !!defaults.mascotUrl;
}
