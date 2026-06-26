import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSuperAdmin, isSuperAdminEmail } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth-guards";

/**
 * POST /api/admin/members/[id]/archive
 *
 * Soft-delete (archive) a member. Sets archivedAt = now() and archivedBy =
 * the calling Super Admin's user ID. The member's row is preserved in the
 * DB for audit; they're just hidden from the main members list.
 *
 * Permission: ONLY Super Admins can archive members.
 *
 * Returns:
 *   200 + { ok: true, archivedAt, archivedBy } on success
 *   403 if caller is not a Super Admin
 *   404 if member not found
 *   400 if member is already archived or is a Super Admin (cannot archive SAs)
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      {
        error: "Only a Super Admin can archive members.",
        debug: { youEmail: me.email, youRole: me.role },
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, archivedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Super Admins cannot be archived — they'd just be recreated with
  // SUPER_ADMIN role on their next sign-in (because SUPER_ADMIN_EMAILS
  // is hard-coded in source).
  if (isSuperAdminEmail(target.email)) {
    return NextResponse.json(
      {
        error:
          "Super Admins cannot be archived. Remove their email from SUPER_ADMIN_EMAILS in src/lib/permissions.ts first.",
      },
      { status: 403 }
    );
  }

  // Don't allow self-archive (footgun — would lock the admin out).
  if (target.id === me.id) {
    return NextResponse.json(
      { error: "You cannot archive your own account." },
      { status: 400 }
    );
  }

  // Idempotent: if already archived, just return current state.
  if (target.archivedAt) {
    return NextResponse.json({
      ok: true,
      alreadyArchived: true,
      archivedAt: target.archivedAt.toISOString(),
      archivedBy: me.id,
    });
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      archivedBy: me.id,
    },
    select: { id: true, archivedAt: true, archivedBy: true },
  });

  return NextResponse.json({
    ok: true,
    archivedAt: updated.archivedAt?.toISOString(),
    archivedBy: updated.archivedBy,
  });
}

/**
 * DELETE /api/admin/members/[id]/archive
 *
 * Restore an archived member. Sets archivedAt = null, archivedBy = null.
 * The member reappears in the main members list immediately.
 *
 * Permission: ONLY Super Admins can unarchive.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // DELETE method = unarchive (restore). We use DELETE because it
  // semantically removes the "archived" state.
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      { error: "Only a Super Admin can restore archived members." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, archivedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (!target.archivedAt) {
    return NextResponse.json({
      ok: true,
      alreadyActive: true,
    });
  }

  await db.user.update({
    where: { id },
    data: {
      archivedAt: null,
      archivedBy: null,
    },
  });

  return NextResponse.json({ ok: true, restored: id });
}
