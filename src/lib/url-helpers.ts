/**
 * URL helpers — keep URL strings sane across user-edited fields.
 */

/**
 * Ensures a URL has an http:// or https:// scheme. If the input is missing
 * a scheme (e.g. "linkedin.com/company/foo"), prepends "https://". Empty /
 * nullish input is returned as-is.
 *
 * Used to fix the LinkedIn-on-chapter-landing bug where admins entered a
 * bare domain and the browser treated it as a relative path under /c/.
 */
export function ensureAbsoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  //mailto: / tel: / sms: / etc. — leave as-is
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
