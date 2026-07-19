import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin, ROLES } from "@/lib/permissions";

/**
 * POST /api/admin/members/bulk-assign-scope
 *
 * Bulk-assigns countryId + chapterId to a set of users. Super Admin only
 * (Admins can bulk-assign within their own country — enforced below).
 *
 * Body:
 *   {
 *     userIds: string[],            // required, IDs of users to update
 *     countryId: string | null,     // required — null clears the country
 *     chapterId: string | null,     // optional — null clears the chapter
 *                                    // (must belong to countryId, or be null)
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
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];
  if (userIds.length === 0) {
    return NextResponse.json({ error: "userIds[] required" }, { status: 400 });
  }

  const countryId = typeof body.countryId === "string" && body.countryId ? body.countryId : null;
  const chapterId = typeof body.chapterId === "string" && body.chapterId ? body.chapterId : null;

  // If chapterId is provided, it must belong to countryId.
  if (chapterId) {
    if (!countryId) {
      return NextResponse.json(
        { error: "Cannot set chapter without a country" },
        { status: 400 }
      );
    }
    const chapter = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { countryId: true },
    });
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
    if (chapter.countryId !== countryId) {
      return NextResponse.json(
        { error: "Chapter does not belong to the selected country" },
        { status: 400 }
      );
    }
  }

  // Non-Super-Admins: enforce scope.
  // - ADMIN: can only assign users to their OWN country (or to a chapter in
  //   their own country). Cannot clear country (would create an unscoped user).
  // - CHAPTER_ORGANIZER / CO_HOST: cannot bulk-assign scope at all.
  if (!isSuper) {
    if (user.role !== ROLES.ADMIN || !user.countryId) {
      return NextResponse.json(
        { error: "Only Super Admin (or country Admins within their own country) can bulk-assign scope." },
        { status: 403 }
      );
    }
    if (!countryId || countryId !== user.countryId) {
      return NextResponse.json(
        { error: "Admins can only assign users to their own country." },
        { status: 403 }
      );
    }
  }

  // Don't allow bulk-editing Super Admins (their scope is global).
  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const targets = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, role: true },
  });

  if (targets.length !== userIds.length) {
    const foundIds = new Set(targets.map((t) => t.id));
    const missing = userIds.filter((id) => !foundIds.has(id));
    return NextResponse.json(
      { error: `Some users not found: ${missing.join(", ")}` },
      { status: 404 }
    );
  }

  // Block edits to Super Admins.
  const protectedTargets = targets.filter(
    (t) =>
      t.role === ROLES.SUPER_ADMIN ||
      superAdminEmails.includes(t.email.toLowerCase())
  );
  if (protectedTargets.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot bulk-assign scope on Super Admin(s): ${protectedTargets
          .map((t) => t.email)
          .join(", ")}. Their scope is global.`,
      },
      { status: 403 }
    );
  }

  const result = await db.user.updateMany({
    where: { id: { in: userIds } },
    data: {
      countryId,
      chapterId: chapterId ?? null,
    },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
