// Find the AI Salon Tel Aviv event and its speakers.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const events = await db.event.findMany({
    where: { OR: [
      { title: { contains: "AI Salon Tel Aviv", mode: "insensitive" } },
      { title: { contains: "AI Salon", mode: "insensitive" } },
      { slug: { contains: "tel-aviv", mode: "insensitive" } },
      { slug: { contains: "salon", mode: "insensitive" } },
    ]},
    select: { id: true, title: true, slug: true, startsAt: true },
  });
  console.log("Matching events:");
  console.log(JSON.stringify(events, null, 2));

  // Also list all events just in case
  const allEvents = await db.event.findMany({
    select: { id: true, title: true, slug: true },
    orderBy: { startsAt: "desc" },
    take: 20,
  });
  console.log("\nAll recent events:");
  console.log(JSON.stringify(allEvents, null, 2));
} finally {
  await db.$disconnect();
}
