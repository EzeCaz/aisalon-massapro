/**
 * Unified tracking helper — fires a single event to ALL 4 channels
 * in parallel: GA4, Meta Pixel, GTM dataLayer, and Local Backup Tracker.
 *
 * This is the ONLY tracking function most app code should call.
 *
 * Channel mapping per conversion type is in CONVERSION_CATALOG below.
 *
 * Usage:
 *   import { trackEvent } from "@/lib/tracking/track-event"
 *
 *   // After successful onboarding form submit:
 *   trackEvent("form_completed", {
 *     page_name: "Onboarding",
 *     method: "email",
 *     user_id: user.id,
 *   })
 *
 *   // After successful RSVP:
 *   trackEvent("rsvp", {
 *     page_name: "Event",
 *     event_slug: slug,
 *     event_id: eventId,
 *   })
 */

import { trackGa4Event } from "./ga4"
import {
  trackMetaStandardEvent,
  trackMetaCustomEvent,
} from "./meta-pixel"
import { pushToDataLayer } from "./gtm"
import * as BackupTracker from "./backup-tracker"
import { safeTrackCall } from "./safe-call"

/**
 * Catalog of all conversion events. Maps our internal event name to:
 *  - GA4 event name (or null = skip GA4)
 *  - Meta event type + event name (or null = skip Meta)
 *  - GTM dataLayer event name (or null = skip GTM)
 *  - Local Backup Tracker conversion type (or null = skip local)
 *  - Whether to record a TrackedLead row (vs just a ClickEvent)
 */
type ChannelMapping = {
  ga4?: string
  metaStandard?: string
  metaCustom?: string
  gtm?: string
  localConversionType?: string
  localEventType?: "button_click" | "scroll" | "video" | "funnel_step"
  recordsLead?: boolean
}

export const CONVERSION_CATALOG: Record<string, ChannelMapping> = {
  // Conversions
  signup: {
    ga4: "sign_up",
    metaStandard: "CompleteRegistration",
    gtm: "signUp",
    localConversionType: "signup",
    recordsLead: true,
  },
  form_completed: {
    ga4: "form_completed",
    metaCustom: "FormCompleted",
    gtm: "formCompleted",
    localConversionType: "onboarding",
    recordsLead: true,
  },
  rsvp: {
    ga4: "rsvp",
    metaStandard: "Schedule",
    gtm: "rsvp",
    localConversionType: "rsvp",
    recordsLead: true,
  },
  event_checkin: {
    ga4: "event_checkin",
    metaCustom: "EventCheckin",
    gtm: "eventCheckin",
    localConversionType: "event_checkin",
    recordsLead: true,
  },
  contact: {
    ga4: "contact",
    metaCustom: "Contact",
    gtm: "contact",
    localConversionType: "contact",
    recordsLead: true,
  },
  contact_clicked: {
    // Fires when user CLICKS the Contact button (per user spec: track
    // button press, not each message). This is a click event, not a
    // full conversion — the actual "contact" conversion fires when
    // the user sends their first message.
    ga4: "contact_clicked",
    metaCustom: "ContactClicked",
    gtm: "contactClicked",
    localEventType: "button_click",
    recordsLead: false,
  },
  profile_completed: {
    ga4: "profile_completed",
    metaCustom: "ProfileCompleted",
    gtm: "profileCompleted",
    localConversionType: "profile_completed",
    recordsLead: true,
  },
  share: {
    ga4: "share",
    metaCustom: "Share",
    gtm: "share",
    localEventType: "button_click",
    recordsLead: false,
  },
  // Engagement events
  cta_click: {
    ga4: "cta_click",
    metaCustom: "CtaClick",
    gtm: "ctaClick",
    localEventType: "button_click",
    recordsLead: false,
  },
  lead_form_open: {
    ga4: "lead_form_open",
    metaCustom: "LeadFormOpen",
    gtm: "leadFormOpen",
    localEventType: "button_click",
    recordsLead: false,
  },
  scroll_to_section: {
    ga4: "scroll_to_section",
    gtm: "scrollToSection",
    localEventType: "scroll",
    recordsLead: false,
  },
  video_play: {
    ga4: "video_play",
    gtm: "videoPlay",
    localEventType: "video",
    recordsLead: false,
  },
  video_complete: {
    ga4: "video_complete",
    gtm: "videoComplete",
    localEventType: "video",
    recordsLead: false,
  },
  file_download: {
    ga4: "file_download",
    metaCustom: "FileDownload",
    gtm: "fileDownload",
    localEventType: "button_click",
    recordsLead: false,
  },
  email_click: {
    ga4: "email_click",
    gtm: "emailClick",
    localEventType: "button_click",
    recordsLead: false,
  },
  // E-commerce (future-proofing)
  begin_checkout: {
    ga4: "begin_checkout",
    metaStandard: "InitiateCheckout",
    gtm: "beginCheckout",
    localEventType: "button_click",
    recordsLead: false,
  },
  add_to_cart: {
    ga4: "add_to_cart",
    metaStandard: "AddToCart",
    gtm: "addToCart",
    localEventType: "button_click",
    recordsLead: false,
  },
  purchase: {
    ga4: "purchase",
    metaStandard: "Purchase",
    gtm: "purchase",
    localConversionType: "purchase",
    recordsLead: true,
  },
}

