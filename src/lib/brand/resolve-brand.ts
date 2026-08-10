/**
 * 4-layer brand resolution chain.
 *
 * Per the Brand-Field Platform Plan §2.5.1, the brand shown to a visitor
 * is resolved by checking four sources in order, taking the first hit:
 *
 *   1. URL `?brand=<slug>` parameter  — explicit override (sales demo mode,
 *      external brand demos without DNS changes)
 *   2. Request host header             — coma.massapro.com → coma,
 *      aisalon.massapro.com → aisalon (see BRAND_HOST_MAP)
 *   3. User session `user.brandId`     — once the user is signed in, their
 *      brand preference is sticky (not yet implemented — needs the Brand
 *      table + user.brandId column)
 *   4. Environment variable            — BRAND_DEFAULT_SLUG, falls back
 *      to "aisalon" if unset
 *
 * Layer 3 (session-based) is a stub for now — it always returns null.
 * It will be implemented when the Brand table is added to the Prisma
 * schema and the User model gains a `brandId` foreign key.
 *
 * SECURITY:
 *   - `resolveBrand` is safe to call from PUBLIC routes (no auth check).
 *   - It only reads the request's Host header + URL search params + env.
 *   - It returns a BrandConfig (display config only — never secrets).
 *
 * PERFORMANCE:
 *   - All operations are O(1) hash lookups — no DB calls.
 *   - The function is safe to call on every request (used in middleware
 *     and RSC page components).
 */

import {
  BRAND_HOST_MAP,
  BRAND_DEFAULT_SLUG_ENV,
  FALLBACK_DEFAULT_BRAND,
  getBrandConfig,
  isBrandSlug,
  type BrandConfig,
  type BrandSlug,
} from "./brand-config";

/**
 * Inputs to the brand resolution chain.
 *
 * Each input corresponds to one layer of the chain:
 *   - `urlBrandSlug`     → layer 1 (URL `?brand=` override)
 *   - `hostHeader`       → layer 2 (host-based default)
 *   - `userBrandSlug`    → layer 3 (session-based — not yet implemented)
 *   - `envDefaultSlug`   → layer 4 (BRAND_DEFAULT_SLUG env var)
 *
 * The caller is expected to gather these from the appropriate context:
 *   - In RSC page components: read `searchParams` for URL, `headers()`
 *     for host, `process.env` for env default.
 *   - In middleware: read `req.nextUrl.searchParams` for URL,
 *     `req.headers.get("host")` for host.
 */
export interface BrandResolutionInputs {
  /** Value of `?brand=` URL parameter, or null if not present. */
  urlBrandSlug?: string | null;
  /** Value of the HTTP `Host` header, or null if not present. */
  hostHeader?: string | null;
  /** User's session brand slug (layer 3 — currently always null). */
  userBrandSlug?: string | null;
  /** Value of `process.env.BRAND_DEFAULT_SLUG`, or null if unset. */
  envDefaultSlug?: string | null;
}

/**
 * Resolve the brand for a request.
 *
 * Implements the 4-layer chain: URL → host → user → env.
 *
 * Returns the resolved BrandConfig (always defined — falls back to the
 * platform default `aisalon` if no layer matches).
 *
 * The returned object is the SINGLE SOURCE OF TRUTH for all brand
 * rendering on the page. The caller should pass it down to all child
 * components as a prop rather than re-resolving.
 */
export function resolveBrand(inputs: BrandResolutionInputs): BrandConfig {
  // Layer 1 — URL `?brand=` override (explicit, highest priority).
  if (inputs.urlBrandSlug && isBrandSlug(inputs.urlBrandSlug)) {
    return getBrandConfig(inputs.urlBrandSlug);
  }

  // Layer 2 — Host header → BRAND_HOST_MAP lookup.
  if (inputs.hostHeader) {
    const host = normalizeHost(inputs.hostHeader);
    if (host && host in BRAND_HOST_MAP) {
      return getBrandConfig(BRAND_HOST_MAP[host]);
    }
  }

  // Layer 3 — User session brand (stub for future implementation).
  // When the Brand table is added, this will read `user.brandId` from
  // the NextAuth session and look up the brand slug.
  if (inputs.userBrandSlug && isBrandSlug(inputs.userBrandSlug)) {
    return getBrandConfig(inputs.userBrandSlug);
  }

  // Layer 4 — Environment variable default.
  if (inputs.envDefaultSlug && isBrandSlug(inputs.envDefaultSlug)) {
    return getBrandConfig(inputs.envDefaultSlug);
  }

  // Final fallback — hard-coded platform default.
  return getBrandConfig(FALLBACK_DEFAULT_BRAND);
}

/**
 * Normalize a Host header for BRAND_HOST_MAP lookup.
 *
 *   - Lowercase
 *   - Strip port (e.g. "coma.massapro.com:3000" → "coma.massapro.com")
 *   - Strip trailing dot (rare but legal DNS)
 */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/**
 * Convenience: read BRAND_DEFAULT_SLUG from process.env at call time.
 *
 * Used by RSC page components that don't want to plumb the env value
 * through manually. Safe to call from server code only.
 */
export function getEnvDefaultBrandSlug(): string | null {
  const v = process.env[BRAND_DEFAULT_SLUG_ENV];
  return v || null;
}

/**
 * Convenience: get the list of all valid brand slugs.
 *
 * Used by the login form's brand switcher (dev-only) and by middleware
 * to validate `?brand=` parameters before forwarding.
 */
export function listBrandSlugs(): BrandSlug[] {
  return ["aisalon", "coma"];
}
