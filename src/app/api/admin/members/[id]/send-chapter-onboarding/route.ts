/**
 * POST /api/admin/members/[id]/send-chapter-onboarding
 *
 * Sends a chapter onboarding form invite to a chapter lead. Creates a
 * ChapterOnboardingInvite row with a tokenized URL, emails the lead, and
 * returns the invite details.
 *
 * Auth: ADMIN+ (members.edit permission). Called from the "Send chapter
 * onboarding form" button on the EditMemberDialog.
 *
 * Body (all optional — admin can pre-fill if known):
 *   { prefillChapterName?: string, prefillChapterSlug?: string }
 *
 * Response:
 *   200 { ok: true, invite: { token, formUrl, sentTo } }
 *   400 { error: "..." }  — user not eligible (e.g. missing email)
 *   403 { error: "Forbidden" }
 *   404 { error: "Member not found" }
 *   500 { error: "SMTP not configured" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { can } from "@/lib/permissions";
import { isSuperAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { emailConfigured, sendChapterOnboardingEmail } from "@/lib/email";
import { generateOnboardingToken } from "@/lib/chapter-onboarding-types";

const EXPIRES_DAYS = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ──
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });
  if (!can(me.role, "members.edit") && !isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // ── Load target user ──
  const target = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      chapterId: true,
      chapter: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // ── Parse optional body ──
  let body: { prefillChapterName?: string; prefillChapterSlug?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  // Pre-fill logic: if admin provided a chapter name/slug, use it.
  // Otherwise, if the user is already linked to a chapter, use that chapter's
  // name/slug as the pre-fill (useful for re-onboarding an existing chapter).
  const prefillChapterName =
    (body.prefillChapterName?.trim() || target.chapter?.name || "").trim() || null;
  const prefillChapterSlug =
    (body.prefillChapterSlug?.trim() || target.chapter?.slug || "").trim() || null;

  // ── SMTP check ──
  if (!emailConfigured()) {
    return NextResponse.json(
      {
        error:
          "SMTP is not configured on this server. Set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM env vars in Vercel to enable email delivery.",
      },
      { status: 500 },
    );
  }

  // ── Create invite ──
  const token = generateOnboardingToken();
  const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  const invite = await db.chapterOnboardingInvite.create({
    data: {
      token,
      userId: target.id,
      invitedById: me.id,
      inviteeEmail: target.email,
      prefillChapterName,
      prefillChapterSlug,
      expiresAt,
      status: "PENDING",
    },
  });

  // ── Build form URL + send email ──
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");
  const formUrl = `${siteUrl}/chapter-onboarding/${token}`;

  const emailResult = await sendChapterOnboardingEmail({
    to: target.email,
    name: target.name,
    chapterName: prefillChapterName,
    formUrl,
  });

  if (!emailResult.ok) {
    return NextResponse.json(
      {
        error:
          "Invite was created but the email couldn't be sent (" +
          (emailResult.error || "unknown error") +
          "). The form URL is included below — you can copy and send it manually.",
        invite: { token, formUrl, sentTo: target.email },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    invite: {
      id: invite.id,
      token,
      formUrl,
      sentTo: target.email,
      expiresAt: expiresAt.toISOString(),
    },
  });
}
