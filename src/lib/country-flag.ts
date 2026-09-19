/**
 * Country flag emoji helper.
 *
 * Bug context: the `Country.flagEmoji` column was seeded incorrectly
 * for some countries — instead of the actual flag emoji (e.g. "🇨🇦"),
 * the seed stored the literal ISO-2 code (e.g. "CA"). Israel was
 * seeded correctly ("🇮🇱"), but Canada (and possibly others) got the
 * raw code, so the chapter landing page rendered the two letters
 * "CA" where the flag should have been.
 *
 * `displayFlag(code, flagEmoji)` returns the correct emoji by:
 *   1. Using `flagEmoji` when it's a real emoji (length > 2 or contains
 *      a regional-indicator char), AND
 *   2. Deriving the emoji from `code` via regional-indicator symbols
 *      (the universal ISO-3166 alpha-2 → flag conversion), AND
 *   3. Falling back to "🏳️" when neither is available.
 *
 * This is a UI-only safety net — call it whenever you render a flag
 * from a Country record. The underlying DB rows can still be cleaned
 * up via the admin /countries API, but the rendering path no longer
 * depends on the seed being perfect.
 */

// Regional indicator symbols start at U+1F1E6 ("A") — subtract 'A' (65)
// and add 0x1F1E6 to convert each ASCII letter of an ISO-2 code.
const REGIONAL_INDICATOR_BASE = 0x1f1e6;

function isoCodeToFlagEmoji(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  // Pair of regional indicator letters → the flag emoji for that country.
  const ch1 = String.fromCodePoint(REGIONAL_INDICATOR_BASE + (c.charCodeAt(0) - 65));
  const ch2 = String.fromCodePoint(REGIONAL_INDICATOR_BASE + (c.charCodeAt(1) - 65));
  return ch1 + ch2;
}

function looksLikeEmoji(v: string): boolean {
  // A real flag emoji is the two regional-indicator chars (length 2 in
  // UTF-16 surrogate-pair terms — code points, not chars), or any
  // single grapheme longer than 2 UTF-16 units. A 2-char ASCII string
  // (like "CA") is definitely NOT an emoji — it's the malformed seed.
  // Quick test: any code point in the regional indicator range.
  for (const ch of v) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && cp >= 0x1f1e6 && cp <= 0x1f1ff) return true;
  }
  return false;
}

export function displayFlag(
  code: string | null | undefined,
  flagEmoji: string | null | undefined
): string {
  if (flagEmoji && looksLikeEmoji(flagEmoji)) return flagEmoji;
  // flagEmoji was either null/undefined or a malformed ASCII seed
  // (e.g. "CA") — derive from the ISO code.
  const derived = isoCodeToFlagEmoji(code);
  if (derived) return derived;
  return "🏳️";
}
