import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin, ROLES } from "@/lib/permissions";

/**
 * POST /api/admin/registrants/bulk-assign-scope
 *
 * Bulk-assigns chapterId to a set of EventRsvp rows (registrants).
 * Country is implicit — it flows from the chapter's countryId.
 *
 * Body:
 *   {
 *     rsvpIds: string[],         // required, IDs of EventRsvp rows to update
 *     chapterId: string | null,  // required — null clears the chapter
 *   }
 *
 * Returns: { ok: true, updated: N }
 *
 * Note: this only changes the registrant's chapterId tag. It does NOT
 * move the underlying Event to a different chapter (use the event
 * bulk-assign endpoint for that).
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
  const rsvpIds: string[] = Array.isArray(body.rsvpIds) ? body.rsvpIds : [];
  if (rsvpIds.length === 0) {
    return NextResponse.json({ error: "rsvpIds[] required" }, { status: 400 });
  }

  const chapterId = typeof body.chapterId === "string" && body.chapterId ? body.chapterId : null;

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
  if (!isSuper) {
    if (user.role !== ROLES.ADMIN || !user.countryId) {
      return NextResponse.json(
        { error: "Only Super Admin (or country Admins within their own country) can bulk-assign registrant scope." },
        { status: 403 }
      );
    }
    if (resolvedCountryId && resolvedCountryId !== user.countryId) {
      return NextResponse.json(
        { error: "Admins can only assign registrants to chapters in their own country." },
        { status: 403 }
      );
    }
  }

  const result = await db.eventRsvp.updateMany({
    where: { id: { in: rsvpIds } },
    data: { chapterId },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
