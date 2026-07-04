import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { can, isSuperAdmin } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth-guards";
import { sendPasswordEmail, emailConfigured } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/admin/members/bulk-reset-password
 *
 * Admin-initiated password reset for many members at once.
 *
 * Body: { userIds: string[] }
 *
 * - For each user ID: generates a fresh password, hashes it, stores it,
 *   emails the plaintext to the user's primary email.
 * - Caps at 100 users per request to keep Vercel serverless timeout
 *   under control. For larger lists, the admin should split the batch.
 * - Returns a per-user result summary: { sent: [{ id, email }], failed:
 *   [{ id, email, error }], skipped: [{ id, email, reason }] }.
 * - The admin's own ID is always skipped (use the Forgot Password link
 *   on /login to reset your own password).
 * - Regular admins can't reset Super Admins' passwords — those are
 *   skipped with reason "super_admin: requires super admin caller".
 *
 * Permission:
 *   - ADMIN or SUPER_ADMIN can call this route.
 *   - CO_HOST and MEMBER get 403.
 *
 * Note: SMTP must be configured for emails to actually send. If SMTP is
 * missing, all resets fail with a clear error message (the password
 * hashes are NOT updated — we check SMTP before touching any rows).
 */
export async function POST(req: NextRequest) {
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  if (!can(me.role, "members.edit") && !isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userIds = Array.isArray(body.userIds) ? body.userIds.filter((x): x is string => typeof x === "string") : [];
  if (userIds.length === 0) {
    return NextResponse.json({ error: "No user IDs provided." }, { status: 400 });
  }
  if (userIds.length > 100) {
    return NextResponse.json(
      { error: `Too many users (${userIds.length}). Bulk reset is capped at 100 per request.` },
      { status: 400 }
    );
  }

  // SMTP must be configured before we touch any rows. If we update the
  // hashes and THEN discover SMTP is broken, we'd have locked everyone
  // out with no way to deliver the new passwords.
  if (!emailConfigured()) {
    return NextResponse.json(
      {
        error:
          "SMTP is not configured on the server. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, " +
          "SMTP_FROM, and SMTP_SECURE in the Vercel project's environment variables before sending " +
          "bulk password resets.",
      },
      { status: 500 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");

  const callerIsSuperAdmin = isSuperAdmin({ email: me.email, role: me.role });

  // Fetch all targets in one query.
  const targets = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true, role: true },
  });
  const targetMap = new Map(targets.map((t) => [t.id, t]));

  const sent: { id: string; email: string }[] = [];
  const failed: { id: string; email: string; error: string }[] = [];
  const skipped: { id: string; email: string; reason: string }[] = [];

  // Sequential loop — avoids spawning 100 parallel SMTP connections
  // (Gmail throttles, and Vercel's memory is limited).
  for (const id of userIds) {
    const target = targetMap.get(id);
    if (!target) {
      skipped.push({ id, email: "(unknown)", reason: "user not found" });
      continue;
    }
    // Skip the admin's own ID — they should use the Forgot Password flow.
    if (me.id === target.id) {
      skipped.push({ id, email: target.email, reason: "can't reset your own password here — use Forgot Password on /login" });
      continue;
    }
    // Regular admins can't reset Super Admins' passwords.
    if (target.role === "SUPER_ADMIN" && !callerIsSuperAdmin) {
      skipped.push({ id, email: target.email, reason: "super_admin: requires super admin caller" });
      continue;
    }

    try {
      const password = crypto.randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
      const passwordHash = await bcrypt.hash(password, 10);

      await db.user.update({
        where: { id: target.id },
        data: { passwordHash },
      });

      const result = await sendPasswordEmail({
        to: target.email,
        name: target.name,
        password,
        siteUrl,
      });
      if (!result.ok) {
        failed.push({ id, email: target.email, error: result.error || "email send failed" });
        continue;
      }
      sent.push({ id, email: target.email });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      failed.push({ id, email: target.email, error: errMsg.slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sent,
    failed: failed,
    skipped: skipped,
    summary: {
      sent: sent.length,
      failed: failed.length,
      skipped: skipped.length,
      total: userIds.length,
    },
  });
}
