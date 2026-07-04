/**
 * Referral code generator.
 *
 * Format: SAL-{base36(userId)}-{random6}
 *   - SAL- prefix identifies AI Salon referral codes (vs MP- for
 *     receptionist.massapro.com affiliates)
 *   - base36(userId) makes the code partially user-attributable (admin
 *     can decode the user ID without a DB lookup) but not guessable
 *   - random6 (alphanumeric, excludes O/0/I/1/L to avoid confusion)
 *     makes the code unguessable by enumeration
 *
 * Examples: SAL-1A-X7K2MP, SAL-2B-9PF3QR, SAL-3C-K4M8ST
 */

const RANDOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // excludes O, 0, I, 1, L

function randomChars(n: number): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint32Array(n)
    crypto.getRandomValues(arr)
    return Array.from(arr, (n) => RANDOM_ALPHABET[n % RANDOM_ALPHABET.length]).join("")
  }
  // Fallback (should never hit in browser/Node)
  let s = ""
  for (let i = 0; i < n; i++) {
    s += RANDOM_ALPHABET[Math.floor(Math.random() * RANDOM_ALPHABET.length)]
  }
  return s
}

/**
 * Generates a referral code for a user. Does NOT persist — caller
 * must save to User.referralCode.
 */
export function generateReferralCode(userId: string): string {
  const base36 = Buffer.from(userId, "utf8").toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .slice(0, 6)
    .toUpperCase()
  return `SAL-${base36}-${randomChars(6)}`
}
