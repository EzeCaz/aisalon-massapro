"use client";

import * as React from "react";
import { Cookie, X, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * CookieConsentBanner — GDPR-style cookie consent popup.
 *
 * Behavior:
 *   - On first visit, shows a banner at the bottom of the screen with
 *     "Accept All" and "Reject Non-Essential" buttons.
 *   - User choice is stored in localStorage `ais_cookie_consent`:
 *       "all"      → all cookies allowed (GA4 + Meta Pixel fire)
 *       "essential" → only essential cookies (no GA4/Pixel)
 *   - Once a choice is made, the banner stays hidden for 6 months
 *     ( configurable via RECONSENT_DAYS ).
 *   - When the user clicks "Accept All", dispatches a window event
 *     `cookieConsentChanged` that the AnalyticsScripts component
 *     listens for to load GA4 + Meta Pixel on demand.
 *
 * The banner is intentionally lightweight — no external CSS, no
 * external consent management platform. Just a simple yes/no.
 */

const STORAGE_KEY = "ais_cookie_consent";
const STORAGE_TIMESTAMP_KEY = "ais_cookie_consent_ts";
const RECONSENT_DAYS = 180; // 6 months

type ConsentChoice = "all" | "essential" | null;

function getStoredConsent(): ConsentChoice {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "all" || v === "essential") return v;
  return null;
}

function getStoredTimestamp(): number | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_TIMESTAMP_KEY);
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

function isConsentStale(): boolean {
  const ts = getStoredTimestamp();
  if (!ts) return true;
  const ageMs = Date.now() - ts;
  return ageMs > RECONSENT_DAYS * 24 * 60 * 60 * 1000;
}

function setConsent(choice: Exclude<ConsentChoice, null>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, choice);
  window.localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
  // Notify listeners (AnalyticsScripts) that consent changed
  window.dispatchEvent(new CustomEvent("cookieConsentChanged", { detail: { choice } }));
}

export function CookieConsentBanner() {
  const [visible, setVisible] = React.useState(false);
  const [choice, setChoice] = React.useState<ConsentChoice>(null);

  React.useEffect(() => {
    // Only show banner if no choice OR choice is stale
    const stored = getStoredConsent();
    const stale = isConsentStale();
    setChoice(stored ? null : stored);
    setVisible(!stored || stale);
  }, []);

  function handleAcceptAll() {
    setConsent("all");
    setChoice("all");
    setVisible(false);
    toast.success("Thanks! Analytics cookies enabled.");
  }

  function handleReject() {
    setConsent("essential");
    setChoice("essential");
    setVisible(false);
    toast.info("Only essential cookies will be used.");
  }

  // Also expose the current choice so analytics scripts can read it
  // via the window event.
  React.useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setChoice(getStoredConsent());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-[60] p-3 sm:p-4 pointer-events-none"
    >
      <div className="mx-auto max-w-3xl pointer-events-auto rounded-xl border border-black/15 bg-white shadow-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#FF005A]/10 shrink-0">
            <Cookie className="h-5 w-5 text-[#FF005A]" />
          </div>
          <div>
            <p className="text-sm font-bold text-black">We use cookies</p>
            <p className="text-xs text-black/80 mt-0.5 leading-relaxed">
              We use essential cookies to make the site work, plus analytics cookies
              (Google Analytics 4 + Meta Pixel) to understand how members use the
              platform. You can choose which to allow.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReject}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-black/70 hover:bg-black/5"
          >
            <X className="h-3.5 w-3.5" />
            Essential only
          </button>
          <button
            type="button"
            onClick={handleAcceptAll}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-black text-white px-3 py-2 text-xs font-semibold hover:bg-black/90"
          >
            <Check className="h-3.5 w-3.5" />
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * useCookieConsent — hook for any component that needs to know whether
 * analytics cookies have been consented to. Returns:
 *   - "all"        → user clicked Accept All
 *   - "essential"  → user clicked Essential only (or no choice yet but banner visible)
 *   - null         → no choice yet (banner is showing, scripts should NOT load)
 *
 * Re-renders the calling component when consent changes.
 */
export function useCookieConsent(): ConsentChoice {
  const [choice, setChoiceState] = React.useState<ConsentChoice>(null);
  React.useEffect(() => {
    setChoiceState(getStoredConsent());
    function onChanged(e: Event) {
      const detail = (e as CustomEvent).detail as { choice: Exclude<ConsentChoice, null> };
      setChoiceState(detail.choice);
    }
    window.addEventListener("cookieConsentChanged", onChanged as EventListener);
    return () => window.removeEventListener("cookieConsentChanged", onChanged as EventListener);
  }, []);
  return choice;
}
