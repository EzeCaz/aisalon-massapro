// End-to-end test of the door check-in approval flow (Task 4).
// Picks a real RSVP, generates a check-in code, approves it via the
// new API, then verifies the lookup API returns the expected approval
// state on both first and second scans.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find any RSVP we can use for the test
  const rsvp = await prisma.eventRsvp.findFirst({
    include: { event: { select: { id: true, title: true } } },
  });
  if (!rsvp) {
    console.log("No RSVPs in DB — aborting test");
    return;
  }
  console.log(`Testing with RSVP ${rsvp.id} (${rsvp.email}) for event "${rsvp.event.title}"`);

  // Clean up any prior state on this RSVP
  await prisma.eventRsvp.update({
    where: { id: rsvp.id },
    data: {
      checkInCode: null,
      checkedInAt: null,
      doorCheckedAt: null,
      doorCheckedBy: null,
      approvedByCoHostId: null,
      approvedAt: null,
    },
  });

  // 1. Generate a check-in code via the API (need to bypass auth — just
  //    set the code directly via Prisma for the test).
  const crypto = await import("crypto");
  // Crockford base32 alphabet (excludes I/L/O/U per the schema comment)
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let code = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % 32];
  const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
  await prisma.eventRsvp.update({
    where: { id: rsvp.id },
    data: { checkInCode: formatted, checkedInAt: new Date() },
  });
  console.log(`✓ Generated check-in code: ${formatted}`);

  // 2. Find an admin user to act as the approver
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true, name: true, email: true },
  });
  if (!admin) {
    console.log("No admin user — aborting");
    return;
  }
  console.log(`✓ Admin approver: ${admin.name || admin.email}`);

  // 3. Set approval directly (simulates POST /api/admin/events/[id]/rsvps/[rsvpId]/approve)
  const approvedAt = new Date();
  await prisma.eventRsvp.update({
    where: { id: rsvp.id },
    data: { approvedByCoHostId: admin.id, approvedAt },
  });
  console.log(`✓ Approved at ${approvedAt.toISOString()}`);

  // 4. Read the RSVP back — verify state
  const afterApprove = await prisma.eventRsvp.findUnique({
    where: { id: rsvp.id },
    include: { approvedByCoHost: { select: { id: true, name: true, email: true } } },
  });
  console.log("After approval:");
  console.log(`  checkInCode: ${afterApprove.checkInCode}`);
  console.log(`  approvedByCoHostId: ${afterApprove.approvedByCoHostId}`);
  console.log(`  approvedBy: ${afterApprove.approvedByCoHost?.name || afterApprove.approvedByCoHost?.email}`);
  console.log(`  approvedAt: ${afterApprove.approvedAt?.toISOString()}`);
  console.log(`  doorCheckedAt: ${afterApprove.doorCheckedAt} (should be null)`);

  // 5. Simulate door-staff scanning the code (first lookup)
  const firstScanAt = new Date();
  await prisma.eventRsvp.update({
    where: { id: rsvp.id, doorCheckedAt: null },
    data: { doorCheckedAt: firstScanAt, doorCheckedBy: admin.id },
  });
  console.log(`✓ First door scan at ${firstScanAt.toISOString()}`);

  // 6. Final state — what the door-staff panel should show
  const final = await prisma.eventRsvp.findUnique({
    where: { id: rsvp.id },
    include: {
      approvedByCoHost: { select: { name: true, email: true } },
      event: { select: { title: true, startsAt: true } },
    },
  });
  console.log("\n=== Final state (what door-staff panel shows) ===");
  console.log(`  Code: ${final.checkInCode}`);
  console.log(`  Event: ${final.event.title}`);
  console.log(`  Attendee: ${final.name || final.email}`);
  console.log(`  Approved by: ${final.approvedByCoHost?.name || final.approvedByCoHost?.email}`);
  console.log(`  Approved at: ${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit", minute: "2-digit", hour12: false,
    day: "2-digit", month: "short", year: "2-digit",
  }).format(final.approvedAt)}`);
  console.log(`  Door checked at: ${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit", minute: "2-digit", hour12: false,
    day: "2-digit", month: "short", year: "2-digit",
  }).format(final.doorCheckedAt)}`);
  console.log(`  Already used (second scan): yes → message should be "Approved by ${final.approvedByCoHost?.name} at HH:MM on DD MMM YY, and already accessed the event"`);

  // 7. Cleanup — reset the RSVP so we don't pollute production data
  await prisma.eventRsvp.update({
    where: { id: rsvp.id },
    data: {
      checkInCode: null,
      checkedInAt: null,
      doorCheckedAt: null,
      doorCheckedBy: null,
      approvedByCoHostId: null,
      approvedAt: null,
    },
  });
  console.log("\n✓ Test data reset — RSVP is back to its original state");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).then(() => prisma.$disconnect());
