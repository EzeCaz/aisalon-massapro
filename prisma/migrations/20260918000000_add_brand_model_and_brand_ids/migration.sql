-- ============================================================================
-- Phase 3A — Brand model + brandId on Chapter/User
-- Date: 2026-09-18
--
-- Adds the Brand table (the parent-platform / white-label brand entity)
-- and brandId FK columns on Chapter + User. Also seeds the 2 initial
-- brands (Coma parent + AIS child) and backfills existing rows.
--
-- ARCHITECTURE (per user decisions 2026-09-17/18):
--   - Coma is the PARENT PLATFORM (parentBrandId = NULL).
--   - AIS is a child brand of Coma (parentBrandId = Coma.id), permanently
--     grandfathered on aisalon.massapro.com.
--   - All future brands (Danone, HiTech AI, etc.) are children of Coma,
--     living on platform.joincoma.com with ?brand=<slug> URL identity.
--
-- DATA BACKFILL (per user decisions):
--   - Chapters: all existing chapters → brandId = AIS (decision #1 —
--     preserves AIS user experience; Coma chapters are created fresh).
--   - Users: brandSlug='coma' → Coma; brandSlug='aisalon' OR NULL → AIS
--     (decision #2 — legacy users keep their AIS experience).
--
-- EVERY statement is idempotent (IF NOT EXISTS / IF EXISTS / ON CONFLICT
-- DO NOTHING / guarded UPDATEs) so re-running is always safe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Brand table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Brand" (
    "id"                  TEXT              NOT NULL,
    "slug"                TEXT              NOT NULL,
    "displayName"         TEXT              NOT NULL,
    "wordmark"            TEXT              NOT NULL,
    "tagline"             TEXT              NOT NULL,
    "primaryColor"        TEXT              NOT NULL,
    "accentColor"         TEXT              NOT NULL,
    "secondaryColor"      TEXT              NOT NULL,
    "gradient"            TEXT              NOT NULL,
    "heroBannerUrl"       TEXT,
    "faviconUrl"          TEXT,
    "logoUrl"             TEXT,
    "emailLogoUrl"        TEXT,
    "loginEyebrowTemplate"         TEXT     NOT NULL,
    "loginHeadlineTemplate"        TEXT     NOT NULL,
    "loginSubtitle"                TEXT     NOT NULL,
    "loginFormHeading"             TEXT     NOT NULL,
    "loginFormSubheadingTemplate"  TEXT     NOT NULL,
    "footerCredit"                 TEXT     NOT NULL,
    "emailFromName"       TEXT              NOT NULL,
    "emailContactEmail"   TEXT              NOT NULL,
    "domainArchitecture"  TEXT              NOT NULL DEFAULT 'single',
    "apexDomain"          TEXT,
    "appDomain"           TEXT,
    "legacyDomains"       TEXT[]            NOT NULL DEFAULT '{}',
    "status"              TEXT              NOT NULL DEFAULT 'DRAFT',
    "onboardedAt"         TIMESTAMP(3),
    "parentBrandId"       TEXT,
    "createdAt"           TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- Unique slug (global brand uniqueness — user decision #3).
CREATE UNIQUE INDEX IF NOT EXISTS "Brand_slug_key" ON "Brand"("slug");

-- Hierarchy + status indexes.
CREATE INDEX IF NOT EXISTS "Brand_parentBrandId_idx" ON "Brand"("parentBrandId");
CREATE INDEX IF NOT EXISTS "Brand_status_idx" ON "Brand"("status");

-- Self-relation FK (parent brand). Prisma names it Brand_parentBrandId_fkey.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Brand_parentBrandId_fkey') THEN
    ALTER TABLE "Brand"
      ADD CONSTRAINT "Brand_parentBrandId_fkey"
      FOREIGN KEY ("parentBrandId") REFERENCES "Brand"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Seed the 2 initial brands (Coma parent + AIS child)
-- ----------------------------------------------------------------------------
-- Fixed IDs for determinism ('brand-coma' / 'brand-aisalon'). The
-- scripts/seed-brands.ts upsert finds rows by slug, so these IDs are
-- stable across re-runs of either the migration or the seed script.

INSERT INTO "Brand" (
  "id", "slug", "displayName", "wordmark", "tagline",
  "primaryColor", "accentColor", "secondaryColor", "gradient",
  "heroBannerUrl", "faviconUrl", "logoUrl", "emailLogoUrl",
  "loginEyebrowTemplate", "loginHeadlineTemplate", "loginSubtitle",
  "loginFormHeading", "loginFormSubheadingTemplate", "footerCredit",
  "emailFromName", "emailContactEmail",
  "domainArchitecture", "apexDomain", "appDomain", "legacyDomains",
  "status", "onboardedAt", "parentBrandId", "createdAt", "updatedAt"
) VALUES (
  'brand-coma', 'coma', 'Coma', 'coma',
  'Building the Operating System for Communities',
  '#0A1F44', '#F5A623', '#E84855',
  'conic-gradient(from 180deg at 50% 50%, #E84855, #0A1F44, #F5A623, #E84855)',
  'https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1786481988015-r315qt.png',
  '/brand/coma/favicon-32.png', '/brand/coma/logo.png', NULL,
  '{chapterName} Chapter',
  'The home for {accentSpanOpen}community builders{accentSpanClose} in {chapterName}.',
  'Log in to access the Coma platform — manage your chapter, host events, onboard new members, and orchestrate your community''s growth with the Coma operating system.',
  'Welcome to Coma',
  'Sign in with Google, or use your email and password to access the Coma {chapterName} platform.',
  'Platform by MassaPro · Powered by Coma',
  'Coma <coma@massapro.com>', 'coma@massapro.com',
  'single', 'platform.joincoma.com', 'platform.joincoma.com',
  ARRAY['coma.massapro.com']::TEXT[],
  'ACTIVE', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "Brand" (
  "id", "slug", "displayName", "wordmark", "tagline",
  "primaryColor", "accentColor", "secondaryColor", "gradient",
  "heroBannerUrl", "faviconUrl", "logoUrl", "emailLogoUrl",
  "loginEyebrowTemplate", "loginHeadlineTemplate", "loginSubtitle",
  "loginFormHeading", "loginFormSubheadingTemplate", "footerCredit",
  "emailFromName", "emailContactEmail",
  "domainArchitecture", "apexDomain", "appDomain", "legacyDomains",
  "status", "onboardedAt", "parentBrandId", "createdAt", "updatedAt"
) VALUES (
  'brand-aisalon', 'aisalon', 'AI Salon', 'aisalon',
  'Empowering AI Connections',
  '#004F98', '#00E6FF', '#FF005A',
  'conic-gradient(from 180deg at 50% 50%, #FF005A, #820A7D, #004F98, #00E6FF, #FF005A)',
  NULL, NULL, NULL, NULL,
  '{chapterName} Chapter',
  'The community for {accentSpanOpen}AI builders{accentSpanClose} in {chapterName}.',
  'Log in to access events, upload photos from our gatherings, browse the shared slideshow, and connect with fellow founders, CMOs, investors and AI builders.',
  'Welcome',
  'Sign in with Google, or use your email and password to access the AI Salon {chapterName} community.',
  'Platform by MassaPro · Powered by AI Salon',
  'AI Salon <noreply@aisalon.massapro.com>', 'aisalon@massapro.com',
  'single', 'aisalon.massapro.com', 'aisalon.massapro.com',
  ARRAY[]::TEXT[],
  'ACTIVE', CURRENT_TIMESTAMP,
  (SELECT "id" FROM "Brand" WHERE "slug" = 'coma'),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("slug") DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. brandId on Chapter + constraint changes
-- ----------------------------------------------------------------------------

-- New nullable brandId column (FK added below, after data backfill).
ALTER TABLE "Chapter" ADD COLUMN IF NOT EXISTS "brandId" TEXT;

-- Phase 3A: DROP the global unique on Chapter.slug so the same chapter
-- slug can exist under different brands (e.g. 'tel-aviv' under both AIS
-- + Coma). Index name from the V7-add-hierarchy migration.
DROP INDEX IF EXISTS "Chapter_slug_key";

-- Phase 3A: DROP the (countryId, slug) unique constraint — too restrictive
-- (would prevent 'tel-aviv' under two brands in the same country).
DROP INDEX IF EXISTS "Chapter_countryId_slug_key";

-- New composite unique: per brand+country+slug.
CREATE UNIQUE INDEX IF NOT EXISTS "Chapter_brandId_countryId_slug_key"
  ON "Chapter"("brandId", "countryId", "slug");

-- Brand index for admin UI filtering.
CREATE INDEX IF NOT EXISTS "Chapter_brandId_idx" ON "Chapter"("brandId");

-- FK to Brand (RESTRICT — can't delete a brand that has chapters).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Chapter_brandId_fkey') THEN
    ALTER TABLE "Chapter"
      ADD CONSTRAINT "Chapter_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. brandId on User
-- ----------------------------------------------------------------------------

-- New nullable brandId column (FK added below).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brandId" TEXT;

-- Brand indexes for admin UI filtering.
CREATE INDEX IF NOT EXISTS "User_brandId_idx" ON "User"("brandId");
CREATE INDEX IF NOT EXISTS "User_role_brandId_idx" ON "User"("role", "brandId");

-- FK to Brand (SET NULL — deleting a brand orphans its users rather
-- than deleting them; matches the Chapter/Country FK pattern on User).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_brandId_fkey') THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Data backfill (runs AFTER the FKs exist so referential integrity holds)
-- ----------------------------------------------------------------------------
-- Per user decision #1: all existing chapters → AIS. Coma chapters will
-- be created fresh via the Phase 3C onboarding flow.
UPDATE "Chapter"
SET "brandId" = (SELECT "id" FROM "Brand" WHERE "slug" = 'aisalon')
WHERE "brandId" IS NULL;

-- Per user decision #2: legacy users (brandSlug NULL or 'aisalon') → AIS;
-- explicit Coma users (brandSlug = 'coma') → Coma.
UPDATE "User"
SET "brandId" = (SELECT "id" FROM "Brand" WHERE "slug" = 'aisalon')
WHERE "brandId" IS NULL
  AND ("brandSlug" = 'aisalon' OR "brandSlug" IS NULL);

UPDATE "User"
SET "brandId" = (SELECT "id" FROM "Brand" WHERE "slug" = 'coma')
WHERE "brandId" IS NULL
  AND "brandSlug" = 'coma';

-- ----------------------------------------------------------------------------
-- 6. Sync the denormalized brandSlug cache for rows that had none
-- ----------------------------------------------------------------------------
-- brandSlug is kept as a denormalized cache of Brand.slug during the
-- migration period (dropped in Phase 3E). Legacy rows with NULL brandSlug
-- now get the correct slug from their newly-assigned brand.
UPDATE "User"
SET "brandSlug" = (SELECT "slug" FROM "Brand" WHERE "Brand"."id" = "User"."brandId")
WHERE "brandSlug" IS NULL AND "brandId" IS NOT NULL;
