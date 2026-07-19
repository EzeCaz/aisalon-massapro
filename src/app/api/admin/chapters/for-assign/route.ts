import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin } from "@/lib/permissions";

/**
 * GET /api/admin/chapters/for-assign
 *
 * Returns all countries + chapters available for member assignment.
 *
 * Used by the EditMemberDialog's "Country / Chapter assignment" selectors.
 *
 * Scope rules:
 *   - Super Admin: returns ALL countries + ALL chapters (so they can assign
 *     an admin to any country or chapter).
 *   - Admin: returns only their country + its chapters (they cannot assign
 *     a user to a country/chapter outside their own scope).
 *   - Chapter Organizer / CO_HOST: returns only their own chapter.
 *   - Member / Speaker: 403 (this is an admin-only endpoint).
 *
 * Response shape:
 *   {
 *     countries: [{ id, name, code, flagEmoji, slug, isActive }],
 *     chapters:  [{ id, name, slug, countryId, city, isActive }]
 *   }
 *
 * The chapters list is FLAT (not nested under countries) so the client can
 * easily filter it by selected countryId.
 */
export async function GET() {
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;
  if (!can(user.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isSuper = isSuperAdmin({ email: user.email, role: user.role });

  // --- Fetch countries ---
  // Super Admin: all. Admin: their own only. Chapter Organizer: their own only.
  const countryWhere: Record<string, unknown> = isSuper
    ? {}
    : user.countryId
      ? { id: user.countryId }
      : { id: "___NEVER___" };

  const countries = await db.country.findMany({
    where: countryWhere,
    select: {
      id: true,
      name: true,
      code: true,
      slug: true,
      flagEmoji: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
  });

  // --- Fetch chapters ---
  // Super Admin: all. Admin: chapters in their country. Chapter Organizer: their own only.
  let chapterWhere: Record<string, unknown>;
  if (isSuper) {
    chapterWhere = {};
  } else if (user.chapterId) {
    chapterWhere = { id: user.chapterId };
  } else if (user.countryId) {
    chapterWhere = { countryId: user.countryId };
  } else {
    chapterWhere = { id: "___NEVER___" };
  }

  const chapters = await db.chapter.findMany({
    where: chapterWhere,
    select: {
      id: true,
      name: true,
      slug: true,
      countryId: true,
      city: true,
      isActive: true,
    },
    orderBy: [{ country: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json({ countries, chapters });
}
