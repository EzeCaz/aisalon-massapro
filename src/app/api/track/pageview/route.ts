/**
 * POST /api/track/pageview
 *
 * Records a page view in the local Prisma DB. Fire-and-forget —
 * clients call this via sendBeacon on every page load.
 *
 * Body: {
 *   sessionId, affId?, userId?, pageUrl, pagePath, referrer?, userAgent?,
 *   utmSource?, utmMedium?, utmCampaign?, utmContent?, utmTerm?,
 *   ftUtmSource?, ftUtmMedium?, ftUtmCampaign?, ftUtmContent?, ftUtmTerm?
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const required = ["sessionId", "pageUrl", "pagePath"]
    for (const f of required) {
      if (!body[f]) {
        return NextResponse.json({ error: `missing ${f}` }, { status: 400 })
      }
    }

    const ip =
      body.ipAddress ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null

    await db.pageView.create({
      data: {
        sessionId: body.sessionId,
        affId: body.affId || null,
        userId: body.userId || null,
        pageUrl: body.pageUrl,
        pagePath: body.pagePath,
        referrer: body.referrer || null,
        userAgent: body.userAgent || request.headers.get("user-agent") || null,
        ipAddress: ip,
        utmSource: body.utmSource || null,
        utmMedium: body.utmMedium || null,
        utmCampaign: body.utmCampaign || null,
        utmContent: body.utmContent || null,
        utmTerm: body.utmTerm || null,
        ftUtmSource: body.ftUtmSource || null,
        ftUtmMedium: body.ftUtmMedium || null,
        ftUtmCampaign: body.ftUtmCampaign || null,
        ftUtmContent: body.ftUtmContent || null,
        ftUtmTerm: body.ftUtmTerm || null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[track/pageview] error:", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
