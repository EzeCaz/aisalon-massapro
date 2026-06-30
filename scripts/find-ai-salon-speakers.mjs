// Find the AI Salon event + list its speakers.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  // The AI Salon Tel Aviv event has slug "ai-salon-human"
  // (per /home/z/my-project/scripts/find-ai-salon-event.mjs output).
  const event = await db.event.findUnique({
    where: { slug: "ai-salon-human" },
    select: { id: true, title: true, slug: true, startsAt: true },
  });
  console.log("Event:", JSON.stringify(event, null, 2));

  const speakers = await db.speaker.findMany({
    where: { eventId: event.id },
    select: { id: true, name: true, role: true, company: true, order: true },
    orderBy: { order: "asc" },
  });
  console.log("\nSpeakers (" + speakers.length + " total):");
  for (const s of speakers) {
    console.log(`  [${s.order}] ${s.name} — ${s.role || "?"} @ ${s.company || "?"} (id=${s.id})`);
  }

  // Also check if there are any existing EventPrepQuestion rows for this event
  const existingQs = await db.eventPrepQuestion.count({
    where: { eventId: event.id },
  });
  console.log(`\nExisting EventPrepQuestion rows for this event: ${existingQs}`);
} finally {
  await db.$disconnect();
}
