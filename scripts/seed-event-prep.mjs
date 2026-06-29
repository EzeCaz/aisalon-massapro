// Seed EventPrepQuestion rows for the "ai-salon-human" event.
//
// Layout per user spec 2026-06-30:
//   - 10 GENERIC questions (scope="GENERIC", speakerId=null) — apply to all
//     speakers, rendered on the right column of the Event prep tab.
//   - 5 SPEAKER questions per speaker × 6 speakers = 30 personalized
//     questions, rendered in each speaker's box on the left column.
//
// Topic: "all the content in this entire project, without asking about
// the specific tools but the subjects" — i.e. the AI Human Flourishing
// microsite (/resources/ai-human-flourishing) subjects:
//   Identity & Purpose, Education & Development, Work & Economic Life,
//   Wellbeing, Relationships & Community, Creativity & Culture.
// Plus the Four Postures: Curiosity, Intentionality, Clarity, Care.
//
// Run once: node scripts/seed-event-prep.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GENERIC_QUESTIONS = [
  { tag: "human flourishing", text: "How do you see AI reshaping what it means to flourish as a human being in the next decade?" },
  { tag: "augmentation vs. replacement", text: "Where is the line between AI augmenting human judgment and AI replacing it — and who should draw that line?" },
  { tag: "misconceptions", text: "What's a widely held belief about AI's impact on people that you think is wrong?" },
  { tag: "redesign", text: "If you could redesign one everyday system (work, healthcare, education, finance) with AI at its core, what would you change first?" },
  { tag: "unasked questions", text: "What's the most important question about AI and human flourishing that almost no one is asking?" },
  { tag: "speed vs. trust", text: "How do we balance the speed of AI progress with the slower pace of trust-building and ethical reflection?" },
  { tag: "personal practice", text: "What habit or practice should every person adopt today to stay grounded as AI becomes more capable?" },
  { tag: "gap", text: "Where do you see the biggest gap between what AI could do for people and what it actually does today?" },
  { tag: "connection", text: "What's one concrete way AI could deepen — rather than dilute — human connection?" },
  { tag: "long-term vision", text: "When you look 20 years ahead, what does a 'flourishing' relationship between humans and AI look like to you?" },
];

// Each entry: speaker name match (must be unique), 5 personalized questions.
const SPEAKER_QUESTIONS = [
  {
    match: /dan ariely/i,
    questions: [
      { tag: "behavioral economics", text: "Behavioral science shows we're systematically irrational. How does AI — which often mirrors our behavior back to us — change the picture of human irrationality?" },
      { tag: "misbelief", text: "Your work on misbelief explores why people come to believe false things. How do AI-driven personalization and generated content accelerate — or disrupt — the spread of misbelief?" },
      { tag: "nudges", text: "You've designed 'better systems for human behavior' with governments and companies. Where could AI nudge people toward better decisions without crossing into manipulation?" },
      { tag: "bureaucracy", text: "Bureaucracy reduces engagement and motivation. Can AI meaningfully reduce bureaucratic friction in ways that increase human dignity — not just efficiency?" },
      { tag: "vulnerable decision-makers", text: "You co-founded Shapa and Epilog to improve health and end-of-life experiences. Where do you see AI helping — or hurting — the most vulnerable decision-makers?" },
    ],
  },
  {
    match: /yehoshua|shuki/i,
    questions: [
      { tag: "research to production", text: "You've bridged cutting-edge research and commercial impact at AI21. What's the most common failure mode when enterprises try to turn AI research into production value?" },
      { tag: "scaling decisions", text: "As VP Applied AI, you own end-to-end delivery. How do you decide which AI use cases are worth scaling vs. which should be killed early?" },
      { tag: "data-first culture", text: "You've led data-first culture changes at AI21. What does 'intelligent decision-making' actually look like in an organization — and where does AI help vs. add noise?" },
      { tag: "LLM misconceptions", text: "You've been an AI Evangelist — speaking to technical and non-technical audiences. What's the most dangerous misconception about LLMs that business leaders still hold?" },
      { tag: "leading AI teams", text: "You've managed 35+ person cross-disciplinary teams. How is leading an AI team different from leading a traditional software team — and what should change in how we hire and grow people?" },
    ],
  },
  {
    match: /eyal rond/i,
    questions: [
      { tag: "biometrics tradeoffs", text: "You've built biometric systems used for access control. How do you balance security, convenience, and privacy when AI is making decisions about who gets in?" },
      { tag: "edge AI", text: "Edge AI moves inference closer to where people live. What does that mean for privacy, latency, and trust compared to cloud-based AI?" },
      { tag: "research vs. shipped", text: "You led 45-person CV/ML teams at Intel. Where do you see the biggest gap between academic computer vision and what actually ships in products?" },
      { tag: "domain potential", text: "You've shipped products in robotics, healthcare, and security. Which of these domains has the most potential to advance human flourishing — and which carries the most risk?" },
      { tag: "next frontier", text: "Face authentication is now in billions of devices. What's the next frontier for human-AI interaction at the edge, and what should we be cautious about?" },
    ],
  },
  {
    match: /noam inbar/i,
    questions: [
      { tag: "investor vs. operator", text: "You've been on both sides — operator and investor. Where do investors most misjudge the AI opportunity, and where do operators most misjudge investor expectations?" },
      { tag: "investible AI", text: "As a General Partner at Viola FinTech, what makes an AI startup investible vs. just interesting technology?" },
      { tag: "pivot signals", text: "You've navigated 'high-impact pivots'. When should an AI startup pivot vs. persevere — and how do you read the signals?" },
      { tag: "responsible fintech AI", text: "Fintech + AI carries unique regulatory and trust burdens. What does responsible AI adoption look like in financial services specifically?" },
      { tag: "governance patterns", text: "You sit on multiple boards. What governance pattern have you seen separate AI initiatives that scale from those that stall?" },
    ],
  },
  {
    match: /dennis nerush/i,
    questions: [
      { tag: "shipping fast", text: "You lead AI Engineering at Elementor, serving millions of users. How do you ship AI features fast without compromising quality or trust?" },
      { tag: "multi-agent", text: "You've built multi-agent systems for web creation. What's the biggest unsolved problem in making AI agents genuinely useful in production?" },
      { tag: "managing AI engineers", text: "You've written about engineering management in the AI era. How is managing AI engineers different from managing traditional software engineers?" },
      { tag: "people first", text: "You emphasize 'people first'. How do you protect human creativity and ownership when AI is increasingly doing the work?" },
      { tag: "hiring in the AI era", text: "You expect candidates to use AI in hiring. How is the engineer's skill set shifting — and what should universities and bootcamps be teaching differently?" },
    ],
  },
  {
    match: /ido vapner/i,
    questions: [
      { tag: "enterprise mistakes", text: "You advise C-level executives on AI strategy across multiple countries. What's the most common mistake enterprises make when adopting AI at scale?" },
      { tag: "POC to production", text: "You've moved AI initiatives from POC to production. What separates the 5% that ship from the 95% that don't?" },
      { tag: "skill gaps", text: "You mentor 3,000+ professionals on Generative and Agentic AI. What skill gap surprises you most — technical, strategic, or human?" },
      { tag: "vendor strategy", text: "You build alliances with AWS, Microsoft, Google, NVIDIA. How should enterprises think about vendor lock-in vs. multi-cloud flexibility for AI workloads?" },
      { tag: "healthy AI roadmap", text: "You've built AI businesses from zero to multi-million dollar. What does a healthy AI roadmap look like for an enterprise in 2026 — and what should they stop doing?" },
    ],
  },
];

