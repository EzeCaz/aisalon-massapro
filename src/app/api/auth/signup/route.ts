import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPasswordEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/auth/signup
 * Body: { email, name? }
 *
 * - Validates email format + name.
 * - If user already exists AND has a passwordHash, resets the password
 *   and emails the new one (acts as a "forgot password" flow).
 * - If user exists but has no passwordHash (Google-only), generates a new
 *   password, hashes it, attaches to the user, and emails the plaintext.
 * - If user doesn't exist, creates them with role=MEMBER and a fresh
 *   password hash, then emails the plaintext.
 *
 * The plaintext password is NEVER stored — only the bcrypt hash.
 */
export async function POST(req: NextRequest) {
  let body: { email?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const name = (body.name as string | undefined)?.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Please tell us your name." }, { status: 400 });
  }

  // Generate a memorable-ish but random 8-char password (alphanumeric)
  const password = crypto.randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.passwordHash) {
    // Reset the password and email the new one.
    await db.user.update({
      where: { id: existing.id },
      data: { passwordHash, name: existing.name || name },
    });
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");
    const result = await sendPasswordEmail({
      to: email,
      name: existing.name || name,
      password,
      siteUrl,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "Could not send email. Please try again or use Google sign-in." },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: "We sent a new password to your email. Check your inbox (and spam folder).",
    });
  }

  // Either create a new user, or attach a password to an existing Google-only user
  if (existing && !existing.passwordHash) {
    await db.user.update({
      where: { id: existing.id },
      data: { passwordHash, name: existing.name || name },
    });
  } else {
    await db.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "MEMBER",
      },
    });
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");
  const result = await sendPasswordEmail({
    to: email,
    name,
    password,
    siteUrl,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Account created, but we couldn't send the password email. Please contact the admin." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "We sent your password to your email. Check your inbox (and spam folder).",
  });
}
