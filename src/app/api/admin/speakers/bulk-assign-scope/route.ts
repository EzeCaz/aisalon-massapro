import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin, ROLES } from "@/lib/permissions";

/**
 * POST /api/admin/speakers/bulk-assign-scope
 *
 * Bulk-assigns chapterId to a set of Speaker rows.
 *
 * Body:
 *   {
 *     speakerIds: string[],      // required, IDs of Speaker rows to update
 *     chapterId: string | null,  // required — null clears the chapter
 *   }
 *
 * Returns: { ok: true, updated: N }
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;
  if (!can(user.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isSuper = isSuperAdmin({ email: user.email, role: user.role });

  const body = await req.json().catch(() => ({}));
  const speakerIds: string[] = Array.isArray(body.speakerIds) ? body.speakerIds : [];
  if (speakerIds.length === 0) {
    return NextResponse.json({ error: "speakerIds[] required" }, { status: 400 });
  }

  const chapterId = typeof body.chapterId === "string" && body.chapterId ? body.chapterId : null;

  let resolvedCountryId: string | null = null;
  if (chapterId) {
    const chapter = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { countryId: true },
    });
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
    resolvedCountryId = chapter.countryId;
  }

  if (!isSuper) {
    if (user.role !== ROLES.ADMIN || !user.countryId) {
      return NextResponse.json(
        { error: "Only Super Admin (or country Admins within their own country) can bulk-assign speaker scope." },
        { status: 403 }
      );
    }
    if (resolvedCountryId && resolvedCountryId !== user.countryId) {
      return NextResponse.json(
        { error: "Admins can only assign speakers to chapters in their own country." },
        { status: 403 }
      );
    }
  }

  const result = await db.speaker.updateMany({
    where: { id: { in: speakerIds } },
    data: { chapterId },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
