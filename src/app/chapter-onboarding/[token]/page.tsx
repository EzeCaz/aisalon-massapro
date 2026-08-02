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
 */

import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { ChapterOnboardingForm } from "./chapter-onboarding-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

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

  // Look up the invitee's name.
  let inviteeName: string | null = null;
  try {
    const user = await db.user.findUnique({
      where: { id: invite.userId },
      select: { name: true },
    });
    inviteeName = user?.name ?? null;
  } catch {
    // ignore
  }

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
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="w-8 h-8 rounded-lg"
              style={{
                background:
                  "conic-gradient(from 180deg at 50% 50%, #FF005A, #820A7D, #004F98, #00E6FF, #FF005A)",
              }}
            />
            <div>
              <div className="text-sm font-bold text-slate-900 leading-none">
                AI Salon
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
          />
        ) : effectiveStatus === "EXPIRED" ? (
          <ExpiredView expiresAt={invite.expiresAt} />
        ) : effectiveStatus === "REVOKED" ? (
          <RevokedView />
        ) : (
          <ChapterOnboardingForm
            token={invite.token}
            inviteeName={inviteeName}
            inviteeEmail={invite.inviteeEmail}
            prefillChapterName={invite.prefillChapterName}
            prefillChapterSlug={invite.prefillChapterSlug}
            expiresAt={invite.expiresAt}
          />
        )}
      </div>

      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-slate-500">
          AI Salon · Empowering AI Connections ·{" "}
          <a
            href="https://aisalon.massapro.com"
            className="text-slate-700 hover:underline"
          >
            aisalon.massapro.com
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
}: {
  inviteeName: string | null;
  inviteeEmail: string;
  submittedAt: Date | null;
  chapterName: string;
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
            The global AI Salon team will review your submission within 2 business days.
            We&apos;ll reach out to <span className="font-medium">{inviteeEmail}</span> with
            next steps and your admin access.
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Need to make changes? Just reply to the original onboarding email, or
          reach us at <a href="mailto:aisalon@massapro.com" className="text-slate-700 underline">aisalon@massapro.com</a>.
        </p>
      </CardContent>
    </Card>
  );
}

function ExpiredView({ expiresAt }: { expiresAt: Date }) {
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
          Please ask your AI Salon global team contact to send you a fresh
          onboarding link. They can do this from the admin dashboard by
          opening your member profile and clicking &quot;Send chapter form&quot;.
        </p>
      </CardContent>
    </Card>
  );
}

function RevokedView() {
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
              An admin revoked this invite. Please contact the AI Salon team
              if you believe this is in error.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-700">
          Email us at{" "}
          <a href="mailto:aisalon@massapro.com" className="text-slate-900 underline">
            aisalon@massapro.com
          </a>{" "}
          and we&apos;ll help you get a new link.
        </p>
      </CardContent>
    </Card>
  );
}
