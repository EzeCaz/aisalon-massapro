/**
 * Google Analytics 4 — Measurement Protocol sender.
 *
 * Sends server-side events to GA4 via the Measurement Protocol v2
 * (https://developers.google.com/analytics/devguides/collection/protocol/ga4).
 *
 * Required env vars:
 *   - GA4_MEASUREMENT_ID    e.g. "G-XXXXXXXXXX"
 *   - GA4_API_SECRET        e.g. "abc123..." (generated in GA4 Admin → Data Streams)
 *
 * When either env var is missing, the function returns { ok: false, status: 0 }
 * silently — the caller decides whether to log.
 *
 * Client ID strategy:
 *   - For events that have a corresponding browser session, pass the same
 *     client_id as the GA4 pageview (extracted from the _ga cookie).
 *   - For server-only events (email open pixel, email click redirect),
 *     generate a stable client_id from the user's email hash. This means
 *     GA4 will group all server-side events for a user under one client_id,
 *     which is fine for attribution purposes.
 */

export type GA4EventName =
  | "page_view"
  | "rsvp_submit"
  | "door_checkin"
  | "attended"
  | "no_show"
  | "email_open"
  | "email_click"
  | "email_send"
  | "purchase"
  | "flow_step_fired"
  | "flow_halted";

export type GA4EventInput = {
  event_name: GA4EventName;
  /** Client ID — see module docs. If null, derived from email hash. */
  client_id?: string;
  /** User email — used to derive client_id if not provided. */
  email?: string;
  /** Event params (any JSON-serializable values). */
  params?: Record<string, string | number | boolean | null | undefined>;
  /** User properties (optional). */
  user_properties?: Record<string, { value: string | number | boolean }>;
  /** Consent flags (GDPR). Default: all granted. */
  consent?: {
    ad_user_data?: "granted" | "denied";
    ad_personalization?: "granted" | "denied";
    analytics_storage?: "granted" | "denied";
  };
};

type GA4Payload = {
  client_id: string;
  events: Array<{
    name: string;
    params: Record<string, unknown>;
  }>;
  user_properties?: Record<string, { value: unknown }>;
  consent?: Record<string, string>;
};

export type GA4SendResult = {
  ok: boolean;
  status: number;
  body: string;
};

/** Send a single event to GA4. Returns silently if env not configured. */
export async function sendGA4Event(input: GA4EventInput): Promise<GA4SendResult> {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) {
    return { ok: false, status: 0, body: "GA4_MEASUREMENT_ID or GA4_API_SECRET not set" };
  }

  // Derive client_id if not provided.
  let client_id = input.client_id;
  if (!client_id) {
    if (input.email) {
      const crypto = require("node:crypto") as typeof import("node:crypto");
      const hash = crypto.createHash("sha256").update(input.email.toLowerCase().trim(), "utf-8").digest("hex");
      // GA4 client_id format: "1234567890.1234567890"
      client_id = `${hash.slice(0, 10)}.${hash.slice(10, 20)}`;
    } else {
      client_id = `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
    }
  }

  const payload: GA4Payload = {
    client_id,
    events: [
      {
        name: input.event_name,
        params: {
          // Engagement time is REQUIRED for non-page-view events.
          engagement_time_msec: 100,
          ...input.params,
        },
      },
    ],
  };

  if (input.user_properties) {
    payload.user_properties = input.user_properties;
  }
  if (input.consent) {
    payload.consent = Object.fromEntries(
      Object.entries(input.consent).map(([k, v]) => [k, v as string]),
    );
  }

  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: -1, body: String(err) };
  }
}
