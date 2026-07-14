-- ===========================================================================
-- Add sessionUrl column to EventAgendaItem (2026-07-15)
-- ===========================================================================
-- Adds a dedicated column for the per-session link (recording, livestream,
-- signup form, sponsor call-booking link, etc.). The public agenda tab
-- prefers this column when set; when null, it falls back to extracting the
-- first http(s) URL from the description text (legacy behavior preserved
-- so existing sessions that embed a URL in their description keep working).
--
-- Nullable so existing rows are unaffected. No default value.
-- ===========================================================================

ALTER TABLE "EventAgendaItem" ADD COLUMN "sessionUrl" TEXT;
