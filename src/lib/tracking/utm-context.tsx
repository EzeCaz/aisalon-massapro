"use client"

/**
 * Universal UTM Context Provider.
 *
 * Wraps the entire app in <UtmProvider>. On mount, reads UTMs from the
 * URL (via useSearchParams), resolves the affiliate ID (priority:
 * Aff-Id > Aff Id > utm), persists them to cookies (first-touch never
 * overwritten, last-touch updated), and exposes them via useUtm().
 *
 * Per the Affiliate UTM doc §2.3, UTM capture uses useState initializer
 * so we always attribute to the FIRST landing URL, not subsequent
 * client-side navigations.
 *
 * Also fires a pageview on every route change (via usePageViewTracker
 * in the PageViewTracker component below).
 */

import React, { createContext, useContext, useEffect, useState, useMemo } from "react"
import { useSearchParams, usePathname } from "next/navigation"
import {
  extractUtmParams,
  resolveAffIdFromSearchParams,
  type UtmParams,
  hasUtmParams,
} from "./utm-types"
import { TRACKING_COOKIES } from "./tracking-ids"
import { trackPageViewAll } from "./track-event"
import { getSessionId } from "./backup-tracker"

type UtmContextValue = {
  /** Last-touch UTMs (from URL on mount, or updated from cookie on subsequent visits). */
  utmParams: UtmParams
  /** Resolved affiliate ID (priority: Aff-Id > Aff Id > utm). */
  affId: string
  /** First-touch UTMs (from massapro_ft cookie — never overwritten). */
  firstTouch: UtmParams
  /** Session ID (from sessionStorage). */
  sessionId: string
  /** True if any UTM param was present on mount. */
  hasUtms: boolean
  /** True if affId looks like a member referral code (SAL-...). */
  isMemberReferral: boolean
  /** User ID (from session, if signed in). */
  userId?: string
}

const UtmContext = createContext<UtmContextValue | null>(null)

/**
 * Reads a cookie by name. Returns null if not found.
 */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
  if (!raw) return null
  try {
    return decodeURIComponent(raw.split("=").slice(1).join("="))
  } catch {
    return null
  }
}

/**
 * Sets a cookie with the given name, value, and days-to-expire.
 */
function setCookie(name: string, value: string, days: number): void {
  if (typeof document === "undefined") return
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
  const safe = encodeURIComponent(value)
  document.cookie = `${name}=${safe}; expires=${expires}; path=/; SameSite=Lax`
}

/**
 * Parses the JSON value of the affiliate cookie. Returns {} if missing.
 */
function readAffiliateCookie(): {
  affId?: string
  utm?: Partial<UtmParams>
  ftUtm?: Partial<UtmParams>
  landing_page?: string
  timestamp?: number
} {
  const raw = readCookie(TRACKING_COOKIES.AFFILIATE)
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function UtmProvider({
  children,
  userId,
}: {
  children: React.ReactNode
  userId?: string
}) {
  const searchParams = useSearchParams()
  const pathname = usePathname()

  // Capture UTMs + affId ONCE on mount (per the doc §2.3 pattern)
  const [utmParams] = useState<UtmParams>(() => extractUtmParams(searchParams))
  const [affId] = useState<string>(() => resolveAffIdFromSearchParams(searchParams))
  const [sessionId] = useState<string>(() => getSessionId())

  // Read first-touch from cookie (set by a previous visit, or empty on first visit)
  const [firstTouch, setFirstTouch] = useState<UtmParams>(() => {
    const aff = readAffiliateCookie()
    return {
      utm_source: aff.ftUtm?.utm_source || "",
      utm_medium: aff.ftUtm?.utm_medium || "",
      utm_campaign: aff.ftUtm?.utm_campaign || "",
      utm_content: aff.ftUtm?.utm_content || "",
      utm_term: aff.ftUtm?.utm_term || "",
    }
  })

  // On mount: persist UTMs + affId to cookies
  useEffect(() => {
    if (typeof window === "undefined") return

    const existing = readAffiliateCookie()
    const hasNewUtms = hasUtmParams(utmParams)
    const hasNewAffId = Boolean(affId)

    // First-touch: set ONLY if not already set (massapro_ft cookie)
    if (!existing.ftUtm || !hasUtmParams(existing.ftUtm as UtmParams)) {
      if (hasNewUtms) {
        const ft = {
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
          utm_content: utmParams.utm_content,
          utm_term: utmParams.utm_term,
        }
        setFirstTouch(ft)
        setCookie(TRACKING_COOKIES.FIRST_TOUCH, JSON.stringify(ft), 30)
      }
    } else {
      // Preserve existing first-touch
      setFirstTouch({
        utm_source: existing.ftUtm.utm_source || "",
        utm_medium: existing.ftUtm.utm_medium || "",
        utm_campaign: existing.ftUtm.utm_campaign || "",
        utm_content: existing.ftUtm.utm_content || "",
        utm_term: existing.ftUtm.utm_term || "",
      })
    }

    // Affiliate cookie: update with new UTMs + affId (last-touch)
    // Preserve first-touch data inside the affiliate cookie too (for server-side reads)
    const updated = {
      affId: hasNewAffId ? affId : existing.affId || "",
      utm: hasNewUtms
        ? {
            utm_source: utmParams.utm_source,
            utm_medium: utmParams.utm_medium,
            utm_campaign: utmParams.utm_campaign,
            utm_content: utmParams.utm_content,
            utm_term: utmParams.utm_term,
          }
        : existing.utm || {},
      ftUtm: existing.ftUtm || (hasNewUtms ? utmParams : {}),
      landing_page: existing.landing_page || window.location.pathname,
      timestamp: Date.now(),
    }
    setCookie(TRACKING_COOKIES.AFFILIATE, JSON.stringify(updated), 30)

    // Session cookie (1 day)
    setCookie(TRACKING_COOKIES.SESSION, sessionId, 1)
  }, [affId, utmParams, sessionId])

  // Fire pageview on every route change
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!pathname) return
    trackPageViewAll(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const value = useMemo<UtmContextValue>(
    () => ({
      utmParams,
      affId,
      firstTouch,
      sessionId,
      hasUtms: hasUtmParams(utmParams),
      isMemberReferral: affId.startsWith("SAL-"),
      userId,
    }),
    [utmParams, affId, firstTouch, sessionId, userId],
  )

  return <UtmContext.Provider value={value}>{children}</UtmContext.Provider>
}

/**
 * Hook — returns the current UTM context.
 * Must be used inside <UtmProvider>.
 */
export function useUtm(): UtmContextValue {
  const ctx = useContext(UtmContext)
  if (!ctx) {
    throw new Error("useUtm must be used inside <UtmProvider>")
  }
  return ctx
}
