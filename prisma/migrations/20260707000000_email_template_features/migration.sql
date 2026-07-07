-- Feature 1: No-check-in-code variant body
ALTER TABLE "EmailStageTemplate" ADD COLUMN "noCodeHtmlBody" TEXT;
ALTER TABLE "EmailStageTemplate" ADD COLUMN "noCodeSubject" TEXT;

-- Feature 2: Brand logo override per template
ALTER TABLE "EmailStageTemplate" ADD COLUMN "logoUrl" TEXT;

-- Feature 3: Alternative subject line re-send
ALTER TABLE "EmailStageTemplate" ADD COLUMN "altSubject" TEXT;
ALTER TABLE "EmailStageTemplate" ADD COLUMN "altNotOpenedHours" INTEGER;

-- EmailQueue: track alt-resend + no-code-variant rows
ALTER TABLE "EmailQueue" ADD COLUMN "isAltResend" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailQueue" ADD COLUMN "altOfEmailQueueId" TEXT;
ALTER TABLE "EmailQueue" ADD COLUMN "usedNoCodeVariant" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "EmailQueue_isAltResend_idx" ON "EmailQueue"("isAltResend");
