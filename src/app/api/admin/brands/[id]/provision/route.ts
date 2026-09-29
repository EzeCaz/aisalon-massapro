import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin, ROLES } from "@/lib/permissions";
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
 * Option 4 brand-admin auto-promotion (2026-09-29): if the invite has
 * an `applicantUserId` (the lead signed in via /apply/form before
 * submitting), the applicant is auto-promoted to BRAND_ADMIN for the
 * newly-provisioned brand — role=BRAND_ADMIN, brandSlug=brandSlug,
 * brandId=brandId. This implements "Path 1 — Lead applies → Super
 * Admin approves" of the brand-admin approval flow.
 *
 * Body: { } (no body — uses the invite's stored submissionJson)
 *
 * Returns: { ok: true, brandId, brandSlug, brandAdminPromoted?: string }
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
    select: {
      id: true,
      status: true,
      submissionJson: true,
      appliedBrandId: true,
      applicantUserId: true,
      inviteeEmail: true,
      prefillBrandSlug: true,
    },
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

    // ── Auto-promote applicant to BRAND_ADMIN (Option 4, Path 1) ─────
    // If the invite has an applicantUserId (the lead signed in via
    // /apply/form before submitting), promote them to BRAND_ADMIN for
    // this brand. This is the "Lead applies → Super Admin approves"
    // path — provisioning IS the approval step, and the lead becomes
    // the brand admin automatically.
    let brandAdminPromoted: string | undefined;
    if (invite.applicantUserId) {
      try {
        await db.user.update({
          where: { id: invite.applicantUserId },
          data: {
            role: ROLES.BRAND_ADMIN,
            brandSlug,
            brandId,
            onboardedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        brandAdminPromoted = invite.applicantUserId;
        console.log(
          `[provision] Auto-promoted applicant ${invite.applicantUserId} to BRAND_ADMIN for ${brandSlug}`,
        );
      } catch (promoErr) {
        // Don't fail the whole provision if the promotion fails —
        // the brand is created, the Super Admin can manually promote
        // the user later. Log and continue.
        console.error(
          `[provision] Failed to auto-promote applicant ${invite.applicantUserId}:`,
          promoErr instanceof Error ? promoErr.message : promoErr,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      brandId,
      brandSlug,
      brandAdminPromoted,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 400 });
  }
}
