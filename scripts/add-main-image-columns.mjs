/**
 * add-main-image-columns.mjs
 *
 * Surgical SQL migration to add the two new columns introduced in
 * Task 23 without running a full `prisma db push` (which fails due
 * to an unrelated MemberTag.label unique constraint that would
 * require data deduplication).
 *
 * Adds:
 *   - Event.mainImageId  TEXT  (nullable, FK → EventImage.id ON DELETE SET NULL)
 *   - EmailRecipient.retryCount  INTEGER NOT NULL DEFAULT 0
 *
 * Both are purely additive — no existing rows are touched.
 *
 * Run with:
 *   DATABASE_URL=<prod non-pooled URL> node scripts/add-main-image-columns.mjs
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const statements = [
  // --- Event.mainImageId ---
  // Add the nullable column if it doesn't already exist.
  `ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "mainImageId" TEXT;`,
  // Add the FK constraint if it doesn't already exist.
  // ON DELETE SET NULL: if the image is deleted, the event's pointer
  // becomes null rather than cascading the deletion.
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Event_mainImageId_fkey'
    ) THEN
      ALTER TABLE "Event"
        ADD CONSTRAINT "Event_mainImageId_fkey"
        FOREIGN KEY ("mainImageId") REFERENCES "EventImage"("id")
        ON DELETE SET NULL;
    END IF;
  END $$;`,
  // Add an index for fast lookups (e.g. "which event uses this image?")
  `CREATE INDEX IF NOT EXISTS "Event_mainImageId_idx" ON "Event"("mainImageId");`,

  // --- EmailRecipient.retryCount ---
  `ALTER TABLE "EmailRecipient"
     ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;`,
];

async function main() {
  console.log("Running surgical migration:");
  for (const sql of statements) {
    const preview = sql.split("\n")[0].slice(0, 80);
    console.log(`  → ${preview}${sql.length > 80 ? "…" : ""}`);
    await db.$executeRawUnsafe(sql);
  }
  console.log("\n✓ Migration complete.");

  // Verify the columns exist
  const verify = await db.$queryRaw`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'Event' AND column_name = 'mainImageId'
       OR table_name = 'EmailRecipient' AND column_name = 'retryCount'
    ORDER BY table_name, column_name;
  `;
  console.log("\nVerification — new columns:");
  console.table(verify);
}

main()
  .catch((e) => {
    console.error("✗ Migration failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
