/**
 * AI Salon — Facilitator's Field Guide
 * Content extracted from "AI & Human Flourishing: A Facilitator's Field Guide for Chapter Conversations"
 * Source book: "AI and the Art of Being Human" by Jeff Abbott & Andrew Maynard
 */

export interface Quote {
  text: string;
  source: string; // e.g. "Ch. 3, p. 80"
}

export interface Question {
  id: string;
  text: string;
}

export interface Tool {
  name: string;
  source: string; // e.g. "CH. 3, P. 74"
  description: string;
  recipe: string; // Run-it instructions
  duration?: string;
  /** Optional slug linking this guide entry to a dedicated tool page under /tools/[slug]. */
  toolSlug?: string;
}

export interface ConversationArea {
  id: string;
  number: string; // "01"
  title: string;
  framing: string; // The framing question
  quotes: Quote[];
  questions: Question[];
  stories: string;
  tools: Tool[];
  vow: string;
  facilitatorNote?: string;
  fieldNotes?: { lab: string; bench: string } | { field: string };
}

export const founderNote = `I've always felt more at home on Main Street than on Wall Street — the place where people say hello, where the question under the question is always human. That's the whole wager of this campaign. Our chapters don't lead with "what can AI do?" We lead with the quieter, harder one: who are you becoming while it does it — and what will you choose to remain?

This guide gives you six conversation areas, each grounded in AI and the Art of Being Human. My co-author Andrew Maynard brings the academic altitude — the research on responsible innovation and human futures from his work at ASU. I bring the practitioner's floor: a VC who's watched perfect strategies collapse on contact with reality, and who believes care is a competitive edge, not a moral nicety. Keep both voices in the room. The friction between the lab and the bench is where the good conversation lives.`;

export const founder = {
  name: "Jeff Abbott",
  role: "Founder, AI Salon · Co-author, AI and the Art of Being Human",
};

export interface Posture {
  name: string;
  description: string;
}

export const fourPostures: Posture[] = [
  {
    name: "Curiosity",
    description: "Stay willing to be surprised — resist defaulting to the obvious answer.",
  },
  {
    name: "Intentionality",
    description: "Choose consciously rather than following algorithmic momentum.",
  },
  {
    name: "Clarity",
    description: "See what the model misses — the human context beneath the data.",
  },
  {
    name: "Care",
    description: "Choose human flourishing over pure optimization.",
  },
];

export const salonElements: string[] = [
  "A frame — the human question beneath the technical one.",
  "Read-aloud lines — short quotes (with page numbers) to set the temperature.",
  "Questions — open prompts to put on the table; pick three, don't rush.",
  "Stories — named characters from the book to anchor the abstract.",
  "Tools — one or two, each with a \"run-it-in-the-room\" recipe.",
  "A one-line vow — something to carry out the door.",
];

export const salonPractices: { title: string; body: string }[] = [
  {
    title: "Three is enough",
    body: "The smallest viable community is three people. You don't need thirty.",
  },
  {
    title: "Check in before you dig in",
    body: "Borrow Diana's three questions — curiosity, concern, care — to open.",
  },
  {
    title: "Hold space, gently",
    body: "Well-Being especially can open real doors. Host the conversation; don't diagnose it. If something heavy surfaces, honor it and point toward trusted support.",
  },
];

