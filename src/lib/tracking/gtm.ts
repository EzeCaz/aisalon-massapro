/**
 * Google Tag Manager (GTM) helper.
 *
 * GTM is loaded globally in src/app/layout.tsx via <Script strategy="beforeInteractive">.
 * This module exposes a typed pushToDataLayer() function that components
 * call to fire custom events.
 *
 * Per the GTM convention, all custom events are pushed to window.dataLayer
 * as objects with an `event` property. GTM triggers fire based on these
 * event names.
 */

import { safeTrackCall } from "./safe-call"

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}

/**
 * Pushes an event to the GTM dataLayer. The event object must include
 * an `event` property (the trigger name configured in GTM).
 *
 * Safe to call before GTM has loaded — window.dataLayer is initialized
 * as an empty array by the GTM snippet in layout.tsx, so pushes are
 * queued and replayed when GTM loads.
 *
 * NOTE: GTM events DO NOT require cookie consent in our setup because
 * GTM itself only fires tags that have their own consent rules. The
 * individual GA4 + Meta Pixel tags check consent separately.
 */
export function pushToDataLayer(event: Record<string, unknown> & { event: string }): void {
  safeTrackCall(() => {
    if (typeof window === "undefined") return
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push(event)
  })
}

/**
 * Returns the current dataLayer (for debugging). Returns empty array
 * if GTM hasn't loaded yet.
 */
export function getDataLayer(): Record<string, unknown>[] {
  if (typeof window === "undefined") return []
  return window.dataLayer || []
}
