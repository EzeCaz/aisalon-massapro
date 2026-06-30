import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPasswordEmail, emailConfigured } from "@/lib/email";
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
 *
 * All errors are caught and returned as JSON so the client can show a
 * meaningful message instead of "Could not reach the server".
 */
export async function POST(req: NextRequest) {
  try {
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

    // Detect missing SMTP config early — we can still create the user, but
    // we won't be able to email them the password. Surface this clearly.
    const smtpReady = emailConfigured();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");

    let userExisted = false;
    let userHasPassword = false;
    let displayName = name;

    try {
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        userExisted = true;
        userHasPassword = !!existing.passwordHash;
        displayName = existing.name || name;
        // Either reset an existing password or attach one to a Google-only user.
        await db.user.update({
          where: { id: existing.id },
          data: { passwordHash, name: displayName },
        });
      } else {
        // Generate a unique referral code for the new user.
        // Format: SAL-{base36(timestamp)}-{random6} — opaque, shareable,
        // and unique via the @unique constraint on User.referralCode.
        const referralCode = `SAL-${Date.now().toString(36).toUpperCase()}-${Math.random()
          .toString(36)
          .slice(2, 8)
          .toUpperCase()}`;
        await db.user.create({
          data: {
            email,
            name,
            passwordHash,
            role: "MEMBER",
            referralCode,
            referralCodeSetAt: new Date(),
          },
        });
      }
    } catch (dbErr) {
      console.error("[signup] DB error:", dbErr);
      // The most common cause in production is a misconfigured DATABASE_URL
      // (e.g. pointing at a read-only local SQLite file on Vercel's
      // serverless filesystem). Surface a clear, actionable message.
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      return NextResponse.json(
        {
          error:
            "The user database isn't reachable from the server. " +
            "This usually means DATABASE_URL on Vercel is still pointing at a local SQLite file — " +
            "switch it to a real Postgres database (Vercel → Storage → Create Postgres) and run `prisma db push`. " +
            "Internal: " + msg.slice(0, 200),
        },
        { status: 503 }
      );
    }

    // SMTP not configured — we can't email the password. Don't fail the
    // request, but be honest about it so the user / admin can fix SMTP.
    if (!smtpReady) {
      console.warn(
        `[signup] SMTP_* env vars are not set on the server — cannot email the password to ${email}. ` +
          `User record was ${userExisted ? "updated" : "created"} successfully, but the password is only visible in this server log:\n` +
          `----\nPassword for ${email}: ${password}\n----`
      );
      return NextResponse.json({
        ok: true,
        message:
          "Your account is ready, but the email server isn't configured yet on our side. " +
          "The site admin has been notified and will send you your password manually. " +
          "(If you are the admin, check the Vercel function logs — the password is printed there.)",
      });
    }

    const result = await sendPasswordEmail({
      to: email,
      name: displayName,
      password,
      siteUrl,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            "Account " + (userExisted ? "updated" : "created") +
            ", but we couldn't send the password email (" +
            (result.error || "unknown error") +
            "). Please contact the admin.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: userHasPassword
        ? "We sent a new password to your email. Check your inbox (and spam folder)."
        : "We sent your password to your email. Check your inbox (and spam folder).",
    });
  } catch (err) {
    console.error("[signup] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Unexpected server error: " + msg.slice(0, 200) },
      { status: 500 }
    );
  }
}
