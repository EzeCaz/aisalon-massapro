-- Migration: Add `logoHidden` boolean to EmailTemplate2
-- Date: 2026-08-05
--
-- Adds a per-template "hide brand logo" flag. When true, the email
-- renderer skips the top-right brand logo injection (buildLogoBlock
-- returns an empty string). The logoUrl field is preserved so the
-- admin can toggle the logo back on without re-configuring the URL.
--
-- Defaults to false (logo shown) — preserves existing behavior for
-- all current templates.

ALTER TABLE "EmailTemplate2"
  ADD COLUMN "logoHidden" BOOLEAN NOT NULL DEFAULT false;
