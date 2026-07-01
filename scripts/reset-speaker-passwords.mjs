// Reset passwords for two speakers who can't log in.
// Sets a clean, memorable password + ensures they have a utmUid.
//
// Usage: node scripts/reset-speaker-passwords.mjs
//
// Prints the new credentials to stdout so the admin can communicate
// them verbally / via DM. Does NOT send an email (SMTP may not be
// configured locally).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const TARGETS = [
  { email: "eyal.rond@realsenseai.com", newPassword: "Salon2026!" },
  { email: "noam.inbar@violafintech.com", newPassword: "Salon2026!" },
];

async function main() {
  for (const t of TARGETS) {
    const email = t.email.toLowerCase();
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`✗ User not found: ${email}`);
      continue;
    }
    const hash = await bcrypt.hash(t.newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
      select: { id: true, email: true, name: true, role: true },
    });
    console.log(
      `✓ Reset password for ${user.name || "(no name)"} <${email}>  (id: ${user.id})  →  new password: ${t.newPassword}`
    );
  }
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
