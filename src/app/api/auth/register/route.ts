import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/auth/register
 * Body: { email, name, password }
 *
 * Creates a brand-new user account with an email + password.
 *
 * After this succeeds, the client auto-signs-in via next-auth's
 * Credentials "email" provider (see login-form.tsx → handleSignUp).
 *
 * Errors:
 *   400 — missing/invalid fields, password too short
 *   409 — email already registered
 *   503 — DB not reachable
 */
export async function POST(req: NextRequest) {
  try {
    let body: { email?: unknown; name?: unknown; password?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const email = (body.email as string | undefined)?.trim().toLowerCase();
    const name = (body.name as string | undefined)?.trim();
    const password = (body.password as string | undefined) ?? "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 }
      );
    }
    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "Please tell us your name (at least 2 characters)." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Check for an existing user (by primary email or secondary email)
    const existing =
      (await db.user.findUnique({ where: { email } })) ||
      (await db.userEmail
        .findUnique({
          where: { email },
          include: { user: true },
        })
        .catch(() => null));

    if (existing) {
      return NextResponse.json(
        {
          error:
            "An account with that email already exists. Try logging in instead, or use Forgot Password to reset.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      await db.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: "MEMBER",
        },
      });
    } catch (dbErr) {
      console.error("[register] DB error:", dbErr);
      const msg =
        dbErr instanceof Error ? dbErr.message : String(dbErr);
      return NextResponse.json(
        {
          error:
            "The user database isn't reachable from the server. " +
            "This usually means DATABASE_URL is misconfigured. " +
            "Internal: " +
            msg.slice(0, 200),
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[register] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Unexpected server error: " + msg.slice(0, 200) },
      { status: 500 }
    );
  }
}
