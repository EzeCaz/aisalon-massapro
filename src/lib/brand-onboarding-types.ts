/**
 * Shared types for the brand lead onboarding form.
 *
 * Used by:
 *   - src/app/api/admin/brands/send-onboarding/route.ts (creates invite)
 *   - src/app/api/brand-onboarding/[token]/route.ts (GET form meta, POST submission)
 *   - src/app/brand-onboarding/[token]/page.tsx (public form page)
 *   - src/app/brand-onboarding/[token]/brand-onboarding-form.tsx (client form)
 *   - src/app/admin/brands/page.tsx (admin review)
 *
 * Mirrors the chapter-onboarding pattern. Skipped fields inherit from
 * Coma (the platform parent brand) at provision time — see
 * `provisionBrandFromSubmission` in src/lib/brand-provision.ts.
 */
export type BrandOnboardingFormData = {
  // ─── Section 1: Brand Basics ───────────────────────────────────────
  brandName: string;
  brandSlug: string;
  /** Short tagline shown under the wordmark on login + footer.
   *  When skipped, inherits from Coma ("Building the Operating System
   *  for Communities"). */
  tagline?: string;
  /** Lowercase wordmark shown in the header (e.g. "danone", "hitechai").
   *  When skipped, defaults to the lowercased brandName. */
  wordmark?: string;

  // ─── Section 2: Color palette ─────────────────────────────────────
  /** Primary brand color (hex, e.g. "#0A1F44"). Skipped → Coma's primary. */
  primaryColor?: string;
  /** Secondary accent (hex). Skipped → Coma's secondary. */
  secondaryColor?: string;
  /** Accent color (hex). Skipped → Coma's accent. */
  accentColor?: string;
  /** CSS gradient string (e.g. "linear-gradient(...)"). Skipped →
   *  Coma's gradient. */
  gradient?: string;

  // ─── Section 3: Brand assets (URLs) ────────────────────────────────
  /** Wide hero banner PNG (login left panel). Skipped → Coma's heroBanner. */
  heroBannerUrl?: string;
  /** Favicon (browser tab icon). Skipped → Coma's favicon. */
  faviconUrl?: string;
  /** Square logo mark. Skipped → text wordmark is used instead. */
  logoUrl?: string;
  /** Email header logo. Skipped → favicon or text wordmark fallback. */
  emailLogoUrl?: string;

  // ─── Section 3b: Mascot (optional character) ───────────────────────
  /** Mascot character name (e.g. "Falafel Meerkat"). Skipped → no mascot;
   *  the brand renders with a text wordmark only. */
  mascotName?: string;
  /** Mascot image URL (PNG/SVG). Skipped → no mascot image rendered. */
  mascotImageUrl?: string;
  /** 1-2 sentence backstory shown on the about/branding page. */
  mascotBackstory?: string;

  // ─── Section 3c: Brand book / style guide ──────────────────────────
  /** URL to the brand's full style guide (PDF/DOC/Figma). Super Admin
   *  references this when reviewing the application + provisioning. */
  brandBookUrl?: string;

  // ─── Section 4: Login copy ─────────────────────────────────────────
  /** Eyebrow template above the H1 on /login. Skipped → "{brandName} community"
   *  (matches Coma + AIS today). */
  loginEyebrowTemplate?: string;
  /** H1 template. Skipped → Coma's headline template with {brandName}
   *  interpolated. */
  loginHeadlineTemplate?: string;
  /** Plain text subtitle below the H1. Skipped → derived from tagline. */
  loginSubtitle?: string;
  /** Form heading (e.g. "Welcome to Danone"). Skipped → "Welcome to {brandName}". */
  loginFormHeading?: string;
  /** Form subheading template. Skipped → Coma's template. */
  loginFormSubheadingTemplate?: string;
  /** Footer credit text on login. Skipped → "Platform by MassaPro · Powered by {brandName}". */
  footerCredit?: string;

  // ─── Section 5: Email config ──────────────────────────────────────
  /** From: header for transactional emails (e.g. "Danone <noreply@danone.com>").
   *  Skipped → "Coma <coma@massapro.com>" (platform default). */
  emailFromName?: string;
  /** Reply-To / contact email. Skipped → "coma@massapro.com". */
  emailContactEmail?: string;

  // ─── Section 6: Domain architecture ────────────────────────────────
  /** Apex domain (e.g. "platform.joincoma.com"). New brands live on
   *  platform.joincoma.com with ?brand=<slug> for identity — so this
   *  is informational only. Skipped → "platform.joincoma.com". */
  apexDomain?: string;
  /** Domain architecture: "single" (default) or "split" (legacy). */
  domainArchitecture?: "single" | "split";

  // ─── Section 7: Lead info ──────────────────────────────────────────
  leadName: string;
  leadEmail: string; // mirrors inviteeEmail at invite time; the form can correct it
  leadPhone?: string;
  leadRole?: string;
  leadLinkedinUrl?: string;

  // ─── Section 8: Launch plan ────────────────────────────────────────
  /** When does the brand want to launch their first chapter? */
  targetLaunchDate?: string; // YYYY-MM-DD
  /** Which city will the first chapter be in? */
  firstChapterCity?: string;
  /** Which country? ISO 3166-1 alpha-2 code (e.g. "FR", "CA", "IL"). */
  firstChapterCountryCode?: string;
  /** Free-text launch plan notes. */
  launchNotes?: string;

  // ─── Section 9: Additional notes ───────────────────────────────────
  operationalNotes?: string;
  partnershipOpportunities?: string;
  openQuestions?: string;
};

/** Metadata returned by GET /api/brand-onboarding/[token] — tells the
 *  form page who the invite is for + whether it's still valid. */
export type BrandOnboardingInviteMeta = {
  token: string;
  status: "PENDING" | "SUBMITTED" | "EXPIRED" | "REVOKED";
  inviteeEmail: string;
  prefillBrandName: string | null;
  prefillBrandSlug: string | null;
  expiresAt: string; // ISO
  submittedAt: string | null;
  openedAt: string | null;
  /** Only present when status === "SUBMITTED" — lets the form page show
   *  a "you already submitted" view with the data. */
  submission?: BrandOnboardingFormData;
};

/** Common IANA timezones for the dropdown. */
export const COMMON_TIMEZONES = [
  "Asia/Jerusalem",
  "America/Montreal",
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/Athens",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
] as const;

/** Generate an unguessable token for the invite URL. */
export function generateOnboardingToken(): string {
  // 32 bytes of randomness → base64url → ~43 chars. Sufficient for a
  // non-guessable URL token (256 bits of entropy).
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Common ISO 3166-1 alpha-2 country codes — for the first chapter
 *  country dropdown. Mirrors the chapter-onboarding country list. */
export const COMMON_COUNTRIES = [
  { code: "IL", name: "Israel" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "ES", name: "Spain" },
  { code: "PT", name: "Portugal" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "JP", name: "Japan" },
  { code: "AU", name: "Australia" },
  { code: "ZA", name: "South Africa" },
] as const;
