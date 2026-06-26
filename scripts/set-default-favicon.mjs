#!/usr/bin/env node
/**
 * Set the favicon to the meerkat brand image on production Neon.
 *
 * The admin had previously tried to set the favicon via /admin/images but
 * it failed because the SiteSetting table didn't exist. Now that the
 * table is created (via apply-v4.9-schema-changes.mjs), this script
 * sets a sensible default favicon so the platform has one immediately.
 *
 * The user can still change it later via /admin/images.
 */
const DATABASE_URL =
  "postgresql://neondb_owner:npg_7DLHiSkO1EAf@ep-restless-voice-at8gnuqn-pooler.c-9.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

const FAVICON_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
    log: ["warn", "error"],
  });

  // Check if favicon is already set
  const existing = await prisma.siteSetting.findUnique({
    where: { key: "favicon" },
  });
  if (existing) {
    console.log(`[INFO] favicon already set to: ${existing.value}`);
    console.log("[INFO] not overwriting — admin can change via /admin/images");
    await prisma.$disconnect();
    return;
  }

  // Set favicon to the meerkat brand image
  await prisma.siteSetting.upsert({
    where: { key: "favicon" },
    create: { key: "favicon", value: FAVICON_URL },
    update: { value: FAVICON_URL },
  });
  console.log(`[OK] favicon set to: ${FAVICON_URL}`);

  // Also check loginHero + loginBanner (should already be set from prior attempts)
  const all = await prisma.siteSetting.findMany();
  console.log("\n[INFO] Current SiteSetting rows:");
  for (const row of all) {
    console.log(`  - ${row.key} = ${row.value.slice(0, 80)}${row.value.length > 80 ? "..." : ""}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[ERR]", e);
  process.exit(1);
});
