/**
 * Seed the local SQLite sandbox DB with the admin user + Israel/Tel Aviv
 * hierarchy so login works in dev.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts
 *
 * Idempotent — safe to re-run. Updates password/role if user already exists.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const db = new PrismaClient();

const ADMIN_EMAIL = "eze@massapro.com";
const ADMIN_PASSWORD = "Massapro2026!";
const ADMIN_NAME = "Eze Admin";

async function main() {
  // 1. Ensure Country Israel exists
  const israel = await db.country.upsert({
    where: { slug: "israel" },
    update: {},
    create: {
      name: "Israel",
      code: "IL",
      slug: "israel",
    },
  });
  console.log(`Country: ${israel.name} (${israel.id})`);

  // 2. Ensure Chapter Tel Aviv exists
  const telAviv = await db.chapter.upsert({
    where: { slug: "tel-aviv" },
    update: {},
    create: {
      name: "Tel Aviv",
      slug: "tel-aviv",
      countryId: israel.id,
    },
  });
  console.log(`Chapter: ${telAviv.name} (${telAviv.id})`);

  // 3. Hash the password
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  // 4. Upsert admin user
  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      passwordHash,
      role: "ADMIN",
      name: ADMIN_NAME,
    },
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      passwordHash,
      role: "ADMIN",
      countryId: israel.id,
      chapterId: telAviv.id,
    },
  });
  console.log(`Admin user: ${admin.email} (${admin.id}) — role: ${admin.role}`);

  // 5. Ensure a SiteSetting row exists so site-settings.ts doesn't error
  const existingSetting = await db.siteSetting.findFirst();
  if (!existingSetting) {
    await db.siteSetting.create({
      data: {
        key: "platformName",
        value: "AI Salon Tel Aviv",
      },
    });
    console.log("SiteSetting: created platformName row");
  } else {
    console.log(`SiteSetting: already has rows (first key: ${existingSetting.key})`);
  }

  console.log("\n✅ Seed complete.");
  console.log(`   Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
