/**
 * POST /api/track/lead
 *
 * Records a tracked conversion/lead. Called after successful signup,
 * onboarding, RSVP, contact, etc.
 *
 * Body: {
 *   sessionId, affId?, userId?, name, email?, phone?, company?,
 *   conversionType, conversionRef?, initialStatus?, planType?,
 *   utmSource?, utmMedium?, utmCampaign?, utmContent?, utmTerm?,
 *   ftUtmSource?, ftUtmMedium?, ftUtmCampaign?, ftUtmContent?, ftUtmTerm?
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (!body.sessionId || !body.name || !body.conversionType) {
      return NextResponse.json(
        { error: "missing sessionId, name, or conversionType" },
        { status: 400 },
      )
    }

    await db.trackedLead.create({
      data: {
        sessionId: body.sessionId,
        affId: body.affId || null,
        userId: body.userId || null,
        name: body.name,
        email: body.email || null,
        phone: body.phone || null,
        company: body.company || null,
        conversionType: body.conversionType,
        conversionRef: body.conversionRef || null,
        initialStatus: body.initialStatus || null,
        planType: body.planType || null,
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
    console.error("[track/lead] error:", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
