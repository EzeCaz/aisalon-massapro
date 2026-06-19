// AI Salon Tel Aviv — DB seed
// Creates:
//   1. Admin user: eze@massapro.com
//   2. The June 18, 2026 event: "The AI CMO Blueprint"
//   3. 4 speakers (Ohad, Ellad, Boris, Miri) + Ezequiel as host
//   4. Full agenda

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ADMIN_EMAIL = "eze@massapro.com";

async function main() {
  // 1. Admin user (role ADMIN)
  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN", name: "Ezequiel Sznaider" },
    create: {
      email: ADMIN_EMAIL,
      name: "Ezequiel Sznaider",
      role: "ADMIN",
    },
  });
  console.log("✓ Admin user:", admin.email, "(", admin.role, ")");

  // 2. The June 18, 2026 event
  const eventSlug = "ai-cmo-blueprint-2026-06-18";
  const eventStart = new Date("2026-06-18T18:00:00+03:00"); // Tel Aviv time
  const eventEnd = new Date("2026-06-18T21:30:00+03:00");

  // Delete existing event with this slug (idempotent re-seed)
  const existing = await db.event.findUnique({ where: { slug: eventSlug } });
  if (existing) {
    await db.event.delete({ where: { id: existing.id } });
    console.log("✓ Removed existing event for clean re-seed");
  }

  const event = await db.event.create({
    data: {
      slug: eventSlug,
      title: "The AI CMO Blueprint: Scaling Growth & Agentic Innovation",
      subtitle: "AI Salon Tel Aviv",
      chapter: "Tel Aviv",
      venue: "Google for Startups Campus",
      address: "Tel Aviv-Yafo, Tel Aviv District",
      city: "Tel Aviv",
      country: "ISR",
      mapUrl: "https://maps.app.goo.gl/24Xnk9CxxVmRLbyZ6",
      startsAt: eventStart,
      endsAt: eventEnd,
      description: `This is not another AI talk.

This is a blueprint for what's next — how top organizations are moving from experimenting with AI to building real AI-powered operating systems that drive measurable growth.

Three world-class speakers. One powerful evening.

Join the AI Salon Tel Aviv community at Google For Startups Campus TLV to demystify how top-tier organizations are scaling innovation, leveraging AI agents, and embedding intelligence directly into customer workflows.`,
      takeaways: `• Fast Forward OS Blueprint & Architecture
• Agent Role Cheatsheet
• 4-Step Implementation Roadmap
• Creative Intelligence Frameworks + Prediction Toolkit
• System design templates and prompt starters from the speakers`,
      intendedFor: `Founders, CMOs, Product Leaders, Growth Marketers, and AI builders who want to stop guessing and start scaling with confidence.

This event is for AI Salon TLV registered members.`,
      rsvpUrl: "https://forms.gle/h3bA3LPa85SRqPtq6",
    },
  });
  console.log("✓ Event:", event.title);

  // 3. Speakers
  const speakersData = [
    {
      name: "Ohad Ronen",
      role: "AI Product Lead, Amdocs",
      company: "Amdocs",
      topic: "Building the Fast Forward Operating System: AI Agents, Dashboards & MSP Strategy",
      bio: "Get an exclusive look under the hood of a real AI-native OS — how to connect agents, smart dashboards, and multi-channel execution into one unified system.",
      order: 1,
    },
    {
      name: "Ellad Kushnir Matarasso",
      role: "COO, Alison.ai",
      company: "Alison.ai",
      topic: "Stop Throwing Pasta on the Wall. Start Learning Why it Sticks.",
      bio: "After analyzing 90,000 creatives and over $500M in media spend, Ellad reveals why most high-volume testing is leading advertisers into a creative dead-end — and how the smartest teams are turning performance data into predictable creative intelligence.",
      order: 2,
    },
    {
      name: "Boris Mergold",
      role: "Google Cloud Data & AI Sales Specialist, Creator of 'AskBoris'",
      company: "Google Cloud",
      topic: "Transforming Marketing with AI: The CMO's Blueprint",
      bio: "Real case studies from Levi's, Golden State Warriors, and Home Depot. Learn how to move from fragmented tools to interconnected, outcome-driven AI growth systems.",
      order: 3,
    },
    {
      name: "Miri Fenton",
      role: "Principal, Maverick Ventures",
      company: "Maverick Ventures",
      topic: "Cutting through the AI slop",
      bio: "Addresses the struggle technical founders face in building a coherent narrative amidst AI-generated noise. She will guide founders on identifying this challenge, developing a unique brand strategy, and effectively deploying a narrative arc when pitching to investors.",
      order: 4,
    },
  ];

  const speakers = [];
  for (const s of speakersData) {
    const sp = await db.speaker.create({
      data: { ...s, eventId: event.id },
    });
    speakers.push(sp);
    console.log("  ✓ Speaker:", sp.name);
  }

  // Ezequiel as host speaker (for the welcome agenda item)
  const hostSpeaker = await db.speaker.create({
    data: {
      eventId: event.id,
      name: "Ezequiel Sznaider",
      role: "Founder & Chief Organizer, AI Salon Tel Aviv",
      company: "MassaPro",
      topic: "Welcome",
      bio: "Founder of AI Salon Tel Aviv. Hosts and curates the community's monthly gatherings at Google for Startups Campus TLV.",
      order: 0,
    },
  });
  console.log("  ✓ Host:", hostSpeaker.name);

  // 4. Agenda — full timeline per the brief
  const agenda = [
    { start: "18:00", end: "18:20", title: "Welcome by Ezequiel Sznaider", type: "WELCOME", speakerId: hostSpeaker.id },
    { start: "18:20", end: "19:00", title: "Ohad Ronen — Building the Fast Forward OS", type: "TALK", speakerId: speakers[0].id },
    { start: "19:00", end: "19:10", title: "Rest & Networking", type: "BREAK" },
    { start: "19:10", end: "19:55", title: "Ellad Kushnir Matarasso — Stop Throwing Pasta on the Wall. Start Learning Why it Sticks.", type: "TALK", speakerId: speakers[1].id },
    { start: "19:55", end: "20:10", title: "Rest & Networking", type: "BREAK" },
    { start: "20:10", end: "20:50", title: "Boris Mergold — Transforming Marketing with AI", type: "TALK", speakerId: speakers[2].id },
    { start: "20:50", end: "21:05", title: 'Miri Fenton — "Cutting through the AI slop"', type: "TALK", speakerId: speakers[3].id },
    { start: "21:05", end: "21:15", title: "Fast Pitch Round", type: "FAST_PITCH" },
    { start: "21:15", end: "21:30", title: "Snacks & Networking", type: "NETWORKING" },
  ];

  for (const a of agenda) {
    const [sh, sm] = a.start.split(":").map(Number);
    const [eh, em] = a.end.split(":").map(Number);
    // Build the date in Tel Aviv TZ (UTC+3, no DST since we control the date).
    // eventStart is 2026-06-18T15:00:00Z = 18:00 +03:00. We want, e.g., 18:20 +03:00 = 15:20 UTC.
    // So compute: UTC ms = eventStart.UTCms + ((h*60+m) - 18*60) * 60000
    const startUtcMs =
      eventStart.getTime() + ((sh * 60 + sm) - 18 * 60) * 60_000;
    const endUtcMs =
      eventStart.getTime() + ((eh * 60 + em) - 18 * 60) * 60_000;
    const start = new Date(startUtcMs);
    const end = new Date(endUtcMs);
    await db.eventAgendaItem.create({
      data: {
        eventId: event.id,
        startsAt: start,
        endsAt: end,
        title: a.title,
        type: a.type,
        speakerId: a.speakerId || null,
      },
    });
    console.log(`  ✓ Agenda: ${a.start}-${a.end} ${a.title}`);
  }

  // 5. A few default member tags (admin can manage these later)
  const defaultTags = [
    { label: "Speaker", color: "#FF005A" },
    { label: "Builder", color: "#00E6FF" },
    { label: "Investor", color: "#820A7D" },
    { label: "Founder", color: "#FFAC30" },
    { label: "CMO", color: "#007E72" },
    { label: "Product Leader", color: "#004F98" },
    { label: "Growth Marketer", color: "#FF005A" },
    { label: "Community Member", color: "#52525B" },
  ];
  // Only create tag *labels*; assignment is per-user from the admin UI.
  // We model tags as a separate MemberTag table linked to users, but for the
  // admin UI we want to show the catalog of available tags. We'll store them
  // as a static list in code (see src/lib/tags.ts) — no separate table needed.

  console.log("\n✅ Seed complete.");
  console.log(`   Admin: ${admin.email}`);
  console.log(`   Event: ${event.slug}`);
  console.log(`   Speakers: ${speakers.length + 1}`);
  console.log(`   Agenda items: ${agenda.length}`);
  console.log(`   Default tag catalog: ${defaultTags.length} (see src/lib/tags.ts)`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
