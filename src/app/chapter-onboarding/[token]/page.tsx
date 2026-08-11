/**
 * /chapter-onboarding/[token] — PUBLIC chapter lead onboarding form.
 *
 * No auth required — the token in the URL authenticates the requester.
 * The form is sent to a chapter lead by an admin via the "Send chapter
 * onboarding form" button on the EditMemberDialog.
 *
 * Server component:
 *   1. Validates the token.
 *   2. If valid + PENDING → renders the form (client component).
 *   3. If SUBMITTED → renders a "thank you, you've already submitted" view.
 *   4. If EXPIRED / REVOKED → renders an error view with instructions.
 *
 * BRAND-AWARE:
 *   The invitee's brandSlug (set by Super Admin via V7 hierarchy assignment)
 *   determines which brand renders on this page:
 *     - brandSlug="coma"  → Coma branding (navy/amber, Coma logo, Coma copy)
 *     - brandSlug=null    → AIS (platform default)
 *   The brand is passed to the form as a prop, included in the submission
 *   JSON, and used by /admin/chapter-onboarding to render the right brand
 *   when reviewing the submission.
 */

import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { ChapterOnboardingForm } from "./chapter-onboarding-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { getBrandConfig, type BrandConfig } from "@/lib/brand/brand-config";

export const dynamic = "force-dynamic";

export default async function ChapterOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const invite = await db.chapterOnboardingInvite.findUnique({
    where: { token },
    select: {
      token: true,
      status: true,
      inviteeEmail: true,
      prefillChapterName: true,
      prefillChapterSlug: true,
      expiresAt: true,
      submittedAt: true,
      openedAt: true,
      submissionJson: true,
      userId: true,
    },
  });

  if (!invite) notFound();

  // Look up the invitee's name + brandSlug.
  // brandSlug drives the brand rendering on this page (Coma vs AIS).
  // If the column is missing or the user has no brandSlug, falls back to AIS.
  let inviteeName: string | null = null;
  let brandSlug: string | null = null;
  try {
    const user = await db.user.findUnique({
      where: { id: invite.userId },
      select: { name: true, brandSlug: true },
    });
    inviteeName = user?.name ?? null;
    brandSlug = user?.brandSlug ?? null;
  } catch {
    // ignore — defaults to AIS brand
  }

  // Resolve the BrandConfig for this invitee.
  const brand: BrandConfig = getBrandConfig(brandSlug ?? "aisalon");

  // Compute effective status.
  let effectiveStatus = invite.status;
  if (invite.status === "PENDING" && new Date(invite.expiresAt) < new Date()) {
    effectiveStatus = "EXPIRED";
  }

  // Mark opened on first view.
  if (invite.status === "PENDING" && !invite.openedAt) {
    try {
      await db.chapterOnboardingInvite.update({
        where: { token },
        data: { openedAt: new Date() },
      });
    } catch {
      // non-critical
    }
  }

  const submission = invite.submissionJson ? JSON.parse(invite.submissionJson) : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header — brand-aware. Renders the brand's logo/wordmark + colors
          instead of hardcoded "AI Salon" + pink/cyan gradient. */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="w-8 h-8 rounded-lg"
              style={{ background: brand.gradient }}
            />
            <div>
              <div className="text-sm font-bold text-slate-900 leading-none">
                {brand.displayName}
              </div>
              <div className="text-[0.65rem] uppercase tracking-wider text-slate-500 mt-0.5">
                Chapter Onboarding
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            For: <span className="font-medium text-slate-700">{inviteeName || invite.inviteeEmail}</span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {effectiveStatus === "SUBMITTED" && submission ? (
          <AlreadySubmittedView
            inviteeName={inviteeName}
            inviteeEmail={invite.inviteeEmail}
            submittedAt={invite.submittedAt}
            chapterName={submission.chapterName}
            brand={brand}
          />
        ) : effectiveStatus === "EXPIRED" ? (
          <ExpiredView expiresAt={invite.expiresAt} brand={brand} />
        ) : effectiveStatus === "REVOKED" ? (
          <RevokedView brand={brand} />
        ) : (
          <ChapterOnboardingForm
            token={invite.token}
            inviteeName={inviteeName}
            inviteeEmail={invite.inviteeEmail}
            prefillChapterName={invite.prefillChapterName}
            prefillChapterSlug={invite.prefillChapterSlug}
            expiresAt={invite.expiresAt}
            brand={brand}
          />
        )}
      </div>

      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-slate-500">
          {brand.displayName} · {brand.tagline} ·{" "}
          <a
            href={brand.slug === "coma" ? "https://coma.massapro.com" : "https://aisalon.massapro.com"}
            className="text-slate-700 hover:underline"
          >
            {brand.slug === "coma" ? "coma.massapro.com" : "aisalon.massapro.com"}
          </a>
        </div>
      </footer>
    </main>
  );
}

function AlreadySubmittedView({
  inviteeName,
  inviteeEmail,
  submittedAt,
  chapterName,
  brand,
}: {
  inviteeName: string | null;
  inviteeEmail: string;
  submittedAt: Date | null;
  chapterName: string;
  brand: BrandConfig;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </div>
          <div>
            <CardTitle className="text-xl text-slate-900">
              You&apos;re all set, {inviteeName?.split(" ")[0] || "there"}!
            </CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              We received your onboarding form for{" "}
              <span className="font-semibold text-slate-700">{chapterName}</span>.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span>
              Submitted{" "}
              {submittedAt
                ? new Date(submittedAt).toLocaleString("en-US", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })
                : "earlier"}
            </span>
          </div>
          <div className="text-slate-600">
            The global {brand.displayName} team will review your submission within 2 business days.
            We&apos;ll reach out to <span className="font-medium">{inviteeEmail}</span> with
            next steps and your admin access.
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Need to make changes? Just reply to the original onboarding email, or
          reach us at{" "}
          <a
            href={brand.slug === "coma" ? "mailto:team@coma.massapro.com" : "mailto:aisalon@massapro.com"}
            className="text-slate-700 underline"
          >
            {brand.slug === "coma" ? "team@coma.massapro.com" : "aisalon@massapro.com"}
          </a>.
        </p>
      </CardContent>
    </Card>
  );
}

function ExpiredView({ expiresAt, brand }: { expiresAt: Date; brand: BrandConfig }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-xl text-slate-900">
              This onboarding link has expired
            </CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              The link expired on{" "}
              {new Date(expiresAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              .
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-700">
          Please ask your {brand.displayName} global team contact to send you a fresh
          onboarding link. They can do this from the admin dashboard by
          opening your member profile and clicking &quot;Send chapter form&quot;.
        </p>
      </CardContent>
    </Card>
  );
}

function RevokedView({ brand }: { brand: BrandConfig }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-600" />
          </div>
          <div>
            <CardTitle className="text-xl text-slate-900">
              This onboarding link has been revoked
            </CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              An admin revoked this invite. Please contact the {brand.displayName} team
              if you believe this is in error.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-700">
          Email us at{" "}
          <a
            href={brand.slug === "coma" ? "mailto:team@coma.massapro.com" : "mailto:aisalon@massapro.com"}
            className="text-slate-900 underline"
          >
            {brand.slug === "coma" ? "team@coma.massapro.com" : "aisalon@massapro.com"}
          </a>{" "}
          and we&apos;ll help you get a new link.
        </p>
      </CardContent>
    </Card>
  );
}
