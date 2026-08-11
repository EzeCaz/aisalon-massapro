/**
 * POST /api/admin/chapter-onboarding/preview-invite
 *
 * Creates a chapter onboarding invite WITHOUT sending an email. Returns
 * the formUrl so the Super Admin can open it in a browser to preview
 * the brand-aware onboarding form (e.g. for Coma).
 *
 * Auth: SUPER_ADMIN only.
 *
 * Body:
 *   { email: string }   — the email of the user to create an invite for.
 *                         The user must already exist (signed in at least
 *                         once). The user's brandSlug determines which
 *                         brand the form renders with.
 *
 * Response:
 *   200 { ok: true, invite: { token, formUrl, sentTo, expiresAt } }
 *   403 { error: "Forbidden" }     — caller is not SUPER_ADMIN
 *   404 { error: "User not found" } — email doesn't match a user row
 *
 * NOTE: This endpoint is for previewing the form only. To actually send
 * the invite email to the chapter lead, use
 * POST /api/admin/members/[id]/send-chapter-onboarding instead.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { generateOnboardingToken } from "@/lib/chapter-onboarding-types";

const EXPIRES_DAYS = 30;

export async function POST(req: NextRequest) {
  // ── Auth: SUPER_ADMIN only ──
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Parse body ──
  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — but we need an email
  }
  const email = (body.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing 'email' in body" }, { status: 400 });
  }

  // ── Load target user ──
  const target = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      brandSlug: true,
    },
  });
  if (!target) {
    return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 });
  }

  // ── Check for an existing PENDING invite for this user. If found,
  //    reuse it (don't create a duplicate). ──
  const existing = await db.chapterOnboardingInvite.findFirst({
    where: {
      userId: target.id,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, expiresAt: true },
  });

  let invite;
  if (existing) {
    invite = existing;
  } else {
    // Create a new invite.
    const token = generateOnboardingToken();
    const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    invite = await db.chapterOnboardingInvite.create({
      data: {
        token,
        userId: target.id,
        invitedById: me.id,
        inviteeEmail: target.email,
        prefillChapterName: null,
        prefillChapterSlug: null,
        expiresAt,
        status: "PENDING",
      },
      select: { id: true, token: true, expiresAt: true },
    });
  }

  // ── Build form URL ──
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");
  const formUrl = `${siteUrl}/chapter-onboarding/${invite.token}`;

  return NextResponse.json({
    ok: true,
    invite: {
      id: invite.id,
      token: invite.token,
      formUrl,
      sentTo: target.email,
      expiresAt: invite.expiresAt.toISOString(),
      brandSlug: target.brandSlug ?? "aisalon",
    },
  });
}
