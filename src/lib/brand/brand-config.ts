/**
 * Brand configuration registry.
 *
 * Each brand that the platform serves (currently `aisalon` and `coma`) has
 * an entry here. The entry is the single source of truth for:
 *
 *   - Brand slug (canonical identifier used in URLs, env vars, and DB rows)
 *   - Display name (shown in copy)
 *   - Wordmark styling (font, lowercase vs mixed case, tagline)
 *   - Color palette (primary, accent, gradients)
 *   - Login page copy (eyebrow template, headline template, subtitle)
 *   - Default chapter slug when none is provided
 *
 * Per the Brand-Field Platform Plan §2.5.1 (Login URL Contract):
 *
 *   - `coma.massapro.com`  → defaults to brand `coma`
 *   - `aisalon.massapro.com` → defaults to brand `aisalon`
 *   - `?brand=<slug>` URL parameter overrides the host default
 *
 * The brand registry is a static code-level config (not DB-driven) because
 * brand identity is a one-time creative decision, not a runtime value that
 * admins should edit. New brands are added by appending to BRANDS below.
 *
 * SECURITY:
 *   - Reads are safe to call from PUBLIC routes (no auth check). Returns
 *     only display config — never secrets.
 *   - The brand resolution chain (resolve-brand.ts) consumes this registry
 *     and returns a single BrandConfig to the renderer.
 */

/**
 * Canonical brand slug. Each brand has a unique lowercase slug used in:
 *   - URL `?brand=<slug>` override
 *   - Environment variable `BRAND_DEFAULT_SLUG`
 *   - Host→brand mapping (BRAND_HOST_MAP)
 *   - DB `Brand.slug` column (when the Brand table is added)
 */
export type BrandSlug = "aisalon" | "coma";

/**
 * Static brand configuration entry.
 *
 * All visual + copy parameters for one brand. The login page reads from
 * this object to decide colors, copy, logo, and default chapter.
 */
export interface BrandConfig {
  slug: BrandSlug;
  /** Display name shown in titles, copy, and metadata. */
  displayName: string;
  /**
   * Default chapter slug when the URL has no `?chapterSlug=` parameter.
   *
   * Different brands have different "home" chapters:
   *   - AI Salon → Tel Aviv (the original AIS chapter)
   *   - Coma → Tel Aviv (Coma's first chapter, same physical city but
   *     organized under the Coma brand)
   *
   * This default is informational only — the URL contract allows any
   * brand to be paired with any chapterSlug (e.g. `?brand=coma&chapterSlug=mtl`
   * for a Coma-branded Montreal login).
   */
  defaultChapterSlug: string;

  /** Wordmark text shown in the logo. Lowercase by convention ("aisalon", "coma"). */
  wordmark: string;
  /** Tagline shown beneath/after the wordmark on login + marketing pages. */
  tagline: string;

  /** Primary brand color (used for buttons, links, focus rings). */
  primaryColor: string;
  /** Accent color (used for eyebrow text, highlights, decorative orbs). */
  accentColor: string;
  /** Secondary accent (used in gradients). */
  secondaryColor: string;
  /** Decorative gradient used on login left-panel orbs + wordmark spans. */
  gradient: string;

  /**
   * Brand-level hero banner image — the primary visual on the login page's
   * brand panel.
   *
   * Resolution chain (highest precedence first):
   *   1. `brand.heroBanner` (this field) — brand-level canonical visual.
   *      Applied uniformly across ALL chapters of that brand (a Coma user
   *      in Montreal sees the same Coma banner as a Coma user in Tel Aviv).
   *      This is the whole point of brand identity: one consistent visual
   *      per brand, regardless of chapter.
   *   2. Chapter DB override (`ChapterSetting.loginHero`) — admin can
   *      upload a chapter-specific hero photo. Only kicks in when the
   *      brand has no heroBanner (e.g. AIS today, which still uses
   *      per-chapter photos until a proper AIS brand hero is produced).
   *   3. Hard-coded fallback `/images/falafel-meerkat.jpg` — only fires
   *      when both the brand default and the chapter override are absent.
   *
   * Empty string means "no brand-level hero — fall back to the next tier".
   * This is used by AIS, which keeps the legacy falafel-meerkat fallback
   * until a proper AIS brand hero is produced.
   *
   * The image is rendered as a wide banner (aspect-[3/2]) — NOT a square.
   * It should be a landscape transparent PNG (artwork/logo on transparent
   * background) so it floats on the brand-colored panel without a card.
   */
  heroBanner: string;

  /**
   * Login page eyebrow template.
   * `{chapterName}` is replaced at render time.
   */
  loginEyebrowTemplate: string;
  /**
   * Login page H1 template.
   * `{chapterName}` is replaced at render time.
   * `{accentSpanOpen}` / `{accentSpanClose}` wrap the gradient-highlighted phrase.
   */
  loginHeadlineTemplate: string;
  /** Login page subtitle (below H1). Plain text, no templates. */
  loginSubtitle: string;

  /** Sign-in form heading (e.g. "Welcome"). */
  loginFormHeading: string;
  /** Sign-in form subheading (under "Welcome"). */
  loginFormSubheadingTemplate: string;

  /** Footer credit text on the login left panel. */
  footerCredit: string;
}

/**
 * The canonical brand registry.
 *
 * To add a new brand:
 *   1. Add a new entry to this object with a unique slug.
 *   2. Add the slug to the `BrandSlug` union type above.
 *   3. (Optional) Add a host mapping in BRAND_HOST_MAP below.
 *   4. (Optional) Create a brand-specific logo component if the wordmark
 *      needs custom SVG.
 */
