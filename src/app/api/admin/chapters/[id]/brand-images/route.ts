import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin, ROLES } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  getChapterBrandImageOverrides,
  CHAPTER_BRAND_IMAGE_KEYS,
  isChapterBrandImageKey,
  type ChapterBrandImageKey,
} from "@/lib/chapter-brand-images";
import { getPublicSettings } from "@/lib/site-settings";

/**
 * GET /api/admin/chapters/[id]/brand-images
 *
 * Returns the chapter-scoped brand image overrides for one chapter
 * (favicon, loginHero, loginBanner), plus the global SiteSetting values
 * so the admin UI can show "chapter override → global fallback" pairs.
 *
 * Auth: SUPER_ADMIN, ADMIN (own country), or CHAPTER_ORGANIZER (own
 * chapter). Same scope rules as PATCH /api/admin/chapters/[id].
 *
 * Returns:
 *   {
 *     chapter: { id, name, slug },
 *     overrides:  { favicon?: string, loginHero?: string, loginBanner?: string },
 *     global:     { favicon, loginHero, loginBanner, ... }
 *   }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;

  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!can(user!.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, name: true, slug: true, countryId: true },
  });
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  // Scope check
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    if (user!.role === ROLES.ADMIN && chapter.countryId !== user!.countryId) {
      return NextResponse.json({ error: "Out of scope" }, { status: 403 });
    }
    if (
      (user!.role === ROLES.CHAPTER_ORGANIZER || user!.role === ROLES.CO_HOST) &&
      chapter.id !== user!.chapterId
    ) {
      return NextResponse.json({ error: "Out of scope" }, { status: 403 });
    }
  }

  const overrides = await getChapterBrandImageOverrides(chapterId);
  const global = await getPublicSettings();

  // Type-narrow the overrides to only the chapter brand image keys
  // (the helper already does this, but TS doesn't know that).
  const safeOverrides: Partial<Record<ChapterBrandImageKey, string>> = {};
  for (const k of CHAPTER_BRAND_IMAGE_KEYS) {
    const v = overrides[k];
    if (typeof v === "string") safeOverrides[k] = v;
  }

  return NextResponse.json({
    chapter: { id: chapter.id, name: chapter.name, slug: chapter.slug },
    overrides: safeOverrides,
    global: {
      favicon: global.favicon,
      loginHero: global.loginHero,
      loginBanner: global.loginBanner,
    },
  });
}

// Re-export the key type for type-only consumers.
export type { ChapterBrandImageKey };
export { isChapterBrandImageKey };
