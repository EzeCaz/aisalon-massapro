import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import { sendChapterOnboardingEmail } from "@/lib/email";
import {
  generateOnboardingToken,
} from "@/lib/brand-onboarding-types";

/**
 * POST /api/admin/brands/send-onboarding
 *
 * Super Admin creates a brand-onboarding invite and emails the lead
 * a unique URL to fill the public form at /brand-onboarding/[token].
 *
 * Body: {
 *   inviteeEmail: string,
 *   prefillBrandName?: string,
 *   prefillBrandSlug?: string,
 *   adminNotes?: string,
 * }
 *
 * Returns: { ok: true, inviteId, token, inviteeEmail }
 *
 * The invite expires after 30 days. The lead can fill the form once;
 * subsequent visits show a "you already submitted" view.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 });
  }

  let body: {
    inviteeEmail?: string;
    prefillBrandName?: string;
    prefillBrandSlug?: string;
    adminNotes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const inviteeEmail = (body.inviteeEmail || "").trim().toLowerCase();
  if (!inviteeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail)) {
    return NextResponse.json({ error: "A valid invitee email is required." }, { status: 400 });
  }

  const prefillBrandName = (body.prefillBrandName || "").trim() || null;
  const prefillBrandSlugRaw = (body.prefillBrandSlug || "").trim().toLowerCase() || null;
  // Validate slug pattern if provided.
  const prefillBrandSlug =
    prefillBrandSlugRaw && /^[a-z0-9-]{2,40}$/.test(prefillBrandSlugRaw) ? prefillBrandSlugRaw : null;

  // Prevent duplicate pending invites to the same email.
  const existingPending = await db.brandOnboardingInvite.findFirst({
    where: { inviteeEmail, status: "PENDING" },
    select: { id: true, token: true, expiresAt: true },
  });
  if (existingPending) {
    return NextResponse.json({
      error: `There's already a pending invite to ${inviteeEmail} (expires ${existingPending.expiresAt.toISOString().slice(0, 10)}). Revoke it first if you want to send a new one.`,
      existingToken: existingPending.token,
    }, { status: 409 });
  }

  const token = generateOnboardingToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const invite = await db.brandOnboardingInvite.create({
    data: {
      token,
      inviteeEmail,
      prefillBrandName,
      prefillBrandSlug,
      invitedById: user!.id,
      expiresAt,
      adminNotes: (body.adminNotes || "").trim() || null,
    },
    select: { id: true, token: true, expiresAt: true },
  });

  // Send the invite email. The form URL is `<siteUrl>/brand-onboarding/<token>`.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://platform.joincoma.com");
  const formUrl = `${siteUrl.replace(/\/$/, "")}/brand-onboarding/${token}`;
  const emailResult = await sendChapterOnboardingEmail({
    to: inviteeEmail,
    name: prefillBrandName || null,
    chapterName: prefillBrandName,
    formUrl,
    brandSlug: "coma", // the invite email always comes "from" Coma (platform parent)
  });
  if (!emailResult.ok) {
    return NextResponse.json({
      ok: true,
      inviteId: invite.id,
      token: invite.token,
      inviteeEmail,
      emailWarning: `Invite created but the email couldn't be sent (${emailResult.error || "unknown error"}). Share the form URL manually: ${formUrl}`,
    });
  }

  return NextResponse.json({
    ok: true,
    inviteId: invite.id,
    token: invite.token,
    inviteeEmail,
    formUrl,
    expiresAt: invite.expiresAt.toISOString(),
  });
}
