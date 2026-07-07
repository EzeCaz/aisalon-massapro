/**
 * Quiz Content Generator
 * ---------------------
 * Converts the AI Salon "Facilitator's Field Guide" content
 * (src/lib/salon-data/salon-data.ts) into Kahoot-style quiz questions
 * with 4 options, one correct answer, and a deep-dive explanation
 * pulled from the source area.
 *
 * The generator is deterministic — same input always produces the same
 * question set — so the admin can re-seed without creating duplicates.
 *
 * Output shape matches the QuizQuestion Prisma model (minus DB fields).
 */

import {
  conversationAreas,
  fourPostures,
  type ConversationArea,
} from "@/lib/salon-data/salon-data";

export interface GeneratedQuizQuestion {
  /** Stable id: `${areaId}--q${n}` (NOT the DB id — that's generated on insert). */
  tempId: string;
  text: string;
  options: string[]; // length 4
  correctIndex: number; // 0..3
  deepDive: string | null;
  sourceAreaId: string;
  /** Suggested time limit (seconds). Null = use session default. */
  timeLimitSec: number | null;
}

/**
 * Question bank — hand-authored multiple-choice questions derived from
 * the salon-data content. Each question is tied to a ConversationArea
 * and includes a "deep dive" explanation that references the source
 * quote or story, so the host can use the quiz as a teaching tool, not
 * just a game.
 *
 * Writing style:
 *   - Stem is a single, self-contained sentence.
 *   - 4 options: 1 correct, 3 plausible distractors.
 *   - Distractors come from adjacent concepts in the same area
 *     (so they're not obviously wrong).
 *   - Deep-dive is 1-2 sentences referencing the chapter / story.
 */
