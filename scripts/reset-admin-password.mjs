// Reset eze@massapro.com password to a known temporary value.
// Usage: node scripts/reset-admin-password.mjs <new-password>
// If no arg given, generates a random 16-char password.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const db = new PrismaClient();
try {
  const newPassword = process.argv[2] || crypto.randomBytes(12).toString("base64url").slice(0, 16);
  const hash = await bcrypt.hash(newPassword, 10);

  const updated = await db.user.update({
    where: { email: "eze@massapro.com" },
    data: { passwordHash: hash },
    select: { id: true, email: true, role: true },
  });

  console.log(JSON.stringify({
    user: updated,
    newPassword,
    hashPrefix: hash.slice(0, 7),
    hashLen: hash.length,
  }, null, 2));
} finally {
  await db.$disconnect();
}
