// Quick verify of import counts
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const all = await db.user.findMany({
    where: { importSource: { not: null } },
    select: {
      email: true,
      name: true,
      company: true,
      appliedFor: true,
      invitedToSpeak: true,
      mobile: true,
    },
    take: 5,
  });
  console.log("Sample imported users (first 5):");
  console.table(all);

  const total = await db.user.count();
  const imported = await db.user.count({ where: { importSource: { not: null } } });
  const fastPitch = await db.user.count({ where: { appliedFor: "Fast pitch" } });
  const presentation = await db.user.count({ where: { appliedFor: "Presentation/Lecure" } });
  const invited = await db.user.count({ where: { invitedToSpeak: "Yes" } });
  console.log("\nCounts:");
  console.log({ total, imported, fastPitch, presentation, invited });

  await db.$disconnect();
})();
