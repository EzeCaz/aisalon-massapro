-- Issue 3 (2026-09-30): add isPubliclyListed column to Chapter.
-- Default true (preserves existing behavior — all current chapters
-- stay publicly listed until an admin toggles them off).
ALTER TABLE "Chapter" ADD COLUMN "isPubliclyListed" BOOLEAN NOT NULL DEFAULT true;
