import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/profile/set-password
 * Body: { newPassword }
 *
 * For users who don't have a password yet (Google-only sign-in users
 * who never went through email/password sign-up). Lets them set a
 * password WITHOUT verifying a "current password" (since they don't
 * have one).
 *
 * On success, clears mustSetPassword so the user is no longer
 * redirected to /set-password.
 *
 * If the user already has a passwordHash, this endpoint returns 400 —
 * they should use /api/auth/change-password (which requires the
 * current password) instead.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.passwordHash) {
    return NextResponse.json(
      {
        error:
          "You already have a password. Use the Change Password form (which requires your current password).",
      },
      { status: 400 }
    );
  }

  let body: { newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newPassword = (body.newPassword as string | undefined) ?? "";
  if (newPassword.length < 8 || newPassword.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters." },
      { status: 400 }
    );
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, mustSetPassword: false },
  });
  return NextResponse.json({ ok: true });
}
