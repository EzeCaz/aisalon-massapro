-- Migration: Add brandSlug column to "User"
-- Date: 2026-08-11
--
-- Adds a nullable `brandSlug` column to the User table. This persists
-- which top-level brand (aisalon | coma) a user signed up under, so
-- brand context follows the user across every page (dashboard, admin,
-- onboarding, emails) — not just the login page where brand is
-- currently resolved per-request from URL/host.
--
-- NULL = legacy user (treated as "aisalon" — the platform default).
-- Set at signup time by /api/auth/signup when the request includes
-- brandSlug in the body (forwarded by the brand-aware login form).
--
-- The column is nullable + has no FK because brands are still a
-- code-level concept (src/lib/brand/brand-config.ts) — there is no
-- Brand table in Prisma yet. Adding a CHECK constraint for valid
-- slugs would couple the DB to the code-level brand registry, which
-- we want to avoid until the Brand table is properly modeled.

ALTER TABLE "User"
  ADD COLUMN "brandSlug" TEXT;
