/**
 * One-time backfill: for every Speaker with no userId but with a
 * contactEmail set, look up the matching User and link them. Also
 * tries to auto-link by name when the speaker has no contactEmail
 * (e.g. Ezequiel Sznaider → user Ezequiel Sznaider).
 *
 * Run with: npx tsx scripts/backfill-speaker-users.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const speakers = await db.speaker.findMany({
    where: { userId: null },
    select: { id: true, name: true, contactEmail: true },
  });

  console.log(`Found ${speakers.length} speakers without a linked user.`);

  let linkedByEmail = 0;
  let linkedByName = 0;
  let skipped = 0;

  for (const s of speakers) {
    // 1. Try by contactEmail
    if (s.contactEmail) {
      const u = await db.user.findUnique({
        where: { email: s.contactEmail.toLowerCase() },
        select: { id: true, email: true, name: true },
      });
      if (u) {
        await db.speaker.update({
          where: { id: s.id },
          data: { userId: u.id },
        });
        console.log(`  [email] ${s.name} → ${u.email}`);
        linkedByEmail++;
        continue;
      }
    }

    // 2. Try by name (case-insensitive exact match)
    if (s.name) {
      const u = await db.user.findFirst({
        where: { name: { equals: s.name, mode: "insensitive" } },
        select: { id: true, email: true, name: true },
      });
      if (u) {
        await db.speaker.update({
          where: { id: s.id },
          data: { userId: u.id, contactEmail: u.email },
        });
        console.log(`  [name]  ${s.name} → ${u.email}`);
        linkedByName++;
        continue;
      }
    }

    skipped++;
  }

  console.log("\nDone.");
  console.log(`  Linked by email: ${linkedByEmail}`);
  console.log(`  Linked by name:  ${linkedByName}`);
  console.log(`  Skipped (no match): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
