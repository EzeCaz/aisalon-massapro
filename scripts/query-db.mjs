import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const [events, rsvps, users, visits, attribs] = await Promise.all([
  prisma.event.count(),
  prisma.eventRsvp.count(),
  prisma.user.count(),
  prisma.referralVisit.count(),
  prisma.referralAttribution.count(),
]);
console.log({ events, rsvps, users, visits, attribs });
// Find an event + RSVP to test with
const event = await prisma.event.findFirst({ select: { id: true, title: true } });
console.log("First event:", event);
const rsvp = await prisma.eventRsvp.findFirst({
  where: { checkInCode: { not: null } },
  select: { id: true, eventId: true, checkInCode: true, approvedAt: true, doorCheckedAt: true },
});
console.log("First RSVP with code:", rsvp);
await prisma.$disconnect();
