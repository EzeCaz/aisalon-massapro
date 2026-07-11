-- Make EmailQueue.rsvpId nullable.
--
-- WHY:
-- The flow-based email system's "Send to Audience" action used to create
-- synthetic EventRsvp rows (status=GOING, source=IMPORT, name=null) for
-- every audience email that didn't already have an RSVP, just to satisfy
-- the EmailQueue.rsvpId NOT NULL foreign key. This had the side-effect of
-- polluting the event's registrant list with hundreds of synthetic rows
-- (e.g. 58 real RSVPs became 248 after sending to a 240-email audience).
--
-- FIX:
-- Make rsvpId (and therefore the rsvp relation) optional. The flow
-- trigger now sets rsvpId only when an RSVP already exists; otherwise
-- it leaves rsvpId null and the queue row uses the denormalized
-- email / eventId / userId columns directly. The flow worker fetches
-- the event by row.eventId when rsvp is null.
--
-- The legacy stage-based orchestrator is unaffected — it bootstraps
-- queue rows from real RSVPs only, so rsvpId is always set there.

-- 1. Drop the NOT NULL constraint on EmailQueue.rsvpId.
--    Postgres syntax: ALTER COLUMN ... DROP NOT NULL.
ALTER TABLE "EmailQueue" ALTER COLUMN "rsvpId" DROP NOT NULL;

-- 2. Drop the existing FK constraint so we can re-create it with ON DELETE
--    CASCADE that allows nulls. Prisma's auto-generated FK name varies, so
--    we use IF EXISTS to be safe.
--    (Note: a FK with a nullable column still cascades deletes when the
--    referenced row IS deleted — the nullable column just means inserts
--    can omit it.)
ALTER TABLE "EmailQueue" DROP CONSTRAINT IF EXISTS "EmailQueue_rsvpId_fkey";

-- 3. Re-create the FK with the same rules as before (CASCADE on delete).
ALTER TABLE "EmailQueue"
  ADD CONSTRAINT "EmailQueue_rsvpId_fkey"
  FOREIGN KEY ("rsvpId") REFERENCES "EventRsvp"("id") ON DELETE CASCADE;

-- No data migration needed: existing rows all have rsvpId set (the old
-- schema required it). New rows may have rsvpId = NULL.
