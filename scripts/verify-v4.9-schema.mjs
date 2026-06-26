#!/usr/bin/env node
/**
 * Verify the V4.9 schema migration by checking which tables/columns exist.
 */
const DATABASE_URL =
  "postgresql://neondb_owner:npg_7DLHiSkO1EAf@ep-restless-voice-at8gnuqn-pooler.c-9.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
    log: ["error"],
  });

  // Check SiteSetting table
  try {
    const settings = await prisma.$queryRaw`
      SELECT key, value, "updatedAt" FROM "SiteSetting" ORDER BY key
    `;
    console.log("[OK] SiteSetting table exists. Rows:", settings.length);
    for (const row of settings) {
      console.log(`     - ${row.key} = ${row.value.slice(0, 80)}${row.value.length > 80 ? "..." : ""}`);
    }
  } catch (err) {
    console.log("[FAIL] SiteSetting table missing:", err.message);
  }

  // Check User.archivedAt
  try {
    const cols = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'User' AND column_name IN ('archivedAt', 'archivedBy')
    `;
    console.log("[OK] User archive columns:", cols.map((c) => c.column_name).join(", "));
  } catch (err) {
    console.log("[FAIL] User archive columns missing:", err.message);
  }

  // Check EventRsvp.checkInCode
  try {
    const cols = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'EventRsvp' AND column_name IN ('checkInCode', 'checkedInAt', 'doorCheckedAt', 'doorCheckedBy')
    `;
    console.log("[OK] EventRsvp check-in columns:", cols.map((c) => c.column_name).join(", "));
  } catch (err) {
    console.log("[FAIL] EventRsvp check-in columns missing:", err.message);
  }

  // Check EventCoHost table
  try {
    const count = await prisma.$queryRaw`SELECT COUNT(*)::int as n FROM "EventCoHost"`;
    console.log(`[OK] EventCoHost table exists. Rows: ${count[0].n}`);
  } catch (err) {
    console.log("[FAIL] EventCoHost table missing:", err.message);
  }

  // Check _EventAgendaItemToSpeaker join table
  try {
    const count = await prisma.$queryRaw`SELECT COUNT(*)::int as n FROM "_EventAgendaItemToSpeaker"`;
    console.log(`[OK] _EventAgendaItemToSpeaker table exists. Rows: ${count[0].n}`);
  } catch (err) {
    console.log("[FAIL] _EventAgendaItemToSpeaker table missing:", err.message);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[ERR]", e);
  process.exit(1);
});
