"use client";

/**
 * CookieConsentBanner — GDPR-style cookie consent banner.
 *
 * - Shows on first visit (no consent cookie yet)
 * - User can: Accept All / Reject All / Customize (analytics, marketing)
 * - Choice persisted in `aisalon_cookie_consent` cookie for 1 year
 * - Tracking scripts check consent via hasConsent() before firing
 * - Banner appears at bottom of screen, dismissible after choice
 *
 * Per the user's spec: when user clicks "Contact" button, fire the
 * contact event on all 3 platforms (GTM, GA4, Meta). This requires
 * marketing consent. If consent is rejected, the contact event
 * still fires to the local backup tracker (essential — needed for
 * the admin dashboard).
 */

import { useState, useEffect } from "react";
import { TRACKING_COOKIES, DEFAULT_CONSENT, type ConsentState } from "@/lib/tracking/tracking-ids";

/**
 * Reads consent state from cookie. Returns DEFAULT_CONSENT (all false)
 * if no cookie is set yet.
 */
export function loadConsentFromCookie(): ConsentState {
  if (typeof document === "undefined") return { ...DEFAULT_CONSENT }
  try {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TRACKING_COOKIES.CONSENT}=`))
    if (!raw) return { ...DEFAULT_CONSENT }
    const value = decodeURIComponent(raw.split("=").slice(1).join("="))
    const parsed = JSON.parse(value) as Partial<ConsentState>
    return {
      essential: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      consentDate: parsed.consentDate || "",
    }
  } catch {
    return { ...DEFAULT_CONSENT }
  }
}

function saveConsentCookie(consent: ConsentState) {
  if (typeof document === "undefined") return
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${TRACKING_COOKIES.CONSENT}=${encodeURIComponent(
    JSON.stringify(consent),
  )}; expires=${expires}; path=/; SameSite=Lax`
}

export function CookieConsentBanner({
  consent,
  onConsentChange,
}: {
  consent: ConsentState | null
  onConsentChange: (consent: ConsentState) => void
}) {
  const [showCustomize, setShowCustomize] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (consent) {
      setAnalytics(consent.analytics)
      setMarketing(consent.marketing)
    }
  }, [consent])

  // Sync consent state to window.__aisalonConsent so the safeTrackCall
  // helper can read it without prop drilling. This is the bridge between
  // the React layer and the vanilla tracking modules (ga4.ts, meta-pixel.ts).
  useEffect(() => {
    if (typeof window === "undefined") return
    if (consent) {
      ;(window as unknown as { __aisalonConsent?: typeof consent }).__aisalonConsent = consent
      // Also update Google Consent Mode v2 if gtag is loaded
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          analytics_storage: consent.analytics ? "granted" : "denied",
          ad_storage: consent.marketing ? "granted" : "denied",
        })
      }
    }
  }, [consent])

  // Don't render until mounted (avoids hydration mismatch)
  if (!mounted) return null

  // Don't render if user has already consented
  if (consent && consent.consentDate) return null

  const acceptAll = () => {
    const newConsent: ConsentState = {
      essential: true,
      analytics: true,
      marketing: true,
      consentDate: new Date().toISOString(),
    }
    saveConsentCookie(newConsent)
    onConsentChange(newConsent)
  }

  const rejectAll = () => {
    const newConsent: ConsentState = {
      essential: true,
      analytics: false,
      marketing: false,
      consentDate: new Date().toISOString(),
    }
    saveConsentCookie(newConsent)
    onConsentChange(newConsent)
  }

  const saveCustomized = () => {
    const newConsent: ConsentState = {
      essential: true,
      analytics,
      marketing,
      consentDate: new Date().toISOString(),
    }
    saveConsentCookie(newConsent)
    onConsentChange(newConsent)
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: "#1a1033",
        color: "#ffffff",
        padding: "16px 20px",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 400px", fontSize: "14px", lineHeight: 1.5 }}>
            <strong style={{ color: "#FF005A" }}>We use cookies</strong> to track
            traffic sources, measure conversions, and improve your experience.
            Anonymous analytics help us understand which content resonates;
            marketing cookies let us optimize ad campaigns. You can change
            your choice anytime in your account settings.
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={rejectAll}
              style={{
                background: "transparent",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.3)",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Reject all
            </button>
            <button
              onClick={() => setShowCustomize((s) => !s)}
              style={{
                background: "transparent",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.3)",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Customize
            </button>
            <button
              onClick={acceptAll}
              style={{
                background: "#FF005A",
                color: "#ffffff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Accept all
            </button>
          </div>
        </div>

        {showCustomize && (
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              padding: "16px",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "14px",
                opacity: 0.7,
              }}
            >
              <input type="checkbox" checked disabled />
              <span>
                <strong>Essential</strong> — required for the platform to
                function (login, session, security). Always on.
              </span>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
              />
              <span>
                <strong>Analytics</strong> — Google Analytics 4 + local
                traffic tracking. Helps us understand which content
                resonates. Anonymous.
              </span>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
              />
              <span>
                <strong>Marketing</strong> — Meta Pixel + Google Tag Manager.
                Lets us optimize ad campaigns and build retargeting
                audiences.
              </span>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={saveCustomized}
                style={{
                  background: "#7C3AED",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 20px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Save my preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
