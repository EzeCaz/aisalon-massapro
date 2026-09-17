/**
 * Subdomain-aware URL builder for the Coma split-domain architecture.
 *
 * Since 2026-09-17, the Coma brand lives on TWO hosts:
 *
 *   - joincoma.com             (apex) → login surface ONLY (login + auth)
 *   - platform.joincoma.com    (subdomain) → everything else (events,
 *     admin, community, testimonials, resources, /api/* except /api/auth/*)
 *
 * The middleware enforces the split by 302-redirecting out-of-scope paths
 * to the correct host. But emails and other URL builders need to construct
 * the right URL the first time (without a redirect round-trip) so email
 * links land the user on the right subdomain immediately.
 *
 * This helper centralizes the "which host does this path belong on?"
 * decision so email templates, RSVP confirmations, and cron workers don't
 * need to duplicate the routing logic.
 *
 * USAGE:
 *   import { resolveComaSiteUrl } from "@/lib/brand/coma-site-url";
 *
 *   // In an email template — for a Coma user:
 *   const eventUrl = resolveComaSiteUrl("coma", "/events/some-slug");
 *   // → "https://platform.joincoma.com/events/some-slug"
 *
 *   const loginUrl = resolveComaSiteUrl("coma", "/login");
 *   // → "https://joincoma.com/login"
 *
 *   // For an AIS user: returns the AIS single-domain URL unchanged.
 *   resolveComaSiteUrl("aisalon", "/events/some-slug")
 *   // → "https://aisalon.massapro.com/events/some-slug"
 *
 * DECISION: For non-Coma brands, this helper simply returns the brand's
 * siteUrl + path (no split). For Coma, it inspects the path and routes
 * to the apex (login) or the subdomain (everything else).
 */

import type { BrandSlug } from "@/lib/brand/brand-config";

/**
 * Paths (or path prefixes) that belong on the APEX (joincoma.com), not
 * the app subdomain. Everything else goes to platform.joincoma.com.
 *
 * - /login            — the login page itself
 * - /api/auth/*       — NextAuth callback handlers (Google OAuth, etc.)
 *                       These MUST be on the same host that initiated
 *                       the OAuth flow, otherwise the redirect_uri
 *                       registered with Google won't match.
 * - /favicon.ico      — served from apex so the browser tab icon is
 *                       correct on the login page (already excluded
 *                       from middleware, but listed here for completeness).
 *
 * Note: After login, the post-login-redirect API route handles the
 * redirect to the app subdomain (with the session cookie set on
 * .joincoma.com so it's readable on both apex and platform).
 */
const APEX_PATHS: Array<{ prefix: string; exact?: boolean }> = [
  { prefix: "/login", exact: true },
  { prefix: "/api/auth/" },
];

/**
 * Determine whether a path belongs on the Coma apex (joincoma.com) or
 * the app subdomain (platform.joincoma.com).
 */
function isApexPath(pathname: string): boolean {
  return APEX_PATHS.some((rule) => {
    if (rule.exact) return pathname === rule.prefix;
    return pathname.startsWith(rule.prefix);
  });
}

/**
 * Brand slug → base URLs for the Coma split-domain architecture.
 *
 * For brands that don't use a split, `apex` and `app` are the same value.
 */
const BRAND_HOSTS: Record<BrandSlug, { apex: string; app: string }> = {
  coma: {
    apex: "https://joincoma.com",
    app: "https://platform.joincoma.com",
  },
  aisalon: {
    apex: "https://aisalon.massapro.com",
    app: "https://aisalon.massapro.com",
  },
};

/**
 * Build a full URL for a brand-aware path, using the correct subdomain
 * for the Coma split-domain architecture.
 *
 * For Coma:
 *   - /login and /api/auth/* → https://joincoma.com/...
 *   - everything else         → https://platform.joincoma.com/...
 *
 * For AIS (or any future single-domain brand):
 *   - always returns siteUrl + path (no split)
 *
 * @param brandSlug   - The brand to build the URL for
 * @param path        - The absolute path (must start with "/"). Query
 *                      strings are preserved.
 * @returns Full URL string (e.g. "https://platform.joincoma.com/events")
 */
export function resolveComaSiteUrl(
  brandSlug: BrandSlug | string,
  path: string,
): string {
  // Normalize the slug to a valid BrandSlug (defensive — if an unknown
  // slug is passed, fall back to AIS which is single-domain).
  const slug: BrandSlug =
    brandSlug === "coma" || brandSlug === "aisalon" ? brandSlug : "aisalon";

  const hosts = BRAND_HOSTS[slug];
  if (!path.startsWith("/")) {
    // Defensive — callers should always pass an absolute path, but if
    // someone passes a relative path, prepend "/" to avoid a malformed URL.
    path = "/" + path;
  }

  // For AIS or any non-split brand, apex === app — no need to check the path.
  if (hosts.apex === hosts.app) {
    return `${hosts.app}${path}`;
  }

  // Coma — route based on path.
  const base = isApexPath(path) ? hosts.apex : hosts.app;
  return `${base}${path}`;
}

/**
 * Return the APEX host (login surface) for a brand.
 *
 * For Coma → "https://joincoma.com"
 * For AIS   → "https://aisalon.massapro.com"
 */
export function getBrandLoginHost(brandSlug: BrandSlug | string): string {
  const slug: BrandSlug =
    brandSlug === "coma" || brandSlug === "aisalon" ? brandSlug : "aisalon";
  return BRAND_HOSTS[slug].apex;
}

/**
 * Return the APP host (everything-except-login surface) for a brand.
 *
 * For Coma → "https://platform.joincoma.com"
 * For AIS   → "https://aisalon.massapro.com"
 */
export function getBrandAppHost(brandSlug: BrandSlug | string): string {
  const slug: BrandSlug =
    brandSlug === "coma" || brandSlug === "aisalon" ? brandSlug : "aisalon";
  return BRAND_HOSTS[slug].app;
}
