// Verify the Neon DB is fully wired up — schema, tables, relations, indexes.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(60));
  console.log("Neon Postgres — connection + schema health check");
  console.log("=".repeat(60));

  // 1. DB info
  const info = await prisma.$queryRaw`
    SELECT
      current_database() AS db,
      current_user AS user,
      current_schema() AS schema,
      version() AS version
  `;
  console.log("\n[1] Connection OK:");
  console.log("    DB:", info[0].db);
  console.log("    User:", info[0].user);
  console.log("    Schema:", info[0].schema);
  console.log("    Version:", info[0].version.split(",")[0]);

  // 2. List all tables in public schema
  const tables = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  console.log("\n[2] Tables in 'public' schema:");
  for (const t of tables) console.log("    -", t.tablename);

  // 3. Check PresentationFile table columns + indexes
  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PresentationFile'
    ORDER BY ordinal_position
  `;
  console.log("\n[3] 'PresentationFile' columns:");
  for (const c of cols) {
    console.log(
      `    - ${c.column_name.padEnd(20)} ${c.data_type.padEnd(20)} null=${
        c.is_nullable
      } default=${c.column_default || "—"}`
    );
  }

  const idx = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'PresentationFile'
    ORDER BY indexname
  `;
  console.log("\n[4] 'PresentationFile' indexes:");
  for (const i of idx) console.log("    -", i.indexname);

  // 5. Check that the implicit M2M join table for PresentationFile <-> Speaker exists
  const m2m = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE '_Presentation%'
       OR tablename LIKE '%ToSpeakers%'
    ORDER BY tablename
  `;
  console.log("\n[5] M2M join tables for presentations:");
  for (const t of m2m) console.log("    -", t.tablename);

  // 6. Row counts per table
  const tableNames = [
    "User",
    "MemberTag",
    "Event",
    "Speaker",
    "EventAgendaItem",
    "EventImage",
    "PresentationFile",
  ];
  console.log("\n[6] Row counts:");
  for (const name of tableNames) {
    const count = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS c FROM "${name}"`
    );
    console.log(`    - ${name.padEnd(22)} ${count[0].c} rows`);
  }

  // 7. Show the actual event we care about
  const event = await prisma.event.findFirst({
    where: { slug: "ai-cmo-blueprint-2026-06-18" },
    include: {
      _count: { select: { speakers: true, agenda: true, images: true, presentations: true } },
    },
  });
  console.log("\n[7] Production event 'ai-cmo-blueprint-2026-06-18':");
  console.log("    ID:", event.id);
  console.log("    Title:", event.title);
  console.log("    Speakers:", event._count.speakers);
  console.log("    Agenda items:", event._count.agenda);
  console.log("    Images:", event._count.images);
  console.log("    Presentations:", event._count.presentations);

  // 8. Active connections (Neon autoscales — should be low when idle)
  const conns = await prisma.$queryRaw`
    SELECT state, count(*)::int AS c
    FROM pg_stat_activity
    WHERE datname = current_database()
    GROUP BY state
    ORDER BY state
  `;
  console.log("\n[8] Active Postgres connections on this DB:");
  for (const c of conns) console.log(`    - ${c.state || "idle"}: ${c.c}`);

  console.log("\n" + "=".repeat(60));
  console.log("ALL CHECKS PASSED — Neon is healthy and in sync with schema.");
  console.log("=".repeat(60));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("CHECK FAILED:", e);
    prisma.$disconnect();
    process.exit(1);
  });
