/**
 * Seed EventPrepQuestion rows for the AI Salon Tel Aviv event
 * (slug: "ai-salon-human", id: cmqs1k6w30000nbfla4jbwffv).
 *
 * Per user request (2026-06-30): the Event Prep tab lost all content.
 * Repopulate it with:
 *   - 5 personalized questions for each of the 6 invited speakers
 *     (Dan Ariely, Yehoshua Cohen, Eyal Rond, Noam Inbar, Dennis Nerush,
 *      Ido Vapner)
 *   - 10 generic questions (apply to all speakers)
 *
 * Behavior:
 *   - Idempotent — re-running the script won't create duplicates.
 *     We match by (eventId, speakerId, scope, text) and skip if exists.
 *   - Order is set explicitly per the user's question numbering.
 *   - Tags are populated from the user's input.
 *   - Does NOT touch existing EventPrepSuggestion rows.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/seed-event-prep-questions.mjs
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const EVENT_SLUG = "ai-salon-human";

// ────────────────────────────────────────────────────────────────────────────
// Speaker → questions mapping (per user's spec).
// Each entry: { name (case-insensitive match), questions: [{ text, tag }] }
// ────────────────────────────────────────────────────────────────────────────
const SPEAKER_QUESTIONS: { name: string; questions: { text: string; tag?: string }[] }[] = [
  {
    name: "Dan Ariely",
    questions: [
      { text: "Behavioral science shows we're systematically irrational. How does AI — which often mirrors our behavior back to us — change the picture of human irrationality?", tag: "behavioral economics" },
      { text: "Your work on misbelief explores why people come to believe false things. How do AI-driven personalization and generated content accelerate — or disrupt — the spread of misbelief?", tag: "misbelief" },
      { text: "You've designed 'better systems for human behavior' with governments and companies. Where could AI nudge people toward better decisions without crossing into manipulation?", tag: "nudges" },
      { text: "Bureaucracy reduces engagement and motivation. Can AI meaningfully reduce bureaucratic friction in ways that increase human dignity — not just efficiency?", tag: "bureaucracy" },
      { text: "You co-founded Shapa and Epilog to improve health and end-of-life experiences. Where do you see AI helping — or hurting — the most vulnerable decision-makers?", tag: "vulnerable decision-makers" },
    ],
  },
  {
    name: "Yehoshua (Shuki) Cohen",
    questions: [
      { text: "You've bridged cutting-edge research and commercial impact at AI21. What's the most common failure mode when enterprises try to turn AI research into production value?", tag: "research to production" },
      { text: "As VP Applied AI, you own end-to-end delivery. How do you decide which AI use cases are worth scaling vs. which should be killed early?", tag: "scaling decisions" },
      { text: "You've led data-first culture changes at AI21. What does 'intelligent decision-making' actually look like in an organization — and where does AI help vs. noise?", tag: "data-first culture" },
      { text: "You've been an AI Evangelist — speaking to technical and non-technical audiences. What's the most dangerous misconception about LLMs that business leaders still hold?", tag: "LLM misconceptions" },
      { text: "You've managed 35+ person cross-disciplinary teams. How is leading an AI team different from leading a traditional software team — and what should change in how we hire and grow people?", tag: "leading AI teams" },
    ],
  },
  {
    name: "Eyal Rond",
    questions: [
      { text: "You've built biometric systems used for access control. How do you balance security, convenience, and privacy when AI is making decisions about who gets in?", tag: "biometrics tradeoffs" },
      { text: "Edge AI moves inference closer to where people live. What does that mean for privacy, latency, and trust compared to cloud-based AI?", tag: "edge AI" },
      { text: "You led 45-person CV/ML teams at Intel. Where do you see the biggest gap between academic computer vision and what actually ships in products?", tag: "research vs. shipped" },
      { text: "You've shipped products in robotics, healthcare, and security. Which of these domains has the most potential to advance human flourishing — and which carries the most risk?", tag: "domain potential" },
      { text: "Face authentication is now in billions of devices. What's the next frontier for human-AI interaction at the edge, and what should we be cautious about?", tag: "next frontier" },
    ],
  },
  {
    name: "Noam inbar",
    questions: [
      { text: "You've been on both sides — operator and investor. Where do investors most misjudge the AI opportunity, and where do operators most misjudge investor expectations?", tag: "investor vs. operator" },
      { text: "As a General Partner at Viola FinTech, what makes an AI startup investible vs. just interesting technology?", tag: "investible AI" },
      { text: "You've navigated 'high-impact pivots'. When should an AI startup pivot vs. persevere — and how do you read the signals?", tag: "pivot signals" },
      { text: "Fintech + AI carries unique regulatory and trust burdens. What does responsible AI adoption look like in financial services specifically?", tag: "responsible fintech AI" },
      { text: "You sit on multiple boards. What governance pattern have you seen separate AI initiatives that scale from those that stall?", tag: "governance patterns" },
    ],
  },
  {
    name: "Dennis Nerush",
    questions: [
      { text: "You lead AI Engineering at Elementor, serving millions of users. How do you ship AI features fast without compromising quality or trust?", tag: "shipping fast" },
      { text: "You've built multi-agent systems for web creation. What's the biggest unsolved problem in making AI agents genuinely useful in production?", tag: "multi-agent" },
      { text: "You've written about engineering management in the AI era. How is managing AI engineers different from managing traditional software engineers?", tag: "managing AI engineers" },
      { text: "You emphasize 'people first'. How do you protect human creativity and ownership when AI is increasingly doing the work?", tag: "people first" },
      { text: "You expect candidates to use AI in hiring. How is the engineer's skill set shifting — and what should universities and bootcamps be teaching differently?", tag: "hiring in the AI era" },
    ],
  },
  {
    name: "Ido Vapner",
    questions: [
      { text: "You advise C-level executives on AI strategy across multiple countries. What's the most common mistake enterprises make when adopting AI at scale?", tag: "enterprise mistakes" },
      { text: "You've moved AI initiatives from POC to production. What separates the 5% that ship from the 95% that don't?", tag: "POC to production" },
      { text: "You mentor 3,000+ professionals on Generative and Agentic AI. What skill gap surprises you most — technical, strategic, or human?", tag: "skill gaps" },
      { text: "You build alliances with AWS, Microsoft, Google, NVIDIA. How should enterprises think about vendor lock-in vs. multi-cloud flexibility for AI workloads?", tag: "vendor strategy" },
      { text: "You've built AI businesses from zero to multi-million dollar. What does a healthy AI roadmap look like for an enterprise in 2026 — and what should they stop doing?", tag: "healthy AI roadmap" },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// 10 generic questions (apply to all speakers — rendered on the right column).
// ────────────────────────────────────────────────────────────────────────────
const GENERIC_QUESTIONS: { text: string; tag?: string }[] = [
  { text: "How do you see AI reshaping what it means to flourish as a human being in the next decade?", tag: "human flourishing" },
  { text: "Where is the line between AI augmenting human judgment and AI replacing it — and who should draw that line?", tag: "augmentation vs. replacement" },
  { text: "What's a widely held belief about AI's impact on people that you think is wrong?", tag: "misconceptions" },
  { text: "If you could redesign one everyday system (work, healthcare, education, finance) with AI at its core, what would you change first?", tag: "redesign" },
  { text: "What's the most important question about AI and human flourishing that almost no one is asking?", tag: "unasked questions" },
  { text: "How do we balance the speed of AI progress with the slower pace of trust-building and ethical reflection?", tag: "speed vs. trust" },
  { text: "What habit or practice should every person adopt today to stay grounded as AI becomes more capable?", tag: "personal practice" },
  { text: "Where do you see the biggest gap between what AI could do for people and what it actually does today?", tag: "gap" },
  { text: "What's one concrete way AI could deepen — rather than dilute — human connection?", tag: "connection" },
  { text: "When you look 20 years ahead, what does a 'flourishing' relationship between humans and AI look like to you?", tag: "long-term vision" },
];

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const event = await db.event.findUnique({
    where: { slug: EVENT_SLUG },
    select: { id: true, title: true },
  });
  if (!event) {
    console.error(`Event with slug "${EVENT_SLUG}" not found.`);
    process.exit(1);
  }
  console.log(`Event: ${event.title} (id=${event.id})`);

  const allSpeakers = await db.speaker.findMany({
    where: { eventId: event.id },
    select: { id: true, name: true },
  });

  let createdSpeaker = 0;
  let skippedSpeaker = 0;
  let notFoundSpeakers: string[] = [];

  for (const sq of SPEAKER_QUESTIONS) {
    // Match case-insensitively on speaker name
    const speaker = allSpeakers.find(
      (s) => s.name.toLowerCase().trim() === sq.name.toLowerCase().trim()
    );
    if (!speaker) {
      notFoundSpeakers.push(sq.name);
      continue;
    }

    for (let i = 0; i < sq.questions.length; i++) {
      const q = sq.questions[i];
      // Idempotency check: skip if a question with the same text already exists.
      const existing = await db.eventPrepQuestion.findFirst({
        where: { eventId: event.id, speakerId: speaker.id, text: q.text },
        select: { id: true },
      });
      if (existing) {
        skippedSpeaker++;
        continue;
      }
      await db.eventPrepQuestion.create({
        data: {
          eventId: event.id,
          speakerId: speaker.id,
          scope: "SPEAKER",
          text: q.text,
          tag: q.tag || null,
          order: i,
        },
      });
      createdSpeaker++;
    }
  }

  let createdGeneric = 0;
  let skippedGeneric = 0;
  for (let i = 0; i < GENERIC_QUESTIONS.length; i++) {
    const q = GENERIC_QUESTIONS[i];
    const existing = await db.eventPrepQuestion.findFirst({
      where: { eventId: event.id, scope: "GENERIC", text: q.text },
      select: { id: true },
    });
    if (existing) {
      skippedGeneric++;
      continue;
    }
    await db.eventPrepQuestion.create({
      data: {
        eventId: event.id,
        speakerId: null,
        scope: "GENERIC",
        text: q.text,
        tag: q.tag || null,
        order: i,
      },
    });
    createdGeneric++;
  }

  console.log(`\n--- Summary ---`);
  console.log(`Speaker questions: created ${createdSpeaker}, skipped (already existed) ${skippedSpeaker}`);
  console.log(`Generic questions: created ${createdGeneric}, skipped (already existed) ${skippedGeneric}`);
  if (notFoundSpeakers.length > 0) {
    console.log(`\nWARNING: Speakers not found in DB (check name spelling):`);
    for (const n of notFoundSpeakers) console.log(`  - ${n}`);
  }
  console.log(`\nDone.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
