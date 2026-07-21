/**
 * Per-chapter brand-image settings (favicon, loginHero, loginBanner).
 *
 * This is the chapter-scoped equivalent of `src/lib/site-settings.ts`.
 * It uses the existing `ChapterSetting` table (key/value pairs scoped to
 * a chapterId) to store per-chapter overrides for the same three brand
 * image roles that the global SiteSetting table holds:
 *
 *   - "favicon"      → chapter-specific favicon URL
 *   - "loginHero"    → chapter-specific login hero image URL
 *   - "loginBanner"  → chapter-specific login banner image URL
 *
 * Resolution rule at runtime (see getChapterBrandImagesForSlug):
 *   1. ChapterSetting[chapterId, key]   ← chapter-specific value
 *   2. SiteSetting[key]                  ← global value
 *   3. DEFAULTS[key]                     ← hard-coded fallback
 *
 * SECURITY:
 *   - Reads are safe to call from PUBLIC routes (no auth check). They
 *     return only image URLs — never sensitive values.
 *   - Writes are SUPER_ADMIN-only (or Admin/ChapterOrganizer for their
 *     own chapter) and are enforced at the API layer
 *     (see /api/admin/chapters/[id]/brand-images/select/route.ts).
 */
import { db } from "@/lib/db";
import {
  DEFAULTS,
  K_FAVICON,
  K_LOGIN_HERO,
  K_LOGIN_BANNER,
  getPublicSettings,
  type PublicSettings,
} from "@/lib/site-settings";

/**
 * The set of keys that can be overridden at the chapter level.
 * Currently mirrors the three brand image keys from site-settings.ts.
 * WhatsApp + LinkedIn URLs are stored directly on the Chapter row
 * (chapter.whatsappGroupUrl / chapter.linkedinUrl), not in
 * ChapterSetting, so they're not part of this allowlist.
 */
export const CHAPTER_BRAND_IMAGE_KEYS = [
  K_FAVICON,
  K_LOGIN_HERO,
  K_LOGIN_BANNER,
] as const;

export type ChapterBrandImageKey = (typeof CHAPTER_BRAND_IMAGE_KEYS)[number];

/** True if `key` is a chapter-overridable brand image key. */
export function isChapterBrandImageKey(key: string): key is ChapterBrandImageKey {
  return (CHAPTER_BRAND_IMAGE_KEYS as readonly string[]).includes(key);
}

/**
 * Read all chapter-scoped brand image overrides for one chapter.
 *
 * Returns ONLY the rows that exist for this chapter — keys not present
 * here mean "fall back to global SiteSetting". The caller is expected
 * to merge this with the global settings.
 *
 * Safe to call from PUBLIC routes.
 */
export async function getChapterBrandImageOverrides(
  chapterId: string
): Promise<Partial<Record<ChapterBrandImageKey, string>>> {
  try {
    const rows = await db.chapterSetting.findMany({
      where: { chapterId, key: { in: [...CHAPTER_BRAND_IMAGE_KEYS] } },
      select: { key: true, value: true },
    });
    const out: Partial<Record<ChapterBrandImageKey, string>> = {};
    for (const r of rows) {
      if (isChapterBrandImageKey(r.key)) {
        out[r.key] = r.value;
      }
    }
    return out;
  } catch (err) {
    console.warn(
      `[chapter-brand-images] could not read ChapterSetting for chapter ${chapterId}:`,
      err
    );
    return {};
  }
}

/**
 * Read all chapter-scoped brand image overrides for one chapter,
 * looked up by slug. Returns null when the chapter doesn't exist.
 *
 * Safe to call from PUBLIC routes.
 */
export async function getChapterBrandImageOverridesBySlug(
  chapterSlug: string
): Promise<{ chapterId: string; overrides: Partial<Record<ChapterBrandImageKey, string>> } | null> {
  try {
    const chapter = await db.chapter.findUnique({
      where: { slug: chapterSlug },
      select: { id: true },
    });
    if (!chapter) return null;
    const overrides = await getChapterBrandImageOverrides(chapter.id);
    return { chapterId: chapter.id, overrides };
  } catch (err) {
    console.warn(
      `[chapter-brand-images] could not look up chapter by slug "${chapterSlug}":`,
      err
    );
    return null;
  }
}

