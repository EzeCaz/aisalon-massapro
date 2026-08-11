/**
 * Brand-aware email rendering context.
 *
 * Resolves a BrandConfig into the set of values that transactional
 * email templates need to render correctly for a specific brand:
 *
 *   - Wordmark (e.g. "coma", "aisalon")
 *   - Display name (e.g. "Coma", "AI Salon")
 *   - Tagline ("Building the Operating System for Communities" / "Empowering AI Connections")
 *   - Primary + accent colors (for the password box, buttons, gradient banners)
 *   - From name + email address (e.g. "Coma <noreply@coma.massapro.com>")
 *   - Site URL (e.g. "https://coma.massapro.com")
 *   - Login URL (with the right ?brand= param so the brand sticks)
 *
 * WHY THIS EXISTS:
 *   Before this module, every transactional email hardcoded "AI Salon",
 *   "Tel Aviv", pink (#FF005A) + cyan (#00E6FF) colors, and
 *   "aisalon.massapro.com" URLs. A Coma user who signed up via the
 *   Coma-branded login page received an "AI Salon Tel Aviv" password
 *   email — broken brand experience.
 *
 *   This module lets `sendPasswordEmail`, `sendRsvpConfirmationEmail`,
 *   and the orchestrator templates branch on the brand slug and render
 *   the correct wordmark, colors, and copy per brand.
 *
 * USAGE:
 *   import { resolveEmailBrandContext } from "@/lib/email-brand-context";
 *
 *   const ctx = resolveEmailBrandContext("coma");
 *   // ctx.wordmark === "coma"
 *   // ctx.displayName === "Coma"
 *   // ctx.primaryColor === "#0A1F44"
 *   // ctx.fromName === "Coma <noreply@coma.massapro.com>"
 */

import { BRANDS, isBrandSlug, FALLBACK_DEFAULT_BRAND, type BrandSlug } from "@/lib/brand/brand-config";

export interface EmailBrandContext {
  /** Brand slug (e.g. "coma", "aisalon"). */
  slug: BrandSlug;
  /** Lowercase wordmark string (e.g. "coma"). */
  wordmark: string;
  /** Display name in Title Case (e.g. "Coma"). */
  displayName: string;
  /** Tagline shown in email footers. */
  tagline: string;
  /** Primary brand color (hex) — used for buttons, links, password box borders. */
  primaryColor: string;
  /** Accent color (hex) — used for highlights, eyebrow text. */
  accentColor: string;
  /** Secondary color (hex) — used in gradient banners. */
  secondaryColor: string;
  /** CSS gradient for hero banners / button backgrounds. */
  gradient: string;
  /** From: header for transactional emails. */
  fromName: string;
  /** Login URL (with brand param appended). */
  loginUrl: string;
  /** Site URL (no trailing slash). */
  siteUrl: string;
  /** Footer credit text — shown at the bottom of every email. */
  footerCredit: string;
  /** Contact email address (for "reply to this email" copy). */
  contactEmail: string;
}

/**
 * Resolve an EmailBrandContext from a brand slug.
 *
 * Falls back to the platform default brand (aisalon) if the slug is
 * unknown or null — this preserves backwards compatibility for legacy
 * users who have no brandSlug on their row.
 *
 * The site URLs are derived from the brand slug:
 *   - coma    → https://coma.massapro.com
 *   - aisalon → https://aisalon.massapro.com
 *
 * The From: address uses the brand's domain so emails pass SPF/DKIM
 * alignment (assuming the brand's DNS is configured). If SMTP_FROM is
 * set in the env, the caller can override `fromName` — but the default
 * is the brand-specific address.
 */
export function resolveEmailBrandContext(
  brandSlug: string | null | undefined
): EmailBrandContext {
  const slug: BrandSlug = brandSlug && isBrandSlug(brandSlug)
    ? brandSlug
    : FALLBACK_DEFAULT_BRAND;
  const brand = BRANDS[slug];

  // Per-brand site + email config. These are hardcoded because they're
  // brand identity decisions, not runtime values — same as the brand
  // colors and wordmark.
  const brandSiteConfig: Record<BrandSlug, {
    siteUrl: string;
    fromName: string;
    contactEmail: string;
  }> = {
    coma: {
      siteUrl: "https://coma.massapro.com",
      fromName: "Coma <noreply@coma.massapro.com>",
      contactEmail: "team@coma.massapro.com",
    },
    aisalon: {
      siteUrl: "https://aisalon.massapro.com",
      fromName: "AI Salon <noreply@aisalon.massapro.com>",
      contactEmail: "aisalon@massapro.com",
    },
  };

  const site = brandSiteConfig[slug];
  // Login URL preserves the brand via ?brand= so the brand sticks even
  // when the user clicks through from an email on a different domain.
  // (e.g. a Coma email opened in Gmail links to aisalon.massapro.com/login?brand=coma
  // — without ?brand=coma, the host header would resolve to AIS.)
  const loginUrl = `${site.siteUrl}/login?brand=${slug}`;

  return {
    slug,
    wordmark: brand.wordmark,
    displayName: brand.displayName,
    tagline: brand.tagline,
    primaryColor: brand.primaryColor,
    accentColor: brand.accentColor,
    secondaryColor: brand.secondaryColor,
    gradient: brand.gradient,
    fromName: site.fromName,
    loginUrl,
    siteUrl: site.siteUrl,
    footerCredit: brand.footerCredit,
    contactEmail: site.contactEmail,
  };
}
