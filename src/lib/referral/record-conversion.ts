/**
 * Conversion recorder — records a referral conversion when a visitor
 * who arrived via a member's referral link converts.
 *
 * Used by:
 *   - /api/auth/signup (signup conversion)
 *   - /api/user/onboarding (onboarding conversion)
 *   - /api/events/[slug]/rsvp (rsvp conversion)
 *   - Contact dialog open (contact conversion — fires on click, not message send)
 */

import { db } from "@/lib/db"
import { resolveReferral } from "./resolve-referral"
import type { UtmParams } from "@/lib/tracking/utm-types"

type RecordConversionInput = {
  affId: string | null | undefined
  conversionType: "signup" | "onboarding" | "rsvp" | "contact" | "profile_completed"
  conversionRef?: string
  referredEmail?: string
  referredUserId?: string
  utm?: Partial<UtmParams>
  ftUtm?: Partial<UtmParams>
  sessionId?: string
}

/**
 * Records a referral conversion. NO-OP if:
 *   - affId is null/empty
 *   - affId is not a member referral code
 *   - affId doesn't match any User
 *   - a conversion with the same (referringUserId, conversionType, conversionRef) already exists
 *
 * Returns the created ReferralConversion, or null if no conversion was recorded.
 */
export async function recordConversion(
  input: RecordConversionInput,
) {
  const { affId, conversionType, conversionRef } = input
  if (!affId || !affId.startsWith("SAL-")) return null

  const referrer = await resolveReferral(affId)
  if (!referrer) return null

  try {
    const conversion = await db.referralConversion.create({
      data: {
        referringUserId: referrer.id,
        referredEmail: input.referredEmail || null,
        referredUserId: input.referredUserId || null,
        conversionType,
        conversionRef: conversionRef || null,
        affId,
        utmSnapshot: {
          utm: input.utm || {},
          ftUtm: input.ftUtm || {},
          sessionId: input.sessionId,
        },
        sessionId: input.sessionId || null,
      },
    })
    return conversion
  } catch (err: unknown) {
    // P2002 = unique constraint violation (duplicate conversion). Safe to ignore —
    // happens when the same user converts twice (e.g. signs up then onboards).
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return null
    }
    throw err
  }
}
