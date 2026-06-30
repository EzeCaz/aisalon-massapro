/**
 * Meta Pixel (Facebook Pixel) helper.
 *
 * Meta Pixel is loaded globally in src/app/layout.tsx via <Script strategy="afterInteractive">.
 * Pixel ID: 1324228136505577
 *
 * Per the Affiliate UTM doc §7, Meta distinguishes between:
 *  - Standard events (e.g. 'Purchase', 'Schedule', 'Lead', 'AddToCart')
 *    — used for ad optimization, count as conversions in Ads Manager
 *  - Custom events (e.g. 'FormCompleted', 'CtaClick')
 *    — used for retargeting audiences only
 *
 * Use Standard events when there's an applicable one; fall back to Custom
 * for everything else.
 */

import { safeTrackCall } from "./safe-call"

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
  }
}

/**
 * Fires a STANDARD Meta event (counts as conversion in Ads Manager).
 * See https://www.facebook.com/business/help/402791146561655
 * Standard events: 'PageView', 'ViewContent', 'Search', 'AddToCart',
 * 'AddToWishlist', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase',
 * 'Lead', 'CompleteRegistration', 'Contact', 'FindLocation',
 * 'Schedule', 'StartTrial', 'SubmitApplication', 'Subscribe',
 * 'CustomizeProduct', 'Donate', 'MessagingConversationStarted'.
 */
export function trackMetaStandardEvent(
  eventName: string,
  params: Record<string, unknown> = {},
): void {
  safeTrackCall(
    () => {
      if (typeof window === "undefined") return
      if (typeof window.fbq !== "function") return
      window.fbq("track", eventName, params)
    },
    { requireConsent: "marketing" },
  )
}

/**
 * Fires a CUSTOM Meta event (does NOT count as conversion — only for
 * retargeting audiences). Used when no Standard event applies.
 */
export function trackMetaCustomEvent(
  eventName: string,
  params: Record<string, unknown> = {},
): void {
  safeTrackCall(
    () => {
      if (typeof window === "undefined") return
      if (typeof window.fbq !== "function") return
      window.fbq("trackCustom", eventName, params)
    },
    { requireConsent: "marketing" },
  )
}

/**
 * Fires a PageView standard event. Called automatically by Meta Pixel
 * on script init (in layout.tsx) for the initial page load. We also
 * call this manually on SPA route changes.
 */
export function trackMetaPageView(): void {
  safeTrackCall(
    () => {
      if (typeof window === "undefined") return
      if (typeof window.fbq !== "function") return
      window.fbq("track", "PageView")
    },
    { requireConsent: "marketing" },
  )
}
