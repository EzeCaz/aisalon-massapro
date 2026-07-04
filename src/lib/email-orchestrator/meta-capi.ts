/**
 * Meta Conversions API (CAPI) — generic event sender.
 *
 * Supports two kinds of events:
 *   1. Email events (OPEN / CLICK) — tied to an EmailQueue row, persisted
 *      in TrackingLog.metaPayload for audit.
 *   2. Platform events (Lead / CompleteRegistration / Purchase) — tied to
 *      a user + RSVP, persisted in a generic event log via the caller.
 *
 * We ALWAYS construct the payload. We ONLY send to Meta if:
 *   - META_ACCESS_TOKEN is set
 *   - META_PIXEL_ID is set
 *
 * When META_TEST_EVENT_CODE is set, the payload includes `test_event_code`
 * so the event shows up in Meta Events Manager "Test Events" tab without
 * affecting real ad attribution.
 *
 * Reference:
 * https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import type { Prisma } from "@prisma/client";

export type MetaEventName =
  | "EmailOpen"
  | "EmailClick"
  | "Lead"           // RSVP created
  | "CompleteRegistration" // door check-in / attended
  | "Purchase"       // paid event (future)
  | "PageView";      // not typically sent via CAPI (browser pixel handles it)

export type MetaActionSource = "email" | "website" | "system";

export type MetaEventInput = {
  event_name: MetaEventName;
  /** Event time (Unix seconds). Defaults to now. */
  event_time?: number;
  /** Action source — what surface the event happened on. */
  action_source: MetaActionSource;
  /** User email (will be SHA-256 hashed). */
  email: string;
  /** Optional PII for identity stitching (all SHA-256 hashed + lowercased). */
  firstName?: string;
  lastName?: string;
  phone?: string;
  city?: string;
  country?: string;
  /** Optional event_id for deduplication with browser pixel. */
  event_id?: string;
  /** Optional event source URL. */
  event_source_url?: string;
  /** Optional custom data (content_name, value, currency, etc.). */
  custom_data?: {
    content_name?: string;
    content_category?: string;
    content_ids?: string[];
    value?: number;
    currency?: string;
    [k: string]: unknown;
  };
};

type MetaPayload = {
  data: Array<{
    event_name: string;
    event_time: number;
    action_source: string;
    event_id?: string;
    event_source_url?: string;
    user_data: Record<string, string[]>;
    custom_data?: Record<string, unknown>;
  }>;
  test_event_code?: string;
};

/** Build the CAPI payload from a typed input. */
export function buildMetaPayload(input: MetaEventInput): MetaPayload {
  const event_time = input.event_time ?? Math.floor(Date.now() / 1000);
  const user_data: Record<string, string[]> = {};

  // Required: email (hashed)
  if (input.email) {
    user_data.em = [sha256Hex(input.email.toLowerCase().trim())];
  }
  // Optional PII (all hashed + lowercased per Meta spec)
  if (input.firstName) {
    user_data.fn = [sha256Hex(input.firstName.toLowerCase().trim())];
  }
  if (input.lastName) {
    user_data.ln = [sha256Hex(input.lastName.toLowerCase().trim())];
  }
  if (input.phone) {
    // Strip non-digits, country code prefix is recommended
    const cleaned = input.phone.replace(/[^\d]/g, "");
    user_data.ph = [sha256Hex(cleaned)];
  }
  if (input.city) {
    user_data.ct = [sha256Hex(input.city.toLowerCase().trim())];
  }
  if (input.country) {
    user_data.country = [sha256Hex(input.country.toLowerCase().trim())];
  }
  // External ID — stable identifier for cross-device matching.
  // We use the email hash as external_id too (since we don't have a
  // separate user_id concept in Meta's schema).
  if (input.email) {
    user_data.external_id = [sha256Hex(input.email.toLowerCase().trim())];
  }

  const event: MetaPayload["data"][number] = {
    event_name: input.event_name,
    event_time,
    action_source: input.action_source,
    user_data,
  };

  if (input.event_id) event.event_id = input.event_id;
  if (input.event_source_url) event.event_source_url = input.event_source_url;
  if (input.custom_data) event.custom_data = input.custom_data;

  const payload: MetaPayload = { data: [event] };

  const testCode = process.env.META_TEST_EVENT_CODE;
  if (testCode) payload.test_event_code = testCode;

  return payload;
}

/**
 * Send the payload to Meta Graph API. Returns { ok, status, body } —
 * does NOT throw on failure (caller decides what to do).
 */
