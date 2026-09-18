/**
 * Fix: terminate idle pgbouncer sessions holding the Prisma migrate
 * advisory lock. Safe — the sessions are idle (no in-flight query),
 * the app reconnects transparently.
 * Usage: DATABASE_URL=<url> npx tsx scripts/fix-prod-lock.ts
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$queryRaw<Array<{ pid: number; terminated: boolean }>>`
      SELECT a.pid AS pid, pg_terminate_backend(a.pid) AS terminated
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory' AND l.granted = true AND a.state = 'idle'
    `;
    console.log(`Terminated ${result.length} idle session(s) holding advisory locks:`);
    for (const r of result) console.log(`  pid=${r.pid} terminated=${r.terminated}`);

    // Verify the lock is now free.
    const tryLock = await prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(72707369) AS locked
    `;
    console.log(`\npg_try_advisory_lock(72707369) = ${tryLock[0]?.locked}`);
    if (tryLock[0]?.locked) {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(72707369)`;
      console.log("Lock is FREE — run migrate deploy now.");
    } else {
      console.log("Lock still held — re-run this script or check pg_stat_activity again.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Fix failed:", e);
  process.exit(1);
});
