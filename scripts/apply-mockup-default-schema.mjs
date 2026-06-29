// Apply EventMockupDefault schema change to production DB.
// Usage: node scripts/apply-mockup-default-schema.mjs
//
// This script:
//   1. Fetches DATABASE_URL from Vercel project env (decrypted)
//   2. Connects via Prisma Client (already generated)
//   3. Runs the raw SQL to create EventMockupDefault table + indices
//   4. Prints success/failure
//
// We use raw SQL via $executeRawUnsafe because prisma db push fails
// due to unrelated P2002 errors on other tables.

import { PrismaClient } from "@prisma/client";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_aoKtARAel8wlmcIlLRjjSPKshMLA";
if (!VERCEL_TOKEN) {
  console.error("ERROR: set VERCEL_TOKEN env var (Vercel PAT with project env read access)");
  process.exit(1);
}

async function getProdDatabaseUrl() {
  // Get the env var ID for DATABASE_URL
  const listRes = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
  );
  const listData = await listRes.json();
  const envEntry = (listData.envs || []).find((e) => e.key === "DATABASE_URL");
  if (!envEntry) throw new Error("DATABASE_URL not found in Vercel env");
  const envId = envEntry.id;

  // Decrypt it
  const decRes = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${envId}`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
  );
  const decData = await decRes.json();
  if (!decData.value) throw new Error("Failed to decrypt DATABASE_URL");
  return decData.value;
}

async function main() {
  const dbUrl = await getProdDatabaseUrl();
  console.log("Got DATABASE_URL (length=" + dbUrl.length + ")");

  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    console.log("Creating EventMockupDefault table...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EventMockupDefault" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "dataJson" TEXT NOT NULL,
          "imageUrl" TEXT NOT NULL,
          "caption" TEXT,
          "eventImageId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "EventMockupDefault_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log("✓ Table created");

    console.log("Creating unique index on (eventId, type)...");
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "EventMockupDefault_eventId_type_key"
      ON "EventMockupDefault"("eventId", "type")
    `);
    console.log("✓ Unique index created");

    console.log("Creating index on (eventId)...");
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EventMockupDefault_eventId_idx"
      ON "EventMockupDefault"("eventId")
    `);
    console.log("✓ Index created");

    console.log("Adding FK constraint to Event...");
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "EventMockupDefault"
        ADD CONSTRAINT "EventMockupDefault_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "Event"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
      `);
      console.log("✓ FK added");
    } catch (e) {
      if (String(e).includes("already exists")) {
        console.log("✓ FK already exists, skipping");
      } else {
        throw e;
      }
    }

    console.log("");
    console.log("✅ All schema changes applied successfully");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ FAILED:", err);
  process.exit(1);
});
