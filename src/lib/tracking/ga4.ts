/**
 * Google Analytics 4 (gtag) helper.
 *
 * GA4 is loaded globally in src/app/layout.tsx via <Script strategy="afterInteractive">.
 * This module exposes a typed trackGa4Event() function.
 *
 * Per the Affiliate UTM doc §6.1, GA4 is configured with the measurement
 * ID G-CC1EQ0L7L5 (replaces the old G-Z2TP8Y923Q from receptionist.massapro.com).
 */

import { GA4_MEASUREMENT_ID } from "./tracking-ids"
import { safeTrackCall } from "./safe-call"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Sends an event to GA4. Requires analytics consent (set by CookieConsentBanner).
 *
 * @example
 * trackGa4Event('form_completed', {
 *   event_category: 'engagement',
 *   event_label: 'Onboarding Form',
 *   page_name: 'Onboarding',
 * })
 */
export function trackGa4Event(
  eventName: string,
  params: Record<string, unknown> = {},
): void {
  safeTrackCall(
    () => {
      if (typeof window === "undefined") return
      if (typeof window.gtag !== "function") return
      window.gtag("event", eventName, params)
    },
    { requireConsent: "analytics" },
  )
}

/**
 * Sends a page_view event to GA4 with the given path.
 * Called automatically by usePageViewTracker() on every route change.
 */
export function trackGa4PageView(pagePath: string, pageTitle?: string): void {
  safeTrackCall(
    () => {
      if (typeof window === "undefined") return
      if (typeof window.gtag !== "function") return
      // gtag('event', 'page_view', ...) is what GA4 uses for SPA route changes
      window.gtag("event", "page_view", {
        page_path: pagePath,
        page_title: pageTitle || pagePath,
        send_to: GA4_MEASUREMENT_ID,
      })
    },
    { requireConsent: "analytics" },
  )
}

/**
 * Sets a user property in GA4 (e.g. user_role, user_id).
 * Called after login so GA4 can segment users by role.
 */
export function setGa4UserProperty(props: Record<string, string>): void {
  safeTrackCall(
    () => {
      if (typeof window === "undefined") return
      if (typeof window.gtag !== "function") return
      window.gtag("set", { user_properties: props })
    },
    { requireConsent: "analytics" },
  )
}
