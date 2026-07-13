/**
 * POST /api/track/pageview
 *
 * Records a page view in the local Prisma DB. Fire-and-forget —
 * clients call this via sendBeacon on every page load.
 *
 * Also updates User.lastActiveAt when userId is provided, so the admin
 * activity-report page can show "last seen on the platform at X".
 *
 * Body: {
 *   sessionId, affId?, userId?, pageUrl, pagePath, referrer?, userAgent?,
 *   utmSource?, utmMedium?, utmCampaign?, utmContent?, utmTerm?,
 *   ftUtmSource?, ftUtmMedium?, ftUtmCampaign?, ftUtmContent?, ftUtmTerm?
 * }
 *
 * Returns: { ok: true, pageViewId: "<cuid>" }
 *   The pageViewId is used by the client to pair a page-leave event
 *   with this pageview (for session-duration tracking).
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

    const pageView = await db.pageView.create({
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
      select: { id: true },
    })

    // Update User.lastActiveAt so "last seen" is fresher than lastLoginAt.
    // Fire-and-forget — if this fails, we still return ok to the client.
    if (body.userId) {
      try {
        await db.user.update({
          where: { id: body.userId },
          data: { lastActiveAt: new Date() },
        })
      } catch {
        // Ignore — user may have been deleted between session start and now.
      }
    }

    return NextResponse.json({ ok: true, pageViewId: pageView.id })
  } catch (err) {
    console.error("[track/pageview] error:", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
