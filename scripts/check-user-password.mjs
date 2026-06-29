// Quick DB probe: does eze@massapro.com have a passwordHash?
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  const u = await db.user.findUnique({
    where: { email: "eze@massapro.com" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      image: true,
    },
  });
  if (!u) {
    console.log("USER NOT FOUND in DB");
  } else {
    console.log(JSON.stringify({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      image: u.image,
      status: u.status,
      hasPasswordHash: !!u.passwordHash,
      passwordHashLen: u.passwordHash ? u.passwordHash.length : 0,
      passwordHashPrefix: u.passwordHash ? u.passwordHash.slice(0, 7) : null,
    }, null, 2));
  }
} finally {
  await db.$disconnect();
}