async function main() {
  const event = await prisma.event.findUnique({
    where: { slug: "ai-salon-human" },
    include: { speakers: { orderBy: { order: "asc" } } },
  });
  if (!event) {
    console.error("Event 'ai-salon-human' not found.");
    process.exit(1);
  }
  console.log(`Event: ${event.title} (${event.id}) — ${event.speakers.length} speakers`);

  // Match each speaker to their question set by name.
  const matched = event.speakers.map((sp) => {
    const set = SPEAKER_QUESTIONS.find((s) => s.match.test(sp.name));
    return { speaker: sp, set };
  });
  for (const m of matched) {
    if (!m.set) {
      console.warn(`  ⚠ No question set matched speaker "${m.speaker.name}"`);
    } else {
      console.log(`  ✓ "${m.speaker.name}" → ${m.set.questions.length} questions`);
    }
  }

  // Idempotency: skip if any questions already exist for this event.
  const existing = await prisma.eventPrepQuestion.count({ where: { eventId: event.id } });
  if (existing > 0) {
    console.log(`Event already has ${existing} prep questions. Skipping seed (idempotent).`);
    return;
  }

  // Insert GENERIC questions.
  for (let i = 0; i < GENERIC_QUESTIONS.length; i++) {
    const q = GENERIC_QUESTIONS[i];
    await prisma.eventPrepQuestion.create({
      data: {
        eventId: event.id,
        scope: "GENERIC",
        speakerId: null,
        text: q.text,
        tag: q.tag,
        order: i,
      },
    });
  }
  console.log(`Inserted ${GENERIC_QUESTIONS.length} generic questions.`);

  // Insert SPEAKER questions.
  let totalSpeakerQs = 0;
  for (const m of matched) {
    if (!m.set) continue;
    for (let i = 0; i < m.set.questions.length; i++) {
      const q = m.set.questions[i];
      await prisma.eventPrepQuestion.create({
        data: {
          eventId: event.id,
          scope: "SPEAKER",
          speakerId: m.speaker.id,
          text: q.text,
          tag: q.tag,
          order: i,
        },
      });
      totalSpeakerQs++;
    }
  }
  console.log(`Inserted ${totalSpeakerQs} speaker questions.`);
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
