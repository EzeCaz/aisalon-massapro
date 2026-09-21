import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import {
  resolveBrand,
  getEnvDefaultBrandSlug,
} from "@/lib/brand/resolve-brand";
import { BrandHeaderLogo } from "@/components/brand/brand-header-logo";
import { ApplyFormClient } from "./apply-form-client";
import type { Metadata } from "next";

/**
 * /apply/form — the application form for community leads.
 *
 * Auth-gated: the lead must be signed in (via /apply/login) so we can
 * link the application to their user.id (applicantUserId on
 * BrandOnboardingInvite). The lead's name + email are pre-filled from
 * the session.
 *
 * Form fields mirror the BrandOnboardingFormData type — all optional
 * except brandName, brandSlug, leadName (pre-filled), leadEmail
 * (pre-filled). Skipped fields inherit Coma defaults at provision
 * time.
 *
 * On submit, POST /api/apply creates a BrandOnboardingInvite with
 * source="SELF_SERVE" + status="SUBMITTED". The lead can re-visit
 * /apply/form to see their existing application (read-only).
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Apply to bring your community to Coma",
    description:
      "Fill in your brand's identity, colors, logo, mascot, slogan, and launch plan. Skipped fields inherit Coma's defaults.",
  };
}

export const dynamic = "force-dynamic";

export default async function ApplyFormPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/apply/login?callbackUrl=/apply/form");
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true },
  });
  if (!me) {
    redirect("/apply/login?callbackUrl=/apply/form");
  }

  // Resolve brand for visual styling.
  const h = await headers();
  const host = h.get("host");
  const brand = resolveBrand({
    urlBrandSlug: null,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  // Has the user already submitted an application?
  // Wrapped in try/catch — if the migration adding source/applicantUserId
  // hasn't applied yet, the query fails. Treat as "no existing application"
  // and render the empty form.
  let existing: {
    id: string;
    token: string;
    status: string;
    submittedAt: Date | null;
    submissionJson: string | null;
    appliedBrandId: string | null;
  } | null = null;
  try {
    existing = await db.brandOnboardingInvite.findFirst({
      where: {
        OR: [
          { applicantUserId: me.id },
          { inviteeEmail: me.email, source: "SELF_SERVE" },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        status: true,
        submittedAt: true,
        submissionJson: true,
        appliedBrandId: true,
      },
    });
  } catch (dbErr) {
    console.warn("[/apply/form] existing-application lookup failed (likely migration not applied):", dbErr);
  }

  let existingSubmission: Record<string, unknown> | null = null;
  if (existing?.submissionJson) {
    try {
      existingSubmission = JSON.parse(existing.submissionJson);
    } catch {
      // ignore corrupt JSON
    }
  }

  const isSubmitted = existing?.status === "SUBMITTED" || !!existing?.submissionJson;
  const isProvisioned = !!existing?.appliedBrandId;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <a href="/apply" className="flex items-center gap-2">
            <BrandHeaderLogo
              brand={{
                slug: brand.slug,
                wordmark: brand.wordmark,
                tagline: brand.tagline,
                primaryColor: brand.primaryColor,
                secondaryColor: brand.secondaryColor,
                accentColor: brand.accentColor,
                gradient: brand.gradient,
              }}
            />
          </a>
          <span className="text-xs text-black/60">Brand application form</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <ApplyFormClient
          leadName={me.name || ""}
          leadEmail={me.email}
          brandPrimaryColor={brand.primaryColor}
          brandSecondaryColor={brand.secondaryColor}
          brandAccentColor={brand.accentColor}
          brandGradient={brand.gradient}
          existingSubmission={existingSubmission}
          existingStatus={
            isProvisioned ? "PROVISIONED" : isSubmitted ? "SUBMITTED" : null
          }
          existingSubmittedAt={existing?.submittedAt?.toISOString() ?? null}
        />
      </main>
    </div>
  );
}
