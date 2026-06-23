// Reverse-engineer the missing Prisma models from the production Neon DB.
// Dumps column info for each missing table so we can reconstruct the models.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLES = [
  "EmailCampaign",
  "EmailEvent",
  "EmailRecipient",
  "EmailTemplate",
  "EventRsvp",
  "EventCoHost",
];

async function describeTable(table: string) {
  console.log(`\n=== ${table} ===`);
  const cols = await prisma.$queryRaw`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
    ORDER BY ordinal_position;
  `;
  for (const c of cols as any[]) {
    console.log(
      `  ${c.column_name.padEnd(28)} ${c.data_type.padEnd(20)} null=${c.is_nullable.padEnd(3)} default=${c.column_default ?? "—"}`
    );
  }

  // Foreign keys
  const fks = await prisma.$queryRaw`
    SELECT
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = ${table}
      AND tc.constraint_type = 'FOREIGN KEY';
  `;
  if ((fks as unknown[]).length > 0) {
    console.log("  FKs:");
    for (const f of fks as any[]) {
      console.log(`    ${f.column_name} → ${f.foreign_table}.${f.foreign_column}`);
    }
  }

  // Indexes
  const idx = await prisma.$queryRaw`
    SELECT
      i.relname AS index_name,
      a.attname AS column_name,
      am.amname AS index_method
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_am am ON i.relam = am.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE t.relname = ${table}
      AND i.relname NOT LIKE '%_pkey';
  `;
  if ((idx as unknown[]).length > 0) {
    console.log("  Indexes:");
    for (const ix of idx as any[]) {
      console.log(`    ${ix.index_name} (${ix.index_method}) on ${ix.column_name}`);
    }
  }

  // Unique constraints
  const uniques = await prisma.$queryRaw`
    SELECT
      tc.constraint_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = ${table}
      AND tc.constraint_type = 'UNIQUE';
  `;
  if ((uniques as unknown[]).length > 0) {
    console.log("  Unique:");
    for (const u of uniques as any[]) {
      console.log(`    ${u.constraint_name} on ${u.column_name}`);
    }
  }
}

async function main() {
  for (const t of TABLES) {
    await describeTable(t);
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
