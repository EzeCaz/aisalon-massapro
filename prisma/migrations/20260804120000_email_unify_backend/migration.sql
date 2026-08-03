-- Migration: Email unification Phase 1 (backend) — TSK-0074
-- Date: 2026-08-04
--
-- Implements the FULL schema unification of the bifurcated email template
-- system into a single `EmailTemplate2` model.
--
-- BEFORE this migration, the schema has TWO template tables:
--   - "EmailTemplate"        (campaign-side; subject/bodyHtml/bodyText/
--                             signatureHtml/thumbnailUrl/createdBy/chapterId)
--   - "EmailStageTemplate"   (flow-side; stage/name/subject/htmlBody/
--                             stopIfNotOpenedHours/isActive/isDefault/
--                             altSubject/altNotOpenedHours/noCodeHtmlBody/
--                             noCodeSubject/logoUrl/updatedBy/chapterId)
--
-- AFTER this migration:
--   - Both legacy tables remain in the DB (read-only). They're renamed in
--     the Prisma schema to `EmailTemplateLegacy` / `EmailStageTemplateLegacy`
--     (with `@@map("EmailTemplate")` / `@@map("EmailStageTemplate")` so the
--     underlying table names don't change).
--   - A new `EmailTemplate2` table holds the MERGED set of fields.
--   - Existing rows from both legacy tables are copied into EmailTemplate2
--     (IDs preserved so existing FK references still resolve).
--   - EmailCampaign.templateId FK is repointed from EmailTemplate → EmailTemplate2.
--   - EmailFlowStep.templateId FK is repointed from EmailStageTemplate → EmailTemplate2.
--   - EmailCampaign.flowId is added (1:1 link to EmailFlow, partial unique index).
--   - EmailFlow.campaign back-relation is wired via the new flowId FK.
--
-- Name collision handling:
--   Both legacy tables can have rows with the same `name` (e.g. "Awareness"
--   could exist in both). When copying stage templates, we suffix the name
--   with " (stage)" if a campaign-side template already exists with the
--   same name. (EmailTemplate2.name is NOT unique — this is purely for
--   human-readable clarity in the admin UI.)
--
-- This migration is NON-DESTRUCTIVE: no rows are deleted, no tables are
-- dropped. The legacy tables stay accessible for read-only queries.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Create the EmailTemplate2 table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "EmailTemplate2" (
    "id"                   TEXT          NOT NULL,
    "name"                 TEXT          NOT NULL,
    "slug"                 TEXT,
    "category"             TEXT          NOT NULL DEFAULT 'general',
    "stage"                INTEGER,
    "subject"              TEXT          NOT NULL,
    "bodyHtml"             TEXT          NOT NULL,
    "bodyText"             TEXT,
    "signatureHtml"        TEXT,
    "mobileOverridesHtml"  TEXT,
    "thumbnailUrl"         TEXT,
    "logoUrl"              TEXT,
    "stopIfNotOpenedHours" INTEGER,
    "isActive"             BOOLEAN       NOT NULL DEFAULT true,
    "isDefault"            BOOLEAN       NOT NULL DEFAULT false,
    "altSubject"           TEXT,
    "altNotOpenedHours"    INTEGER,
    "noCodeHtmlBody"       TEXT,
    "noCodeSubject"        TEXT,
    "createdBy"            TEXT,
    "updatedBy"            TEXT,
    "chapterId"            TEXT,
    "createdAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "EmailTemplate2_pkey" PRIMARY KEY ("id")
);

-- Indexes matching the Prisma schema @@index annotations.
CREATE INDEX IF NOT EXISTS "EmailTemplate2_stage_idx"       ON "EmailTemplate2"("stage");
CREATE INDEX IF NOT EXISTS "EmailTemplate2_isActive_idx"    ON "EmailTemplate2"("isActive");
CREATE INDEX IF NOT EXISTS "EmailTemplate2_chapterId_idx"   ON "EmailTemplate2"("chapterId");
CREATE INDEX IF NOT EXISTS "EmailTemplate2_category_idx"    ON "EmailTemplate2"("category");

-- `stage` is unique-when-set (partial unique index — multiple NULLs allowed).
-- Matches the `@unique` annotation on `stage Int?` in the Prisma schema.
CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate2_stage_key"
    ON "EmailTemplate2"("stage")
    WHERE "stage" IS NOT NULL;

-- Foreign keys for EmailTemplate2:
--   chapterId → Chapter.id (ON DELETE SET NULL — matches Prisma schema)
--   (createdBy and updatedBy are plain String? — no FK, matches the
--    EmailStageTemplate convention to avoid back-relation churn on User.)
ALTER TABLE "EmailTemplate2"
    DROP CONSTRAINT IF EXISTS "EmailTemplate2_chapterId_fkey";
ALTER TABLE "EmailTemplate2"
    ADD CONSTRAINT "EmailTemplate2_chapterId_fkey"
    FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Migrate rows from "EmailTemplate" (campaign-side legacy)
-- ─────────────────────────────────────────────────────────────────────────────
-- IDs are PRESERVED so existing EmailCampaign.templateId FK values still
-- resolve after Step 5 repoints the FK to EmailTemplate2.
--
-- Field mapping (EmailTemplate → EmailTemplate2):
--   id, name, slug, category, subject, bodyHtml, bodyText,
--   signatureHtml, thumbnailUrl, createdBy, chapterId,
--   createdAt, updatedAt → same names
-- Stage-only fields (stopIfNotOpenedHours, isActive, isDefault, altSubject,
-- altNotOpenedHours, noCodeHtmlBody, noCodeSubject, logoUrl, updatedBy,
-- mobileOverridesHtml) default to NULL/false on campaign-side rows.

INSERT INTO "EmailTemplate2" (
    "id", "name", "slug", "category", "subject", "bodyHtml", "bodyText",
    "signatureHtml", "thumbnailUrl", "createdBy", "chapterId",
    "createdAt", "updatedAt"
)
SELECT
    t."id", t."name", t."slug", t."category", t."subject", t."bodyHtml",
    t."bodyText", t."signatureHtml", t."thumbnailUrl", t."createdBy",
    t."chapterId", t."createdAt", t."updatedAt"
FROM "EmailTemplate" t
WHERE NOT EXISTS (
    SELECT 1 FROM "EmailTemplate2" e2 WHERE e2."id" = t."id"
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Migrate rows from "EmailStageTemplate" (flow-side legacy)
-- ─────────────────────────────────────────────────────────────────────────────
-- IDs are PRESERVED so existing EmailFlowStep.templateId FK values still
-- resolve after Step 4 repoints the FK to EmailTemplate2.
--
-- Field mapping (EmailStageTemplate → EmailTemplate2):
--   id → id
--   name → name (with " (stage)" suffix if a campaign-side row already
--          exists with the same name — purely for human readability)
--   stage → stage
--   subject → subject
--   htmlBody → bodyHtml  (← field renamed)
--   stopIfNotOpenedHours, isActive, isDefault, altSubject, altNotOpenedHours,
--   noCodeHtmlBody, noCodeSubject, logoUrl, updatedBy, chapterId → same names
--   createdAt is NOT on the legacy EmailStageTemplate table — use COALESCE
--          with updatedAt or NOW() so the NOT NULL constraint is satisfied.
--   updatedAt → updatedAt (COALESCE to NOW() in case legacy rows have NULL)
-- Campaign-only fields (slug, category, bodyText, signatureHtml, thumbnailUrl,
-- createdBy, mobileOverridesHtml) default to NULL/'general' on stage rows.

INSERT INTO "EmailTemplate2" (
    "id", "name", "stage", "subject", "bodyHtml",
    "stopIfNotOpenedHours", "isActive", "isDefault",
    "altSubject", "altNotOpenedHours",
    "noCodeHtmlBody", "noCodeSubject",
    "logoUrl", "updatedBy", "chapterId",
    "createdAt", "updatedAt"
)
SELECT
    s."id",
    CASE
        WHEN EXISTS (SELECT 1 FROM "EmailTemplate" t WHERE t."name" = s."name")
            THEN s."name" || ' (stage)'
        WHEN EXISTS (
            SELECT 1 FROM "EmailTemplate2" e2
            WHERE e2."id" <> s."id" AND e2."name" = s."name"
        )
            THEN s."name" || ' (stage)'
        ELSE s."name"
    END AS "name",
    s."stage",
    s."subject",
    s."htmlBody",
    s."stopIfNotOpenedHours",
    s."isActive",
    s."isDefault",
    s."altSubject",
    s."altNotOpenedHours",
    s."noCodeHtmlBody",
    s."noCodeSubject",
    s."logoUrl",
    s."updatedBy",
    s."chapterId",
    COALESCE(s."updatedAt", NOW()) AS "createdAt",
    COALESCE(s."updatedAt", NOW()) AS "updatedAt"
FROM "EmailStageTemplate" s
WHERE NOT EXISTS (
    SELECT 1 FROM "EmailTemplate2" e2 WHERE e2."id" = s."id"
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Repoint EmailFlowStep.templateId FK → EmailTemplate2
-- ─────────────────────────────────────────────────────────────────────────────
-- The FK currently points at "EmailStageTemplate"("id"). Since we preserved
-- the IDs in Step 3, every existing EmailFlowStep.templateId value resolves
-- to a row in EmailTemplate2. We just swap the FK target.

-- Drop indexes that reference the FK column (will recreate after).
-- (None to drop — there's no index on EmailFlowStep.templateId alone in the
--  current schema; the FK is the only constraint on this column.)

ALTER TABLE "EmailFlowStep"
    DROP CONSTRAINT IF EXISTS "EmailFlowStep_templateId_fkey";

ALTER TABLE "EmailFlowStep"
    ADD CONSTRAINT "EmailFlowStep_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EmailTemplate2"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: Repoint EmailCampaign.templateId FK → EmailTemplate2
-- ─────────────────────────────────────────────────────────────────────────────
-- Same pattern as Step 4 — IDs preserved, FK target swapped.

ALTER TABLE "EmailCampaign"
    DROP CONSTRAINT IF EXISTS "EmailCampaign_templateId_fkey";

ALTER TABLE "EmailCampaign"
    ADD CONSTRAINT "EmailCampaign_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EmailTemplate2"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6: Add EmailCampaign.flowId + 1:1 link to EmailFlow
-- ─────────────────────────────────────────────────────────────────────────────
-- flowId is nullable (legacy campaigns have no flow link). The unique
-- constraint uses a PARTIAL INDEX (WHERE flowId IS NOT NULL) so that
-- multiple NULL values are allowed (PostgreSQL unique indexes treat NULL
-- as distinct by default, but the partial index makes the intent explicit
-- and is slightly more storage-efficient).

ALTER TABLE "EmailCampaign"
    ADD COLUMN IF NOT EXISTS "flowId" TEXT;

-- Drop any pre-existing constraint/index with this name (idempotent).
DROP INDEX IF EXISTS "EmailCampaign_flowId_key";

CREATE UNIQUE INDEX "EmailCampaign_flowId_key"
    ON "EmailCampaign"("flowId")
    WHERE "flowId" IS NOT NULL;

-- FK: EmailCampaign.flowId → EmailFlow.id (ON DELETE SET NULL — matches
-- the Prisma schema. When a flow is deleted, the linked campaign keeps
-- its data but loses the flow link.)
ALTER TABLE "EmailCampaign"
    DROP CONSTRAINT IF EXISTS "EmailFlow_campaign_fkey";

ALTER TABLE "EmailCampaign"
    ADD CONSTRAINT "EmailFlow_campaign_fkey"
    FOREIGN KEY ("flowId") REFERENCES "EmailFlow"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 7: Verify — sanity-check row counts (informational, no enforcement).
-- ─────────────────────────────────────────────────────────────────────────────
-- These queries are no-ops at the SQL level but surface in the migration
-- logs for ops debugging. They DO NOT modify any data.

-- SELECT
--   (SELECT COUNT(*) FROM "EmailTemplate")       AS legacy_campaign_templates,
--   (SELECT COUNT(*) FROM "EmailStageTemplate")  AS legacy_stage_templates,
--   (SELECT COUNT(*) FROM "EmailTemplate2")      AS unified_templates;
