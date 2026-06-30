/**
 * Central tracking IDs for the AI Salon platform.
 *
 * All external tracking IDs (GTM, GA4, Meta Pixel) live here so they
 * can be changed in ONE place without hunting through layout.tsx.
 *
 * Loaded by:
 *  - src/app/layout.tsx (for <Script> tags)
 *  - src/lib/tracking/* (for typed wrappers)
 */

export const GTM_ID = "GTM-5BQ6MCJK" as const
export const GA4_MEASUREMENT_ID = "G-CC1EQ0L7L5" as const
export const META_PIXEL_ID = "1324228136505577" as const

/**
 * Cookie names — kept in sync with the doc's tracker convention
 * (massapro_affiliate, massapro_ft, massapro_session) so the AI Salon
 * tracker can interoperate with the existing receptionist.massapro.com
 * infrastructure if cross-property attribution is ever needed.
 */
export const TRACKING_COOKIES = {
  AFFILIATE: "massapro_affiliate", // 30-day — last-touch UTMs + affId
  FIRST_TOUCH: "massapro_ft", // 30-day — first-touch UTMs (never overwritten)
  SESSION: "massapro_session", // 1-day — session ID
  FUNNEL: "massapro_funnel", // 30-day — funnel progress (JSON array)
  CONSENT: "aisalon_cookie_consent", // 1-year — user's consent choice
} as const

/**
 * Cookie consent categories. The CookieConsentBanner lets the user
 * accept/reject each category. Tracking scripts check the user's
 * consent before firing.
 */
export type ConsentCategory = "essential" | "analytics" | "marketing"

export type ConsentState = {
  essential: true // always true
  analytics: boolean
  marketing: boolean
  consentDate: string // ISO timestamp
}

export const DEFAULT_CONSENT: ConsentState = {
  essential: true,
  analytics: false,
  marketing: false,
  consentDate: "",
}
