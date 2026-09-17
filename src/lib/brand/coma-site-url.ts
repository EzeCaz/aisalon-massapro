/**
 * Brand-aware URL builder.
 *
 * REVISED 2026-09-17 (Interpretation A "centralized login"):
 * The split-domain architecture (joincoma.com apex for login, platform.joincoma.com
 * subdomain for app) was DROPPED in favor of a single host per brand. All
 * future brands (Danone, HiTech AI, etc.) live on platform.joincoma.com —
 * they don't get their own apex domain. Brand identity is URL-driven
 * (?brand=<slug>), not host-driven.
 *
 * AIS is the only exception: it keeps its standalone single domain
 * (aisalon.massapro.com) permanently.
 *
 * This helper now just returns the brand's single app host + the path.
 * It's kept as a function (rather than inlined) so callers have a clear
 * injection point for "brand-aware URL" and so future evolution (e.g.
 * a future "split domain" opt-in for specific brands) can happen here
 * without touching call sites.
 *
 * USAGE:
 *   import { resolveBrandSiteUrl } from "@/lib/brand/coma-site-url";
 *
 *   const eventUrl = resolveBrandSiteUrl("coma", "/events/some-slug");
 *   // → "https://platform.joincoma.com/events/some-slug"
 *
 *   resolveBrandSiteUrl("aisalon", "/events/some-slug")
 *   // → "https://aisalon.massapro.com/events/some-slug"
 *
 *   resolveBrandSiteUrl("danone", "/events/some-slug")  // future brand
 *   // → "https://platform.joincoma.com/events/some-slug" (until Danone
 *   //    gets its own domain, which would require a schema + UI change)
 */

import type { BrandSlug } from "@/lib/brand/brand-config";

/**
 * Brand slug → single app host (no split domain).
 *
 * For AIS → https://aisalon.massapro.com (grandfathered standalone).
 * For Coma → https://platform.joincoma.com (the central platform host).
 * For future brands → https://platform.joincoma.com (they all live on
 * the central host until/unless we add per-brand domain config to the
 * Brand table in Phase 3C).
 *
 * NOTE: this is a hard-coded map for now (Phase 1). In Phase 3B this
 * will be replaced by a DB lookup on the Brand table (which will have
 * `appDomain` + `domainArchitecture` fields). The function signature
 * stays the same — only the implementation changes.
 */
const BRAND_APP_HOSTS: Record<BrandSlug, string> = {
  coma: "https://platform.joincoma.com",
  aisalon: "https://aisalon.massapro.com",
};

/**
 * Build a full URL for a brand-aware path, using the brand's app host.
 *
 * For AIS → https://aisalon.massapro.com<path>
 * For Coma → https://platform.joincoma.com<path>
 * For unknown brand → falls back to platform.joincoma.com (the parent
 * platform default — safer than AIS now that Coma is the parent).
 *
 * @param brandSlug   - The brand to build the URL for
 * @param path        - The absolute path (must start with "/"). Query
 *                      strings are preserved.
 * @returns Full URL string (e.g. "https://platform.joincoma.com/events")
 */
export function resolveBrandSiteUrl(
  brandSlug: BrandSlug | string,
  path: string,
): string {
  // Normalize the slug to a valid BrandSlug (defensive — if an unknown
  // slug is passed, fall back to Coma which is the parent platform
  // default since the 2026-09-17 architecture revision).
  const slug: BrandSlug =
    brandSlug === "coma" || brandSlug === "aisalon" ? brandSlug : "coma";

  const host = BRAND_APP_HOSTS[slug];
  if (!path.startsWith("/")) {
    // Defensive — callers should always pass an absolute path, but if
    // someone passes a relative path, prepend "/" to avoid a malformed URL.
    path = "/" + path;
  }
  return `${host}${path}`;
}

