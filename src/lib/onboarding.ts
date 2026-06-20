/**
 * Onboarding helpers — shared between the /onboarding page, the
 * POST /api/user/onboarding route, and the auth-gated pages
 * (/events, /profile) that need to redirect brand-new users to
 * the intake form before they can use the rest of the platform.
 *
 * Rule: a user needs onboarding if they were NOT pre-imported
 * (importSource is null) AND they haven't completed the form yet
 * (onboardedAt is null). Pre-imported users already have intake
 * data from the AI Salon TLV spreadsheet, so they skip the form.
 */

type OnboardingAwareUser = {
  importSource?: string | null;
  onboardedAt?: Date | null;
};

export function needsOnboarding(user: OnboardingAwareUser | null): boolean {
  if (!user) return false; // not signed in — let the auth gate handle it
  if (user.importSource) return false; // pre-imported from spreadsheet
  if (user.onboardedAt) return false; // already completed the form
  return true;
}

/**
 * The canonical list of "I am interested in…" options shown on the
 * onboarding form (mirrors the AI Salon TLV intake spreadsheet).
 * The "Other" option is a free-text field appended after the chosen
 * checkboxes — see /api/user/onboarding for the serialization format.
 */
export const INTERESTED_IN_OPTIONS = [
  "Be a guest speaker",
  "Host an event in our offices",
  "Become a premium sponsor",
  "Sponsor a specific event",
  "Want to pitch my startup",
] as const;

/**
 * The canonical list of "Tell us more about yourself" options shown
 * on the onboarding form. Mirrors the AI Salon TLV intake spreadsheet.
 */
export const PROFILE_CATEGORIES_OPTIONS = [
  "I am an investor",
  "I am an entrepreneur",
  "I am a startup employee",
  "Looking for my next opportunity",
  "I am a startup seeking for funding",
] as const;
