// Quick check: what tables exist in the production Neon DB?
// Run with: DATABASE_URL=... npx tsx scripts/check-db-tables.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  console.log("=== Tables in production Neon DB ===");
  for (const t of tables as { table_name: string }[]) {
    console.log(`  ${t.table_name}`);
  }
  console.log(`\nTotal: ${(tables as unknown[]).length} tables`);

  const emailTables = (tables as { table_name: string }[])
    .map((t) => t.table_name)
    .filter((n) => n.toLowerCase().includes("email") || n.toLowerCase().includes("campaign") || n.toLowerCase().includes("template") || n.toLowerCase().includes("rsvp") || n.toLowerCase().includes("cohost") || n.toLowerCase().includes("co_host"));

  console.log("\n=== Email/Campaign/Template/CoHost tables ===");
  for (const t of emailTables) {
    console.log(`  ${t}`);
  }
  if (emailTables.length === 0) {
    console.log("  (none found)");
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