/**
 * Return the APEX/login host for a brand.
 *
 * REVISED 2026-09-17: in the single-domain architecture, the login host
 * is the SAME as the app host (no more apex/subdomain split). This
 * function is kept for backward compat with callers that ask for a
 * "login host" explicitly — it just returns the same value as
 * getBrandAppHost(). In Phase 3B it'll be replaced by a DB lookup on
 * the Brand.apexDomain field.
 */
export function getBrandLoginHost(brandSlug: BrandSlug | string): string {
  return getBrandAppHost(brandSlug);
}

/**
 * Return the APP host for a brand.
 *
 * For AIS → https://aisalon.massapro.com (single domain = app = login)
 * For Coma → https://platform.joincoma.com (single domain = app = login)
 */
export function getBrandAppHost(brandSlug: BrandSlug | string): string {
  const slug: BrandSlug =
    brandSlug === "coma" || brandSlug === "aisalon" ? brandSlug : "coma";
  return BRAND_APP_HOSTS[slug];
}

// ─────────────────────────────────────────────────────────────────────
// BACKWARD COMPAT: the original split-domain helper was named
// `resolveComaSiteUrl`. Some call sites still import it. This alias
// preserves them — same signature, same behavior (now just single-host).
// Will be cleaned up in Phase 3E once all callers are migrated.
// ─────────────────────────────────────────────────────────────────────
export const resolveComaSiteUrl = resolveBrandSiteUrl;

// ─────────────────────────────────────────────────────────────────────
// `?brand=<slug>` appending helper
// ─────────────────────────────────────────────────────────────────────

/**
 * Append `?brand=<slug>` to a URL or path string, preserving any existing
 * query string. Used by share-link builders (referral cards, public-event
 * page, testimonial share, email-body links, admin display URLs, etc.)
 * so that when a Coma user shares a link, the recipient sees Coma
 * branding when they click — instead of the platform default.
 *
 * Behavior:
 *   - If the URL already has `?brand=...`, leave it alone (don't override).
 *   - If the URL has a query string (`?...`), append `&brand=<slug>`.
 *   - If the URL has no query string, append `?brand=<slug>`.
 *   - Works on both absolute URLs (`https://...`) and relative paths (`/events/...`).
 *
 * Examples:
 *   appendBrandParam("https://platform.joincoma.com/events/foo", "coma")
 *     → "https://platform.joincoma.com/events/foo?brand=coma"
 *   appendBrandParam("/events/foo?utm_uid=abc123", "aisalon")
 *     → "/events/foo?utm_uid=abc123&brand=aisalon"
 *   appendBrandParam("https://x.com/e/bar?brand=coma", "aisalon")
 *     → "https://x.com/e/bar?brand=coma" (unchanged — brand already set)
 *
 * @param urlOrPath  - The URL or path to append to. Can be a string OR a
 *                     URL object (the function returns a string in both
 *                     cases for simplicity).
 * @param brandSlug  - The brand slug to set (e.g. "coma", "aisalon").
 *                     Pass an empty string to skip (returns the URL unchanged).
 * @returns The URL with `?brand=<slug>` appended (if not already present).
 */
export function appendBrandParam(
  urlOrPath: string | URL,
  brandSlug: string,
): string {
  if (!brandSlug) return urlOrPath.toString();

  // URL object case — use the URL API directly.
  if (urlOrPath instanceof URL) {
    if (!urlOrPath.searchParams.has("brand")) {
      urlOrPath.searchParams.set("brand", brandSlug);
    }
    return urlOrPath.toString();
  }

  // String case — try to parse as URL; if it fails, treat as a path.
  const str = urlOrPath;
  try {
    if (str.startsWith("http://") || str.startsWith("https://")) {
      const u = new URL(str);
      if (!u.searchParams.has("brand")) {
        u.searchParams.set("brand", brandSlug);
      }
      return u.toString();
    }
  } catch {
    // fall through to path handling
  }

  // Relative path case — manual append.
  if (str.includes("?brand=") || str.includes("&brand=")) {
    return str; // already has brand param
  }
  const separator = str.includes("?") ? "&" : "?";
  return `${str}${separator}brand=${encodeURIComponent(brandSlug)}`;
}
