#!/usr/bin/env node
/**
 * Configure the Vercel project `AISalon-MassaPro`:
 *   1. Ensure `aisalon.massapro.com` is added as a production domain
 *   2. Set / update env vars for production:
 *      - NEXTAUTH_URL=https://aisalon.massapro.com
 *      - NEXT_PUBLIC_SITE_URL=https://aisalon.massapro.com
 *      - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (already provided)
 *      - ADMIN_EMAIL=eze@massapro.com
 *      - NEXTAUTH_SECRET (generated if missing)
 *      - DATABASE_URL (Vercel Postgres connection string — must be set in dashboard)
 *
 * Usage:
 *   node /home/z/my-project/scripts/configure-vercel.mjs
 */
import fs from "node:fs/promises";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID = "prj_aoKtARAel8wlmcIlLRjjSPKshMLA";
const TEAM_ID = "team_xQgfSmNbNo5JFCAaVyRboPBf";
const PRODUCTION_DOMAIN = "aisalon.massapro.com";

if (!VERCEL_TOKEN) {
  console.error("ERROR: VERCEL_TOKEN env var is required.");
  process.exit(1);
}

const apiBase = "https://api.vercel.com/v9";
const common = {
  headers: {
    Authorization: `Bearer ${VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  },
};

async function getProject() {
  const url = `${apiBase}/projects/${PROJECT_ID}?teamId=${TEAM_ID}`;
  const res = await fetch(url, { headers: common.headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch project: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function addDomain(domain) {
  const url = `${apiBase}/projects/${PROJECT_ID}/domains?teamId=${TEAM_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: common.headers,
    body: JSON.stringify({
      name: domain,
      redirect: null,
      gitBranch: null,
    }),
  });
  if (res.ok) {
    console.log(`✓ Added domain: ${domain}`);
    return true;
  }
  const body = await res.text();
  // 409 = already exists, which is fine
  if (res.status === 409 || body.includes("already exists")) {
    console.log(`ℹ Domain already present: ${domain}`);
    return true;
  }
  console.warn(`⚠ Could not add domain ${domain}: ${res.status} ${body}`);
  return false;
}

async function listEnvs() {
  const url = `${apiBase}/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;
  const res = await fetch(url, { headers: common.headers });
  if (!res.ok) throw new Error(`listEnvs failed: ${res.status}`);
  const data = await res.json();
  return data.envs || [];
}

async function deleteEnv(envId) {
  const url = `${apiBase}/projects/${PROJECT_ID}/env/${envId}?teamId=${TEAM_ID}`;
  const res = await fetch(url, { method: "DELETE", headers: common.headers });
  return res.ok;
}

async function createEnv(key, value, target = ["production"]) {
  const url = `${apiBase}/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: common.headers,
    body: JSON.stringify({
      key,
      value,
      type: key.includes("SECRET") ? "encrypted" : "plain",
      target,
    }),
  });
  if (res.ok) {
    console.log(`✓ Created env var: ${key} (target: ${target.join(",")})`);
    return true;
  }
  console.warn(`⚠ Failed to create ${key}: ${res.status} ${await res.text()}`);
  return false;
}

async function upsertEnv(key, value, target = ["production"]) {
  const envs = await listEnvs();
  const matchingKey = envs.filter((e) => e.key === key);

  // If existing envs span multiple targets (e.g. set on dev/preview/prod),
  // delete them all and recreate as production-only for the prod URL.
  if (matchingKey.length > 0) {
    const alreadyCorrect = matchingKey.some(
      (e) =>
        JSON.stringify(e.target || []) === JSON.stringify(target)
    );
    if (alreadyCorrect && matchingKey.length === 1) {
      // Update in place
      const existing = matchingKey[0];
      const url = `${apiBase}/projects/${PROJECT_ID}/env/${existing.id}?teamId=${TEAM_ID}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: common.headers,
        body: JSON.stringify({
          value,
          type: key.includes("SECRET") ? "encrypted" : "plain",
          target,
        }),
      });
      if (res.ok) {
        console.log(`✓ Updated env var: ${key} (target: ${target.join(",")})`);
        return true;
      }
      console.warn(`⚠ Failed to update ${key}: ${res.status} ${await res.text()}`);
      return false;
    }

    // Delete all existing entries for this key, then recreate with desired target
    for (const e of matchingKey) {
      await deleteEnv(e.id);
      console.log(`   Deleted existing ${key} (id=${e.id}, target=${(e.target || []).join(",")})`);
    }
  }
  return createEnv(key, value, target);
}

async function main() {
  console.log("=== AI Salon Tel Aviv — Vercel project configuration ===\n");

  // 1. Fetch project + check domains
  console.log("1. Fetching project info…");
  const project = await getProject();
  console.log(`   Project name: ${project.name}`);
  const domains = (project.targets?.production?.alias || []).concat(project.alias || []);
  console.log(`   Current aliases: ${domains.join(", ") || "(none)"}`);

  const hasProdDomain =
    domains.includes(PRODUCTION_DOMAIN) ||
    (project.targets?.production?.customDomains || []).some((d) => d.name === PRODUCTION_DOMAIN);

  if (!hasProdDomain) {
    console.log(`\n2. Adding production domain: ${PRODUCTION_DOMAIN}`);
    await addDomain(PRODUCTION_DOMAIN);
  } else {
    console.log(`\n2. Production domain already attached: ${PRODUCTION_DOMAIN} ✓`);
  }

  // 3. Set env vars — only the URL-related ones. OAuth + admin + secret
  //    are already set on the Vercel project, so we leave them alone.
  console.log("\n3. Setting production env vars…");

  await upsertEnv("NEXTAUTH_URL", `https://${PRODUCTION_DOMAIN}`, ["production"]);
  await upsertEnv("NEXT_PUBLIC_SITE_URL", `https://${PRODUCTION_DOMAIN}`, ["production"]);

  // Other env vars — verify presence only
  const existingEnvs = await listEnvs();
  const requiredKeys = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "ADMIN_EMAIL",
    "NEXTAUTH_SECRET",
    "DATABASE_URL",
  ];
  console.log("\n   Verifying required env vars are present…");
  for (const k of requiredKeys) {
    const found = existingEnvs.some((e) => e.key === k);
    console.log(`   ${found ? "✓" : "⚠ MISSING"} ${k}`);
  }

  // 4. Verify domains after
  console.log("\n4. Re-fetching project to verify…");
  const finalProject = await getProject();
  const finalAliases = (finalProject.targets?.production?.alias || []).concat(finalProject.alias || []);
  console.log(`   Final aliases: ${finalAliases.join(", ") || "(none)"}`);

  console.log("\n=== Done ===");
  console.log(`Production URL: https://${PRODUCTION_DOMAIN}`);
  console.log("\nNote: For Google OAuth to work in production, add this redirect URI");
  console.log("to the Google Cloud Console OAuth client:");
  console.log(`  https://${PRODUCTION_DOMAIN}/api/auth/callback/google`);
  console.log("\nAlso note: For production DB, set DATABASE_URL to a Vercel Postgres");
  console.log("or Turso connection string in the Vercel project env vars.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
