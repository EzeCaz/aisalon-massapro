// Backfill referral codes for existing users.
//
// Every user should have a unique referralCode so their share links work.
// New users get one at signup (see src/app/api/auth/signup/route.ts),
// but users created before v5.17 don't. This script backfills them.
//
// Run with:
//   DATABASE_URL=$(grep '^DATABASE_URL=' /tmp/vercel-env/.env.production | cut -d'=' -f2- | tr -d '"') \
//   node scripts/backfill-referral-codes.mjs

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/**
 * Generates a SAL-{base36(timestamp)}-{random6} referral code.
 * Matches the format in src/app/api/auth/signup/route.ts.
 */
function generateReferralCode(): string {
  return `SAL-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

try {
  // Find all users without a referralCode
  const users = await db.user.findMany({
    where: {
      OR: [{ referralCode: null }, { referralCode: "" }],
    },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  console.log(`Found ${users.length} user(s) without a referralCode.`);

  if (users.length === 0) {
    console.log("Nothing to do — every user already has a referralCode.");
    process.exit(0);
  }

  let updated = 0;
  let failed = 0;
  for (const user of users) {
    // Try up to 5 times in case of uniqueness collisions (extremely unlikely)
    let success = false;
    for (let attempt = 1; attempt <= 5 && !success; attempt++) {
      try {
        const code = generateReferralCode();
        await db.user.update({
          where: { id: user.id },
          data: {
            referralCode: code,
            referralCodeSetAt: new Date(),
          },
        });
        console.log(`  ✓ ${user.email.padEnd(40)}  →  ${code}`);
        updated++;
        success = true;
      } catch (err) {
        if (attempt === 5) {
          console.error(`  ✗ ${user.email} — failed after 5 attempts:`, err);
          failed++;
        }
        // else: retry with a new code
      }
    }
  }

  console.log("");
  console.log(`Done. Updated: ${updated}. Failed: ${failed}.`);
} finally {
  await db.$disconnect();
}
