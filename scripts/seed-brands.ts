/**
 * Phase 3A data migration — seed the Brand table + backfill brandId.
 *
 * Creates:
 *   1. Coma Brand row (parent, status=ACTIVE, parentBrandId=null).
 *   2. AIS Brand row (child of Coma, status=ACTIVE, parentBrandId=Coma.id).
 *
 * Backfills (per user decisions 2026-09-17):
 *   - All existing chapters: brandId = AIS.id (preserves AIS user experience).
 *   - All existing users: brandId = AIS.id (preserves AIS user experience
 *     for legacy users with brandSlug=null).
 *   - Existing users with brandSlug="coma": brandId = Coma.id (they
 *     explicitly chose Coma).
 *
 * Idempotent: re-running the script is safe — it uses upsert for the Brand
 * rows and conditional updates (only sets brandId where it's null) for
 * the backfill. Safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/seed-brands.ts
 * (or via the SQLite sandbox: npx tsx scripts/seed-brands.ts --sqlite)
 */

import { PrismaClient } from "@prisma/client";

// Brand seed values — mirror the hardcoded BRANDS registry in
// src/lib/brand/brand-config.ts. These are the SOURCE OF TRUTH for
// the initial 2 brands. Phase 3B will switch code reads from the
// hardcoded registry to the DB.
const COMA_SEED = {
  slug: "coma",
  displayName: "Coma",
  wordmark: "coma",
  tagline: "Building the Operating System for Communities",
  primaryColor: "#0A1F44",
  accentColor: "#F5A623",
  secondaryColor: "#E84855",
  gradient:
    "conic-gradient(from 180deg at 50% 50%, #E84855, #0A1F44, #F5A623, #E84855)",
  heroBannerUrl:
    "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1786481988015-r315qt.png",
  faviconUrl: "/brand/coma/favicon-32.png",
  logoUrl: "/brand/coma/logo.png",
  // emailLogoUrl: null (uses global SiteSetting default for now)
  loginEyebrowTemplate: "{chapterName} Chapter",
  loginHeadlineTemplate:
    "The home for {accentSpanOpen}community builders{accentSpanClose} in {chapterName}.",
  loginSubtitle:
    "Log in to access the Coma platform — manage your chapter, host events, onboard new members, and orchestrate your community's growth with the Coma operating system.",
  loginFormHeading: "Welcome to Coma",
  loginFormSubheadingTemplate:
    "Sign in with Google, or use your email and password to access the Coma {chapterName} platform.",
  footerCredit: "Platform by MassaPro · Powered by Coma",
  emailFromName: "Coma <coma@massapro.com>",
  emailContactEmail: "coma@massapro.com",
  domainArchitecture: "single",
  apexDomain: "platform.joincoma.com",
  appDomain: "platform.joincoma.com",
  // legacyDomains: ["coma.massapro.com"] — handled via middleware redirect,
  // not stored here for the SQLite sandbox (Json field); stored as a real
  // array on Postgres.
  status: "ACTIVE",
  onboardedAt: new Date(),
};

