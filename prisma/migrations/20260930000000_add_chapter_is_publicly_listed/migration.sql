-- Issue 3 (2026-09-30): add isPubliclyListed column to Chapter.
-- Default true (preserves existing behavior — all current chapters
-- stay publicly listed until an admin toggles them off).
--
-- Idempotent: uses a DO block + information_schema check so the
-- migration can be re-applied safely if it was partially applied
-- before. Standard ALTER TABLE ADD COLUMN would throw
-- 'column "isPubliclyListed" already exists' on re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Chapter'
      AND column_name = 'isPubliclyListed'
  ) THEN
    ALTER TABLE "Chapter"
      ADD COLUMN "isPubliclyListed" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;
