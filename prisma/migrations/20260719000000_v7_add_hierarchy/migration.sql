-- ============================================================================
-- V7 — Global → Country → Chapter hierarchy
-- ============================================================================
-- This migration is ADDITIVE: it creates new tables and adds new nullable
-- columns. It does NOT drop or modify any existing V6 column. This means
-- V6 code will continue to work against the migrated DB (rollback safe).
--
-- Companion files:
--   core/v7/plan.md                          — full architectural plan
--   scripts/v7-seed-israel-tel-aviv.ts       — seed Israel + Tel Aviv, backfill
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Country
-- ----------------------------------------------------------------------------
CREATE TABLE "Country" (
    "id"                  TEXT              NOT NULL,
    "name"                TEXT              NOT NULL,
    "code"                TEXT              NOT NULL,
    "slug"                TEXT              NOT NULL,
    "flagEmoji"           TEXT,
    "defaultEmailDomain"  TEXT,
    "defaultFromName"     TEXT,
    "defaultReplyTo"      TEXT,
    "isActive"            BOOLEAN           NOT NULL DEFAULT true,
    "createdAt"           TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");
CREATE UNIQUE INDEX "Country_slug_key" ON "Country"("slug");

-- ----------------------------------------------------------------------------
-- 2. Chapter
-- ----------------------------------------------------------------------------
CREATE TABLE "Chapter" (
    "id"                 TEXT              NOT NULL,
    "name"               TEXT              NOT NULL,
    "slug"               TEXT              NOT NULL,
    "countryId"          TEXT              NOT NULL,
    "city"               TEXT,
    "timezone"           TEXT              NOT NULL DEFAULT 'Asia/Jerusalem',
    "whatsappGroupUrl"   TEXT,
    "linkedinUrl"        TEXT,
    "isActive"           BOOLEAN           NOT NULL DEFAULT true,
    "createdAt"          TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Chapter_slug_key" ON "Chapter"("slug");
CREATE UNIQUE INDEX "Chapter_countryId_slug_key" ON "Chapter"("countryId", "slug");
CREATE INDEX "Chapter_countryId_idx" ON "Chapter"("countryId");

ALTER TABLE "Chapter"
  ADD CONSTRAINT "Chapter_countryId_fkey"
  FOREIGN KEY ("countryId") REFERENCES "Country"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 3. ChapterSetting (per-chapter branding overrides)
-- ----------------------------------------------------------------------------
CREATE TABLE "ChapterSetting" (
    "id"         TEXT              NOT NULL,
    "chapterId"  TEXT              NOT NULL,
    "key"        TEXT              NOT NULL,
    "value"      TEXT              NOT NULL,
    "updatedBy"  TEXT,
    "updatedAt"  TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "ChapterSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChapterSetting_chapterId_key_key" ON "ChapterSetting"("chapterId", "key");
CREATE INDEX "ChapterSetting_chapterId_idx" ON "ChapterSetting"("chapterId");

ALTER TABLE "ChapterSetting"
  ADD CONSTRAINT "ChapterSetting_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 4. ChapterEmailTemplateOverride (per-chapter email template overrides)
-- ----------------------------------------------------------------------------
CREATE TABLE "ChapterEmailTemplateOverride" (
    "id"              TEXT              NOT NULL,
    "chapterId"       TEXT              NOT NULL,
    "stageTemplateId" TEXT              NOT NULL,
    "logoUrl"         TEXT,
    "subject"         TEXT,
    "htmlBody"        TEXT,
    "isActive"        BOOLEAN           NOT NULL DEFAULT true,
    "updatedAt"       TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "ChapterEmailTemplateOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChapterEmailTemplateOverride_chapterId_stageTemplateId_key"
  ON "ChapterEmailTemplateOverride"("chapterId", "stageTemplateId");
CREATE INDEX "ChapterEmailTemplateOverride_chapterId_idx"
  ON "ChapterEmailTemplateOverride"("chapterId");

-- NOTE: the FK to EmailStageTemplate is added in step 7 (after we confirm
-- the EmailStageTemplate table name in the current DB).

-- ----------------------------------------------------------------------------
-- 5. Add scoping columns to User
-- ----------------------------------------------------------------------------
ALTER TABLE "User"
  ADD COLUMN "countryId"  TEXT,
  ADD COLUMN "chapterId"  TEXT;

CREATE INDEX "User_countryId_idx" ON "User"("countryId");
CREATE INDEX "User_chapterId_idx" ON "User"("chapterId");
CREATE INDEX "User_role_countryId_idx" ON "User"("role", "countryId");
CREATE INDEX "User_role_chapterId_idx" ON "User"("role", "chapterId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_countryId_fkey"
  FOREIGN KEY ("countryId") REFERENCES "Country"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User"
  ADD CONSTRAINT "User_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 6. Add chapterId FK to Event + isCrossChapter flag
-- ----------------------------------------------------------------------------
-- (Event already has a free-form `chapter String @default("Tel Aviv")` column;
--  we add a real FK column alongside it. The String column stays as a
--  denormalized cache of Chapter.name for backwards compat.)
--
-- isCrossChapter (Q3): when true (Super Admin only can set), the event
-- appears in the listings of ALL chapters in its country. The event is
-- still owned by `chapterId` for admin scope checks.
ALTER TABLE "Event"
  ADD COLUMN "chapterId"      TEXT,
  ADD COLUMN "isCrossChapter" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Event_chapterId_idx" ON "Event"("chapterId");
CREATE INDEX "Event_isCrossChapter_idx" ON "Event"("isCrossChapter");

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 7. Add ChapterEmailTemplateOverride FK to EmailStageTemplate
-- ----------------------------------------------------------------------------
ALTER TABLE "ChapterEmailTemplateOverride"
  ADD CONSTRAINT "ChapterEmailTemplateOverride_stageTemplateId_fkey"
  FOREIGN KEY ("stageTemplateId") REFERENCES "EmailStageTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 8. Add chapterId to remaining entities (denormalized V7 scope column)
-- ----------------------------------------------------------------------------
-- Each table gets a nullable chapterId column + FK to Chapter + index.
-- Nullable so existing V6 rows survive the migration (backfilled by
-- scripts/v7-seed-israel-tel-aviv.ts afterwards).

-- Speaker
ALTER TABLE "Speaker" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "Speaker_chapterId_idx" ON "Speaker"("chapterId");
ALTER TABLE "Speaker"
  ADD CONSTRAINT "Speaker_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EventRsvp
ALTER TABLE "EventRsvp" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "EventRsvp_chapterId_idx" ON "EventRsvp"("chapterId");
ALTER TABLE "EventRsvp"
  ADD CONSTRAINT "EventRsvp_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailQueue
ALTER TABLE "EmailQueue" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "EmailQueue_chapterId_idx" ON "EmailQueue"("chapterId");
ALTER TABLE "EmailQueue"
  ADD CONSTRAINT "EmailQueue_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailRecipient
ALTER TABLE "EmailRecipient" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "EmailRecipient_chapterId_idx" ON "EmailRecipient"("chapterId");
ALTER TABLE "EmailRecipient"
  ADD CONSTRAINT "EmailRecipient_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailCampaign
ALTER TABLE "EmailCampaign" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "EmailCampaign_chapterId_idx" ON "EmailCampaign"("chapterId");
ALTER TABLE "EmailCampaign"
  ADD CONSTRAINT "EmailCampaign_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailTemplate
ALTER TABLE "EmailTemplate" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "EmailTemplate_chapterId_idx" ON "EmailTemplate"("chapterId");
ALTER TABLE "EmailTemplate"
  ADD CONSTRAINT "EmailTemplate_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailStageTemplate
ALTER TABLE "EmailStageTemplate" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "EmailStageTemplate_chapterId_idx" ON "EmailStageTemplate"("chapterId");
ALTER TABLE "EmailStageTemplate"
  ADD CONSTRAINT "EmailStageTemplate_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailFlow
ALTER TABLE "EmailFlow" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "EmailFlow_chapterId_idx" ON "EmailFlow"("chapterId");
ALTER TABLE "EmailFlow"
  ADD CONSTRAINT "EmailFlow_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailAudience
ALTER TABLE "EmailAudience" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "EmailAudience_chapterId_idx" ON "EmailAudience"("chapterId");
ALTER TABLE "EmailAudience"
  ADD CONSTRAINT "EmailAudience_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ReferralVisit
ALTER TABLE "ReferralVisit" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "ReferralVisit_chapterId_idx" ON "ReferralVisit"("chapterId");
ALTER TABLE "ReferralVisit"
  ADD CONSTRAINT "ReferralVisit_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ReferralAttribution
ALTER TABLE "ReferralAttribution" ADD COLUMN "chapterId" TEXT;
CREATE INDEX "ReferralAttribution_chapterId_idx" ON "ReferralAttribution"("chapterId");
ALTER TABLE "ReferralAttribution"
  ADD CONSTRAINT "ReferralAttribution_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- After running this migration, run:
--   tsx scripts/v7-seed-israel-tel-aviv.ts
--
-- That script will:
--   1. Create Country: Israel (code=IL)
--   2. Create Chapter: Tel Aviv (countryId=IL, timezone=Asia/Jerusalem)
--   3. Backfill ALL existing rows (User, Event, Speaker, EventRsvp,
--      EmailQueue, EmailRecipient, EmailCampaign, EmailTemplate,
--      EmailStageTemplate, EmailFlow, EmailAudience, ReferralVisit,
--      ReferralAttribution) with countryId=Israel and chapterId=Tel Aviv
--   4. Migrate role="CO_HOST" → role="CHAPTER_ORGANIZER"
--   5. Migrate role="SPEAKER" → role="MEMBER"
--   6. Print summary counts for verification
-- ============================================================================
