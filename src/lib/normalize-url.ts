/**
 * URL normalization for admin-entered external URLs.
 *
 * Why this exists: when an admin types `linkedin.com/company/foo` into a
 * URL field (no `https://` prefix), the browser treats it as a relative
 * path on the current site. So a link that should go to
 * `https://linkedin.com/company/foo` instead resolves to
 * `https://aisalon.massapro.com/c/linkedin.com/company/foo`.
 *
 * This helper is used at the API layer (on save) so the DB never stores
 * schemeless URLs. The render layer also normalizes defensively, so any
 * pre-existing rows that were saved before this fix still render correctly.
 *
 * Behavior:
 *   - null / undefined / empty / whitespace-only → null
 *   - already has `http://` or `https://` (case-insensitive) → returned as-is
 *   - starts with another scheme (e.g. `mailto:`, `javascript:`, `data:`) → null
 *     (security hygiene — the admin UI only accepts http/https anyway)
 *   - any other string → prepended with `https://`
 *
 * Example:
 *   normalizeHttpUrl("linkedin.com/company/foo") → "https://linkedin.com/company/foo"
 *   normalizeHttpUrl("HTTPS://WhatsApp.com/x")   → "HTTPS://WhatsApp.com/x"
 *   normalizeHttpUrl("")                          → null
 *   normalizeUrl(null)                            → null
 */
export function normalizeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Block other URL schemes (mailto:, tel:, javascript:, data:, ftp:, etc.)
  // Only http/https are valid for the admin URL fields we normalize.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return `https://${trimmed}`;
}
