import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin, ROLES } from "@/lib/permissions";

/**
 * POST /api/admin/events/bulk-assign-scope
 *
 * Bulk-assigns chapterId to a set of Event rows.
 *
 * Body:
 *   {
 *     eventIds: string[],        // required, IDs of Event rows to update
 *     chapterId: string | null,  // required — null clears the chapter
 *     isCrossChapter?: boolean,  // optional, sets the cross-chapter flag
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
  const eventIds: string[] = Array.isArray(body.eventIds) ? body.eventIds : [];
  if (eventIds.length === 0) {
    return NextResponse.json({ error: "eventIds[] required" }, { status: 400 });
  }

  const chapterId = typeof body.chapterId === "string" && body.chapterId ? body.chapterId : null;
  const setCrossChapter = typeof body.isCrossChapter === "boolean";

  // Scope check for chapter.
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

  // Non-Super-Admins: enforce scope.
  // Only Super Admin can toggle isCrossChapter.
  if (setCrossChapter && !isSuper) {
    return NextResponse.json(
      { error: "Only Super Admin can change the cross-chapter flag." },
      { status: 403 }
    );
  }

  if (!isSuper) {
    if (user.role !== ROLES.ADMIN || !user.countryId) {
      return NextResponse.json(
        { error: "Only Super Admin (or country Admins within their own country) can bulk-assign event scope." },
        { status: 403 }
      );
    }
    if (resolvedCountryId && resolvedCountryId !== user.countryId) {
      return NextResponse.json(
        { error: "Admins can only assign events to chapters in their own country." },
        { status: 403 }
      );
    }
  }

  const data: { chapterId: string | null; isCrossChapter?: boolean } = { chapterId };
  if (setCrossChapter) data.isCrossChapter = body.isCrossChapter as boolean;

  const result = await db.event.updateMany({
    where: { id: { in: eventIds } },
    data,
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
