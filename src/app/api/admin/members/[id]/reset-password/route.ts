import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { can, isSuperAdmin } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth-guards";
import { sendPasswordEmail, emailConfigured } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/admin/members/[id]/reset-password
 *
 * Admin-initiated password reset for a single member.
 *
 * - Generates a fresh 8-char password, bcrypt-hashes it, stores it.
 * - Emails the plaintext to the member's PRIMARY email via SMTP.
 * - Returns 200 on success (password email queued).
 * - Returns a clear error if SMTP isn't configured or the user has no
 *   email (Google-only accounts still have a primary email — it's the
 *   one on User.email, so this is fine).
 *
 * Permission:
 *   - ADMIN or SUPER_ADMIN can reset any member's password (any role).
 *   - A Super Admin can reset another Super Admin's password.
 *   - A regular ADMIN cannot reset a Super Admin's password (returns 403).
 *
 * The plaintext password is NEVER returned in the response — it's only
 * sent via email. This mirrors the self-serve signup flow.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  // Allow ADMIN and SUPER_ADMIN. CO_HOST and MEMBER get 403.
  if (!can(me.role, "members.edit") && !isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Regular admins can't reset a Super Admin's password.
  if (
    target.role === "SUPER_ADMIN" &&
    !isSuperAdmin({ email: me.email, role: me.role })
  ) {
    return NextResponse.json(
      { error: "Only a Super Admin can reset another Super Admin's password." },
      { status: 403 }
    );
  }

  // Don't let an admin lock themselves out via this route. (They can
  // still use the Forgot Password flow on /login to recover.)
  if (me.id === target.id) {
    return NextResponse.json(
      { error: "Use the Forgot Password link on the login page to reset your own password." },
      { status: 400 }
    );
  }

  // Generate a memorable-ish but random 8-char password.
  const password = crypto.randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
  const passwordHash = await bcrypt.hash(password, 10);

  // Persist the new hash. The user's existing passwordHash (if any) is
  // overwritten — this is the expected behavior for a reset.
  await db.user.update({
    where: { id: target.id },
    data: { passwordHash },
  });

  // SMTP must be configured to actually deliver the password.
  if (!emailConfigured()) {
    console.error(
      `[reset-password] SMTP_* env vars are not set — cannot email the new password to ${target.email}. ` +
      `User record ${target.id} was updated with a new hash, but the password is only visible here:\n` +
      `----\nPassword for ${target.email}: ${password}\n----`
    );
    return NextResponse.json(
      {
        error:
          "Password was reset on the server, but SMTP is not configured so the email couldn't be sent. " +
          "Check the Vercel function logs for the plaintext password, or configure SMTP_* env vars.",
      },
      { status: 500 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");

  const result = await sendPasswordEmail({
    to: target.email,
    name: target.name,
    password,
    siteUrl,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          "Password was reset, but we couldn't send the email (" +
          (result.error || "unknown error") +
          "). The user can use the Forgot Password link on the login page to get a new one.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `A new password was emailed to ${target.email}.`,
    sentTo: target.email,
  });
}
