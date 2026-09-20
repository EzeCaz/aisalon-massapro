-- ============================================================================
-- Phase 2 (brand onboarding) + Phase 3 (interested locations) — 2026-09-19
--
-- Creates two new tables:
--   1. "BrandOnboardingInvite" — Super Admin invites a brand lead by email →
--      the lead fills a public /brand-onboarding/[token] form (mirroring
--      /chapter-onboarding/[token]) → Super Admin reviews + provisions the
--      new Brand row with branding fields, palette, assets, email config,
--      and apex domain. Skipped fields inherit from Coma (the platform
--      parent brand), so a lead who skips the entire form still gets a
--      working brand with Coma's defaults.
--
--   2. "UserInterestedLocation" — at signup, the user picks up to 5
--      (country + optional city) locations they want to receive community
--      updates from. Used by /communities to surface communities near
--      those locations first, and by the email orchestrator to notify
--      the user about events in their interested cities.
--
-- This migration is IDEMPOTENT — uses CREATE TABLE IF NOT EXISTS so a
-- partial application is safely re-runnable. No data backfill needed.
-- ============================================================================

-- ── 1. BrandOnboardingInvite ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BrandOnboardingInvite" (
    "id"               TEXT NOT NULL,
    "token"            TEXT NOT NULL,
    "inviteeEmail"     TEXT NOT NULL,
    "prefillBrandName" TEXT,
    "prefillBrandSlug" TEXT,
    "invitedById"      TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt"         TIMESTAMP(3),
    "submittedAt"      TIMESTAMP(3),
    "expiresAt"        TIMESTAMP(3) NOT NULL,
    "submissionJson"   TEXT,
    "adminNotes"       TEXT,
    "appliedBrandId"   TEXT,
    "appliedAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandOnboardingInvite_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on token (IF NOT EXISTS via DO block — Postgres < 15
-- doesn't support IF NOT EXISTS on ALTER TABLE ADD CONSTRAINT).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BrandOnboardingInvite_token_key'
    ) THEN
        ALTER TABLE "BrandOnboardingInvite" ADD CONSTRAINT "BrandOnboardingInvite_token_key" UNIQUE ("token");
    END IF;
END $$;

-- Indexes (IF NOT EXISTS supported on CREATE INDEX since Postgres 9.5).
CREATE INDEX IF NOT EXISTS "BrandOnboardingInvite_invitedById_idx" ON "BrandOnboardingInvite" ("invitedById");
CREATE INDEX IF NOT EXISTS "BrandOnboardingInvite_status_idx" ON "BrandOnboardingInvite" ("status");

-- FK to User — cascade when the inviter is deleted (their sent invites
-- go with them). Mirrors the chapter-onboarding pattern.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BrandOnboardingInvite_invitedById_fkey'
    ) THEN
        ALTER TABLE "BrandOnboardingInvite"
          ADD CONSTRAINT "BrandOnboardingInvite_invitedById_fkey"
          FOREIGN KEY ("invitedById") REFERENCES "User" ("id")
          ON DELETE CASCADE;
    END IF;
END $$;

-- ── 2. UserInterestedLocation ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UserInterestedLocation" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "countryId" TEXT,
    "city"      TEXT NOT NULL,
    "region"    TEXT,
    "latitude"  DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInterestedLocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserInterestedLocation_userId_idx" ON "UserInterestedLocation" ("userId");
CREATE INDEX IF NOT EXISTS "UserInterestedLocation_countryId_idx" ON "UserInterestedLocation" ("countryId");

-- FK to User — cascade (deleting a user deletes their interested locations).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserInterestedLocation_userId_fkey'
    ) THEN
        ALTER TABLE "UserInterestedLocation"
          ADD CONSTRAINT "UserInterestedLocation_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User" ("id")
          ON DELETE CASCADE;
    END IF;
END $$;

-- FK to Country — set null (deleting a country leaves the user's
-- interest row but unlinks it from the now-gone country).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserInterestedLocation_countryId_fkey'
    ) THEN
        ALTER TABLE "UserInterestedLocation"
          ADD CONSTRAINT "UserInterestedLocation_countryId_fkey"
          FOREIGN KEY ("countryId") REFERENCES "Country" ("id")
          ON DELETE SET NULL;
    END IF;
END $$;
