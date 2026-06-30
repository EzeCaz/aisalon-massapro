// Verify the seeded Event Prep questions are readable via the API shape.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const event = await db.event.findUnique({
    where: { slug: "ai-salon-human" },
    select: { id: true, title: true },
  });
  console.log("Event:", event?.title);

  const questions = await db.eventPrepQuestion.findMany({
    where: { eventId: event.id },
    include: {
      speaker: { select: { id: true, name: true, role: true, company: true } },
    },
    orderBy: [{ scope: "asc" }, { speakerId: "asc" }, { order: "asc" }],
  });
  console.log(`\nTotal questions: ${questions.length}`);

  // Group by speaker
  const bySpeaker = new Map();
  for (const q of questions) {
    const key = q.speaker ? q.speaker.name : "GENERIC";
    if (!bySpeaker.has(key)) bySpeaker.set(key, []);
    bySpeaker.get(key).push(q);
  }

  for (const [name, qs] of bySpeaker) {
    console.log(`\n${name} (${qs.length} questions):`);
    for (const q of qs) {
      console.log(`  [${q.order}] "${q.text.slice(0, 80)}${q.text.length > 80 ? "..." : ""}" — tag: ${q.tag || "(none)"}`);
    }
  }
} finally {
  await db.$disconnect();
}
