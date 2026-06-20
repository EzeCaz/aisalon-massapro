import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const users = await prisma.user.findMany({
  take: 10,
  orderBy: { createdAt: 'desc' },
  select: { id: true, email: true, name: true, role: true, passwordHash: true, createdAt: true }
})
const out = users.map(u => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  hasPassword: !!u.passwordHash,
  createdAt: u.createdAt
}))
console.log(JSON.stringify(out, null, 2))
await prisma.$disconnect()
