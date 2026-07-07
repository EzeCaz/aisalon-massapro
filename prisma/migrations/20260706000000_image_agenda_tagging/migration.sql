-- Migration: Image ↔ Agenda item tagging (m:n)
-- Date: 2026-07-06
--
-- Adds the ability to tag an EventImage with one or more EventAgendaItem
-- rows (i.e. "this photo belongs to session X"). Complements the existing
-- EventImage.speakers m:n — a photo can be tagged with BOTH the speaker(s)
-- AND the specific session(s) it belongs to.
--
-- Use cases:
--   • Panels: a panel photo tagged with the PANEL agenda item (not just
--     each individual panelist).
--   • Breaks / networking / fast-pitch: photos that have no obvious
--     speaker but do belong to a specific agenda slot.
--   • Multi-session event recaps where a single photo spans two sessions
--     (e.g. a panel that morphs into a fast-pitch round).
--
-- The build uses `prisma db push` (see package.json `build` script), so
-- this migration file is mostly for documentation + manual `prisma migrate
-- deploy` runs on production. `db push` will create the join table
-- automatically from schema.prisma the next time the build runs.
--
-- Join table name follows Prisma's implicit m:n convention for named
-- relations: `_<RelationName>` → `_AgendaItemTaggedImages`.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Create the implicit join table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "_AgendaItemTaggedImages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- Unique constraint so the same (image, agenda item) pair can't be linked twice
CREATE UNIQUE INDEX IF NOT EXISTS "_AgendaItemTaggedImages_AB_unique"
    ON "_AgendaItemTaggedImages"("A", "B");

-- Index on the "B" side (agenda item id) — speeds up "find all images for
-- this session" queries. The "A" side (image id) is covered by the unique
-- index above for "find all sessions for this image" lookups.
CREATE INDEX IF NOT EXISTS "_AgendaItemTaggedImages_B_index"
    ON "_AgendaItemTaggedImages"("B");

-- Foreign keys: cascade on delete so removing an image OR an agenda item
-- automatically cleans up the dangling join row.
ALTER TABLE "_AgendaItemTaggedImages"
    ADD CONSTRAINT "_AgendaItemTaggedImages_A_fkey"
    FOREIGN KEY ("A") REFERENCES "EventImage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_AgendaItemTaggedImages"
    ADD CONSTRAINT "_AgendaItemTaggedImages_B_fkey"
    FOREIGN KEY ("B") REFERENCES "EventAgendaItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
