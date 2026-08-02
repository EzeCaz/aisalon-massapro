/**
 * Shared types for the chapter lead onboarding form.
 *
 * Used by:
 *   - src/app/api/admin/members/[id]/send-chapter-onboarding/route.ts (creates invite)
 *   - src/app/api/chapter-onboarding/[token]/route.ts (GET form meta, POST submission)
 *   - src/app/chapter-onboarding/[token]/page.tsx (public form page)
 *   - src/app/chapter-onboarding/[token]/chapter-onboarding-form.tsx (client form)
 *   - src/app/admin/chapter-onboarding/page.tsx (admin review)
 */

/** The full form submission, stored as `submissionJson` on
 *  `ChapterOnboardingInvite`. Mirrors the DOCX onboarding form fields. */
export type ChapterOnboardingFormData = {
  // ─── Section 1: Chapter Basics ─────────────────────────────────────
  chapterName: string;
  chapterSlug: string;
  country: string;
  city: string;
  timezone: string;

  // ─── Section 2: Contact channels (the "top 3" emphasized fields) ───
  whatsappGroupUrl: string;
  linkedinUrl: string;
  // Free-text "other socials" — admin will configure manually
  otherSocials?: string;

  // ─── Section 3: Languages & Audience ───────────────────────────────
  primaryLanguage: string;
  secondaryLanguage?: string;
  languageDisplayNames?: string;
  targetAudience: string[]; // multi-select: Founders, Investors, CMOs, ...
  audienceSeniority?: string;
  chapterTagline?: string;
  chapterDescription?: string;

  // ─── Section 4: Brand assets (URLs) ────────────────────────────────
  faviconUrl?: string;
  loginHeroUrl?: string;
  loginBannerUrl?: string;
  landingHeroUrl?: string;
  brandColorPrimary?: string;
  brandColorSecondary?: string;

  // ─── Section 5: Email config ───────────────────────────────────────
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  emailLogoUrl?: string;
  emailTemplateOverrides?: string; // free-text notes

  // ─── Section 6: Lead info ──────────────────────────────────────────
  leadName: string;
  leadEmail: string;
  leadPhone?: string;
  leadRole?: string;
  leadLinkedinUrl?: string;

  // ─── Section 7: Co-leads (free-text — admin will provision manually)
  coLeads?: string;

  // ─── Section 8: Launch plan ────────────────────────────────────────
  targetLaunchDate?: string; // YYYY-MM-DD
  firstEventDate?: string; // YYYY-MM-DD
  firstEventTitle?: string;
  firstEventVenue?: string;
  firstEventExpectedAttendance?: string;
  eventFrequency?: string;
  typicalEventDayTime?: string;
  typicalEventFormat?: string;

  // ─── Section 9: Additional notes ───────────────────────────────────
  operationalNotes?: string;
  culturalConsiderations?: string;
  partnershipOpportunities?: string;
  openQuestions?: string;
};

/** Metadata returned by GET /api/chapter-onboarding/[token] — tells the
 *  form page who the invite is for + whether it's still valid. */
export type ChapterOnboardingInviteMeta = {
  token: string;
  status: "PENDING" | "SUBMITTED" | "EXPIRED" | "REVOKED";
  inviteeEmail: string;
  inviteeName: string | null;
  prefillChapterName: string | null;
  prefillChapterSlug: string | null;
  expiresAt: string; // ISO
  submittedAt: string | null;
  openedAt: string | null;
  /** Only present when status === "SUBMITTED" — lets the form page show
   *  a "you already submitted" view with the data. */
  submission?: ChapterOnboardingFormData;
};

/** Audience options for the multi-select. Mirrors the DOCX list. */
export const AUDIENCE_OPTIONS = [
  "Founders & co-founders",
  "Investors (VC, angel, PE)",
  "CMOs & marketing leaders",
  "Product managers",
  "Engineers & ML practitioners",
  "Designers & UX leads",
  "Researchers (academic / industry labs)",
  "Operators & growth leaders",
  "Students & early-career",
  "Executives (C-suite)",
] as const;

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

/** Common ISO 639-1 language codes for the dropdown. */
export const COMMON_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "he", label: "עברית (Hebrew)" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ar", label: "العربية (Arabic)" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "ru", label: "Русский (Russian)" },
  { code: "zh", label: "中文 (Chinese)" },
  { code: "ja", label: "日本語 (Japanese)" },
  { code: "ko", label: "한국어 (Korean)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
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
