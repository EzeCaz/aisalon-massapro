import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 *
 * - Requires an authenticated session.
 * - Verifies the current password against the stored bcrypt hash.
 * - Sets the new password (hashed). Min length 6, max 128.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: "Your account uses Google sign-in. Set a password from your profile first." },
      { status: 400 }
    );
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentPassword = (body.currentPassword as string | undefined) ?? "";
  const newPassword = (body.newPassword as string | undefined) ?? "";

  if (newPassword.length < 6 || newPassword.length > 128) {
    return NextResponse.json(
      { error: "New password must be between 6 and 128 characters." },
      { status: 400 }
    );
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
  return NextResponse.json({ ok: true });
}
