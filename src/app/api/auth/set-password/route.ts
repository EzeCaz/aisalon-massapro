import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/auth/set-password
 * Body: { newPassword }
 *
 * Authenticated endpoint — used by the /set-password page that's shown
 * to users who need to set or change their password (imported members
 * on first login, forgot-password users, or any signed-in user who
 * wants to change their password).
 *
 * Sets the new password (hashed) and returns where the user should be
 * redirected next based on their onboarding status (per requirements
 * #2 and #4).
 *
 *   - Imported member (importSource set, onboardedAt set) → /events
 *   - Brand-new self-registered user (no importSource, no onboardedAt) → /onboarding
 *   - Already onboarded → /events
 *
 * NOTE: A previous version of this endpoint also wrote `mustSetPassword:
 * false` on the user row. That field was never added to the Prisma
 * schema, so the write would throw a Prisma validation error at runtime.
 * The reference has been removed.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newPassword = (body.newPassword as string | undefined) ?? "";
  if (newPassword.length < 6 || newPassword.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 6 and 128 characters." },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  // Decide where to send them next.
  // Per requirement #2: pre-imported members skip onboarding — mark
  // them as onboarded and send to /events.
  // Per requirement #4: brand-new self-registered users go to onboarding.
  let redirectTo = "/events";
  let onboardedNow = false;
  if (user.importSource && !user.onboardedAt) {
    // Imported member completing their first set-password — mark onboarded.
    onboardedNow = true;
  } else if (!user.importSource && !user.onboardedAt) {
    // Brand-new self-registered user — send to onboarding.
    redirectTo = "/onboarding";
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      ...(onboardedNow ? { onboardedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    redirectTo,
    onboardedNow,
  });
}

/**
 * GET /api/auth/set-password
 * Returns the current session user's password + onboarding status.
 * Used by /set-password page to decide whether to show the "set new
 * password" form vs. the "change password" form, and where to send
 * them after submission.
 *
 * NOTE: A previous version also returned a `mustSetPassword` boolean,
 * but that field was never added to the Prisma schema. The reference
 * has been removed — callers should check `hasPassword` (true when
 * `passwordHash` is set) to decide which form to show.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { passwordHash: true, importSource: true, onboardedAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  return NextResponse.json({
    hasPassword: !!user.passwordHash,
    importSource: !!user.importSource,
    onboardedAt: !!user.onboardedAt,
  });
}
