/**
 * POST /api/track/conversion
 *
 * Server-side conversion recording — called by API routes after
 * successful operations (e.g. /api/user/onboarding after onboarding
 * form succeeds). Used to ensure conversions are recorded even if
 * the client-side tracker fails to fire.
 *
 * Also handles referral attribution: if the visitor arrived via a
 * member's referral link (?Aff-Id=SAL-...), this endpoint creates a
 * ReferralConversion row linking the conversion to the referring member.
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (!body.conversionType || !body.name) {
      return NextResponse.json(
        { error: "missing conversionType or name" },
        { status: 400 },
      )
    }

    // 1. Record the TrackedLead row
    const lead = await db.trackedLead.create({
      data: {
        sessionId: body.sessionId || "server",
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
        utmSource: body.utm?.utm_source || null,
        utmMedium: body.utm?.utm_medium || null,
        utmCampaign: body.utm?.utm_campaign || null,
        utmContent: body.utm?.utm_content || null,
        utmTerm: body.utm?.utm_term || null,
        ftUtmSource: body.ftUtm?.utm_source || null,
        ftUtmMedium: body.ftUtm?.utm_medium || null,
        ftUtmCampaign: body.ftUtm?.utm_campaign || null,
        ftUtmContent: body.ftUtm?.utm_content || null,
        ftUtmTerm: body.ftUtm?.utm_term || null,
      },
    })

    // 2. If affId is a member referral code, record the ReferralConversion.
    //    The SAL-... code is matched against User.utmUid (the 12-char hex
    //    share-link id). Strip the "SAL-" prefix before matching.
    const affId = body.affId
    if (affId && affId.startsWith("SAL-")) {
      const utmUid = affId.slice(4) // strip "SAL-"
      const referrer = await db.user.findFirst({
        where: { utmUid },
        select: { id: true },
      })
      if (referrer) {
        try {
          await db.referralConversion.create({
            data: {
              referringUserId: referrer.id,
              referredEmail: body.email || null,
              referredUserId: body.userId || null,
              conversionType: body.conversionType,
              conversionRef: body.conversionRef || lead.id,
              affId,
              utmSnapshot: {
                utm: body.utm || {},
                ftUtm: body.ftUtm || {},
                sessionId: body.sessionId,
              },
              sessionId: body.sessionId,
            },
          })
        } catch (err: unknown) {
          // Unique constraint violation = this conversion was already
          // attributed (e.g. user signed up then onboarded — both
          // could try to attribute). Safe to ignore.
          if (
            err &&
            typeof err === "object" &&
            "code" in err &&
            (err as { code: string }).code === "P2002"
          ) {
            // Ignore duplicate
          } else {
            throw err
          }
        }
      }
    }

    return NextResponse.json({ ok: true, leadId: lead.id })
  } catch (err) {
    console.error("[track/conversion] error:", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
