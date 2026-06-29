// Verify the bcrypt hash we just wrote actually matches the password.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
try {
  const u = await db.user.findUnique({
    where: { email: "eze@massapro.com" },
    select: { passwordHash: true },
  });
  const ok = await bcrypt.compare("Massapro2026!", u.passwordHash);
  console.log("bcrypt compare result:", ok);
  console.log("hash prefix:", u.passwordHash.slice(0, 7));
} finally {
  await db.$disconnect();
}
