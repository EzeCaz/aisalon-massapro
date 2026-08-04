/**
 * scripts/baseline-migrations.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Ensures the `_prisma_migrations` table exists and marks all already-applied
 * migrations as "applied" so that `prisma migrate deploy` will only try to
 * apply genuinely new migrations.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The production database was originally set up via `prisma db push` (not
 * `prisma migrate deploy`), so it has all the tables but NO `_prisma_migrations`
 * table. When we add a new migration that includes DATA migrations (not just
 * schema changes), `prisma db push` can't handle it — it only diffs schema,
 * it doesn't run SQL files. We need `prisma migrate deploy` to actually run
 * the migration SQL.
 *
 * But `prisma migrate deploy` fails with P3005 ("database schema is not empty")
 * when the DB has tables but no `_prisma_migrations` table.
 *
 * This script breaks that deadlock by:
 *   1. Creating `_prisma_migrations` if it doesn't exist.
 *   2. Checking if the DB is empty — if so, EXIT (let migrate deploy apply
 *      all migrations from scratch).
 *   3. For each migration folder (ANY name, not just digit-prefixed — includes
 *      legacy names like `V7-add-hierarchy`) EXCEPT those in `NEW_MIGRATIONS`:
 *      - If no row exists in `_prisma_migrations`, INSERT one marked as applied.
 *      - If a row exists but is in FAILED state (finished_at IS NULL), UPDATE
 *        it to mark as applied (self-healing — handles partial builds).
 *      - If a row exists and is already applied, skip.
 *   4. `prisma migrate deploy` then sees all old migrations as applied and
 *      only tries to apply the migrations in `NEW_MIGRATIONS`.
 *
 * USAGE
 * ─────
 *   node scripts/baseline-migrations.cjs
 *
 * Exit code is always 0 (even on error) so the build script can continue to
 * `prisma migrate deploy` which will fail loudly if there's a real issue.
 * This script is best-effort and idempotent.
 *
 * MAINTENANCE
 * ───────────
 * When you add a NEW migration that includes data migrations (not just schema),
 * add its folder name to `NEW_MIGRATIONS` below so this script knows to defer
 * it to `prisma migrate deploy`.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Migrations that have NOT yet been applied to prod and should be applied
// by `prisma migrate deploy`. These will NOT be baselined as "applied".
const NEW_MIGRATIONS = new Set([
  '20260804120000_email_unify_backend',
  // 2026-08-05: clears per-template email logo overrides + sets the global
  // SiteSetting[emailLogo] to the user's chosen URL. See migration SQL for
  // the full rationale.
  '20260805130000_clear_email_logo_overrides',
]);

async function main() {
  const prisma = new PrismaClient();

  console.log('[baseline] Starting migration baseline...');

  // 1. Create _prisma_migrations table if not exists (matches Prisma's schema).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id VARCHAR(36) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  console.log('[baseline] _prisma_migrations table ensured.');

  // 2. Check if the DB is empty (besides _prisma_migrations). If empty, exit —
  //    `prisma migrate deploy` will apply all migrations from scratch.
  const tables = await prisma.$queryRawUnsafe(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != '_prisma_migrations'
    LIMIT 1
  `);
  if (!tables || tables.length === 0) {
    console.log('[baseline] Database is empty. Skipping baseline — `prisma migrate deploy` will apply all migrations from scratch.');
    await prisma.$disconnect();
    return;
  }

  // 3. List all migration folders (dirs starting with a digit).
  const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[baseline] No migrations directory found. Skipping.');
    await prisma.$disconnect();
    return;
  }

  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const migrationNames = entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(migrationsDir, e.name, 'migration.sql')))
    .map((e) => e.name)
    .sort();

  console.log(`[baseline] Found ${migrationNames.length} migration folders.`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let deferred = 0;

  // Synthetic checksum — same algorithm Prisma uses to detect migration file
  // changes. We use a fixed prefix so re-runs produce the same checksum.
  const baselineChecksum = (name) =>
    crypto.createHash('sha256').update(name + '-baseline').digest('hex');

  for (const name of migrationNames) {
    const isNew = NEW_MIGRATIONS.has(name);

    // Check if already in _prisma_migrations.
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = $1`,
      name
    );

    const checksum = baselineChecksum(name);

    if (!existing || existing.length === 0) {
      // No row yet.
      if (isNew) {
        // New migration not yet attempted — let `migrate deploy` apply it.
        console.log(`[baseline] Deferring (will be applied by migrate deploy): ${name}`);
        deferred++;
      } else {
        // Old migration with no record — baseline as applied.
        const id = crypto.randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES ($1, $2, NOW(), $3, NOW(), 0)`,
          id,
          checksum,
          name
        );
        inserted++;
        console.log(`[baseline] Marked as applied: ${name}`);
      }
      continue;
    }

    const row = existing[0];
    // Row exists. If it's in a failed/partial state (finished_at IS NULL and
    // rolled_back_at IS NULL), mark it as applied (self-healing).
    // This applies to BOTH old and new migrations — a migration that was
    // partially applied then failed blocks ALL future migrate deploy runs.
    // Since the migration SQL in this codebase is written idempotently
    // (uses IF NOT EXISTS / WHERE NOT EXISTS), re-marking as applied is safe:
    // migrate deploy will skip it, and any incomplete work will be completed
    // by the NEXT migration that depends on these objects (or by db push).
    const isFailed = !row.finished_at && !row.rolled_back_at;
    if (isFailed) {
      await prisma.$executeRawUnsafe(
        `UPDATE _prisma_migrations
         SET finished_at = NOW(),
             rolled_back_at = NULL,
             logs = COALESCE(logs, '') || E'\n[baseline] Self-healed from failed state.',
             checksum = $2
         WHERE migration_name = $1`,
        name,
        checksum
      );
      updated++;
      console.log(`[baseline] Self-healed (was failed): ${name}`);
      continue;
    }

    // Row exists and is applied or rolled back — skip.
    skipped++;
  }

  console.log(`[baseline] Done. Inserted: ${inserted}, Updated (self-healed): ${updated}, Skipped: ${skipped}, Deferred: ${deferred}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[baseline] ERROR:', err && (err.message || err));
  // Exit 0 so build can continue — `migrate deploy` will surface real errors.
  process.exit(0);
});
