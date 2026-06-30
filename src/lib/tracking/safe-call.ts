/**
 * Safe wrapper for tracking calls.
 *
 * All external trackers (GA4, Meta Pixel, GTM, MassaPro Affiliate)
 * can throw if:
 *  - their script hasn't loaded yet
 *  - the browser blocks third-party scripts
 *  - their backend is unreachable
 *  - the user has rejected cookies (consent banner)
 *
 * This wrapper swallows errors so tracking failures never break app UX.
 * Mirrors the pattern in the Affiliate UTM doc §12.3 (safeMassaProCall).
 */

import type { ConsentState } from "./tracking-ids"

/**
 * Returns true if the user has consented to the given category.
 * Reads from window.__aisalonConsent (set by CookieConsentBanner).
 * Defaults to false if consent hasn't been recorded yet.
 */
export function hasConsent(category: "analytics" | "marketing"): boolean {
  if (typeof window === "undefined") return false
  const consent = (window as unknown as { __aisalonConsent?: ConsentState }).__aisalonConsent
  if (!consent) return false
  return category === "analytics" ? consent.analytics : consent.marketing
}

/**
 * Runs a tracking function safely. If the function throws, the error
 * is swallowed. Optionally checks consent first and skips if rejected.
 */
export function safeTrackCall(
  fn: () => void,
  options: { requireConsent?: "analytics" | "marketing" } = {},
): void {
  if (typeof window === "undefined") return
  if (options.requireConsent && !hasConsent(options.requireConsent)) return
  try {
    fn()
  } catch {
    // Swallow — tracking must never break app UX
  }
}

/**
 * Same as safeTrackCall but for async functions. Returns a promise
 * that never rejects.
 */
export async function safeTrackCallAsync(
  fn: () => Promise<void>,
  options: { requireConsent?: "analytics" | "marketing" } = {},
): Promise<void> {
  if (typeof window === "undefined") return
  if (options.requireConsent && !hasConsent(options.requireConsent)) return
  try {
    await fn()
  } catch {
    // Swallow
  }
}
