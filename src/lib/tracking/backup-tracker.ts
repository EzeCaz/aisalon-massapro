/**
 * Local backup tracker — writes to /api/track/* endpoints which persist
 * to the local Prisma DB. This is our safety net: even if GA4/Meta/GTM
 * are blocked by ad blockers or fail to load, we still get the data
 * for the admin dashboard.
 *
 * Mirrors the pattern in the Affiliate UTM doc §10, adapted for the
 * AI Salon's Prisma schema.
 *
 * All calls are fire-and-forget (use sendBeacon or fetch with keepalive)
 * so they never block navigation.
 */

import { TRACKING_COOKIES } from "./tracking-ids"
import { safeTrackCall, safeTrackCallAsync } from "./safe-call"
import type { UtmParams } from "./utm-types"

/** Returns the session ID from sessionStorage, creating one if missing. */
export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr_no_session"
  try {
    let sid = sessionStorage.getItem(TRACKING_COOKIES.SESSION)
    if (!sid) {
      sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem(TRACKING_COOKIES.SESSION, sid)
    }
    return sid
  } catch {
    return "sess_no_storage"
  }
}

/**
 * In-memory map of the most recent PageView id per pathname.
 * Used by trackPageLeave() to pair a leave event with the pageview
 * that started on that pathname.
 *
 * Keyed by pathname (not pageUrl) so query-string changes don't
 * confuse the pairing.
 */
const pageViewIdByPath: Map<string, string> = new Map()

/**
 * Returns the pageViewId for the given pathname (or current pathname
 * if omitted). Set by trackPageView() when /api/track/pageview returns
 * the new row id.
 */
export function getCurrentPageViewId(pathname?: string): string | undefined {
  if (typeof window === "undefined") return undefined
  const p = pathname || window.location.pathname
  return pageViewIdByPath.get(p)
}

