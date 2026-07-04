/**
 * UTM parameter types — used by every tracking utility.
 */

/** The 5 standard UTM parameters + the resolved affId. */
export type UtmParams = {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string
  utm_term: string
}

/** Empty (organic / no-UTM) UTM params. */
export const EMPTY_UTM: UtmParams = {
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  utm_content: "",
  utm_term: "",
}

/** Full UTM snapshot — first-touch + last-touch + affId + sessionId. */
export type UtmSnapshot = UtmParams & {
  affId: string
  sessionId: string
  firstTouch: UtmParams
  lastTouch: UtmParams
}

/**
 * The priority order for resolving the affiliate ID from URL params,
 * per the Affiliate UTM doc §2.2. Aff-Id (hyphen) wins, then Aff Id
 * (space, encoded as `+`), then generic `utm`.
 */
export const AFF_ID_PARAM_PRIORITY = ["Aff-Id", "Aff Id", "utm"] as const

/**
 * Resolves the affiliate ID from a URLSearchParams object.
 * Returns empty string if none of the priority params are present.
 *
 * Per the doc, this runs ONCE per page mount (via useState initializer)
 * so we always attribute to the FIRST landing URL, not subsequent
 * client-side navigations.
 */
export function resolveAffIdFromSearchParams(
  searchParams: URLSearchParams | null | undefined,
): string {
  if (!searchParams) return ""
  for (const key of AFF_ID_PARAM_PRIORITY) {
    const v = searchParams.get(key)
    if (v && v.trim()) return v.trim()
  }
  return ""
}

/**
 * Extracts the 5 standard UTM params from a URLSearchParams object.
 * Missing params default to empty string.
 */
export function extractUtmParams(
  searchParams: URLSearchParams | null | undefined,
): UtmParams {
  if (!searchParams) return { ...EMPTY_UTM }
  return {
    utm_source: searchParams.get("utm_source") || "",
    utm_medium: searchParams.get("utm_medium") || "",
    utm_campaign: searchParams.get("utm_campaign") || "",
    utm_content: searchParams.get("utm_content") || "",
    utm_term: searchParams.get("utm_term") || "",
  }
}

/**
 * Appends UTM params + affId to a URL. Skips empty values.
 * Used by ShareButton to build tagged share URLs.
 */
export function appendUtmsToUrl(
  baseUrl: string,
  utm: Partial<UtmParams> & { affId?: string },
): string {
  if (!baseUrl) return baseUrl
  const url = new URL(baseUrl)
  if (utm.utm_source) url.searchParams.set("utm_source", utm.utm_source)
  if (utm.utm_medium) url.searchParams.set("utm_medium", utm.utm_medium)
  if (utm.utm_campaign) url.searchParams.set("utm_campaign", utm.utm_campaign)
  if (utm.utm_content) url.searchParams.set("utm_content", utm.utm_content)
  if (utm.utm_term) url.searchParams.set("utm_term", utm.utm_term)
  if (utm.affId) url.searchParams.set("Aff-Id", utm.affId)
  return url.toString()
}

/** True if the affId looks like an AI Salon member referral code. */
export function isMemberReferralCode(affId: string | null | undefined): boolean {
  return !!affId && affId.startsWith("SAL-")
}

/** True if any UTM param is non-empty. */
export function hasUtmParams(utm: UtmParams): boolean {
  return Boolean(
    utm.utm_source || utm.utm_medium || utm.utm_campaign || utm.utm_content || utm.utm_term,
  )
}
