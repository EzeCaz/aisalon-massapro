// Diagnostic: check whether iphonedana@gmail.com (Dana Avron) is properly
// linked as a Speaker on the "ai-salon-human" event, and what her User.role
// is. This helps confirm the bug behind "I'm a speaker but can't see Event Prep tab".

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

try {
  // 1. Find the user
  const user = await db.user.findUnique({
    where: { email: "iphonedana@gmail.com" },
    select: { id: true, email: true, name: true, role: true, company: true },
  });
  console.log("=== USER ===");
  console.log(user ?? "NOT FOUND");

  if (!user) {
    console.log("User not found — nothing to diagnose.");
    process.exit(0);
  }

  // 2. Find the "ai-salon-human" event (slug)
  const event = await db.event.findFirst({
    where: {
      OR: [
        { slug: { contains: "ai-salon-human" } },
        { slug: { contains: "human" } },
        { title: { contains: "Human", mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, title: true },
  });
  console.log("\n=== EVENT (matching 'human') ===");
  console.log(event ?? "NOT FOUND");

  // 3. Find ALL Speaker rows linked to this user (across all events)
  const speakerRows = await db.speaker.findMany({
    where: {
      OR: [
        { userId: user.id },
        { contactEmail: user.email },
      ],
    },
    select: {
      id: true,
      name: true,
      eventId: true,
      userId: true,
      contactEmail: true,
      event: { select: { id: true, slug: true, title: true } },
    },
  });
  console.log("\n=== SPEAKER ROWS linked to this user (by userId OR contactEmail) ===");
  console.log(`Found ${speakerRows.length} row(s):`);
  for (const s of speakerRows) {
    console.log(`  - Speaker.id=${s.id}  name="${s.name}"  userId=${s.userId ?? "null"}  contactEmail=${s.contactEmail ?? "null"}  event="${s.event?.slug}" (${s.event?.title})`);
  }

  // 4. Find ALL Speaker rows on the "human" event (regardless of who)
  if (event) {
    const eventSpeakers = await db.speaker.findMany({
      where: { eventId: event.id },
      select: { id: true, name: true, userId: true, contactEmail: true },
      orderBy: { order: "asc" },
    });
    console.log(`\n=== ALL SPEAKERS on event "${event.slug}" ===`);
    console.log(`Found ${eventSpeakers.length} speaker(s):`);
    for (const s of eventSpeakers) {
      const matchesUser =
        s.userId === user.id || (s.contactEmail ?? "").toLowerCase() === user.email.toLowerCase();
      console.log(`  ${matchesUser ? "★" : " "} - id=${s.id}  name="${s.name}"  userId=${s.userId ?? "null"}  contactEmail=${s.contactEmail ?? "null"}  ${matchesUser ? "← MATCHES USER" : ""}`);
    }
  }

  // 5. Count GOING RSVPs on the human event
  if (event) {
    const going = await db.eventRsvp.count({
      where: { eventId: event.id, status: "GOING" },
    });
    const total = await db.eventRsvp.count({
      where: { eventId: event.id },
    });
    console.log(`\n=== RSVP COUNTS on "${event.slug}" ===`);
    console.log(`  GOING: ${going}`);
    console.log(`  Total: ${total}`);
  }
} finally {
  await db.$disconnect();
}
