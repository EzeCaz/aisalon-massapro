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
 *   3. For each migration folder EXCEPT those in `NEW_MIGRATIONS`, inserting
 *      a row marking it as "already applied" (with a synthetic checksum).
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
    .filter((e) => e.isDirectory() && /^\d/.test(e.name))
    .map((e) => e.name)
    .sort();

  console.log(`[baseline] Found ${migrationNames.length} migration folders.`);

  let inserted = 0;
  let skipped = 0;
  let deferred = 0;

  for (const name of migrationNames) {
    if (NEW_MIGRATIONS.has(name)) {
      console.log(`[baseline] Deferring (will be applied by migrate deploy): ${name}`);
      deferred++;
      continue;
    }

    // Check if already in _prisma_migrations.
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM _prisma_migrations WHERE migration_name = $1`,
      name
    );

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    // Insert baseline row with a synthetic checksum.
    const id = crypto.randomUUID();
    const checksum = crypto
      .createHash('sha256')
      .update(name + '-baseline')
      .digest('hex');
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

  console.log(`[baseline] Done. Inserted: ${inserted}, Skipped: ${skipped}, Deferred: ${deferred}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[baseline] ERROR:', err && (err.message || err));
  // Exit 0 so build can continue — `migrate deploy` will surface real errors.
  process.exit(0);
});
