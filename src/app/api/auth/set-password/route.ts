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
 * to users with `mustSetPassword=true` (imported members on first
 * login, or users who just used the forgot-password flow).
 *
 * Sets the new password (hashed), clears `mustSetPassword`, and returns
 * where the user should be redirected next based on their onboarding
 * status (per requirements #2 and #4).
 *
 *   - Imported member (importSource set, onboardedAt set) → /events
 *   - Brand-new self-registered user (no importSource, no onboardedAt) → /onboarding
 *   - Already onboarded → /events
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
      mustSetPassword: false,
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
 * Returns whether the current session's user needs to set a password.
 * Used by /set-password page to decide whether to show the form or
 * redirect away.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { mustSetPassword: true, importSource: true, onboardedAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  return NextResponse.json({
    mustSetPassword: user.mustSetPassword,
    importSource: !!user.importSource,
    onboardedAt: !!user.onboardedAt,
  });
}
