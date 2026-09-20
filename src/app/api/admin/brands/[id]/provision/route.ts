import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import { provisionBrandFromSubmission } from "@/lib/brand-provision";
import type { BrandOnboardingFormData } from "@/lib/brand-onboarding-types";

/**
 * POST /api/admin/brands/[id]/provision
 *
 * Super Admin reviews a SUBMITTED brand-onboarding invite and applies
 * it — creates the Brand row with the submitted branding fields
 * (skipped fields inherit from Coma), stamps `appliedBrandId` +
 * `appliedAt` on the invite, and returns the new brand's id + slug.
 *
 * Body: { } (no body — uses the invite's stored submissionJson)
 *
 * Returns: { ok: true, brandId, brandSlug }
 */
type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 });
  }

  const { id: inviteId } = await params;
  const invite = await db.brandOnboardingInvite.findUnique({
    where: { id: inviteId },
    select: { id: true, status: true, submissionJson: true, appliedBrandId: true },
  });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status !== "SUBMITTED") {
    return NextResponse.json({ error: `Invite is in ${invite.status} state, not SUBMITTED.` }, { status: 409 });
  }
  if (invite.appliedBrandId) {
    return NextResponse.json({
      error: `Invite already provisioned (brandId=${invite.appliedBrandId}).`,
      brandId: invite.appliedBrandId,
    }, { status: 409 });
  }
  if (!invite.submissionJson) {
    return NextResponse.json({ error: "Invite has no submission data." }, { status: 422 });
  }

  let submission: BrandOnboardingFormData;
  try {
    submission = JSON.parse(invite.submissionJson) as BrandOnboardingFormData;
  } catch {
    return NextResponse.json({ error: "Submission JSON is corrupt." }, { status: 422 });
  }

  try {
    const { brandId, brandSlug } = await provisionBrandFromSubmission({
      submission,
      appliedByUserId: user!.id,
    });

    await db.brandOnboardingInvite.update({
      where: { id: invite.id },
      data: {
        appliedBrandId: brandId,
        appliedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, brandId, brandSlug });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 400 });
  }
}
