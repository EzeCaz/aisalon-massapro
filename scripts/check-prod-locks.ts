/**
 * Diagnostic: check what's holding the Prisma migrate advisory lock on prod.
 * Usage: DATABASE_URL=<url> npx tsx scripts/check-prod-locks.ts
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const sessions = await prisma.$queryRaw<
      Array<{
        pid: number;
        state: string;
        wait_event_type: string | null;
        wait_event: string | null;
        runtime: string;
        query: string;
        application_name: string;
      }>
    >`
      SELECT pid, state,
             wait_event_type, wait_event,
             (now() - query_start)::text AS runtime,
             left(query, 100) AS query,
             application_name
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
      ORDER BY query_start
    `;
    console.log(`Active sessions: ${sessions.length}`);
    for (const s of sessions) {
      console.log(
        `  pid=${s.pid} state=${s.state} wait=${s.wait_event_type}/${s.wait_event} app=${s.application_name} runtime=${s.runtime}\n    query: ${s.query.replace(/\n/g, " ")}`
      );
    }

    // Who holds the Prisma advisory lock (72707369)?
    const lockHolders = await prisma.$queryRaw<
      Array<{ pid: number; granted: boolean; query: string }>
    >`
      SELECT l.pid, l.granted, left(a.query, 100) AS query
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory'
      ORDER BY l.granted DESC
    `;
    console.log(`\nAdvisory locks: ${lockHolders.length}`);
    for (const l of lockHolders) {
      console.log(`  pid=${l.pid} granted=${l.granted} query: ${l.query.replace(/\n/g, " ")}`);
    }

    // Can we take the lock ourselves right now with a short timeout?
    const tryLock = await prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(72707369) AS locked
    `;
    console.log(`\npg_try_advisory_lock(72707369) = ${tryLock[0]?.locked}`);
    if (tryLock[0]?.locked) {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(72707369)`;
      console.log("  (released immediately — lock is FREE, migrate deploy should work)");
    } else {
      console.log("  (lock is HELD by another session)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Diagnostic failed:", e);
  process.exit(1);
});
