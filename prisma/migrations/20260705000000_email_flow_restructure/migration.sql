-- Migration: Email flow restructure
-- Date: 2026-07-05
--
-- This migration implements the new email flow model:
--   1. Adds EmailAudience table (reusable named email lists)
--   2. Restructures EmailFlowStep: per-step audience + trigger + A/B subjects
--   3. Removes flow-level trigger (EmailFlow.triggerKind, triggerEventId, branchEvaluationDelayHours)
--   4. Removes EmailFlowRun model entirely (steps are independent now)
--   5. Adds subjectVariant + audienceId to EmailQueue for A/B reporting
--   6. Removes flowRunId from EmailQueue
--
-- WARNING: This is a destructive migration (wipe + rebuild strategy).
-- All existing EmailFlow, EmailFlowStep, EmailFlowRun, and EmailQueue rows
-- are deleted. Re-seed after running.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Drop flow-run foreign keys + columns on EmailQueue
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop indexes that reference removed columns
DROP INDEX IF EXISTS "EmailQueue_flowRunId_idx";

-- Drop the foreign key constraint on EmailQueue.flowRunId (name may vary by DB)
ALTER TABLE "EmailQueue" DROP CONSTRAINT IF EXISTS "EmailQueue_flowRunId_fkey";

-- Drop the flowRunId column
ALTER TABLE "EmailQueue" DROP COLUMN IF EXISTS "flowRunId";

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Add new columns to EmailQueue
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "EmailQueue" ADD COLUMN IF NOT EXISTS "subjectVariant" TEXT;
ALTER TABLE "EmailQueue" ADD COLUMN IF NOT EXISTS "audienceId"    TEXT;

CREATE INDEX IF NOT EXISTS "EmailQueue_subjectVariant_idx" ON "EmailQueue"("subjectVariant");
CREATE INDEX IF NOT EXISTS "EmailQueue_audienceId_idx"     ON "EmailQueue"("audienceId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Wipe existing flow data (wipe + rebuild strategy)
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM "TrackingLog" WHERE "queueId" IN (SELECT "id" FROM "EmailQueue" WHERE "flowStepId" IS NOT NULL);
DELETE FROM "EmailQueue"   WHERE "flowStepId" IS NOT NULL;
DELETE FROM "EmailFlowStep";
DELETE FROM "EmailFlowRun";
DROP TABLE IF EXISTS "EmailFlowRun";

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Drop old EmailFlow columns (flow-level trigger)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop indexes that reference removed columns
DROP INDEX IF EXISTS "EmailFlow_status_triggerKind_idx";
DROP INDEX IF EXISTS "EmailFlow_triggerEventId_idx";

-- Drop the foreign key on EmailFlow.triggerEventId
ALTER TABLE "EmailFlow" DROP CONSTRAINT IF EXISTS "EmailFlow_triggerEventId_fkey";

-- Drop the columns
ALTER TABLE "EmailFlow" DROP COLUMN IF EXISTS "triggerKind";
ALTER TABLE "EmailFlow" DROP COLUMN IF EXISTS "triggerEventId";
ALTER TABLE "EmailFlow" DROP COLUMN IF EXISTS "branchEvaluationDelayHours";

-- New index (status only, no triggerKind)
CREATE INDEX IF NOT EXISTS "EmailFlow_status_idx" ON "EmailFlow"("status");

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: Drop old EmailFlowStep columns + add new ones
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old columns
ALTER TABLE "EmailFlowStep" DROP COLUMN IF EXISTS "subjectOverride";
ALTER TABLE "EmailFlowStep" DROP COLUMN IF EXISTS "branchRulesJson";
ALTER TABLE "EmailFlowStep" DROP COLUMN IF EXISTS "filterJson";

-- Add new columns
ALTER TABLE "EmailFlowStep" ADD COLUMN IF NOT EXISTS "audienceId"       TEXT;
ALTER TABLE "EmailFlowStep" ADD COLUMN IF NOT EXISTS "triggerKind"      TEXT;
ALTER TABLE "EmailFlowStep" ADD COLUMN IF NOT EXISTS "triggerEventId"   TEXT;
ALTER TABLE "EmailFlowStep" ADD COLUMN IF NOT EXISTS "subjectVariantA"  TEXT;
ALTER TABLE "EmailFlowStep" ADD COLUMN IF NOT EXISTS "subjectVariantB"  TEXT;

-- Change delayUnit default from HOURS to MINUTES (new steps default to minutes)
ALTER TABLE "EmailFlowStep" ALTER COLUMN "delayUnit" SET DEFAULT 'MINUTES';

-- Foreign key: EmailFlowStep.audienceId → EmailAudience.id (added after table created below)
-- Foreign key: EmailFlowStep.triggerEventId → Event.id (optional, scoped trigger)

CREATE INDEX IF NOT EXISTS "EmailFlowStep_triggerKind_idx" ON "EmailFlowStep"("triggerKind");
CREATE INDEX IF NOT EXISTS "EmailFlowStep_audienceId_idx"  ON "EmailFlowStep"("audienceId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6: Create EmailAudience table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "EmailAudience" (
    "id"          TEXT              NOT NULL,
    "name"        TEXT              NOT NULL,
    "slug"        TEXT,
    "description" TEXT,
    "emailsJson"  TEXT              NOT NULL DEFAULT '[]',
    "isTest"      BOOLEAN           NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "EmailAudience_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailAudience_name_key" ON "EmailAudience"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailAudience_slug_key" ON "EmailAudience"("slug");
CREATE INDEX IF NOT EXISTS "EmailAudience_isTest_idx"     ON "EmailAudience"("isTest");

-- Foreign key from EmailFlowStep.audienceId → EmailAudience.id
ALTER TABLE "EmailFlowStep"
    ADD CONSTRAINT "EmailFlowStep_audienceId_fkey"
    FOREIGN KEY ("audienceId") REFERENCES "EmailAudience"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign key from EmailFlowStep.triggerEventId → Event.id
ALTER TABLE "EmailFlowStep"
    ADD CONSTRAINT "EmailFlowStep_triggerEventId_fkey"
    FOREIGN KEY ("triggerEventId") REFERENCES "Event"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign key from EmailQueue.flowStepId → EmailFlowStep.id
ALTER TABLE "EmailQueue"
    ADD CONSTRAINT "EmailQueue_flowStepId_fkey"
    FOREIGN KEY ("flowStepId") REFERENCES "EmailFlowStep"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 7: Seed the built-in "Test" audience
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "EmailAudience" ("id", "name", "slug", "description", "emailsJson", "isTest", "createdAt", "updatedAt")
VALUES (
    'test-audience-built-in',
    'Test',
    'test',
    'Built-in test audience for flow preview. Contains the admin test emails.',
    '["eze@massapro.com","ezeszna@gmail.com","eze@hi4.ai"]',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;
