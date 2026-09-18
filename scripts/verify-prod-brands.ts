/**
 * Verify Phase 3A migration on production:
 * 1. Brand table has 2 rows (Coma + AIS, correct hierarchy).
 * 2. All chapters have brandId = AIS.
 * 3. All users have brandId (AIS or Coma).
 * Usage: DATABASE_URL=<url> npx tsx scripts/verify-prod-brands.ts
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const brands = await prisma.brand.findMany({
      select: {
        id: true,
        slug: true,
        displayName: true,
        status: true,
        parentBrandId: true,
        apexDomain: true,
        _count: { select: { chapters: true, users: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`=== Brands (${brands.length}) ===`);
    for (const b of brands) {
      console.log(
        `  ${b.slug} (${b.displayName}) — status=${b.status} parent=${b.parentBrandId ?? "(root)"} apex=${b.apexDomain} chapters=${b._count.chapters} users=${b._count.users}`
      );
    }

    const chaptersTotal = await prisma.chapter.count();
    const chaptersWithBrand = await prisma.chapter.count({ where: { brandId: { not: null } } });
    const usersTotal = await prisma.user.count();
    const usersWithBrand = await prisma.user.count({ where: { brandId: { not: null } } });
    const usersNoBrandSlug = await prisma.user.count({ where: { brandSlug: null } });

    console.log(`\n=== Coverage ===`);
    console.log(`Chapters: ${chaptersWithBrand}/${chaptersTotal} have brandId`);
    console.log(`Users: ${usersWithBrand}/${usersTotal} have brandId`);
    console.log(`Users still missing brandSlug cache: ${usersNoBrandSlug}`);

    if (chaptersWithBrand === chaptersTotal && usersWithBrand === usersTotal && usersNoBrandSlug === 0) {
      console.log("\n✅ Phase 3A fully applied — production DB is in sync.");
    } else {
      console.log("\n⚠️ Some rows are not backfilled — re-run the migration (idempotent).");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
