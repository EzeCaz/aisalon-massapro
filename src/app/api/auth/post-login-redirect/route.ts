import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/auth/post-login-redirect
 *
 * Called by the client immediately after a successful sign-in to decide
 * where to send the user. Logic (in priority order):
 *
 *   1. mustSetPassword=true  → /set-password  (force password change)
 *   2. importSource set      → /events        (pre-imported member,
 *                                              mark onboarded if not,
 *                                              skip onboarding form)
 *   3. onboardedAt set       → /events        (returning member)
 *   4. otherwise             → /onboarding    (brand-new self-registered)
 *
 * Side effect: if the user is a pre-imported member who hasn't been
 * marked onboarded yet, this endpoint marks them as onboarded (per
 * requirement #2: existing DB members are auto-marked as "filled").
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Unauthorized", redirectTo: "/login" },
      { status: 401 }
    );
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      mustSetPassword: true,
      importSource: true,
      onboardedAt: true,
    },
  });

  if (!me) {
    return NextResponse.json(
      { error: "User not found", redirectTo: "/login" },
      { status: 404 }
    );
  }

  // 1. Force-set-password gate (imported members on first login,
  //    forgot-password users with a temp password).
  if (me.mustSetPassword) {
    return NextResponse.json({ redirectTo: "/set-password" });
  }

  // 2 & 3. Pre-imported members or already-onboarded members go to /events.
  // Auto-mark onboarded if they're imported but somehow don't have
  // onboardedAt set yet (requirement #2).
  if (me.importSource || me.onboardedAt) {
    if (me.importSource && !me.onboardedAt) {
      await db.user.update({
        where: { id: me.id },
        data: { onboardedAt: new Date() },
      });
    }
    return NextResponse.json({ redirectTo: "/events" });
  }

  // 4. Brand-new self-registered user → onboarding form.
  return NextResponse.json({ redirectTo: "/onboarding" });
}