export const BRANDS: Record<BrandSlug, BrandConfig> = {
  aisalon: {
    slug: "aisalon",
    displayName: "AI Salon",
    defaultChapterSlug: "tel-aviv",
    wordmark: "aisalon",
    tagline: "Empowering AI Connections",
    primaryColor: "#004F98",
    accentColor: "#00E6FF",
    secondaryColor: "#FF005A",
    gradient:
      "conic-gradient(from 180deg at 50% 50%, #FF005A, #820A7D, #004F98, #00E6FF, #FF005A)",
    // AIS currently has no brand-level hero PNG — falls back to the
    // legacy /images/falafel-meerkat.jpg (the original AI Salon mark).
    // Replace with a proper AIS brand hero when one is produced.
    heroBanner: "",
    loginEyebrowTemplate: "{chapterName} Chapter",
    loginHeadlineTemplate:
      "The community for {accentSpanOpen}AI builders{accentSpanClose} in {chapterName}.",
    loginSubtitle:
      "Log in to access events, upload photos from our gatherings, browse the shared slideshow, and connect with fellow founders, CMOs, investors and AI builders.",
    loginFormHeading: "Welcome",
    loginFormSubheadingTemplate:
      "Sign in with Google, or use your email and password to access the AI Salon {chapterName} community.",
    footerCredit: "Platform by MassaPro · Powered by AI Salon",
  },

  coma: {
    slug: "coma",
    displayName: "Coma",
    defaultChapterSlug: "tel-aviv",
    wordmark: "coma",
    tagline: "Building the Operating System for Communities",
    // Coma brand palette: deep institutional navy + warm amber accent +
    // warm secondary (institutional but energetic — fits a parent brand
    // that sits ABOVE sub-brands like AIS).
    primaryColor: "#0A1F44",
    accentColor: "#F5A623",
    secondaryColor: "#E84855",
    gradient:
      "conic-gradient(from 180deg at 50% 50%, #E84855, #0A1F44, #F5A623, #E84855)",
    // Coma brand hero — transparent PNG (1536×1024, 3:2 landscape).
    // Artwork floats directly on the navy brand panel (no card frame).
    // Source: /upload/Coma 2 trans.png → copied to /public/brand/coma/coma-hero.png.
    heroBanner: "/brand/coma/coma-hero.png",
    loginEyebrowTemplate: "{chapterName} Chapter",
    loginHeadlineTemplate:
      "The home for {accentSpanOpen}community builders{accentSpanClose} in {chapterName}.",
    loginSubtitle:
      "Log in to access the Coma platform — manage your chapter, host events, onboard new members, and orchestrate your community's growth with the Coma operating system.",
    loginFormHeading: "Welcome to Coma",
    loginFormSubheadingTemplate:
      "Sign in with Google, or use your email and password to access the Coma {chapterName} platform.",
    footerCredit: "Platform by MassaPro · Powered by Coma",
  },
};

/**
 * Hostname → brand slug mapping.
 *
 * Used by the brand resolution chain (resolve-brand.ts) to determine the
 * default brand based on the request's Host header. The mapping is checked
 * against the hostname (case-insensitive, port-stripped).
 *
 * Per the Brand-Field Platform Plan §2.5.2 (Host-Based Brand Defaults):
 *
 *   - coma.massapro.com    → coma
 *   - aisalon.massapro.com → aisalon
 *
 * Any other host falls back to BRAND_DEFAULT_SLUG from env, or "aisalon"
 * as the hard-coded last-resort default.
 */
export const BRAND_HOST_MAP: Record<string, BrandSlug> = {
  "coma.massapro.com": "coma",
  "aisalon.massapro.com": "aisalon",
  // Local dev aliases (so brand resolution works against localhost:3000
  // with explicit Host headers, or when testing via /etc/hosts).
  "coma.local": "coma",
  "aisalon.local": "aisalon",
};

/**
 * Environment variable name for the platform-wide default brand.
 *
 * Set `BRAND_DEFAULT_SLUG=coma` or `BRAND_DEFAULT_SLUG=aisalon` to control
 * what brand is shown when the host doesn't match BRAND_HOST_MAP and no
 * `?brand=` URL parameter is present.
 */
export const BRAND_DEFAULT_SLUG_ENV = "BRAND_DEFAULT_SLUG";

/**
 * Hard-coded last-resort default brand (used when BRAND_DEFAULT_SLUG env
 * var is not set AND the host doesn't match BRAND_HOST_MAP).
 *
 * Defaults to "aisalon" to preserve backwards compatibility with the
 * original platform (which was AI Salon-only before Coma was added).
 */
export const FALLBACK_DEFAULT_BRAND: BrandSlug = "aisalon";

/**
 * Get a BrandConfig by slug. Returns the AIS brand (platform default)
 * if the slug is unknown — this is a defensive fallback that should
 * never fire in normal operation but prevents crashes if a stale
 * `?brand=` parameter references a deleted brand.
 */
export function getBrandConfig(slug: string): BrandConfig {
  if (isBrandSlug(slug)) {
    return BRANDS[slug];
  }
  return BRANDS[FALLBACK_DEFAULT_BRAND];
}

/** Type guard: is the given string a valid BrandSlug? */
export function isBrandSlug(s: string): s is BrandSlug {
  return s === "aisalon" || s === "coma";
}
