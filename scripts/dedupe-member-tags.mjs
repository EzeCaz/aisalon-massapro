// One-off: dedupe MemberTag.label so we can add the unique constraint.
// MemberTag has a direct `userId` FK (no join table), so we just delete
// duplicate rows (keep the oldest per label).
// Run once: node scripts/dedupe-member-tags.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find duplicate labels
  const dups = await prisma.$queryRaw`
    SELECT label, COUNT(*)::int AS n
    FROM "MemberTag"
    GROUP BY label
    HAVING COUNT(*) > 1
    ORDER BY n DESC
  `;
  console.log(`Found ${dups.length} duplicate label(s).`);
  if (dups.length === 0) return;

  for (const d of dups) {
    // Find all tags with this label, keep the first (oldest), delete the rest.
    const tags = await prisma.memberTag.findMany({
      where: { label: d.label },
      orderBy: { createdAt: "asc" },
    });
    const keep = tags[0];
    const remove = tags.slice(1);
    console.log(`  "${d.label}" appears ${tags.length}× — keeping ${keep.id} (createdAt=${keep.createdAt.toISOString()}), removing ${remove.length} duplicate(s).`);
    for (const r of remove) {
      await prisma.memberTag.delete({ where: { id: r.id } });
    }
  }
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
