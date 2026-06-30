/**
 * POST /api/track/event
 * GET  /api/track/event (1x1 transparent GIF — pixel-based tracking)
 *
 * Records a generic event (email_click, share, etc.). Used as a
 * fallback when an event doesn't fit the more specific /click or /lead
 * endpoints.
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (!body.eventName && !body.event) {
      return NextResponse.json({ error: "missing eventName" }, { status: 400 })
    }
    const eventName = body.eventName || body.event

    await db.clickEvent.create({
      data: {
        sessionId: body.sessionId || "unknown",
        affId: body.affId || null,
        userId: body.userId || null,
        eventType: body.eventType || "funnel_step",
        eventId: eventName,
        pageUrl: body.pageUrl || "",
        pagePath: body.pagePath || body.pageUrl || "",
        metadata: body.params || body.metadata || undefined,
        utmSource: body.utmSource || null,
        utmMedium: body.utmMedium || null,
        utmCampaign: body.utmCampaign || null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[track/event] POST error:", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const eventName = sp.get("event") || sp.get("eventName")
    if (eventName) {
      await db.clickEvent.create({
        data: {
          sessionId: sp.get("session_id") || "pixel",
          affId: sp.get("affid") || null,
          eventType: sp.get("event_type") || "funnel_step",
          eventId: eventName,
          pageUrl: sp.get("page_url") || request.headers.get("referer") || "",
          pagePath: "",
          metadata: {
            utm_campaign: sp.get("utm_campaign"),
          },
          utmCampaign: sp.get("utm_campaign"),
        },
      })
    }
    // Return 1x1 transparent GIF
    return new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (err) {
    console.error("[track/event] GET error:", err)
    return new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: { "Content-Type": "image/gif" },
    })
  }
}
