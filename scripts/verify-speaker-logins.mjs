// Verify both speakers can log in: check passwordHash matches, utmUid,
// role, and that there are no secondary email conflicts.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const TARGETS = [
  { email: "eyal.rond@realsenseai.com", expectedPassword: "Salon2026!" },
  { email: "noam.inbar@violafintech.com", expectedPassword: "Salon2026!" },
];

async function main() {
  for (const t of TARGETS) {
    const email = t.email.toLowerCase();
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,
        utmUid: true,
        onboardedAt: true,
        createdAt: true,
      },
    });
    if (!user) {
      console.error(`✗ Not found: ${email}`);
      continue;
    }
    const passwordOk = user.passwordHash
      ? await bcrypt.compare(t.expectedPassword, user.passwordHash)
      : false;
    console.log("---");
    console.log(`Email:     ${user.email}`);
    console.log(`Name:      ${user.name || "(none)"}`);
    console.log(`Role:      ${user.role}`);
    console.log(`utmUid:    ${user.utmUid || "(none)"}`);
    console.log(`Password:  ${passwordOk ? "✓ matches 'Salon2026!'" : "✗ does NOT match"}`);
    console.log(`Onboarded: ${user.onboardedAt ? "yes" : "no (will be redirected to /onboarding on first login)"}`);
    console.log(`Created:   ${user.createdAt.toISOString()}`);

    // Check secondary emails
    const secondaries = await db.userEmail.findMany({
      where: { userId: user.id },
      select: { email: true, label: true },
    });
    if (secondaries.length > 0) {
      console.log(`Secondary emails:`);
      for (const s of secondaries) {
        console.log(`  - ${s.email} (${s.label || "no label"})`);
      }
    }
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
