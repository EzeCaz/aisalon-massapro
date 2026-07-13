-- ===========================================================================
-- Activity Tracking Models (V5.21 — 2026-07-13)
-- ===========================================================================
-- Adds the 4 missing models that /api/track/* endpoints have been trying
-- to write to since launch. Plus two new columns on "User" for login +
-- activity timestamps.
-- ===========================================================================

-- Add login + activity timestamps to User
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- Create indexes for the new User columns (partial — only non-null rows)
CREATE INDEX "User_lastLoginAt_idx" ON "User" ("lastLoginAt");
CREATE INDEX "User_lastActiveAt_idx" ON "User" ("lastActiveAt");

-- ---------------------------------------------------------------------------
-- PageView
-- ---------------------------------------------------------------------------
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "affId" TEXT,
    "userId" TEXT,
    "pageUrl" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "ftUtmSource" TEXT,
    "ftUtmMedium" TEXT,
    "ftUtmCampaign" TEXT,
    "ftUtmContent" TEXT,
    "ftUtmTerm" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageView_userId_enteredAt_idx" ON "PageView" ("userId", "enteredAt");
CREATE INDEX "PageView_sessionId_enteredAt_idx" ON "PageView" ("sessionId", "enteredAt");
CREATE INDEX "PageView_pagePath_enteredAt_idx" ON "PageView" ("pagePath", "enteredAt");
CREATE INDEX "PageView_enteredAt_idx" ON "PageView" ("enteredAt");

ALTER TABLE "PageView"
    ADD CONSTRAINT "PageView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ClickEvent
-- ---------------------------------------------------------------------------
CREATE TABLE "ClickEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "affId" TEXT,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT,
    "pageUrl" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "metadata" JSONB,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClickEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClickEvent_userId_createdAt_idx" ON "ClickEvent" ("userId", "createdAt");
CREATE INDEX "ClickEvent_sessionId_createdAt_idx" ON "ClickEvent" ("sessionId", "createdAt");
CREATE INDEX "ClickEvent_pagePath_createdAt_idx" ON "ClickEvent" ("pagePath", "createdAt");
CREATE INDEX "ClickEvent_eventType_createdAt_idx" ON "ClickEvent" ("eventType", "createdAt");
CREATE INDEX "ClickEvent_createdAt_idx" ON "ClickEvent" ("createdAt");

ALTER TABLE "ClickEvent"
    ADD CONSTRAINT "ClickEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- TrackedLead
-- ---------------------------------------------------------------------------
CREATE TABLE "TrackedLead" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "affId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "conversionType" TEXT NOT NULL,
    "conversionRef" TEXT,
    "initialStatus" TEXT,
    "planType" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "ftUtmSource" TEXT,
    "ftUtmMedium" TEXT,
    "ftUtmCampaign" TEXT,
    "ftUtmContent" TEXT,
    "ftUtmTerm" TEXT,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrackedLead_userId_idx" ON "TrackedLead" ("userId");
CREATE INDEX "TrackedLead_email_idx" ON "TrackedLead" ("email");
CREATE INDEX "TrackedLead_sessionId_idx" ON "TrackedLead" ("sessionId");
CREATE INDEX "TrackedLead_conversionType_convertedAt_idx" ON "TrackedLead" ("conversionType", "convertedAt");
CREATE INDEX "TrackedLead_convertedAt_idx" ON "TrackedLead" ("convertedAt");

ALTER TABLE "TrackedLead"
    ADD CONSTRAINT "TrackedLead_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ReferralConversion
-- ---------------------------------------------------------------------------
CREATE TABLE "ReferralConversion" (
    "id" TEXT NOT NULL,
    "referringUserId" TEXT NOT NULL,
    "referredUserId" TEXT,
    "referredEmail" TEXT,
    "conversionType" TEXT NOT NULL,
    "conversionRef" TEXT,
    "affId" TEXT,
    "utmSnapshot" JSONB,
    "sessionId" TEXT,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralConversion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferralConversion_referringUserId_convertedAt_idx" ON "ReferralConversion" ("referringUserId", "convertedAt");
CREATE INDEX "ReferralConversion_referredUserId_idx" ON "ReferralConversion" ("referredUserId");
CREATE INDEX "ReferralConversion_referredEmail_idx" ON "ReferralConversion" ("referredEmail");
CREATE INDEX "ReferralConversion_conversionType_convertedAt_idx" ON "ReferralConversion" ("conversionType", "convertedAt");
CREATE INDEX "ReferralConversion_convertedAt_idx" ON "ReferralConversion" ("convertedAt");

ALTER TABLE "ReferralConversion"
    ADD CONSTRAINT "ReferralConversion_referringUserId_fkey"
    FOREIGN KEY ("referringUserId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralConversion"
    ADD CONSTRAINT "ReferralConversion_referredUserId_fkey"
    FOREIGN KEY ("referredUserId") REFERENCES "User" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
