import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const events = await db.event.findMany({
  include: {
    speakers: { select: { name: true, role: true, company: true, topic: true, order: true } },
    agenda: { select: { startsAt: true, title: true, type: true }, orderBy: { startsAt: 'asc' } }
  }
})
for (const e of events) {
  console.log(`\n=== EVENT: ${e.title} ===`)
  console.log(`  slug: ${e.slug}`)
  console.log(`  venue: ${e.venue}`)
  console.log(`  startsAt: ${e.startsAt.toISOString()}`)
  console.log(`  endsAt: ${e.endsAt.toISOString()}`)
  console.log(`  speakers (${e.speakers.length}):`)
  for (const s of [...e.speakers].sort((a,b)=>a.order-b.order)) {
    console.log(`    [${s.order}] ${s.name} — ${s.role} (${s.company})`)
    console.log(`        topic: ${s.topic}`)
  }
  console.log(`  agenda (${e.agenda.length} items):`)
  for (const a of e.agenda) {
    console.log(`    ${a.startsAt.toISOString().slice(11,16)} UTC [${a.type}] ${a.title}`)
  }
}
await db.$disconnect()
