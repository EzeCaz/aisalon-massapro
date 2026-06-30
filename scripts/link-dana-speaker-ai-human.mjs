// One-off data fix: link Dana Avron (iphonedana@gmail.com) as a Speaker
// on the "ai-salon-human" event. The user reports she has "speaker role"
// on this event but the DB has no Speaker row linking her User. We add
// a minimal Speaker row that links via userId + contactEmail so the
// existing isEventSpeaker() check passes and she can see the Event Prep
// tab.
//
// Run with:
//   DATABASE_URL=$(grep '^DATABASE_URL=' /tmp/vercel-env/.env.production | cut -d'=' -f2- | tr -d '"') \
//   node scripts/link-dana-speaker-ai-human.mjs

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const USER_EMAIL = "iphonedana@gmail.com";
const EVENT_SLUG = "ai-salon-human";

try {
  // 1. Find the user
  const user = await db.user.findUnique({
    where: { email: USER_EMAIL },
    select: { id: true, email: true, name: true, role: true, company: true },
  });
  if (!user) {
    console.error(`✗ User not found: ${USER_EMAIL}`);
    process.exit(1);
  }
  console.log(`✓ Found user: ${user.name} (${user.email})  role=${user.role}  company=${user.company ?? "null"}`);

  // 2. Find the event
  const event = await db.event.findUnique({
    where: { slug: EVENT_SLUG },
    select: { id: true, slug: true, title: true },
  });
  if (!event) {
    console.error(`✗ Event not found: ${EVENT_SLUG}`);
    process.exit(1);
  }
  console.log(`✓ Found event: "${event.title}"  slug=${event.slug}  id=${event.id}`);

  // 3. Check if she's already linked as a Speaker on this event
  const existing = await db.speaker.findFirst({
    where: {
      eventId: event.id,
      OR: [
        { userId: user.id },
        { contactEmail: user.email },
      ],
    },
    select: { id: true, name: true, userId: true, contactEmail: true },
  });
  if (existing) {
    console.log(`✓ Already linked — no action needed:`);
    console.log(`    Speaker.id=${existing.id}  name="${existing.name}"  userId=${existing.userId}  contactEmail=${existing.contactEmail}`);
    process.exit(0);
  }

  // 4. Create the Speaker row. We use her User.name as the Speaker.name
  //    (so she shows up in the speaker list correctly). Her company is
  //    Noovi.co (from User.company). The Speaker row links to her User
  //    via userId, and we set contactEmail to her login email so the
  //    auto-link logic would also catch her on future re-syncs.
  const nextOrder = await db.speaker.count({ where: { eventId: event.id } });
  const speaker = await db.speaker.create({
    data: {
      eventId: event.id,
      name: user.name ?? user.email,
      company: user.company,
      // No topic / bio / photoUrl yet — the admin can fill these in
      // via the Speaker editor. The important fields for Event Prep
      // access are userId + contactEmail.
      contactEmail: user.email,
      userId: user.id,
      order: nextOrder, // append to the end of the speaker list
    },
  });
  console.log(`✓ Created Speaker row:`);
  console.log(`    Speaker.id=${speaker.id}`);
  console.log(`    name="${speaker.name}"`);
  console.log(`    company="${speaker.company ?? "null"}"`);
  console.log(`    contactEmail="${speaker.contactEmail}"`);
  console.log(`    userId="${speaker.userId}"`);
  console.log(`    order=${speaker.order}`);
  console.log("");
  console.log(`Dana can now sign in and see the 🎯 Event prep tab on:`);
  console.log(`  https://aisalon.massapro.com/events/${event.slug}`);
} finally {
  await db.$disconnect();
}
