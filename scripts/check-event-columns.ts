// Check the Event table for mainImageId column (referenced in code but missing from schema)
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Event'
    ORDER BY ordinal_position;
  `;
  console.log("=== Event table columns ===");
  for (const c of cols as any[]) {
    console.log(`  ${c.column_name.padEnd(28)} ${c.data_type.padEnd(20)} null=${c.is_nullable}`);
  }
}
main().finally(() => prisma.$disconnect());
