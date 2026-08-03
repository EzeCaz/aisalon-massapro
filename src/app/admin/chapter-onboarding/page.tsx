/**
 * /admin/chapter-onboarding — admin view of all chapter onboarding invites.
 *
 * Lists every invite the current admin can see (all invites for SUPER_ADMIN/ADMIN,
 * scoped-to-chapter for CHAPTER_ORGANIZER — though in practice CHAPTER_ORGANIZER
 * wouldn't be sending onboarding invites, so we just gate to ADMIN+ for simplicity).
 *
 * Click into a submission to see the full form data.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ChapterOnboardingAdminList } from "./chapter-onboarding-admin-list";
import { Globe2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChapterOnboardingAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/chapter-onboarding");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!me) redirect("/login?callbackUrl=/admin/chapter-onboarding");

  if (!can(me.role, "members.edit")) {
    redirect("/admin");
  }

  // Load all invites (newest first).
  const invites = await db.chapterOnboardingInvite.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      status: true,
      inviteeEmail: true,
      prefillChapterName: true,
      prefillChapterSlug: true,
      sentAt: true,
      openedAt: true,
      submittedAt: true,
      expiresAt: true,
      appliedChapterId: true,
      submissionJson: true,
      userId: true,
      user: { select: { name: true } },
      invitedById: true,
      invitedBy: { select: { name: true, email: true } },
    },
  });

  // Serialize dates for the client component.
  const serialized = invites.map((i) => ({
    ...i,
    sentAt: i.sentAt.toISOString(),
    openedAt: i.openedAt?.toISOString() ?? null,
    submittedAt: i.submittedAt?.toISOString() ?? null,
    expiresAt: i.expiresAt.toISOString(),
    inviteeName: i.user?.name ?? null,
    invitedByName: i.invitedBy?.name ?? i.invitedBy?.email ?? null,
  }));

  return (
    <>
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <AdminTabs role={me.role} />
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-1">
            <Globe2 className="w-5 h-5 text-[#820A7D]" />
            <h1 className="text-xl font-bold text-slate-900">Chapter Onboarding</h1>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            Track every chapter onboarding form you&apos;ve sent. Click a row to see the full submission.
          </p>
          <ChapterOnboardingAdminList invites={serialized} currentAdminEmail={me.email} />
        </div>
      </div>
    </>
  );
}
