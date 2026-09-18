-- ============================================================================
-- Phase 3 (multi-community) + brand separation — 2026-09-19
--
-- 1. ChapterMember  — multi-community membership rows (join form JSON,
--                     status, source). Primary membership stays implicit
--                     via User.chapterId; rows here are additional
--                     communities joined via the event-page gate or the
--                     /communities directory.
-- 2. KnowledgeDoc   — DB-backed, per-brand knowledge base docs (previously
--                     a hard-coded RESOURCES array in the admin page).
-- 3. EmailTemplate2.brandSlug — per-brand email template separation
--                     (NULL = legacy template, visible under both tabs).
--
-- Every statement is idempotent (IF NOT EXISTS / guarded) so re-running
-- is always safe. No data backfill is required:
--   - ChapterMember: User.chapterId counts as an implicit ACTIVE
--     membership (enforced in code), so existing users are never locked
--     out of their own community's events.
--   - KnowledgeDoc: the legacy AIS resource list is auto-seeded lazily by
--     the app on first read (src/lib/knowledge-docs.ts).
--   - EmailTemplate2.brandSlug: NULL rows remain visible under both brand
--     tabs (marked "legacy").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ChapterMember
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ChapterMember" (
    "id"         TEXT              NOT NULL,
    "chapterId"  TEXT              NOT NULL,
    "userId"     TEXT              NOT NULL,
    "status"     TEXT              NOT NULL DEFAULT 'ACTIVE',
    "source"     TEXT              NOT NULL DEFAULT 'DIRECTORY',
    "formJson"   JSONB,
    "joinedAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt"  TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "ChapterMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChapterMember_chapterId_userId_key" ON "ChapterMember"("chapterId", "userId");
CREATE INDEX IF NOT EXISTS "ChapterMember_userId_idx" ON "ChapterMember"("userId");
CREATE INDEX IF NOT EXISTS "ChapterMember_chapterId_status_idx" ON "ChapterMember"("chapterId", "status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChapterMember_chapterId_fkey') THEN
    ALTER TABLE "ChapterMember"
      ADD CONSTRAINT "ChapterMember_chapterId_fkey"
      FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChapterMember_userId_fkey') THEN
    ALTER TABLE "ChapterMember"
      ADD CONSTRAINT "ChapterMember_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. KnowledgeDoc
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "KnowledgeDoc" (
    "id"           TEXT              NOT NULL,
    "brandSlug"    TEXT              NOT NULL,
    "section"      TEXT              NOT NULL,
    "sectionIntro" TEXT,
    "sectionOrder" INTEGER           NOT NULL DEFAULT 0,
    "title"        TEXT              NOT NULL,
    "description"  TEXT,
    "url"          TEXT              NOT NULL,
    "kind"         TEXT              NOT NULL DEFAULT 'doc',
    "sortOrder"    INTEGER           NOT NULL DEFAULT 0,
    "isActive"     BOOLEAN           NOT NULL DEFAULT true,
    "updatedBy"    TEXT,
    "createdAt"    TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "KnowledgeDoc_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KnowledgeDoc_brandSlug_isActive_sectionOrder_sortOrder_idx"
  ON "KnowledgeDoc"("brandSlug", "isActive", "sectionOrder", "sortOrder");

-- ----------------------------------------------------------------------------
-- 3. EmailTemplate2.brandSlug (per-brand email template separation)
-- ----------------------------------------------------------------------------
ALTER TABLE "EmailTemplate2" ADD COLUMN IF NOT EXISTS "brandSlug" TEXT;
