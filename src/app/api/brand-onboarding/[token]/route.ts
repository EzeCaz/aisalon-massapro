import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { BrandOnboardingFormData, BrandOnboardingInviteMeta } from "@/lib/brand-onboarding-types";

/**
 * /api/brand-onboarding/[token]
 *
 *   GET  — return the invite metadata (status, prefill, expiry). The
 *          public form page uses this to render the right state
 *          (PENDING form, SUBMITTED view, EXPIRED notice).
 *
 *   POST — submit the form. Body: BrandOnboardingFormData. Stamps
 *          status=SUBMITTED + stores submissionJson + sets submittedAt.
 *          Once submitted, the form is locked — re-POSTs return 409.
 */

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const invite = await db.brandOnboardingInvite.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      status: true,
      inviteeEmail: true,
      prefillBrandName: true,
      prefillBrandSlug: true,
      expiresAt: true,
      submittedAt: true,
      openedAt: true,
      submissionJson: true,
    },
  });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  // Mark first-open (one-shot).
  if (!invite.openedAt && invite.status === "PENDING") {
    try {
      await db.brandOnboardingInvite.update({
        where: { id: invite.id },
        data: { openedAt: new Date() },
      });
    } catch {
      // Non-fatal — the response is still valid.
    }
  }

  const now = new Date();
  let status = invite.status as BrandOnboardingInviteMeta["status"];
  if (status === "PENDING" && invite.expiresAt < now) {
    status = "EXPIRED";
  }

  let submission: BrandOnboardingFormData | undefined;
  if (invite.submissionJson) {
    try {
      submission = JSON.parse(invite.submissionJson) as BrandOnboardingFormData;
    } catch {
      // Corrupt JSON — treat as no submission.
    }
  }

  return NextResponse.json({
    token: invite.token,
    status,
    inviteeEmail: invite.inviteeEmail,
    prefillBrandName: invite.prefillBrandName,
    prefillBrandSlug: invite.prefillBrandSlug,
    expiresAt: invite.expiresAt.toISOString(),
    submittedAt: invite.submittedAt?.toISOString() ?? null,
    openedAt: invite.openedAt?.toISOString() ?? null,
    submission,
  } satisfies BrandOnboardingInviteMeta);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const invite = await db.brandOnboardingInvite.findUnique({
    where: { token },
    select: { id: true, status: true, expiresAt: true, submissionJson: true },
  });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status === "SUBMITTED" || invite.submissionJson) {
    return NextResponse.json(
      { error: "This form has already been submitted. Contact the platform admin if you need to make changes." },
      { status: 409 }
    );
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This invite has expired. Contact the platform admin for a new one." },
      { status: 410 }
    );
  }

  let body: BrandOnboardingFormData;
  try {
    body = (await req.json()) as BrandOnboardingFormData;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Minimal required-field validation. The form page does more
  // thorough client-side validation; we only enforce the essentials.
  if (!body.brandName || body.brandName.trim().length < 2) {
    return NextResponse.json({ error: "Brand name is required (min 2 characters)." }, { status: 400 });
  }
  if (!body.brandSlug || !/^[a-z0-9-]{2,40}$/.test(body.brandSlug.trim().toLowerCase())) {
    return NextResponse.json({ error: "Brand slug is required (2-40 lowercase letters/digits/hyphens)." }, { status: 400 });
  }
  if (!body.leadName || body.leadName.trim().length < 2) {
    return NextResponse.json({ error: "Lead name is required." }, { status: 400 });
  }
  if (!body.leadEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.leadEmail.trim())) {
    return NextResponse.json({ error: "A valid lead email is required." }, { status: 400 });
  }

  // Color validation (optional fields — when present, must be a hex).
  for (const [k, v] of [
    ["primaryColor", body.primaryColor],
    ["secondaryColor", body.secondaryColor],
    ["accentColor", body.accentColor],
  ] as const) {
    if (v && !/^#[0-9A-Fa-f]{6}$/.test(v.trim())) {
      return NextResponse.json({ error: `${k} must be a 6-digit hex color (e.g. "#0A1F44") or empty.` }, { status: 400 });
    }
  }

  await db.brandOnboardingInvite.update({
    where: { id: invite.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      submissionJson: JSON.stringify(body),
    },
  });

  return NextResponse.json({ ok: true, status: "SUBMITTED" });
}