const AIS_SEED = {
  slug: "aisalon",
  displayName: "AI Salon",
  wordmark: "aisalon",
  tagline: "Empowering AI Connections",
  primaryColor: "#004F98",
  accentColor: "#00E6FF",
  secondaryColor: "#FF005A",
  gradient:
    "conic-gradient(from 180deg at 50% 50%, #FF005A, #820A7D, #004F98, #00E6FF, #FF005A)",
  // AIS has no brand-level assets (uses SiteSetting defaults + chapter
  // loginHero for the meerkat photo). All asset URLs are null.
  heroBannerUrl: null,
  faviconUrl: null,
  logoUrl: null,
  emailLogoUrl: null,
  loginEyebrowTemplate: "{chapterName} Chapter",
  loginHeadlineTemplate:
    "The community for {accentSpanOpen}AI builders{accentSpanClose} in {chapterName}.",
  loginSubtitle:
    "Log in to access events, upload photos from our gatherings, browse the shared slideshow, and connect with fellow founders, CMOs, investors and AI builders.",
  loginFormHeading: "Welcome",
  loginFormSubheadingTemplate:
    "Sign in with Google, or use your email and password to access the AI Salon {chapterName} community.",
  footerCredit: "Platform by MassaPro · Powered by AI Salon",
  emailFromName: "AI Salon <noreply@aisalon.massapro.com>",
  emailContactEmail: "aisalon@massapro.com",
  domainArchitecture: "single",
  apexDomain: "aisalon.massapro.com",
  appDomain: "aisalon.massapro.com",
  status: "ACTIVE",
  onboardedAt: new Date(),
};

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("=== Phase 3A: Brand table seed + brandId backfill ===\n");

    // 1. Upsert Coma (parent brand — parentBrandId = null).
    console.log("→ Upserting Coma brand (parent)...");
    const coma = await prisma.brand.upsert({
      where: { slug: "coma" },
      create: { ...COMA_SEED, parentBrandId: null },
      update: { ...COMA_SEED, parentBrandId: null },
    });
    console.log(`  ✓ Coma id=${coma.id} slug=${coma.slug} status=${coma.status}`);

    // 2. Upsert AIS (child of Coma).
    console.log("→ Upserting AIS brand (child of Coma)...");
    const ais = await prisma.brand.upsert({
      where: { slug: "aisalon" },
      create: { ...AIS_SEED, parentBrandId: coma.id },
      update: { ...AIS_SEED, parentBrandId: coma.id },
    });
    console.log(`  ✓ AIS id=${ais.id} slug=${ais.slug} status=${ais.status} parent=${ais.parentBrandId}`);

    // 3. Backfill chapters: brandId = AIS.id where brandId is null.
    // Per user decision #1: all existing chapters (Tel Aviv, Montreal)
    // become AIS chapters. New Coma chapters will be created fresh via
    // the new onboarding flow in Phase 3C.
    console.log("\n→ Backfilling chapters: brandId = AIS where null...");
    const chaptersUpdated = await prisma.chapter.updateMany({
      where: { brandId: null },
      data: { brandId: ais.id },
    });
    console.log(`  ✓ ${chaptersUpdated.count} chapter(s) backfilled to AIS`);

    // 4. Backfill users: brandId based on existing brandSlug.
    // Per user decision #2: users with brandSlug=null (legacy AIS users)
    // → brandId = AIS.id (preserves their experience).
    // Users with brandSlug="coma" → brandId = Coma.id.
    console.log("\n→ Backfilling users: brandId based on brandSlug...");
    const usersAis = await prisma.user.updateMany({
      where: { brandId: null, OR: [{ brandSlug: "aisalon" }, { brandSlug: null }] },
      data: { brandId: ais.id },
    });
    console.log(`  ✓ ${usersAis.count} user(s) backfilled to AIS (brandSlug=null or 'aisalon')`);
    const usersComa = await prisma.user.updateMany({
      where: { brandId: null, brandSlug: "coma" },
      data: { brandId: coma.id },
    });
    console.log(`  ✓ ${usersComa.count} user(s) backfilled to Coma (brandSlug='coma')`);

    // 5. Summary.
    console.log("\n=== Migration complete ===");
    const brandCount = await prisma.brand.count();
    const chaptersWithBrand = await prisma.chapter.count({ where: { brandId: { not: null } } });
    const chaptersWithoutBrand = await prisma.chapter.count({ where: { brandId: null } });
    const usersWithBrand = await prisma.user.count({ where: { brandId: { not: null } } });
    const usersWithoutBrand = await prisma.user.count({ where: { brandId: null } });
    console.log(`Brands: ${brandCount} (expected: 2 — Coma + AIS)`);
    console.log(`Chapters: ${chaptersWithBrand} with brandId, ${chaptersWithoutBrand} without`);
    console.log(`Users: ${usersWithBrand} with brandId, ${usersWithoutBrand} without`);
    if (chaptersWithoutBrand > 0 || usersWithoutBrand > 0) {
      console.log("⚠️  Some rows still have null brandId — re-run the script to retry.");
    } else {
      console.log("✓ All chapters + users have a brandId.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Phase 3A migration failed:", err);
  process.exit(1);
});