const QUESTION_BANK: Array<{
  areaId: string;
  text: string;
  options: string[];
  correctIndex: number;
  deepDive: string;
  timeLimitSec?: number;
}> = [
  // ── Identity & Purpose ────────────────────────────────────────────
  {
    areaId: "identity-purpose",
    text: "According to the AI Salon field guide, what makes human work irreplaceable in the age of AI?",
    options: [
      "Speed and efficiency of execution",
      "Mortality — we make art because we're mortal, not because we're skilled",
      "Access to more data than machines",
      "Lower cost of operation",
    ],
    correctIndex: 1,
    deepDive:
      'From Ch. 3, p. 80: "We don\'t make art because we\'re skilled, but because we\'re mortal." The book frames mortality — not capability — as the source of irreducible human value.',
  },
  {
    areaId: "identity-purpose",
    text: "The Human Qualities Spectrum (R-L-T) sorts activities into three categories. Which is NOT one of them?",
    options: ["Replicable", "Relational", "Transcendent", "Revenue-generating"],
    correctIndex: 3,
    deepDive:
      "The R-L-T spectrum (Ch. 3, p. 74) sorts activities by their human texture: Replicable (AI can do it), Relational (requires human presence), Transcendent (only a human can mean it). Revenue is orthogonal — a transcendent activity can be unpaid.",
  },
  {
    areaId: "identity-purpose",
    text: "When Dorian the Amsterdam painter starts painting blindfolded, what is he expressing?",
    options: [
      "A protest against technology",
      '"What the machine cannot want" — choosing by desire, not output',
      "A new artistic technique",
      "Skepticism of AI's skill",
    ],
    correctIndex: 1,
    deepDive:
      'Dorian (Ch. 3) stops defending technique and starts painting blindfolded — a gesture toward "what the machine cannot want." The point isn\'t better output; it\'s protecting the act of choosing.',
  },
  {
    areaId: "identity-purpose",
    text: "Kaia Lee, the Brooklyn watercolorist, discovers what about her AI clones?",
    options: [
      "They could only copy her style, not her subject",
      "A subreddit of AI pieces had learned her exact signature",
      "They sold for less than her originals",
      "They were illegal under U.S. copyright law",
    ],
    correctIndex: 1,
    deepDive:
      "Kaia Lee (Ch. 5) finds a subreddit of AI pieces that have learned her exact signature — forcing her to ask what's left that's hers. The crisis isn't loss of skill; it's loss of the link between self and output.",
  },

  // ── Education & Development ───────────────────────────────────────
  {
    areaId: "education-development",
    text: "David, the Michigan professor, built what into his office-hours bot?",
    options: [
      "Faster answer delivery",
      '"Productive-struggle" delays so students reach the insight themselves',
      "Automatic grading",
      "Chat logging for review",
    ],
    correctIndex: 1,
    deepDive:
      'David (Ch. 11) intentionally slows AI down with "productive-struggle" delays — protecting the moment of recognition when a student realizes they\'re capable of more than they imagined.',
  },
  {
    areaId: "education-development",
    text: "According to the book, what can AI respond to powerfully but never originate?",
    options: ["Data", "Logic", "Curiosity", "Memory"],
    correctIndex: 2,
    deepDive:
      'From Ch. 1: "AI responds powerfully to curiosity — but it cannot generate it." Curiosity is positioned as the irreducibly human move in learning.',
  },
  {
    areaId: "education-development",
    text: "The Curiosity Loop has four movements. Which is the correct order?",
    options: [
      "Question → Notice → Reflect → Experiment",
      "Notice → Question → Experiment → Reflect",
      "Experiment → Reflect → Notice → Question",
      "Reflect → Experiment → Question → Notice",
    ],
    correctIndex: 1,
    deepDive:
      "The Curiosity Loop (Ch. 1, p. 29): Notice → Question → Experiment → Reflect. The order matters — naming a reaction before questioning it converts defensiveness into learning.",
  },
  {
    areaId: "education-development",
    text: "What does the STARS framework stand for?",
    options: [
      "Small, Time-boxed, Accountable, Reflective, Social",
      "Strategic, Targeted, Adaptive, Repeatable, Scalable",
      "Specific, Timely, Actionable, Reviewable, Shareable",
      "Simple, Testable, Achievable, Relevant, Sustainable",
    ],
    correctIndex: 0,
    deepDive:
      "STARS (Ch. 5, p. 125): Small, Time-boxed, Accountable, Reflective, Social. It's a design pattern for practices that actually stick — not a goal-setting framework.",
  },

  // ── Work & Economic Life ──────────────────────────────────────────
  {
    areaId: "work-economic",
    text: "Mira, the Italian VC, faced an algorithmic verdict about what?",
    options: [
      "Closing three regional depots at 5 a.m.",
      "Laying off 30% of her portfolio",
      "Selling her firm to a competitor",
      "Outsourcing engineering to another country",
    ],
    correctIndex: 0,
    deepDive:
      'Mira (Ch. 8) faces a 5 a.m. algorithmic verdict on three depots — but builds a "Score Sheet" and finds a third path the model couldn\'t see. The depots were the region\'s largest employer; pure efficiency was the wrong answer.',
  },
  {
    areaId: "work-economic",
    text: "What does the Orchestration Triangle integrate?",
    options: [
      "Data, Intuition, Context",
      "Strategy, Operations, Finance",
      "Speed, Quality, Cost",
      "Customer, Product, Market",
    ],
    correctIndex: 0,
    deepDive:
      "The Orchestration Triangle (Ch. 8, p. 197) integrates Data, Intuition, and Context — so you conduct them rather than defaulting to one. Devon, the London jazz conductor, reframes it as Sheet Music, Soul, Story.",
  },
  {
    areaId: "work-economic",
    text: "According to the book, the real returns come from what?",
    options: [
      "Balance between AI and human work",
      "Integration — not balance",
      "Outsourcing the replicable to AI",
      "Specialization in human-only skills",
    ],
    correctIndex: 1,
    deepDive:
      'From Ch. 8, p. 206: "The real returns come from integration. Not balance — integration." The book rejects the work-life-balance framing of human/AI collaboration.',
  },
  {
    areaId: "work-economic",
    text: "Carlos, in Manila, engineered what into his logistics network?",
    options: [
      '"Dignity buffers"',
      "Real-time route optimization",
      "Algorithmic performance scoring",
      "Automated termination protocols",
    ],
    correctIndex: 0,
    deepDive:
      'Carlos (Ch. 6) refuses to reduce workers to efficiency scores and engineers "dignity buffers" into his logistics network — finding value inside what looked like inefficiency.',
  },

  // ── Well-Being & Relationships ────────────────────────────────────
  {
    areaId: "wellbeing",
    text: "The book recommends what practice for opening a salon conversation?",
    options: [
      "Diana's three questions — curiosity, concern, care",
      "A round of professional introductions",
      "Reading the chapter aloud",
      "A guided meditation",
    ],
    correctIndex: 0,
    deepDive:
      "Salon practice #2: borrow Diana's three questions — curiosity, concern, care — to open. The check-in is structural, not ceremonial; it sets the temperature for what comes next.",
  },
  {
    areaId: "wellbeing",
    text: "Why does the guide warn hosts about the Well-Being area in particular?",
    options: [
      "It can be too theoretical",
      "It can open real doors — host the conversation, don't diagnose it",
      "It tends to drift into politics",
      "It is the least popular area",
    ],
    correctIndex: 1,
    deepDive:
      'Salon practice #3: "Well-Being especially can open real doors. Host the conversation; don\'t diagnose it. If something heavy surfaces, honor it and point toward trusted support."',
  },

  // ── Civic & Ethical Life (uses relationships-community area) ──────
  {
    areaId: "relationships-community",
    text: "The Stress-Test Table has four columns. Which set is correct?",
    options: [
      "Value · Temptation · Cost of Integrity · Payoff of Fidelity",
      "Principle · Pressure · Consequence · Reward",
      "Belief · Test · Outcome · Lesson",
      "Virtue · Vice · Benefit · Harm",
    ],
    correctIndex: 0,
    deepDive:
      "The Stress-Test Table (Ch. 6, p. 144): Value · Temptation · Cost of Integrity · Payoff of Fidelity. Writing it on paper makes the trade-off harder to rationalize away.",
  },

  // ── Creativity & Expression ───────────────────────────────────────
  {
    areaId: "creativity-culture",
    text: "The Identity Matrix has four quadrants. Which is NOT one of them?",
    options: [
      "Enduring Essence",
      "Evolving Expression",
      "Replaceable Skills",
      "Profitable Niches",
    ],
    correctIndex: 3,
    deepDive:
      "The Identity Matrix (Ch. 5, p. 119): Enduring Essence, Evolving Expression, Replaceable Skills, and Yet to Be Cultivated. Profitability is not a quadrant — the matrix is about self-knowledge, not market value.",
  },

  // ── Four Postures (cross-area) ────────────────────────────────────
  {
    areaId: "identity-purpose",
    text: "Which is NOT one of the Four Postures from the AI Salon guide?",
    options: ["Curiosity", "Intentionality", "Clarity", "Competence"],
    correctIndex: 3,
    deepDive:
      "The Four Postures are Curiosity, Intentionality, Clarity, and Care. Competence is conspicuously absent — the guide argues flourishing is postural, not skill-based.",
  },
  {
    areaId: "identity-purpose",
    text: 'What does the posture of "Care" mean, per the guide?',
    options: [
      "Choose human flourishing over pure optimization",
      "Be polite to AI assistants",
      "Take care of your own mental health first",
      "Care for the data you feed AI",
    ],
    correctIndex: 0,
    deepDive:
      'Care: "Choose human flourishing over pure optimization." The guide frames care as a competitive edge, not a moral nicety.',
  },
];

