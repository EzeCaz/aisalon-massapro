/**
 * Backfill `utmUid` for all existing users.
 *
 * Generates a unique 12-char lowercase hex string for every user that
 * doesn't have one yet. Retries on collision (extremely unlikely with
 * 12 hex chars = 16^12 = 281 trillion possibilities, but defensive).
 *
 * Usage:
 *   DATABASE_URL=<postgres-url> npx tsx scripts/backfill-utm-uid.ts
 *
 * Safe to re-run — only touches users with utmUid = null.
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const db = new PrismaClient();

/** 12-char lowercase hex (6 random bytes). 16^12 ≈ 2.8×10^14 possibilities. */
function generateUtmUid(): string {
  return crypto.randomBytes(6).toString("hex");
}

async function main() {
  const users = await db.user.findMany({
    where: { utmUid: null },
    select: { id: true, email: true, name: true },
  });
  console.log(`[backfill-utm-uid] ${users.length} users need utmUid`);

  let updated = 0;
  let retried = 0;
  for (const u of users) {
    let attempts = 0;
    while (attempts < 5) {
      try {
        const uid = generateUtmUid();
        await db.user.update({
          where: { id: u.id },
          data: { utmUid: uid },
        });
        updated++;
        if (updated % 50 === 0) {
          console.log(`  ... ${updated}/${users.length} done`);
        }
        break;
      } catch (err: unknown) {
        // P2002 = unique constraint violation — collision, retry
        const code = (err as { code?: string })?.code;
        if (code === "P2002") {
          attempts++;
          retried++;
          continue;
        }
        throw err;
      }
    }
  }
  console.log(
    `[backfill-utm-uid] done. updated=${updated}, retries=${retried}, total=${users.length}`
  );
}

main()
  .catch((err) => {
    console.error("[backfill-utm-uid] FAILED:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
