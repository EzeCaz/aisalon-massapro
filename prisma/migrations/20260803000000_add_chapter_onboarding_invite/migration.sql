-- Add ChapterOnboardingInvite table.
-- Backs the "Send chapter onboarding form" button on the admin EditMemberDialog
-- and the public form at /chapter-onboarding/[token].
-- See src/lib/chapter-onboarding-types.ts for the submission JSON schema.

CREATE TABLE "ChapterOnboardingInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT,
    "prefillChapterName" TEXT,
    "prefillChapterSlug" TEXT,
    "inviteeEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submissionJson" TEXT,
    "adminNotes" TEXT,
    "appliedChapterId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterOnboardingInvite_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on token
CREATE UNIQUE INDEX "ChapterOnboardingInvite_token_key" ON "ChapterOnboardingInvite"("token");

-- Create indexes for common lookups
CREATE INDEX "ChapterOnboardingInvite_userId_idx" ON "ChapterOnboardingInvite"("userId");
CREATE INDEX "ChapterOnboardingInvite_status_idx" ON "ChapterOnboardingInvite"("status");
CREATE INDEX "ChapterOnboardingInvite_invitedById_idx" ON "ChapterOnboardingInvite"("invitedById");

-- Add foreign key constraints
ALTER TABLE "ChapterOnboardingInvite"
    ADD CONSTRAINT "ChapterOnboardingInvite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChapterOnboardingInvite"
    ADD CONSTRAINT "ChapterOnboardingInvite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