export const conversationAreas: ConversationArea[] = [
  {
    id: "identity-purpose",
    number: "01",
    title: "Identity & Purpose",
    framing:
      "When a machine can imitate what you do, the question turns inward — who are you when output is no longer the proof?",
    quotes: [
      {
        text: "We don't make art because we're skilled, but because we're mortal.",
        source: "Ch. 3, p. 80",
      },
      {
        text: "The mirror of AI shows us what we do. The question is: what will we choose to become?",
        source: "Ch. 3, p. 87",
      },
    ],
    questions: [
      {
        id: "id-1",
        text: "When you first watched AI do something you thought was yours, what came up — amazement, excitement, or anxiety? Sit with whichever it was.",
      },
      {
        id: "id-2",
        text: "List ten things you'll do this week. Tag each Replicable, Relational, or Transcendent. Where are most of your hours going?",
      },
      {
        id: "id-3",
        text: "What would you keep doing even if AI did it better than you tomorrow — and why that?",
      },
      {
        id: "id-4",
        text: "The book asks us to stop being special and start being real. Where are you still performing specialness?",
      },
      {
        id: "id-5",
        text: "Finish the line: \"What makes me irreplaceable isn't what I do — it's ______.\"",
      },
      {
        id: "id-6",
        text: "FROM THE FIELD: So much identity is welded to a title or a rung on the ladder. If AI loosens that grip, is it liberation from the \"one path\" — or the loss of the scaffolding we used to know ourselves by?",
      },
    ],
    stories:
      "Kaia Lee, a Brooklyn watercolorist, discovers a subreddit of AI pieces that have learned her exact signature — and has to ask what's left that's hers (Ch. 5). Dorian, an Amsterdam painter, stops defending technique and starts painting blindfolded: \"what the machine cannot want\" (Ch. 3).",
    tools: [
      {
        name: "Human Qualities Spectrum (R–L–T)",
        source: "CH. 3, P. 74",
        description:
          "Sorts what you do into Replicable, Relational, and Transcendent — not to compete with AI, but to see where to invest yourself.",
        recipe:
          "Sticky notes out. Each person lists ten activities, tags each R / L / T, and posts them on a wall drawn as a left-to-right spectrum. Stand back together — where does the room cluster, and what does that reveal?",
        duration: "15 min",
        toolSlug: "human-qualities-spectrum",
      },
      {
        name: "Identity Matrix",
        source: "CH. 5, P. 119",
        description:
          "Four honest quadrants: Enduring Essence, Evolving Expression, Replaceable Skills, and Yet to Be Cultivated.",
        recipe:
          "Draw the grid; fill it brutally honestly. Then pair-share one thing from \"Yet to Be Cultivated\" you've been postponing — and one small step toward it.",
        duration: "15 min",
        toolSlug: "identity-matrix",
      },
    ],
    vow: "I'll let AI carry the replicable, so I can give my life to the transcendent.",
  },
  {
    id: "education-development",
    number: "02",
    title: "Education & Development",
    framing:
      "If AI can hand us every answer, the work of learning becomes protecting the struggle — and the curiosity — that actually grows a person.",
    quotes: [
      {
        text: "Building ethical AI makes the builders more ethical.",
        source: "Ch. 11",
      },
      {
        text: "AI responds powerfully to curiosity — but it cannot generate it.",
        source: "Ch. 1",
      },
    ],
    questions: [
      {
        id: "ed-1",
        text: "David built \"productive-struggle\" delays into his office-hours bot so students reach the insight themselves. Where does instant AI help rob us of the struggle that grows us?",
      },
      {
        id: "ed-2",
        text: "Name one skill where AI is your tutor right now — and one where it's your crutch. How do you tell them apart?",
      },
      {
        id: "ed-3",
        text: "Curiosity is the one move AI can answer but never originate. How do we protect it — in our kids, our teams, ourselves?",
      },
      {
        id: "ed-4",
        text: "If building ethical AI makes the builder more ethical, what would a project look like that grows the learner, not just the output?",
      },
      {
        id: "ed-5",
        text: "What did you once teach yourself that no algorithm assigned — and what made you reach for it?",
      },
      {
        id: "ed-6",
        text: "FROM THE FIELD: There's a quiet danger in going to AI first, before we've thought at all. How do we teach people to think with AI rather than instead of thinking?",
      },
    ],
    stories:
      "David, a Michigan professor of thirty-seven years, turns AI's threat to teaching into \"the irreplaceable moment of recognition when a student realizes they're capable of more than they imagined\" (Ch. 11). Mateo in São Paulo holds his values steady while his build adapts to the phones favela students actually carry (Ch. 2).",
    tools: [
      {
        name: "The Curiosity Loop",
        source: "CH. 1, P. 29",
        description:
          "Notice → Question → Experiment → Reflect — a repeatable way to turn defensiveness about AI into learning.",
        recipe:
          "Each person names one AI thing they've quietly dismissed. Take a single example through all four movements aloud, as a group. Watch a reaction become a question.",
        duration: "15 min",
        toolSlug: "the-curiosity-loop",
      },
      {
        name: "STARS Framework",
        source: "CH. 5, P. 125",
        description:
          "Designs a practice that sticks: Small, Time-boxed, Accountable, Reflective, Social.",
        recipe:
          "Pick one capability to grow. Sketch a 30-day micro-practice hitting all five elements — then name your accountability partner in the room before you leave.",
        duration: "10 min",
        toolSlug: "stars-framework",
      },
    ],
    vow: "I'll use AI to deepen learning, never to outsource the struggle that grows me.",
  },
  {
    id: "work-economic",
    number: "03",
    title: "Work & Economic Life",
    framing:
      "The efficient answer and the human answer aren't always the same answer. The edge belongs to those who can hold both — and conduct between them.",
    quotes: [
      {
        text: "Locally intelligent, not just artificially intelligent.",
        source: "Ch. 8, p. 204",
      },
      {
        text: "The real returns come from integration. Not balance — integration.",
        source: "Ch. 8, p. 206",
      },
    ],
    questions: [
      {
        id: "we-1",
        text: "Mira's optimizer said \"close the depots.\" Context said they were the region's largest employer. When has the efficient answer been the wrong answer in your work?",
      },
      {
        id: "we-2",
        text: "Run the Orchestration Triangle on a live decision: where are you over-trusting data, ignoring intuition, or missing context?",
      },
      {
        id: "we-3",
        text: "The book's wager is that care is a competitive edge, not overhead. Do you buy that — on Main Street, in your market?",
      },
      {
        id: "we-4",
        text: "Carlos refused to reduce workers to efficiency scores and found value hiding inside apparent inefficiency. What \"inefficiency\" of yours is actually relationship capital?",
      },
      {
        id: "we-5",
        text: "Which part of your role is Replicable — and what are you doing now to climb toward the Relational and Transcendent before the market asks?",
      },
      {
        id: "we-6",
        text: "FROM THE FIELD: When the math makes automation rational, the real question isn't \"can we?\" but \"what do we owe the people displaced?\" Where does that duty sit — the founder, the market, or the state?",
      },
    ],
    stories:
      "Mira, an Italian VC facing a 5 a.m. algorithmic verdict on three depots, builds a \"Score Sheet\" and finds a third path the model couldn't see (Ch. 8). Devon, a London jazz conductor, reframes his triangle as Sheet Music, Soul, Story (Ch. 8). Carlos in Manila engineers \"dignity buffers\" into his logistics network (Ch. 6).",
    tools: [
      {
        name: "The Orchestration Triangle",
        toolSlug: "the-orchestration-triangle",
        source: "CH. 8, P. 197",
        description:
          "Integrates three ways of knowing — Data, Intuition, Context — so you conduct them instead of defaulting to one.",
        recipe:
          "Each person writes tomorrow's biggest decision in the center of a triangle, marks where it's currently landing, and names the corner going silent. Discuss what changes if you bring it back in.",
        duration: "15 min",
      },
      {
        name: "Stress-Test Table",
        source: "CH. 6, P. 144",
        description:
          "Makes a values trade-off concrete: Value · Temptation · Cost of Integrity · Payoff of Fidelity.",
        recipe:
          "Take a real pressure you're under. Fill all four columns on paper — writing makes the trade-off harder to rationalize away — and read one row aloud.",
        duration: "10 min",
        toolSlug: "stress-test-table",
      },
    ],
    fieldNotes: {
      bench:
        "From the bench (Jeff): Too many perfect strategies collapse on contact with reality. The depots aren't line items — they're the town's largest employer. Returns live in what the model can't price.",
      lab:
        "From the lab (Andrew): What if care isn't overhead but infrastructure — the thing that lets you move faster in the right direction? Responsible practice, research shows, accelerates rather than slows.",
    },
    vow: "I'll use AI to integrate data, intuition, and context — never to abdicate the decision.",
  },
  {
    id: "wellbeing",
    number: "04",
    title: "Well-Being & Mental Health",
    framing:
      "We've never been more connected or more depleted. The pause — ninety seconds or seven minutes — is where wisdom catches up with capability.",
    quotes: [
      {
        text: "The pause is where we remember to see.",
        source: "Ch. 9, p. 210",
      },
      {
        text: "Haste is a bad advisor.",
        source: "Ch. 4, p. 105",
      },
    ],
    questions: [
      {
        id: "wb-1",
        text: "The Surgeon General calls loneliness an epidemic even as we're hyper-connected. Where does your technology promise connection but deliver simulation?",
      },
      {
        id: "wb-2",
        text: "Hiro set a seven-minute timer in the middle of a crisis. When did a pause last change a decision you were about to make?",
      },
      {
        id: "wb-3",
        text: "Which notifications manufacture an urgency that isn't real? What would you reclaim by turning them off?",
      },
      {
        id: "wb-4",
        text: "Many traditions institutionalize the pause — Shabbat, tafakkur, Ubuntu's \"I am because we are.\" What's your built-in pause?",
      },
      {
        id: "wb-5",
        text: "Where do you feel the tightness before the mind admits something's off — and do you let yourself listen to it?",
      },
      {
        id: "wb-6",
        text: "FROM THE FIELD: AI will always validate you — but validation isn't the same as healing. Where are you reaching for something that makes you feel heard rather than something that helps you grow?",
      },
    ],
    stories:
      "Hiro Tanaka, an Osaka engineer eight hours from a demo, takes mu no jikan — the time of nothingness his grandmother taught him — and ships a fairer model (Ch. 4). Sara in Monterrey turns a single paused decision into citywide \"Algorithmic Pause Points\" (Ch. 4). The evidence backs the instinct: the WHO surgical-checklist pause cut mortality by 47%.",
    tools: [
      {
        name: "The 7-Minute Clarity Pause",
        source: "CH. 4, P. 97",
        description:
          "A structured pause — Breathe → Scan → Center → Decide & Log — for decisions that carry real human weight.",
        recipe:
          "Do it together. Set a timer, screens down, one minute of breath, two minutes scanning the four lenses, three minutes of quiet, then each person writes one line that haste would have hidden.",
        duration: "7 min",
        toolSlug: "7-minute-clarity-pause",
      },
      {
        name: "The 4-Lens Scan",
        source: "CH. 4, P. 95",
        description:
          "A 90-second scan that surfaces what algorithms hide: Stakeholders, Bias Check, Long-Term Ripples, Inner State.",
        recipe:
          "Each person brings one recent AI-mediated decision, runs all four lenses, and shares a single surprise — the stakeholder, bias, or ripple they hadn't seen.",
        duration: "10 min",
        toolSlug: "4-lens-scan",
      },
    ],
    facilitatorNote:
      "This theme can open real doors. Keep it reflective, not clinical — you're hosting a conversation, not a diagnosis. If something heavy surfaces for someone, honor it gently and point them toward a trusted person or professional support. Presence is the gift here, not a fix.",
    vow: "I'll treat the pause as found time, so wisdom can catch up with capability.",
  },
  {
    id: "relationships-community",
    number: "05",
    title: "Relationships & Community",
    framing:
      "In an atomizing age, connection is a quiet rebellion. The smallest unit of resistance — and of the AI Salon — is three people willing to show up.",
    quotes: [
      {
        text: "The smallest viable community is three people.",
        source: "Ch. 12, p. 281",
      },
      {
        text: "Presence is a form of resistance.",
        source: "Ch. 7, p. 330",
      },
    ],
    questions: [
      {
        id: "rc-1",
        text: "\"The smallest viable community is three people.\" Who are your two? What would you gather to figure out together?",
      },
      {
        id: "rc-2",
        text: "Diana's porch circles use a three-question check-in — curiosity, concern, care. Try it tonight with someone. What surfaces that small talk misses?",
      },
      {
        id: "rc-3",
        text: "Tom's granddaughter was flagged \"at-risk\" by an algorithm; he just called her. When has a number stood in for a relationship in your life?",
      },
      {
        id: "rc-4",
        text: "What does \"presence as resistance\" look like in one week of yours? Where could you choose the room over the feed?",
      },
      {
        id: "rc-5",
        text: "If this chapter became a standing circle, what's our one-sentence purpose — specific enough to guide, open enough to evolve?",
      },
      {
        id: "rc-6",
        text: "FROM THE FIELD: Trust is built from shared experience over time, not from a questionnaire match. Where has an algorithm tried to shortcut a relationship in your life — and what did it miss?",
      },
    ],
    stories:
      "Diana, a Denver consultant, builds \"fourth spaces\" on her porch where neighbors meet technological change through shared bewilderment, not expertise (Ch. 7). Phoenix's pod becomes a model for \"Civic AI Circles\" in Arizona libraries; a Nairobi guild spawns twelve sister chapters across East Africa (Ch. 12).",
    tools: [
      {
        name: "The Starter Charter",
        source: "CH. 12, P. 277",
        description:
          "Four questions answered together in 30 minutes: Purpose, Norms, Cadence, Roles.",
        recipe:
          "If the room wants to keep meeting, draft the charter live. One-sentence purpose first — constraint forces clarity. Rotate roles so no hierarchy hardens.",
        duration: "20 min",
        toolSlug: "starter-charter",
      },
      {
        name: "Micro-Circles",
        source: "CH. 7",
        toolSlug: "micro-circle-launch-kit",
        description:
          "The smallest viable community — three people and a check-in — the seed of every Salon chapter.",
        recipe:
          "Form trios. Each person shares one AI encounter from the week through the three questions: what made you curious, what raised concern, where did care lead you?",
        duration: "10 min",
      },
    ],
    vow: "I'll use AI to gather people — never to replace presence.",
  },
  {
    id: "creativity-culture",
    number: "06",
    title: "Creativity & Culture",
    framing:
      "The machine can execute. We decide what to make, what to keep, and whose lineage to honor. The question isn't \"is it art?\" but \"is it human?\"",
    quotes: [
      {
        text: "It gave us permission to be weirder.",
        source: "Ch. 10, p. 238",
      },
      {
        text: "The question 'Is it art?' matters less than 'Is it human?'",
        source: "Ch. 10, p. 242",
      },
    ],
    questions: [
      {
        id: "cc-1",
        text: "Jamie says AI \"gave us permission to be weirder.\" Where has a machine pushed you past your own self-censorship — and where did it flatten you into sameness?",
      },
      {
        id: "cc-2",
        text: "The book swaps \"is it art?\" for \"is it human?\" — does it carry the mark of a particular consciousness? What makes a creation yours?",
      },
      {
        id: "cc-3",
        text: "Try an influence audit: name the real sources behind something you made with AI. What does honoring your \"creative lineage\" change?",
      },
      {
        id: "cc-4",
        text: "Leo added hand-drawn stardust to an AI design and said, \"that part's mine.\" What's your stardust — the irreducible human mark?",
      },
      {
        id: "cc-5",
        text: "What piece of your local culture deserves to be carried into the AI age on your terms, not flattened by a global model?",
      },
      {
        id: "cc-6",
        text: "FROM THE FIELD: Beethoven kept composing after he went deaf — compelled by something the ear couldn't give him. What do you make out of sheer inner necessity, that nobody asked you for?",
      },
    ],
    stories:
      "At Kinetic Koala Games, a 2:47 a.m. haiku becomes a fog beast, then a 48-hour game jam, then a \"Creative Lineage\" credit honoring everyone from Bosch to whale researchers (Ch. 10). In Stockholm, Leo & Maia turn a skateboard graphic into a lesson in critical AI literacy (Ch. 10).",
    tools: [
      {
        name: "Multimodal Ideation Sprint",
        source: "CH. 10, P. 236",
        description:
          "Seed → Generate → Remix → Stress-test → Polish, with an influence audit baked in — velocity without losing the human hand.",
        recipe:
          "Pick one shared creative prompt. Sprint it as a group through the five movements, switching mediums as you go, and document the creative lineage out loud.",
        duration: "30–45 min",
        toolSlug: "multimodal-ideation-sprint",
      },
      {
        name: "Prompt-Scaffolding Canvas",
        source: "CH. 10, P. 244",
        description:
          "Frame · Fuel · Flip · Filter — runs a prompt through the four postures before you ever type it.",
        recipe:
          "Fill the four F's for a real project. Then compare a \"cold\" prompt with the scaffolded one — read both results aloud and feel the difference.",
        duration: "15 min",
        toolSlug: "prompt-scaffolding-canvas",
      },
    ],
    vow: "I'll use AI to be weirder and more myself — and to honor every source I borrow from.",
  },
];

export const commitmentLadder: { timeframe: string; body: string }[] = [
  {
    timeframe: "In 24 hours",
    body: "One tiny, real action — print the Pocket Card, message the two people you'd build a circle with.",
  },
  {
    timeframe: "In 30 days",
    body: "A learning review — what worked, what was harder than expected, how your understanding shifted.",
  },
  {
    timeframe: "In 1 year",
    body: "Teach someone. Start a chapter. Wisdom hoarded helps no one.",
  },
];

export const readerToConvenerIntro = `Every one of these conversations is a seed. The book becomes the curriculum; the chapter becomes the circle; the circle becomes the flywheel. That's how a small-town hello scales into a global community — not by broadcasting, but by gathering, three people at a time.`;
