/**
 * Referral code resolver.
 *
 * Given an affId (from URL or cookie), determines if it's a member
 * referral code (SAL-...) and if so, returns the referring User.
 */

import { db } from "@/lib/db"
import { isMemberReferralCode } from "@/lib/tracking/utm-types"

/**
 * Resolves an affId to a referring User. Returns null if:
 *   - affId is null/empty
 *   - affId is not a member referral code (e.g. MP-ROBERTO-001 from receptionist)
 *   - affId is a member referral code but doesn't match any User
 */
export async function resolveReferral(affId: string | null | undefined) {
  if (!affId || !isMemberReferralCode(affId)) return null
  const user = await db.user.findFirst({
    where: { referralCode: affId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      archivedAt: true,
    },
  })
  // Per user spec: archived members keep their referral codes (personal,
  // even if no longer active). So we DON'T filter by archivedAt = null.
  return user
}