/**
 * Generate the full quiz question set for the "AI & Human Flourishing" session.
 *
 * Returns ~18 questions covering all six conversation areas, ordered by
 * area number then question order. Each question has a stable tempId so
 * the admin can re-run the generator idempotently (matching tempId =
 * no duplicate insert).
 */
export function generateFlourishingQuizQuestions(): GeneratedQuizQuestion[] {
  const areaById = new Map<string, ConversationArea>(
    conversationAreas.map((a) => [a.id, a]),
  );

  return QUESTION_BANK.map((q, i) => {
    const area = areaById.get(q.areaId);
    if (!area) {
      throw new Error(
        `QUESTION_BANK[${i}] references unknown areaId "${q.areaId}"`,
      );
    }
    return {
      tempId: `${q.areaId}--q${i + 1}`,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      deepDive: q.deepDive,
      sourceAreaId: q.areaId,
      timeLimitSec: q.timeLimitSec ?? null,
    };
  });
}

/**
 * Compact summary for admin UI — area name + question count.
 */
export function getQuizContentStats(): {
  totalQuestions: number;
  byArea: Array<{ areaId: string; areaTitle: string; count: number }>;
} {
  const questions = generateFlourishingQuizQuestions();
  const byArea = conversationAreas
    .map((a) => ({
      areaId: a.id,
      areaTitle: a.title,
      count: questions.filter((q) => q.sourceAreaId === a.id).length,
    }))
    .filter((a) => a.count > 0);

  return {
    totalQuestions: questions.length,
    byArea,
  };
}

export { fourPostures };
