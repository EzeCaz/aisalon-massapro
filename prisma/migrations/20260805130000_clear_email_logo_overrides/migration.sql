-- Migration: Clear per-template email logo overrides + set global email logo
-- Date: 2026-08-05
--
-- PER USER SPEC 2026-08-05:
--   "when I select the logo for the email all emails will be automatically
--    with the logo I've chosen, in this case is
--    https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785868301722-nl1qnl.png"
--
-- This migration does TWO things:
--
-- 1. Clears ALL per-template `logoUrl` overrides in EmailTemplate2.
--    Previously, the seed only cleared logoUrl when it differed from the
--    "canonical" URL — which was the OLD logo (1785668808200-0fdrda.png).
--    Templates seeded with that OLD URL kept showing it even after the
--    user picked a new global email logo. Now we clear ALL per-template
--    logoUrl values unconditionally so the global SiteSetting[emailLogo]
--    pick ALWAYS wins.
--
-- 2. Upserts SiteSetting[emailLogo] to the user's chosen URL. If the row
--    doesn't exist, it's created. If it exists (possibly with the OLD URL),
--    it's overwritten with the NEW URL. This ensures the global pick is
--    always the user's chosen logo, regardless of what was previously
--    stored in the DB.
--
-- Idempotent: safe to run multiple times. Re-runs produce 0 updates
-- (the WHERE clause skips rows that are already NULL, and the upsert
-- writes the same value).

-- 1. Clear per-template logoUrl overrides.
-- Only updates rows where logoUrl is NOT NULL (skips already-cleared rows).
UPDATE "EmailTemplate2"
  SET "logoUrl" = NULL
  WHERE "logoUrl" IS NOT NULL;

-- 2. Upsert the global email logo SiteSetting to the user's chosen URL.
-- Uses INSERT ... ON CONFLICT to handle both cases:
--   - Row doesn't exist → INSERT with the new URL
--   - Row exists → UPDATE value + updatedAt (leave updatedBy as-is
--     since we don't have a user ID in a SQL migration)
INSERT INTO "SiteSetting" ("key", "value", "updatedAt")
  VALUES (
    'emailLogo',
    'https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785868301722-nl1qnl.png',
    NOW()
  )
  ON CONFLICT ("key")
  DO UPDATE SET
    "value" = EXCLUDED."value",
    "updatedAt" = NOW()
  WHERE "SiteSetting"."value" != 'https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785868301722-nl1qnl.png';
