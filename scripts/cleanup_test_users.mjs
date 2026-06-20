import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
// Clean up test users created during the upload/rotate tests
const testEmails = ['test-upload@aisalon.local', 'test-signup-check@aisalon.local']
for (const email of testEmails) {
  const u = await db.user.findUnique({ where: { email } })
  if (u) {
    await db.user.delete({ where: { id: u.id } })
    console.log(`Deleted test user: ${email}`)
  } else {
    console.log(`(not present): ${email}`)
  }
}
// Show remaining users
const all = await db.user.findMany({ select: { email: true, name: true, role: true } })
console.log('\nRemaining users:')
for (const u of all) console.log(`  ${u.email} (${u.role}) — ${u.name}`)
await db.$disconnect()