/** Reads the affiliate cookie (last-touch UTMs + affId). */
function readAffiliateCookie(): {
  affId?: string
  utm?: Partial<UtmParams>
  ftUtm?: Partial<UtmParams>
} {
  if (typeof document === "undefined") return {}
  try {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TRACKING_COOKIES.AFFILIATE}=`))
    if (!raw) return {}
    const value = decodeURIComponent(raw.split("=").slice(1).join("="))
    return JSON.parse(value)
  } catch {
    return {}
  }
}

/** Common payload sent to every /api/track/* endpoint. */
type CommonPayload = {
  sessionId: string
  affId?: string
  userId?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  ftUtmSource?: string
  ftUtmMedium?: string
  ftUtmCampaign?: string
  ftUtmContent?: string
  ftUtmTerm?: string
  pageUrl: string
  pagePath: string
  referrer?: string
  userAgent?: string
}

function buildCommonPayload(): CommonPayload {
  if (typeof window === "undefined") {
    return { sessionId: "ssr", pageUrl: "", pagePath: "" }
  }
  const aff = readAffiliateCookie()
  return {
    sessionId: getSessionId(),
    affId: aff.affId,
    utmSource: aff.utm?.utm_source,
    utmMedium: aff.utm?.utm_medium,
    utmCampaign: aff.utm?.utm_campaign,
    utmContent: aff.utm?.utm_content,
    utmTerm: aff.utm?.utm_term,
    ftUtmSource: aff.ftUtm?.utm_source,
    ftUtmMedium: aff.ftUtm?.utm_medium,
    ftUtmCampaign: aff.ftUtm?.utm_campaign,
    ftUtmContent: aff.ftUtm?.utm_content,
    ftUtmTerm: aff.ftUtm?.utm_term,
    pageUrl: window.location.href,
    pagePath: window.location.pathname,
    referrer: document.referrer || undefined,
    userAgent: navigator.userAgent,
  }
}

/**
 * Fires a pageview to /api/track/pageview. Fire-and-forget via sendBeacon
 * (falls back to fetch with keepalive). Captures the returned pageViewId
 * so a later trackPageLeave() can pair with it for session-duration
 * tracking.
 */
export function trackPageView(userId?: string): void {
  safeTrackCall(() => {
    if (typeof window === "undefined") return
    const payload = { ...buildCommonPayload(), userId }
    // Use fetch (not sendBeacon) because we need the response body to
    // capture the pageViewId. sendBeacon is one-way.
    try {
      void fetch("/api/track/pageview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      })
        .then((r) => r.json())
        .then((data: { pageViewId?: string }) => {
          if (data.pageViewId && typeof window !== "undefined") {
            pageViewIdByPath.set(window.location.pathname, data.pageViewId)
          }
        })
        .catch(() => {
          /* swallow — fire-and-forget */
        })
    } catch {
      /* swallow */
    }
  })
}

/**
 * Fires a page-leave event to /api/track/page-leave. Pairs with the
 * pageview recorded by trackPageView() to compute session duration.
 *
 * If no pageViewId is known for the given pathname (or current
 * pathname), this is a silent no-op.
 *
 * Uses sendBeacon so it survives page unload.
 */
export function trackPageLeave(pathname?: string): void {
  safeTrackCall(() => {
    if (typeof window === "undefined") return
    const p = pathname || window.location.pathname
    const pageViewId = pageViewIdByPath.get(p)
    if (!pageViewId) return
    postFireAndForget("/api/track/page-leave", { pageViewId })
    // Clear so a second leave event for the same pathname is a no-op.
    pageViewIdByPath.delete(p)
  })
}

/**
 * Fires a click event to /api/track/click.
 */
export function trackClick(
  eventType: "button_click" | "scroll" | "video" | "funnel_step",
  eventId: string,
  metadata?: Record<string, unknown>,
  userId?: string,
): void {
  safeTrackCall(() => {
    if (typeof window === "undefined") return
    const payload = {
      ...buildCommonPayload(),
      userId,
      eventType,
      eventId,
      metadata,
    }
    postFireAndForget("/api/track/click", payload)
  })
}

/**
 * Fires a lead/conversion to /api/track/lead.
 */
export function trackLead(data: {
  name: string
  email?: string
  phone?: string
  company?: string
  conversionType: string
  conversionRef?: string
  initialStatus?: string
  planType?: string
  userId?: string
}): void {
  safeTrackCall(() => {
    if (typeof window === "undefined") return
    const payload = { ...buildCommonPayload(), ...data }
    postFireAndForget("/api/track/lead", payload)
  })
}

/**
 * Fires a generic event to /api/track/event (e.g. email_click, share).
 */
export function trackEvent(
  eventName: string,
  params: Record<string, unknown> = {},
): void {
  safeTrackCall(() => {
    if (typeof window === "undefined") return
    const payload = { ...buildCommonPayload(), eventName, params }
    postFireAndForget("/api/track/event", payload)
  })
}

/**
 * Posts JSON to a URL using sendBeacon (preferred — survives page unload)
 * or fetch with keepalive (fallback).
 */
function postFireAndForget(url: string, data: unknown): void {
  const body = JSON.stringify(data)
  // Prefer sendBeacon for survivability across page unload
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" })
      if (navigator.sendBeacon(url, blob)) return
    } catch {
      // Fall through to fetch
    }
  }
  // Fallback: fetch with keepalive
  try {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow */
    })
  } catch {
    /* swallow */
  }
}

/**
 * Server-side tracking helper — used by API routes to record conversions
 * that happen server-side (e.g. after successful onboarding API call).
 *
 * Reads UTM data from the request body or the visitor's cookie (sent
 * via the request headers).
 */
export async function trackConversionServerSide(data: {
  conversionType: string
  conversionRef?: string
  name: string
  email?: string
  phone?: string
  company?: string
  initialStatus?: string
  userId?: string
  affId?: string
  utm?: Partial<UtmParams>
  ftUtm?: Partial<UtmParams>
  sessionId?: string
}): Promise<void> {
  await safeTrackCallAsync(async () => {
    if (typeof window !== "undefined") return // server-side only
    const payload = data
    const res = await fetch(
      `http://localhost:${process.env.PORT || 3000}/api/track/conversion`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )
    if (!res.ok) throw new Error(`track conversion failed: ${res.status}`)
  })
}
