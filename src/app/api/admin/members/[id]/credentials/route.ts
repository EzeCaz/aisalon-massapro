import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isSuperAdmin,
  isSuperAdminEmail,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth-guards";
import bcrypt from "bcryptjs";
import { sendPasswordEmail, emailConfigured } from "@/lib/email";

/**
 * PATCH /api/admin/members/[id]/credentials
 *
 * Super-Admin-only endpoint that lets the admin change a member's
 * primary email AND/OR set a new password (manually typed, not auto-
 * generated). Designed for the "speaker can't log in" support case:
 *
 *   - Speaker signed up via email, got a password, password doesn't work
 *     (email client mangled the monospace text, or they typo'd it)
 *   - Admin can set a clean, simple password manually and tell the user
 *     verbally / via DM, bypassing the unreliable email round-trip.
 *
 * Body: {
 *   email?:     string | null,   // new primary email (lowercased)
 *   password?:  string | null,   // new plaintext password (6-128 chars)
 *   sendEmail?: boolean,         // if true + password is set + SMTP is
 *                                // configured, email the new password
 *                                // to the user (default: false — admin
 *                                // typically communicates it manually)
 * }
 *
 * All fields are optional — partial updates work. If neither email nor
 * password is provided, returns 400.
 *
 * Permission:
 *   - ONLY Super Admin (by email OR DB role) can call this endpoint.
 *   - Super Admin targets CANNOT have their credentials changed via
 *     this route (defensive — prevents locking out the platform owner).
 *     To change a Super Admin's password, SSH-style manual DB writes
 *     are required (out of scope for this UI).
 *
 * Email-change semantics:
 *   - If the new email is ALREADY a secondary email on THIS user,
 *     we swap: the old primary becomes a secondary, the secondary
 *     becomes the primary. This keeps the user able to sign in via
 *     both inboxes.
 *   - If the new email is a primary email of ANOTHER user → 400.
 *   - If the new email is a secondary email of ANOTHER user → 400.
 *   - Otherwise: old primary email is downgraded to a secondary
 *     email (label "Previous primary") so the user keeps access.
 *
 * Returns: { ok: true, user: { id, email, name } }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Use getCurrentUser() so the auto-sync runs (if the user's email is
  // in the SUPER_ADMIN_EMAILS allowlist but their DB role hasn't been
  // upgraded yet, this will upgrade it inline).
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      {
        error:
          "Only a Super Admin can change a member's email or password. " +
          "If you are the Super Admin, sign out and back in to refresh your session.",
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Defensive: never let the credentials of a Super Admin be touched via
  // this endpoint (not even by another Super Admin). The Super Admin
  // list is hard-coded by email, so changing their email could lock the
  // platform owner out completely.
  if (isSuperAdminEmail(target.email)) {
    return NextResponse.json(
      {
        error:
          "Super Admin credentials cannot be changed via this endpoint. " +
          "Super Admin status is hard-coded by email — edit SUPER_ADMIN_EMAILS in src/lib/permissions.ts and re-deploy.",
      },
      { status: 403 }
    );
  }

  let body: {
    email?: string | null;
    password?: string | null;
    sendEmail?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newEmailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const newPassword = typeof body.password === "string" ? body.password : "";
  const sendEmailFlag = body.sendEmail === true;

  if (!newEmailRaw && !newPassword) {
    return NextResponse.json(
      { error: "Provide at least one of `email` or `password` to update." },
      { status: 400 }
    );
  }

  // ---- Email change (optional) ----
  if (newEmailRaw) {
    const newEmail = newEmailRaw.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json(
        { error: "New email is not a valid address." },
        { status: 400 }
      );
    }

    if (newEmail === target.email.toLowerCase()) {
      // No-op — they typed the same email. Don't fail, just skip.
    } else {
      // Check no OTHER user already owns this email (primary OR secondary).
      const conflictingPrimary = await db.user.findUnique({
        where: { email: newEmail },
        select: { id: true },
      });
      const conflictingSecondary = await db.userEmail.findUnique({
        where: { email: newEmail },
        select: { id: true, userId: true },
      });
      if (conflictingPrimary && conflictingPrimary.id !== target.id) {
        return NextResponse.json(
          {
            error: `Email "${newEmail}" is already the primary email of another member.`,
          },
          { status: 400 }
        );
      }
      if (conflictingSecondary && conflictingSecondary.userId !== target.id) {
        return NextResponse.json(
          {
            error: `Email "${newEmail}" is already attached to another member as a secondary email.`,
          },
          { status: 400 }
        );
      }

      // If newEmail is already a SECONDARY email on this user → promote
      // (swap): delete the secondary row, set User.email = newEmail,
      // then add the OLD primary as a new secondary (so they can still
      // sign in via the old inbox).
      const existingSecondary = await db.userEmail.findUnique({
        where: { email: newEmail },
      });
      if (existingSecondary && existingSecondary.userId === target.id) {
        await db.$transaction([
          // Drop the secondary row (it's about to become the primary)
          db.userEmail.delete({ where: { id: existingSecondary.id } }),
          // Swap the primary
          db.user.update({
            where: { id: target.id },
            data: { email: newEmail },
          }),
          // Re-insert the OLD primary as a secondary so sign-in still works
          db.userEmail.create({
            data: {
              userId: target.id,
              email: target.email.toLowerCase(),
              label: "Previous primary",
            },
          }),
        ]);
      } else {
        // No existing secondary for this email — straight swap.
        await db.$transaction([
          db.user.update({
            where: { id: target.id },
            data: { email: newEmail },
          }),
          // Keep the old primary email as a secondary so the user can
          // still sign in via the old inbox (prevents accidental lockout
          // if the admin fat-fingers the new email).
          db.userEmail.create({
            data: {
              userId: target.id,
              email: target.email.toLowerCase(),
              label: "Previous primary",
            },
          }),
        ]);
      }

      // Update the in-memory target so the password step (if any) uses
      // the NEW email when sending the notification email.
      target.email = newEmail;
    }
  }

  // ---- Password change (optional) ----
  if (newPassword) {
    if (newPassword.length < 6 || newPassword.length > 128) {
      return NextResponse.json(
        { error: "Password must be between 6 and 128 characters." },
        { status: 400 }
      );
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: target.id },
      data: { passwordHash: hash },
    });

    // Optional: email the new password to the user. Default is OFF —
    // the admin typically tells the user verbally / via DM, which is
    // more reliable than the email round-trip (the whole reason this
    // endpoint exists).
    if (sendEmailFlag) {
      if (!emailConfigured()) {
        return NextResponse.json({
          ok: true,
          warning:
            "Password updated, but SMTP is not configured on the server — the email was NOT sent. Communicate the new password to the user manually.",
          user: { id: target.id, email: target.email, name: target.name },
        });
      }
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");
      const result = await sendPasswordEmail({
        to: target.email,
        name: target.name,
        password: newPassword,
        siteUrl,
      });
      if (!result.ok) {
        return NextResponse.json({
          ok: true,
          warning:
            "Password updated, but the email failed to send (" +
            (result.error || "unknown error") +
            "). Communicate the new password to the user manually.",
          user: { id: target.id, email: target.email, name: target.name },
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    user: { id: target.id, email: target.email, name: target.name },
  });
}