export async function sendMetaPayload(
  payload: MetaPayload,
): Promise<{ ok: boolean; status: number; body: string }> {
  const token = process.env.META_ACCESS_TOKEN;
  const pixelId = process.env.META_PIXEL_ID;
  if (!token || !pixelId) {
    return { ok: false, status: 0, body: "META_ACCESS_TOKEN or META_PIXEL_ID not set" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: -1, body: String(err) };
  }
}

// ----------------------------------------------------------------------------
// Email-specific helper (for backwards compat with TrackingLog persistence)
// ----------------------------------------------------------------------------

/**
 * @deprecated Use buildMetaPayload + sendMetaPayload directly. Kept for
 * the existing email-open / email-click tracking routes which persist
 * to TrackingLog.metaPayload.
 */
export type LegacyMetaEventInput = {
  queueId: string;
  type: "OPEN" | "CLICK";
  email: string;
  targetUrl?: string | null;
  eventTime?: Date;
  sourceUrl?: string;
};

/** @deprecated Build a payload in the legacy email-event shape. */
export function buildLegacyEmailPayload(input: LegacyMetaEventInput): MetaPayload {
  return buildMetaPayload({
    event_name: input.type === "OPEN" ? "EmailOpen" : "EmailClick",
    event_time: input.eventTime ? Math.floor(input.eventTime.getTime() / 1000) : undefined,
    action_source: "email",
    email: input.email,
    event_source_url: input.sourceUrl,
    custom_data:
      input.type === "CLICK" && input.targetUrl
        ? {
            content_name: "email_link_click",
            content_category: "email_engagement",
            content_ids: [input.queueId],
            value: 0,
            currency: "USD",
          }
        : {
            content_name: "email_open",
            content_category: "email_engagement",
            content_ids: [input.queueId],
          },
  });
}

/**
 * Persist the CAPI payload to TrackingLog + try to send. Used by the
 * existing /api/track/email-open and /api/track/email-click routes.
 */
export async function recordAndSendMeta(
  payload: MetaPayload,
  queueId: string,
  type: "OPEN" | "CLICK",
  targetUrl: string | null,
  userAgent: string | null,
  ip: string | null,
  prisma: Prisma.TransactionClient,
): Promise<{ id: string; metaSentAt: Date | null }> {
  // Persist first (always — even if send fails, we want the record).
  const log = await prisma.trackingLog.create({
    data: {
      queueId,
      type,
      targetUrl,
      userAgent,
      ip,
      metaPayload: payload as unknown as Prisma.InputJsonValue,
      metaSentAt: null,
    },
  });

  const result = await sendMetaPayload(payload);
  if (result.ok) {
    const updated = await prisma.trackingLog.update({
      where: { id: log.id },
      data: { metaSentAt: new Date() },
    });
    return { id: log.id, metaSentAt: updated.metaSentAt };
  }
  if (result.status !== 0) {
    // status=0 means "env not configured" — silent. Otherwise log.
    console.error("[meta-capi] send failed:", result.status, result.body);
  }
  return { id: log.id, metaSentAt: null };
}

// ----------------------------------------------------------------------------
// SHA-256 helper (Node crypto)
// ----------------------------------------------------------------------------

function sha256Hex(s: string): string {
  const crypto = require("node:crypto") as typeof import("node:crypto");
  return crypto.createHash("sha256").update(s, "utf-8").digest("hex");
}

// ----------------------------------------------------------------------------
// High-level convenience: logCapiEvent — used by /api/track/open & /click.
// Builds a MetaPayload from the human-friendly input, persists a TrackingLog
// stub, and attempts the Meta CAPI send (best-effort — failures are logged
// but never thrown, since email open pixels must always return 200).
// ----------------------------------------------------------------------------

export type LogCapiEventInput = {
  userId: string;
  userEmail: string;
  userRole: string;
  eventId: string | null;
  eventTitle: string | null;
  stage: string | null;
  emailId: string;
  eventName: "Open" | "Click" | "Send" | "Bounce" | "Deliver";
  eventSourceUrl: string | null;
  trackingLogId: string;
};

export async function logCapiEvent(input: LogCapiEventInput): Promise<{ id: string; metaSentAt: Date | null }> {
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const payload = buildMetaPayload({
      eventName: input.eventName as MetaEventName,
      actionSource: "email",
      eventSourceUrl: input.eventSourceUrl,
      userEmail: input.userEmail,
      userId: input.userId,
      eventTitle: input.eventTitle,
      stage: input.stage,
      emailId: input.emailId,
    });
    return await recordAndSendMeta(
      payload,
      input.trackingLogId,
      input.eventName.toUpperCase() as "OPEN" | "CLICK",
      input.eventSourceUrl,
      null, // userAgent
      null, // ip
      prisma,
    );
  } finally {
    await prisma.$disconnect();
  }
}
