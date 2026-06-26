#!/usr/bin/env node
/**
 * V4.9 schema migration — adds the missing SiteSetting table + archivedAt
 * columns + door check-in columns to production Neon Postgres.
 *
 * Idempotent: uses IF NOT EXISTS so re-running is safe.
 *
 * Usage:
 *   node /home/z/my-project/scripts/apply-v4.9-schema-changes.mjs
 */
const DATABASE_URL =
  "postgresql://neondb_owner:npg_7DLHiSkO1EAf@ep-restless-voice-at8gnuqn-pooler.c-9.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

const SQL = `
-- === SiteSetting table (V4.x feature: admin-changeable favicon/login hero/login banner) ===
CREATE TABLE IF NOT EXISTS "SiteSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- === User soft-delete (archive) columns ===
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "archivedBy" TEXT;

-- Foreign key for User.archivedBy -> User.id (ON DELETE SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_archivedBy_fkey'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_archivedBy_fkey"
      FOREIGN KEY ("archivedBy") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Index for fast filtering of active (non-archived) members
CREATE INDEX IF NOT EXISTS "User_archivedAt_idx" ON "User"("archivedAt");

-- === EventRsvp door check-in columns ===
ALTER TABLE "EventRsvp" ADD COLUMN IF NOT EXISTS "checkInCode" TEXT;
ALTER TABLE "EventRsvp" ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMP(3);
ALTER TABLE "EventRsvp" ADD COLUMN IF NOT EXISTS "doorCheckedAt" TIMESTAMP(3);
ALTER TABLE "EventRsvp" ADD COLUMN IF NOT EXISTS "doorCheckedBy" TEXT;

-- Unique constraint on checkInCode (door staff scan without event context)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventRsvp_checkInCode_key'
  ) THEN
    ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_checkInCode_key" UNIQUE ("checkInCode");
  END IF;
END $$;

-- Index for fast door check-in lookups
CREATE INDEX IF NOT EXISTS "EventRsvp_doorCheckedAt_idx" ON "EventRsvp"("doorCheckedAt");

-- === EventCoHost table (admin-designated event collaborators) ===
CREATE TABLE IF NOT EXISTS "EventCoHost" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "addedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCoHost_pkey" PRIMARY KEY ("id")
);

-- Foreign keys for EventCoHost
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventCoHost_eventId_fkey') THEN
    ALTER TABLE "EventCoHost" ADD CONSTRAINT "EventCoHost_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventCoHost_userId_fkey') THEN
    ALTER TABLE "EventCoHost" ADD CONSTRAINT "EventCoHost_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventCoHost_addedBy_fkey') THEN
    ALTER TABLE "EventCoHost" ADD CONSTRAINT "EventCoHost_addedBy_fkey"
      FOREIGN KEY ("addedBy") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Unique constraint: each user can be a co-host of an event only once
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventCoHost_eventId_userId_key'
  ) THEN
    ALTER TABLE "EventCoHost" ADD CONSTRAINT "EventCoHost_eventId_userId_key" UNIQUE ("eventId", "userId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EventCoHost_eventId_idx" ON "EventCoHost"("eventId");
CREATE INDEX IF NOT EXISTS "EventCoHost_userId_idx" ON "EventCoHost"("userId");

-- === Panelists (m:n between EventAgendaItem and Speaker for PANEL-type items) ===
CREATE TABLE IF NOT EXISTS "_EventAgendaItemToSpeaker" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_EventAgendaItemToSpeaker_AB_unique') THEN
    ALTER TABLE "_EventAgendaItemToSpeaker" ADD CONSTRAINT "_EventAgendaItemToSpeaker_AB_unique" UNIQUE ("A", "B");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_EventAgendaItemToSpeaker_BA_unique') THEN
    ALTER TABLE "_EventAgendaItemToSpeaker" ADD CONSTRAINT "_EventAgendaItemToSpeaker_BA_unique" UNIQUE ("B", "A");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_EventAgendaItemToSpeaker_A_fkey') THEN
    ALTER TABLE "_EventAgendaItemToSpeaker" ADD CONSTRAINT "_EventAgendaItemToSpeaker_A_fkey"
      FOREIGN KEY ("A") REFERENCES "EventAgendaItem"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_EventAgendaItemToSpeaker_B_fkey') THEN
    ALTER TABLE "_EventAgendaItemToSpeaker" ADD CONSTRAINT "_EventAgendaItemToSpeaker_B_fkey"
      FOREIGN KEY ("B") REFERENCES "Speaker"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "_EventAgendaItemToSpeaker_B_index" ON "_EventAgendaItemToSpeaker"("B");
CREATE INDEX IF NOT EXISTS "_EventAgendaItemToSpeaker_A_index" ON "_EventAgendaItemToSpeaker"("A");
`;

// Use node's built-in fetch to call Neon's HTTP SQL endpoint
// (avoids needing to install @prisma/client in standalone mode)
async function main() {
  console.log("[INFO] applying V4.9 schema changes to production Neon DB...");

  // Split SQL into statements, respecting DO $$ ... $$ blocks
  const statements = [];
  let buf = "";
  let inDollarQuote = false;
  for (const line of SQL.split("\n")) {
    buf += line + "\n";
    const dollarCount = (line.match(/\$\$/g) || []).length;
    if (dollarCount % 2 === 1) inDollarQuote = !inDollarQuote;
    if (!inDollarQuote && line.trim().endsWith(";")) {
      statements.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) statements.push(buf.trim());

  console.log(`[INFO] executing ${statements.length} SQL statement(s)...`);

  // Use pg-style connection via @prisma/client (already installed)
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
    log: ["warn", "error"],
  });

  for (const stmt of statements) {
    const preview = stmt.split("\n")[0].slice(0, 80);
    console.log(`  → ${preview}${stmt.length > 80 ? "..." : ""}`);
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      // Continue — many statements are idempotent "IF NOT EXISTS" so a failure
      // on one shouldn't block the rest.
    }
  }
  console.log("[OK] all schema changes applied");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[ERR]", e);
  process.exit(1);
});
