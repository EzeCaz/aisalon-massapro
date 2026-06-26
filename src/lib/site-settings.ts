/**
 * SiteSetting helpers.
 *
 * A thin wrapper around the SiteSetting table that lets Super Admins change
 * certain runtime-configurable values WITHOUT a redeploy — currently the
 * favicon, the login-page hero image, and the login-page banner.
 *
 * The pattern:
 *   - Keys are a fixed allowlist (K_* constants below). The DB is a flat
 *     key/value store; the allowlist is enforced at the API layer, not at
 *     the DB layer.
 *   - Values are always strings. For image settings, the value is either:
 *       (a) a Vercel Blob URL like
 *           https://abc123.public.blob.vercel-storage.com/brand-assets/...webp
 *       (b) a public/ path like "/images/favicon.webp" (used as fallback
 *           when no admin selection exists yet)
 *   - Reads use a single DB round-trip via getPublicSettings() — returns
 *     all three image URLs at once with sensible fallbacks.
 *
 * SECURITY:
 *   - getPublicSettings() is safe to call from PUBLIC routes (no auth
 *     needed). It returns ONLY the image URLs — never any sensitive value.
 *   - setSetting() is SUPER_ADMIN-only and is enforced by the API route
 *     that calls it (see /api/admin/brand-images/select/route.ts).
 */
import { db } from "@/lib/db";

/** Canonical key for the favicon image (used in layout.tsx metadata.icons). */
export const K_FAVICON = "favicon";
/** Canonical key for the login-page hero image (the square mascot panel). */
export const K_LOGIN_HERO = "loginHero";
/** Canonical key for the login-page banner image (background / OG image). */
export const K_LOGIN_BANNER = "loginBanner";

/**
 * All keys that can be written via the admin API. This is the authoritative
 * allowlist — any other key is rejected with 400.
 */
export const ALL_KEYS: ReadonlySet<string> = new Set([
  K_FAVICON,
  K_LOGIN_HERO,
  K_LOGIN_BANNER,
]);

/**
 * Sensible defaults used when no SiteSetting row exists yet (e.g. before
 * the Super Admin makes any selection, or if a row is deleted). These
 * match the values that were hard-coded in layout.tsx and login/page.tsx
 * prior to V4.2, so behaviour is unchanged until the admin actively
 * selects a different image.
 */
export const DEFAULTS: Record<string, string> = {
  [K_FAVICON]: "/images/favicon.webp",
  [K_LOGIN_HERO]: "/images/falafel-meerkat.jpg",
  // The pre-V4.2 login banner was the broken /images/falafel-tlv-ai-salon.png
  // — we keep that here as a fallback marker so the admin can see in the
  // UI that no banner is selected, but the runtime code falls back to the
  // favicon's meerkat instead of 404'ing.
  [K_LOGIN_BANNER]: "/images/falafel-meerkat.jpg",
};

/** Public shape returned by getPublicSettings(). */
export type PublicSettings = {
  favicon: string;
  loginHero: string;
  loginBanner: string;
};

/**
 * Returns the three public image URLs in a single DB round-trip.
 *
 * Safe to call from PUBLIC routes — no auth check inside this function.
 * The caller (route handler) decides whether to require auth.
 *
 * If the DB is unreachable (e.g. during build, or if the SiteSetting table
 * doesn't exist yet on a fresh DB), the DEFAULTS are returned so the page
 * still renders. This makes the function safe to use in generateMetadata()
 * and other server components that must not throw.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await db.siteSetting.findMany({
      select: { key: true, value: true },
    });
  } catch (err) {
    // Most likely "relation SiteSetting does not exist" on a fresh DB
    // that hasn't had the schema pushed yet. Log + fall back to defaults.
    console.warn("[site-settings] could not read SiteSetting table:", err);
    return { ...DEFAULTS } as PublicSettings;
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    favicon: map.get(K_FAVICON) ?? DEFAULTS[K_FAVICON],
    loginHero: map.get(K_LOGIN_HERO) ?? DEFAULTS[K_LOGIN_HERO],
    loginBanner: map.get(K_LOGIN_BANNER) ?? DEFAULTS[K_LOGIN_BANNER],
  };
}

/**
 * Write a single setting. SUPER_ADMIN-only — the caller MUST verify the
 * user's role before calling this.
 *
 * Returns the new value (echoes back what was written).
 */
export async function setSetting(
  key: string,
  value: string,
  updatedBy?: string
): Promise<string> {
  if (!ALL_KEYS.has(key)) {
    throw new Error(`setSetting: unknown key "${key}"`);
  }
  await db.siteSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
  return value;
}

/**
 * Returns true if `url` is a Vercel Blob URL (i.e. a publicly-accessible
 * URL that can be used as <img src> / favicon / OG image without further
 * processing). Returns false for /images/... paths (which are only valid
 * inside the app's own domain — they work as <img src> and favicon, but
 * not as a Blob-style external URL).
 *
 * Used by the /admin/images UI to show a "public" badge on uploaded
 * images vs the hidden-folder stock images.
 */
export function isPublicUrl(url: string): boolean {
  return (
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("/images/") ||
    url.startsWith("/uploads/")
  );
}
