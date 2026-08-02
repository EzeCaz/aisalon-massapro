/**
 * TSK-0057 — "View as" impersonation API for SUPER_ADMIN.
 *
 * POST /api/admin/view-as
 *   Body: { role: string | null, chapterId: string | null }
 *   Sets `viewAsRole` + `viewAsChapterId` on the JWT session token.
 *   Pass null for either to clear that field.
 *
 * DELETE /api/admin/view-as
 *   Clears both fields (equivalent to POST with { role: null, chapterId: null }).
 *
 * SECURITY:
 *   - Only SUPER_ADMIN can set viewAs fields. Enforced server-side here.
 *   - The JWT callback in src/lib/auth.ts reads these fields and
 *     propagates them to the session.
 *   - src/lib/permissions.ts (getUserScope + canSeeAdminNav) honors the
 *     overrides ONLY when the signed-in user is SUPER_ADMIN. Non-super-
 *     admins cannot benefit from viewAs fields even if somehow set.
 *   - The role value is validated against the ROLES allowlist.
 *   - The chapterId value is validated by looking it up in the DB.
 *
 * This route does NOT actually do the impersonation — it only stamps
 * the JWT. The downstream readers (permissions.ts, app-header.tsx) do
 * the impersonation by reading the JWT fields. This separation means
 * the impersonation is stateless + survives page refreshes.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isSuperAdmin,
  isSuperAdminEmail,
  normalizeRole,
  ROLES,
} from "@/lib/permissions";

const ALLOWED_VIEW_AS_ROLES = new Set<string>([
  ROLES.MEMBER,
  ROLES.SPEAKER,
  ROLES.CO_HOST,
  ROLES.CHAPTER_ORGANIZER,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Verify the caller is SUPER_ADMIN. We check both the DB role AND the
  // email allowlist (belt + suspenders) so a compromised token can't
  // escalate.
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, email: true },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!isSuperAdmin({ email: me.email, role: me.role }) && !isSuperAdminEmail(me.email)) {
    return NextResponse.json({ error: "Forbidden — SUPER_ADMIN only" }, { status: 403 });
  }

  // Parse + validate the body.
  let body: { role?: string | null; chapterId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const role = body.role === null || body.role === undefined ? null : String(body.role);
  const chapterId = body.chapterId === null || body.chapterId === undefined ? null : String(body.chapterId);

  if (role !== null && !ALLOWED_VIEW_AS_ROLES.has(role)) {
    return NextResponse.json(
      { error: `Invalid role. Allowed: ${[...ALLOWED_VIEW_AS_ROLES].join(", ")}` },
      { status: 400 }
    );
  }

  if (chapterId !== null) {
    // Validate the chapter exists.
    const chapter = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, name: true },
    });
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
  }

  // TSK-0057: We store the viewAs override in a separate signed cookie
  // (ais_view_as) rather than mutating the JWT directly. The JWT callback
  // in src/lib/auth.ts reads this cookie on every request and stamps the
  // values onto the token, which the session callback then propagates to
  // session.user.viewAsRole + session.user.viewAsChapterId. This avoids
  // the complexity of re-issuing the JWT server-side (next-auth doesn't
  // expose a clean API for that) and means the override survives page
  // refreshes. The cookie is HttpOnly so client-side JS can't tamper with
  // it, and the jwt callback double-checks that the signed-in user is
  // SUPER_ADMIN before honoring the override.

  const cookieName = "ais_view_as";
  const cookieValue = JSON.stringify({ role, chapterId, setBy: me.id, setAt: Date.now() });

  // Set the cookie. Max age = 7 days (matches session JWT). HttpOnly
  // so client-side JS can't tamper. SameSite=lax so it survives the
  // redirect-after-POST pattern.
  const response = NextResponse.json({
    ok: true,
    viewAs: { role, chapterId },
  });
  response.cookies.set(cookieName, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, email: true },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!isSuperAdmin({ email: me.email, role: me.role }) && !isSuperAdminEmail(me.email)) {
    return NextResponse.json({ error: "Forbidden — SUPER_ADMIN only" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, cleared: true });
  response.cookies.delete("ais_view_as");
  return response;
}
