import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const imgs = await db.eventImage.findMany({ select: { id: true, fileUrl: true, fileName: true, eventId: true } })
console.log(`Total EventImage rows: ${imgs.length}`)
for (const i of imgs) console.log(`  ${i.id} | event=${i.eventId} | ${i.fileUrl}`)
const profiles = await db.user.findMany({ where: { photoUrl: { startsWith: "/uploads/" } }, select: { id: true, email: true, photoUrl: true } })
console.log(`Users with local-file photoUrl: ${profiles.length}`)
for (const u of profiles) console.log(`  ${u.email} | ${u.photoUrl}`)
await db.$disconnect()
