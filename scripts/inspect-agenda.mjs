// Inspect existing fast pitch items + all agenda items in production
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const items = await p.eventAgendaItem.findMany({
  where: { event: { slug: "ai-cmo-blueprint-2026-06-18" } },
  include: { speaker: true },
  orderBy: { startsAt: "asc" },
});
console.log(`Found ${items.length} agenda items:`);
for (const it of items) {
  console.log(
    `  [${it.type}] ${it.startsAt.toISOString().slice(11, 16)} — ${it.title}` +
      (it.speaker ? ` (speaker: ${it.speaker.name})` : "")
  );
}
await p.$disconnect();