/**
 * Merge chapter-specific overrides with the global settings. For each
 * of the three brand image keys, the chapter value (if set) wins; the
 * global value is used otherwise.
 *
 * Returns the same shape as PublicSettings, so callers can swap it in
 * anywhere they currently use getPublicSettings().
 */
export async function getEffectiveBrandImages(
  chapterId: string | null | undefined
): Promise<PublicSettings> {
  const globalSettings = await getPublicSettings();
  if (!chapterId) return globalSettings;
  const overrides = await getChapterBrandImageOverrides(chapterId);
  return {
    ...globalSettings,
    favicon: overrides.favicon ?? globalSettings.favicon,
    loginHero: overrides.loginHero ?? globalSettings.loginHero,
    loginBanner: overrides.loginBanner ?? globalSettings.loginBanner,
  };
}

/** Same as getEffectiveBrandImages but resolves the chapter by slug. */
export async function getEffectiveBrandImagesBySlug(
  chapterSlug: string | null | undefined
): Promise<PublicSettings> {
  const globalSettings = await getPublicSettings();
  if (!chapterSlug) return globalSettings;
  const result = await getChapterBrandImageOverridesBySlug(chapterSlug);
  if (!result) return globalSettings;
  return {
    ...globalSettings,
    favicon: result.overrides.favicon ?? globalSettings.favicon,
    loginHero: result.overrides.loginHero ?? globalSettings.loginHero,
    loginBanner: result.overrides.loginBanner ?? globalSettings.loginBanner,
  };
}

/**
 * Write a single chapter-scoped brand image override. The caller MUST
 * verify the user's role + scope (Super Admin, or Admin/Chapter
 * Organizer for their own chapter) BEFORE calling this.
 *
 * Returns the new value (echoes back what was written).
 */
export async function setChapterBrandImage(
  chapterId: string,
  key: ChapterBrandImageKey,
  value: string,
  updatedBy?: string
): Promise<string> {
  if (!isChapterBrandImageKey(key)) {
    throw new Error(
      `setChapterBrandImage: key "${key}" is not a chapter-overridable brand image key. ` +
        `Allowed: ${CHAPTER_BRAND_IMAGE_KEYS.join(", ")}`
    );
  }
  await db.chapterSetting.upsert({
    where: { chapterId_key: { chapterId, key } },
    create: { chapterId, key, value, updatedBy },
    update: { value, updatedBy },
  });
  return value;
}

/**
 * Remove a chapter-scoped override, so the chapter falls back to the
 * global SiteSetting value for this key. The caller MUST verify role +
 * scope before calling.
 */
export async function clearChapterBrandImage(
  chapterId: string,
  key: ChapterBrandImageKey
): Promise<void> {
  if (!isChapterBrandImageKey(key)) {
    throw new Error(
      `clearChapterBrandImage: key "${key}" is not a chapter-overridable brand image key.`
    );
  }
  try {
    await db.chapterSetting.delete({
      where: { chapterId_key: { chapterId, key } },
    });
  } catch {
    // Row didn't exist — nothing to delete. Treat as success.
  }
}

/**
 * Read ALL chapter-scoped brand image overrides for a list of chapters.
 * Used by /admin/images to render the per-chapter "currently selected"
 * badges in a single DB round-trip.
 *
 * Returns a map of chapterId → { key → value }.
 */
export async function getChapterBrandImageOverridesForChapters(
  chapterIds: string[]
): Promise<Map<string, Partial<Record<ChapterBrandImageKey, string>>>> {
  const out = new Map<string, Partial<Record<ChapterBrandImageKey, string>>>();
  if (chapterIds.length === 0) return out;
  try {
    const rows = await db.chapterSetting.findMany({
      where: {
        chapterId: { in: chapterIds },
        key: { in: [...CHAPTER_BRAND_IMAGE_KEYS] },
      },
      select: { chapterId: true, key: true, value: true },
    });
    for (const r of rows) {
      if (!isChapterBrandImageKey(r.key)) continue;
      const inner = out.get(r.chapterId) ?? {};
      inner[r.key] = r.value;
      out.set(r.chapterId, inner);
    }
  } catch (err) {
    console.warn(
      "[chapter-brand-images] could not read ChapterSetting rows for chapters:",
      err
    );
  }
  return out;
}

// Re-export the keys + DEFAULTS so callers don't need to import from
// two different modules.
export { K_FAVICON, K_LOGIN_HERO, K_LOGIN_BANNER, DEFAULTS };
