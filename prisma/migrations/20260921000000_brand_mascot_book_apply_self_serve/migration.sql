-- ============================================================================
-- 2026-09-21: Brand mascot/book fields + self-serve /apply flow
--
-- Adds 4 nullable columns to "Brand" for mascot character + brand book
-- URL, and 2 nullable columns + 1 index to "BrandOnboardingInvite" so
-- community leads can apply without an admin invite (via /apply/form).
--
-- IDEMPOTENT — uses ADD COLUMN IF NOT EXISTS + DO $$ blocks for the FK
-- + index additions. Safe to re-run.
-- ============================================================================

-- ── 1. Brand: mascot + brand book ────────────────────────────────────────
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "mascotName"      TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "mascotImageUrl"  TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "mascotBackstory" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "brandBookUrl"    TEXT;

-- ── 2. BrandOnboardingInvite: applicantUserId + source ──────────────────
-- Allows self-serve applications via /apply/form (no Super Admin invite
-- needed). invitedById becomes nullable so SELF_SERVE rows can have NULL.
-- source is a string ("INVITE" | "SELF_SERVE") defaulting to "INVITE".
ALTER TABLE "BrandOnboardingInvite" ADD COLUMN IF NOT EXISTS "applicantUserId" TEXT;
ALTER TABLE "BrandOnboardingInvite" ADD COLUMN IF NOT EXISTS "source"         TEXT NOT NULL DEFAULT 'INVITE';

-- Make invitedById nullable (was NOT NULL before — Super Admin invite flow
-- required it). SET NULL FKs already handle the cascade. Use DO block since
-- ALTER COLUMN DROP NOT NULL doesn't support IF EXISTS syntax in older pg.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='BrandOnboardingInvite' AND column_name='invitedById' AND is_nullable='NO'
    ) THEN
        ALTER TABLE "BrandOnboardingInvite" ALTER COLUMN "invitedById" DROP NOT NULL;
    END IF;
END $$;

-- Existing FK on invitedById was ON DELETE CASCADE — change to SET NULL
-- since the column is now nullable (matches the User? relation in schema).
-- Drop + re-add only if the existing constraint is CASCADE.
-- Postgres pg_constraint.confdeltype chars: 'a' = NO ACTION, 'r' = RESTRICT,
-- 'c' = CASCADE, 'n' = SET NULL, 'd' = SET DEFAULT.
DO $$
DECLARE
    existing_action CHAR;
BEGIN
    SELECT confdeltype INTO existing_action
    FROM pg_constraint
    WHERE conname = 'BrandOnboardingInvite_invitedById_fkey';
    IF existing_action = 'c' THEN  -- 'c' = CASCADE
        ALTER TABLE "BrandOnboardingInvite" DROP CONSTRAINT IF EXISTS "BrandOnboardingInvite_invitedById_fkey";
        ALTER TABLE "BrandOnboardingInvite"
          ADD CONSTRAINT "BrandOnboardingInvite_invitedById_fkey"
          FOREIGN KEY ("invitedById") REFERENCES "User" ("id")
          ON DELETE SET NULL;
    END IF;
END $$;

-- New index on applicantUserId (self-serve applications lookup by user).
CREATE INDEX IF NOT EXISTS "BrandOnboardingInvite_applicantUserId_idx" ON "BrandOnboardingInvite" ("applicantUserId");

-- New index on source (admin list filtered by source).
CREATE INDEX IF NOT EXISTS "BrandOnboardingInvite_source_idx" ON "BrandOnboardingInvite" ("source");
