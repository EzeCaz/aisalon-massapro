// Quick verification — list PresentationFile columns and confirm schema is live
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Count rows
  const count = await prisma.presentationFile.count();
  console.log("PresentationFile row count:", count);

  // 2. Try fetching the first 5 — should return [] even if no data
  const rows = await prisma.presentationFile.findMany({
    take: 5,
    include: {
      uploader: { select: { id: true, name: true, email: true } },
      speakers: { select: { id: true, name: true } },
      agendaItem: { select: { id: true, title: true } },
    },
  });
  console.log("Sample rows:", JSON.stringify(rows, null, 2));

  // 3. Show the relations work — fetch all events with their presentations count
  const events = await prisma.event.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      _count: { select: { presentations: true, images: true } },
    },
  });
  console.log("Events with presentation counts:");
  for (const e of events) {
    console.log(
      `  - ${e.slug}: ${e._count.presentations} presentations, ${e._count.images} images`
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("ERROR:", e);
    prisma.$disconnect();
    process.exit(1);
  });
