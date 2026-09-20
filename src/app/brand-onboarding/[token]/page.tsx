import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BrandOnboardingFormClient } from "./brand-onboarding-form-client";
import type { Metadata } from "next";

/**
 * /brand-onboarding/[token] — PUBLIC brand onboarding form.
 *
 * Super Admin invites a brand lead by email → the lead gets a unique
 * 30-day URL to this page. They fill in their branding (colors, logo
 * URLs, login copy, email config, launch plan) and submit. Super Admin
 * then reviews + provisions a new Brand row at /admin/brands.
 *
 * Skipped fields inherit from Coma (the platform parent brand) at
 * provision time — see provisionBrandFromSubmission in
 * src/lib/brand-provision.ts.
 *
 * Auth: NONE required to view (the token in the URL is the auth).
 */
type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const invite = await db.brandOnboardingInvite.findUnique({
    where: { token },
    select: { prefillBrandName: true, status: true },
  });
  if (!invite) return { title: "Brand onboarding — Coma" };
  return {
    title: invite.prefillBrandName
      ? `${invite.prefillBrandName} onboarding — Coma`
      : "Brand onboarding — Coma",
    description: "Fill in your brand's identity, colors, logo, and launch plan. Skipped fields inherit from Coma defaults.",
  };
}

export default async function BrandOnboardingPage({ params }: Params) {
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
    notFound();
  }

  // Mark first-open (best-effort — non-fatal on failure).
  if (!invite.openedAt && invite.status === "PENDING") {
    try {
      await db.brandOnboardingInvite.update({
        where: { id: invite.id },
        data: { openedAt: new Date() },
      });
    } catch {
      // ignore
    }
  }

  // Status check — expired or already submitted.
  const now = new Date();
  const isExpired = invite.status === "EXPIRED" || (invite.status === "PENDING" && invite.expiresAt < now);
  const isSubmitted = invite.status === "SUBMITTED" || !!invite.submissionJson;

  let submission: Record<string, unknown> | null = null;
  if (invite.submissionJson) {
    try {
      submission = JSON.parse(invite.submissionJson);
    } catch {
      // ignore
    }
  }

  const serialized = {
    token: invite.token,
    inviteeEmail: invite.inviteeEmail,
    prefillBrandName: invite.prefillBrandName,
    prefillBrandSlug: invite.prefillBrandSlug,
    expiresAt: invite.expiresAt.toISOString(),
    isExpired,
    isSubmitted,
    submittedAt: invite.submittedAt?.toISOString() ?? null,
    submission,
  };

  return <BrandOnboardingFormClient {...serialized} />;
}
