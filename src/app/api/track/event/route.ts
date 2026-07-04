/**
 * POST /api/track/event
 *
 * Server-side tracking endpoint for platform events (RSVP, door check-in,
 * attended, no-show). Fires GA4 Measurement Protocol + Meta Conversions
 * API in parallel. Both calls are best-effort — failures don't fail the
 * HTTP request.
 *
 * Auth:
 *   - CRON_SECRET bearer token (server-to-server calls, e.g. RSVP API)
 *   - Admin NextAuth session (manual admin actions)
 *
 * Body:
 *   {
 *     event_name: "Lead" | "CompleteRegistration" | "Purchase",
 *     event_id:   string,            // for dedup with browser pixel (e.g. rsvpId)
 *     email:      string,            // for identity stitching
 *     event_slug?: string,           // event slug (for content_name)
 *     custom_data?: Record<string, any>,
 *     // Optional PII for Meta identity matching
 *     first_name?: string,
 *     last_name?: string,
 *     phone?: string,
 *     city?: string,
 *     country?: string,
 *     // Optional: pass browser _ga cookie value for GA4 client_id stitching
 *     client_id?: string,
 *   }
 *
 * Response:
 *   200 { ok: true, ga4: GA4SendResult, meta: MetaSendResult }
 *   401 { error: "unauthorized" }
 *   400 { error: "missing required field: <name>" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendGA4Event } from "@/lib/analytics/ga4";
import { buildMetaPayload, sendMetaPayload, type MetaEventName } from "@/lib/email-orchestrator/meta-capi";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

const ALLOWED_EVENTS = new Set([
  "Lead",                  // RSVP created (matches Meta standard event)
  "CompleteRegistration",  // door check-in OR attended
  "Purchase",              // paid event (future)
]);

/** Map platform event_name → GA4 event_name. */
const GA4_EVENT_MAP: Record<string, "rsvp_submit" | "door_checkin" | "attended" | "no_show" | "purchase"> = {
  Lead: "rsvp_submit",
  CompleteRegistration: "attended",
  Purchase: "purchase",
};

export async function POST(req: NextRequest) {
  // --- auth ---
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isCron = bearerToken && CRON_SECRET && bearerToken === CRON_SECRET;

  let isAdmin = false;
  if (!isCron) {
    const session = await getServerSession(authOptions);
    isAdmin = !!session?.user?.email;
  }

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // --- parse body ---
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const event_name = body.event_name as string | undefined;
  const event_id = body.event_id as string | undefined;
  const email = body.email as string | undefined;
  const event_slug = body.event_slug as string | undefined;
  const custom_data = body.custom_data as Record<string, unknown> | undefined;
  const first_name = body.first_name as string | undefined;
  const last_name = body.last_name as string | undefined;
  const phone = body.phone as string | undefined;
  const city = body.city as string | undefined;
  const country = body.country as string | undefined;
  const client_id = body.client_id as string | undefined;

  // --- validate ---
  if (!event_name || !ALLOWED_EVENTS.has(event_name)) {
    return NextResponse.json(
      { error: `missing or invalid event_name (allowed: ${[...ALLOWED_EVENTS].join(", ")})` },
      { status: 400 },
    );
  }
  if (!email) {
    return NextResponse.json({ error: "missing required field: email" }, { status: 400 });
  }
  if (!event_id) {
    return NextResponse.json({ error: "missing required field: event_id (for dedup)" }, { status: 400 });
  }

  // --- fire GA4 + Meta in parallel ---
  const ga4EventName = GA4_EVENT_MAP[event_name] ?? "rsvp_submit";
  const metaEventName = event_name as MetaEventName;

  const [ga4, metaResult] = await Promise.all([
    sendGA4Event({
      event_name: ga4EventName,
      email,
      client_id,
      params: {
        event_id,
        event_slug: event_slug ?? undefined,
        ...custom_data,
      },
    }),
    (async () => {
      const payload = buildMetaPayload({
        event_name: metaEventName,
        action_source: "website",
        email,
        firstName: first_name,
        lastName: last_name,
        phone,
        city,
        country,
        event_id,
        event_source_url: event_slug ? `https://aisalon.massapro.com/e/${event_slug}` : undefined,
        custom_data: {
          content_name: event_slug ?? undefined,
          content_category: event_name,
          content_ids: event_id ? [event_id] : undefined,
          ...custom_data,
        },
      });
      const result = await sendMetaPayload(payload);
      return { ...result, payload };
    })(),
  ]);

  // --- audit log (server-side, always persisted) ---
  // We log to a console log line for now — could be persisted to a
  // TrackingEvent table if needed.
  console.log("[track/event]", {
    event_name,
    event_id,
    email,
    event_slug,
    ga4_ok: ga4.ok,
    meta_ok: metaResult.ok,
    at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    ga4: { ok: ga4.ok, status: ga4.status },
    meta: { ok: metaResult.ok, status: metaResult.status },
    event_id,
  });
}

/** GET — health check. Returns 200 with the auth status. */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isCron = bearerToken && CRON_SECRET && bearerToken === CRON_SECRET;
  return NextResponse.json({
    ok: true,
    endpoint: "/api/track/event",
    auth: isCron ? "cron" : "anonymous",
    ga4_configured: !!(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET),
    meta_configured: !!(process.env.META_ACCESS_TOKEN && process.env.META_PIXEL_ID),
  });
}
