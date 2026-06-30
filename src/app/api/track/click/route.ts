/**
 * POST /api/track/click
 *
 * Records a click event (button click, scroll, video, funnel step).
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (!body.sessionId || !body.eventType || !body.pageUrl) {
      return NextResponse.json({ error: "missing required fields" }, { status: 400 })
    }

    const ip =
      body.ipAddress ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null

    await db.clickEvent.create({
      data: {
        sessionId: body.sessionId,
        affId: body.affId || null,
        userId: body.userId || null,
        eventType: body.eventType,
        eventId: body.eventId || null,
        pageUrl: body.pageUrl,
        pagePath: body.pagePath || body.pageUrl,
        metadata: body.metadata || undefined,
        utmSource: body.utmSource || null,
        utmMedium: body.utmMedium || null,
        utmCampaign: body.utmCampaign || null,
        utmContent: body.utmContent || null,
        utmTerm: body.utmTerm || null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[track/click] error:", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
