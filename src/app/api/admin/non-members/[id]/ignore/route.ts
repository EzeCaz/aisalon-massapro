import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/admin/non-members/[id]/ignore
 *
 * Dismiss the "potential duplicate" flag on a NonMember. The NonMember
 * is kept as a standalone non-member lead (NOT merged into any User).
 * Sets `duplicateStatus = "ignored"` and clears the `duplicateOfUserId`
 * pointer. The admin can re-trigger duplicate detection later by
 * re-uploading a spreadsheet (the upload flow will re-flag if a match
 * is still found).
 *
 * Body: empty (or `{}`).
 *
 * Admin-only.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const nm = await db.nonMember.findUnique({ where: { id }, select: { id: true, duplicateStatus: true } });
  if (!nm) {
    return NextResponse.json({ error: "NonMember not found" }, { status: 404 });
  }

  await db.nonMember.update({
    where: { id },
    data: {
      duplicateStatus: "ignored",
      duplicateReason: `Admin dismissed on ${new Date().toISOString()}`,
    },
  });

  return NextResponse.json({ ok: true, nonMemberId: id, status: "ignored" });
}

/**
 * DELETE /api/admin/non-members/[id]
 *
 * Hard-delete a NonMember. Also deletes their NonMemberRegistrations
 * (cascade). Use this to clean up spam/test entries or to permanently
 * remove a non-member lead. Use POST .../merge to convert a NonMember
 * into a User instead.
 *
 * Admin-only.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await db.nonMember.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: id });
}
