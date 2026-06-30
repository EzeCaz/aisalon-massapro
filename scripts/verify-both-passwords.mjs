// Verify both candidate passwords against the production bcrypt hash.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
try {
  const u = await db.user.findUnique({
    where: { email: "eze@massapro.com" },
    select: { passwordHash: true },
  });
  if (!u || !u.passwordHash) {
    console.log("USER NOT FOUND or no passwordHash");
    process.exit(1);
  }
  console.log("hash prefix:", u.passwordHash.slice(0, 7));
  console.log("hash length:", u.passwordHash.length);

  for (const pwd of ["DPVO6SWQ", "Massapro2026!"]) {
    const ok = await bcrypt.compare(pwd, u.passwordHash);
    console.log(`  bcrypt.compare(${JSON.stringify(pwd)}): ${ok}`);
  }
} finally {
  await db.$disconnect();
}
