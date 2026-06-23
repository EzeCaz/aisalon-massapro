#!/usr/bin/env node
/**
 * Pull production env vars from Vercel (DATABASE_URL), then inspect the Neon
 * Postgres DB directly to see what tables actually exist in production.
 *
 * Usage:
 *   VERCEL_TOKEN=... node /home/z/my-project/scripts/inspect-prod-db.mjs
 */
import { PrismaClient } from "@prisma/client";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID = "prj_aoKtARAel8wlmcIlLRjjSPKshMLA";
const TEAM_ID = "team_xQgfSmNbNo5JFCAaVyRboPBf";

if (!VERCEL_TOKEN) {
  console.error("ERROR: VERCEL_TOKEN env var is required.");
  process.exit(1);
}

async function getProdEnv() {
  // List env vars for the project
  const url = `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch env vars: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // Find DATABASE_URL with target=production
  const prod = (data.envs || []).find(
    (e) => e.key === "DATABASE_URL" && (e.target || []).includes("production")
  );
  if (!prod) {
    console.log("Available env keys:", (data.envs || []).map((e) => e.key).join(", "));
    throw new Error("No DATABASE_URL with target=production found.");
  }
  // Vercel returns encrypted values by default. Need to fetch decrypted value
  // via the /v9/projects/{id}/env/{envId} endpoint with decrypt=true.
  console.log(`  Found env var: id=${prod.id} type=${prod.type}`);
  if (prod.type === "encrypted") {
    console.log("  Value is encrypted — fetching decrypted...");
    const decUrl = `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${prod.id}?teamId=${TEAM_ID}&decrypt=true`;
    const decRes = await fetch(decUrl, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    });
    if (!decRes.ok) {
      throw new Error(`Failed to decrypt: ${decRes.status} ${await decRes.text()}`);
    }
    const decData = await decRes.json();
    return decData.value;
  }
  return prod.value;
}

async function inspect(dbUrl) {
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  console.log("\n=== ALL TABLES in production Neon DB ===");
  const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  for (const t of tables) {
    console.log(`  ${t.table_name}`);
  }
  console.log(`Total: ${tables.length} tables`);

  const emailRelated = tables.filter(
    (t) =>
      t.table_name.toLowerCase().includes("email") ||
      t.table_name.toLowerCase().includes("campaign") ||
      t.table_name.toLowerCase().includes("template") ||
      t.table_name.toLowerCase().includes("rsvp") ||
      t.table_name.toLowerCase().includes("cohost") ||
      t.table_name.toLowerCase().includes("co_host")
  );
  console.log("\n=== Email/Campaign/Template/Rsvp/CoHost tables ===");
  if (emailRelated.length === 0) {
    console.log("  (none — these models are NOT in production DB)");
  } else {
    for (const t of emailRelated) {
      console.log(`  ${t.table_name}`);
    }

    console.log("\n=== Column info for each ===");
    for (const t of emailRelated) {
      console.log(`\n  -- ${t.table_name} --`);
      const cols = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${t.table_name}
        ORDER BY ordinal_position;
      `;
      for (const c of cols) {
        console.log(
          `     ${c.column_name.padEnd(28)} ${c.data_type.padEnd(18)} null=${c.is_nullable.padEnd(3)} default=${c.column_default ?? "—"}`
        );
      }

      const count = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "${t.table_name}"`
      );
      console.log(`     ROW COUNT: ${count[0].n}`);
    }
  }

  await prisma.$disconnect();
}

(async () => {
  try {
    console.log("Fetching DATABASE_URL from Vercel project env vars...");
    const dbUrl = await getProdEnv();
    console.log("✓ Got DATABASE_URL (length:", dbUrl.length, ")");

    // Show prefix and structure (mask password for safety in logs)
    console.log("  First 30 chars:", dbUrl.slice(0, 30));
    console.log("  Last 80 chars: ", dbUrl.slice(-80));

    // Some Vercel env vars come back as JSON-stringified or with extra
    // quoting. Normalize.
    let url = dbUrl.trim();
    if (url.startsWith('"') && url.endsWith('"')) {
      url = url.slice(1, -1);
    }
    // Strip any leading type/scheme that isn't postgres
    const pgMatch = url.match(/(postgres(?:ql)?:\/\/.+)/);
    if (pgMatch) {
      url = pgMatch[1];
    }
    console.log("  Normalized prefix:", url.slice(0, 40));

    await inspect(url);
  } catch (e) {
    console.error("FATAL:", e.message);
    process.exit(1);
  }
})();
