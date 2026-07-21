/**
 * Per-chapter key/value overrides — mirrors the global SiteSetting pattern
 * but scoped to a single Chapter.
 *
 * Supported keys (mirror the global SiteSetting image keys):
 *   - "favicon"      — chapter-specific favicon (shown on /c/[chapterSlug])
 *   - "loginHero"    — chapter hero/profile image (the big visual on the
 *                      chapter landing page hero section)
 *   - "loginBanner"  — chapter OG / social-share image
 *
 * Resolver pattern (used by /c/[chapterSlug] rendering):
 *   1. Look up ChapterSetting[chapterId, key]
 *   2. If null → fall back to global SiteSetting[key] (via getPublicSettings)
 *   3. If still null → fall back to DEFAULTS[key] (hardcoded)
 *
 * This file is safe to call from PUBLIC routes (no auth) — the only writes
 * happen in /api/admin/brand-images/select with SUPER_ADMIN enforcement.
 */
import { db } from "@/lib/db";
import {
  DEFAULTS,
  K_FAVICON,
  K_LOGIN_HERO,
  K_LOGIN_BANNER,
  type PublicSettings,
  getPublicSettings,
} from "@/lib/site-settings";

/** Canonical keys supported at the chapter scope (subset of global keys). */
export const CHAPTER_IMAGE_KEYS = [
  K_FAVICON,
  K_LOGIN_HERO,
  K_LOGIN_BANNER,
] as const;

export type ChapterImageKey = (typeof CHAPTER_IMAGE_KEYS)[number];

/**
 * Returns the per-chapter setting rows for the given chapter.
 * Returns an empty object on DB error so callers can fall back to globals.
 */
export async function getChapterSettingsMap(
  chapterId: string
): Promise<Record<string, string>> {
  try {
    const rows = await db.chapterSetting.findMany({
      where: { chapterId },
      select: { key: true, value: true },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch (err) {
    console.warn("[chapter-settings] could not read ChapterSetting table:", err);
    return {};
  }
}

/**
 * Resolved image URLs for a chapter — for each of the 3 keys, returns
 * either the chapter-specific value, the global value, or the hardcoded
 * default (in that order).
 *
 * Safe to call from public routes.
 */
export async function resolveChapterImages(
  chapterId: string
): Promise<{
  favicon: string;
  loginHero: string;
  loginBanner: string;
  /** True when each key has a chapter-specific override (for UI badges). */
  hasChapterOverride: {
    favicon: boolean;
    loginHero: boolean;
    loginBanner: boolean;
  };
}> {
  const [chapterMap, globals] = await Promise.all([
    getChapterSettingsMap(chapterId),
    getPublicSettings(),
  ]);

  const pick = (key: ChapterImageKey, globalVal: string): string =>
    chapterMap[key] ?? globalVal ?? DEFAULTS[key] ?? "";

  return {
    favicon: pick(K_FAVICON, globals.favicon),
    loginHero: pick(K_LOGIN_HERO, globals.loginHero),
    loginBanner: pick(K_LOGIN_BANNER, globals.loginBanner),
    hasChapterOverride: {
      favicon: K_FAVICON in chapterMap,
      loginHero: K_LOGIN_HERO in chapterMap,
      loginBanner: K_LOGIN_BANNER in chapterMap,
    },
  };
}

/**
 * Write one chapter-scoped setting. Caller MUST verify SUPER_ADMIN.
 */
export async function setChapterSetting(
  chapterId: string,
  key: string,
  value: string,
  updatedBy?: string
): Promise<string> {
  if (!CHAPTER_IMAGE_KEYS.includes(key as ChapterImageKey)) {
    throw new Error(`setChapterSetting: unsupported key "${key}"`);
  }
  await db.chapterSetting.upsert({
    where: { chapterId_key: { chapterId, key } },
    create: { chapterId, key, value, updatedBy },
    update: { value, updatedBy },
  });
  return value;
}

/**
 * Clear one chapter-scoped setting (so it falls back to the global value).
 * Caller MUST verify SUPER_ADMIN.
 */
export async function clearChapterSetting(
  chapterId: string,
  key: string
): Promise<void> {
  if (!CHAPTER_IMAGE_KEYS.includes(key as ChapterImageKey)) {
    throw new Error(`clearChapterSetting: unsupported key "${key}"`);
  }
  try {
    await db.chapterSetting.delete({
      where: { chapterId_key: { chapterId, key } },
    });
  } catch {
    // already absent — no-op
  }
}

/**
 * Returns ALL chapter-scoped selections across ALL chapters, grouped by
 * chapterId → key → value. Used by /admin/images to render per-chapter
 * "currently selected" badges on image cards.
 *
 * Safe to call from SUPER_ADMIN-only routes.
 */
export async function getAllChapterImageSelections(): Promise<
  Record<string, Record<string, string>>
> {
  try {
    const rows = await db.chapterSetting.findMany({
      where: {
        key: { in: [...CHAPTER_IMAGE_KEYS] },
      },
      select: { chapterId: true, key: true, value: true },
    });
    const out: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      (out[r.chapterId] ??= {})[r.key] = r.value;
    }
    return out;
  } catch (err) {
    console.warn("[chapter-settings] could not read all chapter selections:", err);
    return {};
  }
}

/** Re-export for convenience. */
export { getPublicSettings, type PublicSettings };