/**
 * Tracks an event across all 4 channels (GA4 + Meta + GTM + Local).
 *
 * @param eventName - One of the keys in CONVERSION_CATALOG
 * @param params - Event-specific params (auto-enriched with UTMs + sessionId)
 * @param options - Optional per-channel overrides
 */
export function trackEvent(
  eventName: string,
  params: Record<string, unknown> = {},
  options: {
    userId?: string
    leadData?: {
      name?: string
      email?: string
      phone?: string
      company?: string
      conversionRef?: string
      initialStatus?: string
      planType?: string
    }
    skipChannels?: ("ga4" | "meta" | "gtm" | "local")[]
  } = {},
): void {
  const mapping = CONVERSION_CATALOG[eventName]
  if (!mapping) {
    console.warn(`[tracking] Unknown event name: ${eventName}`)
    return
  }

  const skip = new Set(options.skipChannels || [])

  // 1. GA4
  if (mapping.ga4 && !skip.has("ga4")) {
    trackGa4Event(mapping.ga4, params)
  }

  // 2. Meta Pixel
  if (!skip.has("meta")) {
    if (mapping.metaStandard) {
      trackMetaStandardEvent(mapping.metaStandard, params)
    } else if (mapping.metaCustom) {
      trackMetaCustomEvent(mapping.metaCustom, params)
    }
  }

  // 3. GTM dataLayer
  if (mapping.gtm && !skip.has("gtm")) {
    pushToDataLayer({
      event: mapping.gtm,
      ...params,
      timestamp: new Date().toISOString(),
    })
  }

  // 4. Local Backup Tracker
  if (!skip.has("local")) {
    if (mapping.recordsLead) {
      safeTrackCall(() => {
        BackupTracker.trackLead({
          name: options.leadData?.name || "Anonymous",
          email: options.leadData?.email,
          phone: options.leadData?.phone,
          company: options.leadData?.company,
          conversionType: mapping.localConversionType || eventName,
          conversionRef: options.leadData?.conversionRef,
          initialStatus: options.leadData?.initialStatus,
          planType: options.leadData?.planType,
          userId: options.userId,
        })
      })
    } else if (mapping.localEventType) {
      safeTrackCall(() => {
        BackupTracker.trackClick(
          mapping.localEventType!,
          eventName,
          params,
          options.userId,
        )
      })
    }
  }
}

/**
 * Convenience: tracks a page view across GA4 + Meta + Local.
 * (GTM auto-fires page_view from its gtag config — no manual push needed.)
 *
 * Called by usePageViewTracker() on every route change.
 */
export function trackPageViewAll(userId?: string): void {
  safeTrackCall(() => {
    BackupTracker.trackPageView(userId)
  })
}
