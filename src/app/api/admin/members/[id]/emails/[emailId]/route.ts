import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * DELETE /api/admin/members/[id]/emails/[emailId]
 *
 * Remove a secondary email from a member. The primary email
 * (User.email) cannot be deleted via this route — it's the
 * immutable identity.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId, emailId } = await params;

  // Make sure this email belongs to the user (prevents admin from
  // deleting another user's email by guessing the ID).
  const existing = await db.userEmail.findUnique({ where: { id: emailId } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json(
      { error: "Secondary email not found for this member." },
      { status: 404 }
    );
  }

  await db.userEmail.delete({ where: { id: emailId } });

  return NextResponse.json({ ok: true });
}
