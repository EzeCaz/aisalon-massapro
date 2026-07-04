/**
 * AI Salon — Tools
 * Content extracted from "Tools-merged.pdf"
 * Source book: "AI and the Art of Being Human" by Jeff Abbott & Andrew Maynard
 */

export interface ToolStep {
  label: string;
  body: string;
}

export interface SalonTool {
  slug: string;
  name: string;
  chapter: string;        // human label, e.g. "Ch. 4" or "Prelude"
  chapterLine: string;    // full line, e.g. "From Chapter 4 of AI and the Art of Being Human"
  areaId: string;         // conversation area id (or "reader-to-convener")
  areaTitle: string;
  accent: "cyan" | "pink";
  icon: string;           // Lucide icon name
  duration: string;       // e.g. "90 sec", "7 min"
  whatItIs: string;
  whenToUse: string[];
  toolIntro: string;
  steps: ToolStep[];
  howToUse: string;
}

export const tools: SalonTool[] = [
  {
    slug: "4-lens-scan",
    name: "4-Lens Scan",
    chapter: "Ch. 4",
    chapterLine: "From Chapter 4 of AI and the Art of Being Human",
    areaId: "wellbeing",
    areaTitle: "Well-Being & Mental Health",
    accent: "cyan",
    icon: "ScanSearch",
    duration: "90 sec",
    whatItIs: "A 90-second practice that makes visible what algorithms hide—the human stories, biases, and consequences that efficiency sometimes obscures.",
    whenToUse: ["Before accepting any AI alert or recommendation", "When an app suggests urgent action", "When algorithmic scoring affects real people", "Before making any AI-mediated decision about others"],
    toolIntro: "Four Lenses to reveal the invisible",
    steps: [{ label: "Stakeholders", body: "Who risks becoming invisible when we optimize and blindly follow AI? Name specific people the system doesn’t see" }, { label: "Bias Check", body: "What assumptions are hiding in the code? What “normal” does it assume that excludes others?" }, { label: "Long-Term Ripples", body: "What are the potential or possible long-term consequences of decisions and actions?" }, { label: "Inner State", body: "What’s driving you—actual reality or the story the algorithm is telling? Fear or anxiety over what exactly?" }],
    howToUse: "Take just 90 seconds. When an AI system pushes you to act, quickly scan all four lenses before responding. Ask yourself: Who else is affected? What bias is baked in? What type of future am I creating? Am I seeing real threats, or merely seeing what the app trained me to see? Write one insight from each lens if you have time. With practice, this becomes as natural as checking your mirrors before changing lanes while driving—a quick scan that prevents harm.",
  },
  {
    slug: "7-minute-clarity-pause",
    name: "7-Minute Clarity Pause",
    chapter: "Ch. 4",
    chapterLine: "From Chapter 4 of AI and the Art of Being Human",
    areaId: "wellbeing",
    areaTitle: "Well-Being & Mental Health",
    accent: "cyan",
    icon: "Timer",
    duration: "7 min",
    whatItIs: "A structured 7-minute pause that creates space for wisdom when pressure mounts—like a pre-flight checklist for decisions that matter.",
    whenToUse: ["Before deploying any AI system or major feature", "When pressure to ship conflicts with ethical concerns", "When facing a decision with lasting human impact", "When you sense something’s wrong but can’t articulate what"],
    toolIntro: "Seven Minutes (set a timer)",
    steps: [{ label: "Minute 1 — Breathe", body: "Step away from all screens. Three deep breaths: in through the nose, hold for four counts, out through the mouth." }, { label: "Minutes 2–3 — Scan", body: "Run the 4-Lens Scan on your situation (Stakeholders, Bias Check, Long-Term Ripples, Inner State)." }, { label: "Minutes 4–6 — Center", body: "Find the quiet beneath the urgency. What would you choose if there were no pressure? Listen for wisdom." }, { label: "Minute 7 — Decide & Log", body: "Record your decision. Include why you chose this path." }],
    howToUse: "When stakes are high and pressure is mounting, set a 7-minute timer and follow this exactly. Don’t skip steps or rush. The breathing resets your nervous system. The scan reveals what urgency hides. The centering connects you to more profound wisdom. The physical writing makes your choice concrete. This isn’t meditation—it’s a discipline for accessing your full capacity when it matters most.",
  },
  {
    slug: "care-loop",
    name: "CARE Loop",
    chapter: "Ch. 9",
    chapterLine: "From Chapter 9 of AI and the Art of Being Human",
    areaId: "wellbeing",
    areaTitle: "Well-Being & Mental Health",
    accent: "cyan",
    icon: "HeartHandshake",
    duration: "20 min",
    whatItIs: "A team practice that scales individual clarity into organizational compassion and systematic care.",
    whenToUse: ["When your team needs to embed care and dignity into AI systems and their use", "When implementing AI that affects employees, customers, or other stakeholders", "When organizational speed conflicts with human care", "When you need to build care into company culture, not just compliance"],
    toolIntro: "Four Movements for teams",
    steps: [{ label: "Context", body: "Map the whole system—who’s affected, what assumptions exist, how different worlds collide in one space" }, { label: "Acknowledge", body: "Name impacts honestly in team settings—make the invisible visible to everyone, not just leadership" }, { label: "Respond", body: "Act at two scales—immediate adjustments in the present, systemic changes in the near future" }, { label: "Evaluate", body: "Review patterns using both metrics and stories—schedule regular “Reflection Hours” to ask what’s working" }],
    howToUse: "Make this a weekly team practice. Pick one AI process affecting people. Spend 30 minutes running the complete loop together. Document what you discover. Implement at least one immediate fix and identify one systemic change.",
  },
  {
    slug: "commitment-ladder",
    name: "Commitment Ladder",
    chapter: "Ch. 13",
    chapterLine: "From Chapter 13 of AI and the Art of Being Human",
    areaId: "reader-to-convener",
    areaTitle: "Become a Convener",
    accent: "pink",
    icon: "TrendingUp",
    duration: "5 min",
    whatItIs: "Three escalating timeframes that transform your vow from today’s inspiration into sustained practice and shared wisdom.",
    whenToUse: ["Immediately after making your One-Line Vow", "When previous commitments have failed due to a lack of structure", "When you need accountability at multiple scales", "When you want to contribute to collective learning"],
    toolIntro: "Three Rungs (schedule all three now)",
    steps: [{ label: "24 hours", body: "One tiny immediate action that makes your vow real— ask a colleague, install a reminder, print the Pocket Card" }, { label: "30 days", body: "Calendar a learning review right now—what worked, what’s harder than expected, how has understanding evolved?" }, { label: "1 year", body: "Commit to teaching others—start a circle, mentor someone, write about what you’ve learned. Remember that wisdom hoarded helps no one." }],
    howToUse: "After making your vow, immediately schedule all three commitments in your calendar. The 24-hour action must be specific and doable tomorrow. Block 30 minutes exactly one month out for reflection. Set a 1-year reminder to share what you’ve learned. This ladder transforms inspiration into implementation—each rung builds on the last. Small immediate actions create momentum, monthly reviews enable learning, and yearly teaching ensures wisdom spreads.",
  },
  {
    slug: "community-flywheel",
    name: "Community Flywheel",
    chapter: "Ch. 12",
    chapterLine: "From Chapter 12 of AI and the Art of Being Human",
    areaId: "relationships-community",
    areaTitle: "Relationships & Community",
    accent: "pink",
    icon: "Users",
    duration: "20 min",
    whatItIs: "A self-reinforcing cycle for building AI-focused communities where each phase generates momentum for the next.",
    whenToUse: ["When launching a group to navigate AI’s possibilities and possible impacts together", "When assessing why your community is struggling", "When planning sustainable growth for your wider circle", "When transitioning from solo learning to collective wisdom"],
    toolIntro: "Four Phases that build momentum",
    steps: [{ label: "Spark", body: "Recognition that others share your challenge— the curiosity to ask “Who else is grappling with this?”" }, { label: "Structure", body: "Making agreements explicit—regular meeting times, clear roles, shared practices that transform gathering into habit" }, { label: "Scale", body: "Natural growth through resonance—authentic practice attracts the right people without aggressive recruitment" }, { label: "Sustain", body: "Planning for evolution—successful communities build in their own transformation as members grow beyond initial needs" }],
    howToUse: "Identify which phase your community is in. Focus your energy on moving to the next phase rather than skipping ahead. Don’t rush from Spark to Scale—Structure is crucial for sustainability. Like a physical flywheel, each complete rotation makes the next easier. Small, consistent actions build more momentum than grand gestures. Communities that thrive recognize this is a cycle, not a ladder.",
  },
  {
    slug: "human-qualities-spectrum",
    name: "Human Qualities Spectrum",
    chapter: "Ch. 3",
    chapterLine: "From Chapter 3 of AI and the Art of Being Human",
    areaId: "identity-purpose",
    areaTitle: "Identity & Purpose",
    accent: "pink",
    icon: "Spectrum",
    duration: "15 min",
    whatItIs: "A way to understand which human qualities AI can replicate and which remain uniquely ours—not to compete, but to focus on what matters.",
    whenToUse: ["When AI matches or exceeds your professional capabilities", "When questioning your value as machines improve", "When deciding where to invest your development energy", "When feeling threatened by AI replicating your style or skills"],
    toolIntro: "A Spectrum flowing left to right",
    steps: [{ label: "Replicable (left)", body: "Skills AI can master — calculation, pattern recognition, and even certain creativity. Most \"knowledge work\" lives here." }, { label: "Relational (middle)", body: "Human presence and context — emotional attunement, reading the room, navigating unique moments. AI participates but misses deeper currents." }, { label: "Transcendent (right)", body: "What emerges from being human — meaning-making, moral imagination, choosing to find sacred what others call ordinary. These arise from having something at stake." }],
    howToUse: "List 10 activities that define your work or identity. Place each somewhere on the spectrum from Replicable to Transcendent. Be honest—many skills you’re proud of may fall toward the Replicable end, and that’s okay. The insight comes from seeing where you cluster: are you investing primarily in the left side where AI will eventually excel? Shift your focus toward developing qualities further to the right on the spectrum—not to be special, but to be fully human. Remember: this isn’t a hierarchy; we need all parts of the spectrum, but must stop pretending the left side makes us irreplaceable.",
  },
  {
    slug: "identity-matrix",
    name: "Identity Matrix",
    chapter: "Ch. 5",
    chapterLine: "From Chapter 5 of AI and the Art of Being Human",
    areaId: "identity-purpose",
    areaTitle: "Identity & Purpose",
    accent: "pink",
    icon: "LayoutGrid",
    duration: "15 min",
    whatItIs: "A map to help distinguish what AI can automate from what makes you irreducibly you—not to compete, but to know where to focus your growth.",
    whenToUse: ["When AI replicates your professional style or signature", "When questioning your value, as machines match your skills", "When deciding where to invest your development energy", "When your expertise feels suddenly replaceable"],
    toolIntro: "Four Quadrants (be brutally honest)",
    steps: [{ label: "Enduring Essence", body: "Core qualities that persist across contexts— your particular way of seeing, your specific flavor of curiosity. These sound simple, but are infinitely complex" }, { label: "Evolving Expression", body: "How your essence shows up differently as you grow—same core, but different manifestations over time" }, { label: "Replaceable Skills", body: "The techniques you’ve mastered that AI can learn; even the ones you’re proud of. Being honest here is crucial" }, { label: "Yet To Be Cultivated", body: "Latent abilities you’ve thought about developing but haven’t pursued—the engineer who suspects they could teach, the analyst who wants to write" }],
    howToUse: "List your capabilities and qualities across all four quadrants. You may resist putting hard-won skills in “Replaceable”—that’s normal. The insight comes from seeing the whole picture: Are you defending Replaceable territory while ignoring your Enduring Essence? What possibilities in Yet To Be Cultivated have you been postponing? Focus development on Essence and unexplored potential, not on competing, where AI will eventually excel.",
  },
  {
    slug: "intent-map",
    name: "Intent Map",
    chapter: "Ch. 2",
    chapterLine: "From Chapter 2 of AI and the Art of Being Human",
    areaId: "identity-purpose",
    areaTitle: "Identity & Purpose",
    accent: "pink",
    icon: "Compass",
    duration: "15 min",
    whatItIs: "A simple visual tool that makes your values visible before momentum or pressure takes decisions away from you.",
    whenToUse: ["Before implementing any AI system in your organization", "When speed and ethics seem to conflict", "When you need to clarify what matters most in a project", "When your team needs alignment on non-negotiables"],
    toolIntro: "Four Quadrants (draw a simple grid)",
    steps: [{ label: "Values (upper left)", body: "What you refuse to compromise, no matter the pressure." }, { label: "Desired Outcomes (upper right)", body: "The specific, concrete outcomes or changes you're seeking." }, { label: "Guardrails (lower left)", body: "Hard boundaries — what you absolutely won't do." }, { label: "Metrics (lower right)", body: "How you'll measure what actually matters, not only what's easy to count." }],
    howToUse: "Draw a simple grid—this could be on a napkin. Fill each quadrant in order, spending no more than an hour on your first version. Start with Values (your non-negotiables), then Outcomes (what specific change you want), then Guardrails (your “never do this” boundaries), finally Metrics (measuring meaning, not just numbers). The magic is in how they connect: values without metrics are just words; metrics without values optimize for the wrong things. Review monthly and adjust based on what you’re learning.",
  },
  {
    slug: "micro-circle-launch-kit",
    name: "Micro-Circle Launch Kit",
    chapter: "Ch. 7",
    chapterLine: "From Chapter 7 of AI and the Art of Being Human",
    areaId: "relationships-community",
    areaTitle: "Relationships & Community",
    accent: "pink",
    icon: "UserPlus",
    duration: "30 min",
    whatItIs: "Essential elements for starting a sustainable community to navigate AI’s impact together.",
    whenToUse: ["When solo efforts to understand AI feel insufficient", "When you need collective wisdom for making sense of AI and its opportunities and potential", "consequences", "When building a support network for technological change", "When creating space for shared learning about AI"],
    toolIntro: "Five Components for sustainable gatherings",
    steps: [{ label: "Charter", body: "One sentence stating why you gather—specific enough to guide, open enough to evolve" }, { label: "Roles", body: "Rotating functions that prevent hierarchy (examples: Host who facilitates, Witness who captures themes, someone who brings provocative questions, someone who tends to group wellbeing)" }, { label: "Rituals", body: "Consistent practices like the three-question check-in: What sparked curiosity? What concerned you? Where did you practice care?" }, { label: "Tools", body: "Minimal infrastructure—only what you need to gather (Zoom + doc, or chairs + notebook)" }, { label: "Feedback", body: "Every fourth session, a 5-minute Keep/Stop/Try review to evolve together" }],
    howToUse: "Find 2–4 others wrestling with AI’s potential opportunities and impacts. Draft your one- sentence charter together in 30 minutes. Choose a weekly or monthly cadence. Rotate all roles. Start with rituals like the three-question check-in. Keep infrastructure minimal—the constraint helps focus on connection over tools. After four sessions, run Keep/Stop/Try to adjust.",
  },
  {
    slug: "the-mirror-test",
    name: "The Mirror Test",
    chapter: "Prelude",
    chapterLine: "From the Prelude of AI and the Art of Being Human",
    areaId: "identity-purpose",
    areaTitle: "Identity & Purpose",
    accent: "pink",
    icon: "SquareSigma",
    duration: "10 min",
    whatItIs: "A three-question practice to help you understand what it means when AI seems to know you too well.",
    whenToUse: ["When an AI completes your sentences perfectly", "When a recommendation engine predicts exactly what you want", "When AI generates something in your style that others can’t distinguish from your work", "When you feel unsettled by how well technology “gets” you"],
    toolIntro: "Three Questions to ask yourself",
    steps: [{ label: "What did I just see?", body: "Describe what the AI showed you about yourself, staying neutral and factual." }, { label: "What assumptions does this reveal?", body: "Identify what the AI assumes about you based on its training and data." }, { label: "What remains uniquely mine?", body: "Name the experiences, feelings, or qualities that can't be captured by algorithms." }],
    howToUse: "When AI surprises you by knowing something uncanny about you, pause immediately. Write out answers to all three questions, taking time with each. This builds awareness of both AI’s capabilities and your irreducible humanity.",
  },
  {
    slug: "model-dignity-check",
    name: "Model Dignity Check",
    chapter: "Ch. 9",
    chapterLine: "From Chapter 9 of AI and the Art of Being Human",
    areaId: "work-economic",
    areaTitle: "Work & Economic Life",
    accent: "pink",
    icon: "ShieldCheck",
    duration: "15 min",
    whatItIs: "A pre-launch checklist for ensuring AI systems preserve human dignity and catch blind spots before they scale.",
    whenToUse: ["Before any AI system or feature goes live", "When reviewing existing AI implementations", "During design phases, to catch problems early", "When updating or retraining AI models"],
    toolIntro: "Five Questions to ask before launch",
    steps: [{ label: "Who becomes invisible when we optimize?", body: "Name specific people, not categories — \"elderly residents in walk-ups\" not \"some users\"." }, { label: "What \"normal\" is baked into the training data?", body: "Every dataset tells a story about who matters — whose reality shaped this system?" }, { label: "How does this perform for our most vulnerable users?", body: "Test on edge cases — the users with least power, resources, or technical literacy." }, { label: "Can affected humans understand and contest decisions?", body: "Opacity breeds distrust — is there a clear path to challenge the algorithm?" }, { label: "Does this strengthen or erode human agency?", body: "Are we augmenting human judgment or replacing it?" }],
    howToUse: "Before launch, document written answers to all five questions. Be specific—vague answers hide real problems. If any answer troubles you, redesign before deploying. This isn’t a compliance checkbox but a discipline for catching what pure optimization misses. Run this check again whenever you update or retrain the system.",
  },
  {
    slug: "multimodal-ideation-sprint",
    name: "Multimodal Ideation Sprint",
    chapter: "Ch. 10",
    chapterLine: "From Chapter 10 of AI and the Art of Being Human",
    areaId: "creativity-culture",
    areaTitle: "Creativity & Culture",
    accent: "cyan",
    icon: "Zap",
    duration: "30-45 min",
    whatItIs: "A rapid exploration process that builds on your Prompt-Scaffolding Canvas to generate and refine creative options across different media.",
    whenToUse: ["When you need to explore many creative directions quickly", "When working under a deadline but wanting quality", "When stuck in one medium or approach", "When balancing speed with creative and ethical reflection"],
    toolIntro: "Five Phases",
    steps: [{ label: "Seed (20 min)", body: "Generate 10–20 initial concepts — quantity over quality, include quick notes on influences you're drawing from." }, { label: "Generate (30 min)", body: "Select 3–5 promising seeds and create variations across multiple mediums — voice to text, text to image, image to sound, etc." }, { label: "Remix (30 min)", body: "Combine elements from different variations — what happens when you merge opposing directions?" }, { label: "Stress-test (15 min)", body: "Apply practical filters (will it work?) and ethical filters (does it respect sources? Create opportunity?)." }, { label: "Polish (15 min)", body: "Refine one direction engaging all four postures — Curiosity, Intentionality, Clarity, Care." }],
    howToUse: "Block out 2 hours. Move through the phases without judgment until you reach the Stress-test phase. Each phase should be a conversation with AI, not a single exchange. Document creative lineage throughout—note influences and sources. The sprint maintains momentum while building in reflection checkpoints. This isn’t about rushing but about structured exploration that keeps both creative and ethical considerations active.",
  },
  {
    slug: "one-line-vow",
    name: "One-Line Vow",
    chapter: "Ch. 13",
    chapterLine: "From Chapter 13 of AI and the Art of Being Human",
    areaId: "reader-to-convener",
    areaTitle: "Become a Convener",
    accent: "pink",
    icon: "Quote",
    duration: "5 min",
    whatItIs: "A public commitment that transforms private intentions into shared accountability for how you’ll engage with AI.",
    whenToUse: ["When ready to move from understanding to action", "When you need accountability for AI choices", "When joining others in collective commitment", "When private promises keep evaporating"],
    toolIntro: "A Simple Format “I will use AI to _______ so that _______”",
    steps: [{ label: "First blank", body: "Your specific action with AI" }, { label: "Second blank", body: "Your human-centered purpose" }],
    howToUse: "Write your vow using the format. Make it specific enough to guide daily choices, open enough to evolve as you learn. Share it publicly—on social media, in a team meeting, at a family dinner. Tell at least three people who will hold you accountable. The public declaration transforms private intention into shared commitment. Each vow is a small rebellion against passive AI consumption, a choice to engage with purpose. When thousands make vows together, individual choices become collective momentum.",
  },
  {
    slug: "pocket-card",
    name: "Pocket Card",
    chapter: "Ch. 13",
    chapterLine: "From Chapter 13 of AI and the Art of Being Human",
    areaId: "reader-to-convener",
    areaTitle: "Become a Convener",
    accent: "pink",
    icon: "CreditCard",
    duration: "1 min",
    whatItIs: "A portable reminder of the four core principles—small enough to carry, yet powerful enough to redirect you when pressures mount.",
    whenToUse: ["When notifications flood you with false urgency", "Before any AI-mediated decision", "When efficiency nudges you away from doing what you feel is right", "When you need to remember what matters most"],
    toolIntro: "Four Principles (arranged like compass points)",
    steps: [{ label: "Curiosity", body: "Stay willing to be surprised—resist defaulting to the obvious answer" }, { label: "Intentionality", body: "Choose consciously rather than following algorithmic momentum" }, { label: "Clarity", body: "See what the AI tool or model misses— the human context beneath the data" }, { label: "Care", body: "Choose human flourishing over pure optimization" }],
    howToUse: "Print the card. Laminate it if you want. Put it where you’ll see it—wallet, laptop, desk, mirror. When facing any AI decision, pull it out and consider all four principles. Let them redirect you when pressure mounts. This isn’t abstract philosophy but practical navigation—your North Star when algorithmic currents try to sweep you off course. The physical card matters— tangible wisdom in a digital world.",
  },
  {
    slug: "prompt-scaffolding-canvas",
    name: "Prompt-Scaffolding Canvas",
    chapter: "Ch. 10",
    chapterLine: "From Chapter 10 of AI and the Art of Being Human",
    areaId: "creativity-culture",
    areaTitle: "Creativity & Culture",
    accent: "cyan",
    icon: "PenTool",
    duration: "15 min",
    whatItIs: "A framework for structuring creative conversations with AI—whether single prompts or extended dialogues—with built-in ethical reflection.",
    whenToUse: ["When starting any creative project with AI assistance", "When basic interactions produce unsatisfying results", "When you want originality, not just competent outputs", "When ensuring creative ethics alongside creative quality"],
    toolIntro: "Four Quadrants to guide your conversation",
    steps: [{ label: "Frame (Intentionality)", body: "Define why you're creating and for whom — what's the emotional core and intended impact?" }, { label: "Fuel (Curiosity)", body: "Feed unexpected combinations — references, moods, wild collisions that force AI to invent, not template." }, { label: "Flip (Clarity)", body: "Invert an assumption — what if the villain is the hero? What constraint could unlock creativity?" }, { label: "Filter (Care)", body: "Set boundaries — practical (must work on mobile) and ethical (respects source artists, opens possibilities for others)." }],
    howToUse: "Before engaging with AI, spend 15 minutes filling out all four quadrants of the Canvas. Use this to guide your entire creative conversation, not just your first prompt. Frame establishes your purpose throughout. Fuel provides ongoing inspiration that you can introduce as dialogue develops. Flip helps you pivot when AI gets stuck in patterns. Filter keeps you grounded in constraints and ethical considerations across iterations. The canvas shapes the full creative partnership, not just the opening move.",
  },
  {
    slug: "roadmap-canvas",
    name: "Roadmap Canvas",
    chapter: "Ch. 11",
    chapterLine: "From Chapter 11 of AI and the Art of Being Human",
    areaId: "education-development",
    areaTitle: "Education & Development",
    accent: "cyan",
    icon: "Map",
    duration: "30 min",
    whatItIs: "A living document that transforms AI understanding into concrete action through 90-day learning cycles.",
    whenToUse: ["When ready to move from learning about AI to actively shaping your relationship with it", "When inspiration needs to become implementation", "When you have clarity but lack structure for action", "When previous AI initiatives have stalled"],
    toolIntro: "Five Elements (evolves with practice)",
    steps: [{ label: "Purpose", body: "Why this transformation matters— not what you’ll build but the more profound change you seek" }, { label: "Plays", body: "Three concrete 90-day experiments— hypotheses to test, not commitments to defend" }, { label: "Risks", body: "Honest assessment via the 4-Lens Scan —what could go wrong, who might be harmed" }, { label: "Rituals", body: "Practices that keep you grounded—not productivity hacks but anchors to purpose" }, { label: "Metrics", body: "Measuring meaning, not just numbers—include stories, energy levels, what actually matters" }],
    howToUse: "Draft version 1.0 in 30 minutes—it’s meant to be wrong. Review in 30 days, and update based on reality, not projection. Run 90-day cycles: Weeks 1–2 fill out the canvas; Weeks 3–11 run experiments; Week 12 retrospective; Week 13 reframe. Share with an accountability partner who will ask hard questions. The roadmap that changes your life is the one you actually start, not the one you perfect.",
  },
  {
    slug: "stars-framework",
    name: "STARS Framework",
    chapter: "Ch. 5",
    chapterLine: "From Chapter 5 of AI and the Art of Being Human",
    areaId: "education-development",
    areaTitle: "Education & Development",
    accent: "cyan",
    icon: "Sparkles",
    duration: "10 min",
    whatItIs: "A structured framework for translating Identity Matrix insights into sustainable daily practice.",
    whenToUse: ["After completing your Identity Matrix and identifying qualities to develop", "When you want to deepen any quality that matters to you", "When building practices that honor rather than just optimize who you are", "When solo efforts at personal development keep failing"],
    toolIntro: "Five Design Elements Build a sustainable practice for any Identity Matrix quality by incorporating these five components:",
    steps: [{ label: "Small", body: "Keep your practice to 5–30 minutes so you’ll actually do it daily—a five-minute practice maintained beats an hour-long one abandoned" }, { label: "Time-boxed", body: "Commit to following this practice for a specific period (30 days initially) rather than “forever”—finite commitments are easier to keep" }, { label: "Accountable", body: "Tell someone about what you are doing—external witnesses create consistency" }, { label: "Reflective", body: "Build in weekly moments to notice what’s changing—not judging good/bad, just observing shifts" }, { label: "Social", body: "Practice with or around others when possible—transformation happens in relationship, not isolation" }],
    howToUse: "Pick one quality from your Identity Matrix—ideally from Enduring Essence, Evolving Expression, or Yet To Be Cultivated. Design a practice hitting all five components of the STARS framework.",
  },
  {
    slug: "starter-charter",
    name: "Starter Charter",
    chapter: "Ch. 12",
    chapterLine: "From Chapter 12 of AI and the Art of Being Human",
    areaId: "relationships-community",
    areaTitle: "Relationships & Community",
    accent: "pink",
    icon: "FileSignature",
    duration: "30 min",
    whatItIs: "A minimal template for establishing clear agreements that enable genuine collaboration in new AI-focused communities.",
    whenToUse: ["In your first gathering with others exploring AI’s impact", "When informal discussions need to become intentional practice", "When starting any learning circle or support group", "When clarity about purpose and process would help"],
    toolIntro: "Four Questions (answer together in 30 minutes)",
    steps: [{ label: "Purpose", body: "Why do we gather? One sentence only—specific enough to guide, open enough to evolve" }, { label: "Norms", body: "How do we gather? 3–5 agreements that create safety—phones away? Confidentiality? No recruiting?" }, { label: "Cadence", body: "When do we gather? Weekly builds intensity, monthly ensures sustainability— consistency matters more than frequency" }, { label: "Roles", body: "Who does what? Rotating functions prevent hierarchy—Host, Note-taker, Question- bringer, etc." }],
    howToUse: "In your first meeting, spend no more than 30 minutes drafting answers to the questions above together. Don’t overthink it—constraint forces clarity here. One-sentence purpose prevents mission creep. Simple norms prevent confusion. Clear cadence creates commitment. Rotating roles builds collective capacity. Review after four gatherings and adjust as needed. Groups that skip this step inevitably face confusion when unspoken expectations clash.",
  },
  {
    slug: "stress-test-table",
    name: "Stress-Test Table",
    chapter: "Ch. 6",
    chapterLine: "From Chapter 6 of AI and the Art of Being Human",
    areaId: "work-economic",
    areaTitle: "Work & Economic Life",
    accent: "pink",
    icon: "Scale",
    duration: "10 min",
    whatItIs: "A decision tool that makes values trade-offs visible and concrete when pressure tempts you to compromise.",
    whenToUse: ["When immediate rewards conflict with your principles", "When metrics push against what you believe is right and appropriate", "When market pressure conflicts with mission", "Before any decision where you feel your values wavering"],
    toolIntro: "Four Questions (answer for each value at stake)",
    steps: [{ label: "Value", body: "What value or principle is at stake? Name it specifically" }, { label: "Temptation", body: "What’s the immediate reward for compromising? Be honest about what you’d gain" }, { label: "Cost of Integrity", body: "What do you lose by staying true to what you believe? Face the real cost" }, { label: "Payoff of Fidelity", body: "What do you gain long- term by holding firm to your values?" }],
    howToUse: "When facing pressure to compromise, write out all four answers for each value or principle at stake. Don’t just think it—writing makes abstract trade-offs concrete and harder to rationalize. You may need to iterate several times, testing different values. Keep your completed tables— reviewing them regularly reveals patterns in how you navigate pressure. This isn’t just for current crises; it’s preparation for pressures you’ll face in the future.",
  },
  {
    slug: "the-curiosity-loop",
    name: "The Curiosity Loop",
    chapter: "Ch. 1",
    chapterLine: "From Chapter 1 of AI and the Art of Being Human",
    areaId: "education-development",
    areaTitle: "Education & Development",
    accent: "cyan",
    icon: "RefreshCw",
    duration: "15 min",
    whatItIs: "A repeatable practice that transforms defensive reactions into learning opportunities when facing technological change.",
    whenToUse: ["When your expertise feels threatened by AI capabilities", "When a new AI tool could change how you work", "When you feel defensive about technological disruption", "When you catch yourself dismissing AI without exploring it"],
    toolIntro: "Four Movements (repeat as needed)",
    steps: [{ label: "Notice", body: "Observe your reaction without judging it as good or bad. What are you actually feeling in your body?" }, { label: "Question", body: "Challenge your assumptions. Ask questions like “What’s really happening here?” and “What am I assuming?”" }, { label: "Experiment", body: "Take one small action to test your questions. Use a tool, have a conversation, try something new." }, { label: "Reflect", body: "What surprised you? What assumption got challenged? What new question emerged?" }],
    howToUse: "When AI disrupts your work or challenges what you know, run through all four movements in 15–20 minutes. Start by noticing your initial reaction (fear, excitement, or something else?). Question whether that reaction is based on reality or assumption. Try one small experiment with the AI tool. Reflect on what you learned. Then begin the loop again—this is a practice, not a one-time exercise. The more you practice, the more natural curiosity becomes.",
  },
  {
    slug: "the-orchestration-triangle",
    name: "The Orchestration Triangle",
    chapter: "Ch. 8",
    chapterLine: "From Chapter 8 of AI and the Art of Being Human",
    areaId: "work-economic",
    areaTitle: "Work & Economic Life",
    accent: "pink",
    icon: "Scale",
    duration: "15 min",
    whatItIs: "Integrates three ways of knowing — Data, Intuition, and Context — so you conduct them instead of defaulting to any single one.",
    whenToUse: ["When an AI-driven recommendation conflicts with your gut", "When a decision feels reduced to a single number", "When efficiency and human context pull in different directions", "Before signing off on a high-stakes, AI-informed decision"],
    toolIntro: "Three Corners (draw a triangle, name the silent one)",
    steps: [{ label: "Data (top)", body: "What does the model, the dashboard, the algorithm say? Be specific — name the source, the time window, and the confidence interval." }, { label: "Intuition (bottom-left)", body: "What does your trained gut say? Not a guess — the pattern recognition earned through years of practice that the model can't see." }, { label: "Context (bottom-right)", body: "What does the room know that the data doesn't? Local history, relationships, the things that don't fit a column. Often where dignity and duty live." }],
    howToUse: "Draw a triangle on a single page. Write tomorrow's biggest decision in the center. At each corner, mark where the decision is currently landing — Data, Intuition, or Context. Then name the corner going silent: the one you've been ignoring under pressure. Discuss with one other person what changes if you bring it back in. The goal isn't to balance the corners equally — it's to make sure none of them gets drowned out when the math gets loud. The returns come from integration, not balance.",
  },
];

export const toolBySlug = (slug: string) =>
  tools.find((t) => t.slug === slug);

export const toolsByArea = (areaId: string) =>
  tools.filter((t) => t.areaId === areaId);

/**
 * The curated 12-tool set that anchors the six conversation areas
 * (two tools per area). Order is the editorial sequence used on the
 * /tools index page — it follows the chapter flow of the book.
 */
export const featuredToolSlugs: string[] = [
  "human-qualities-spectrum",   // Ch. 3, P. 74  — Identity & Purpose
  "identity-matrix",            // Ch. 5, P. 119 — Identity & Purpose
  "the-curiosity-loop",         // Ch. 1, P. 29  — Education & Development
  "stars-framework",            // Ch. 5, P. 125 — Education & Development
  "the-orchestration-triangle", // Ch. 8, P. 197 — Work & Economic Life
  "stress-test-table",          // Ch. 6, P. 144 — Work & Economic Life
  "7-minute-clarity-pause",     // Ch. 4, P. 97  — Well-Being & Mental Health
  "4-lens-scan",                // Ch. 4, P. 95  — Well-Being & Mental Health
  "starter-charter",            // Ch. 12, P. 277 — Relationships & Community
  "micro-circle-launch-kit",    // Ch. 7         — Relationships & Community
  "multimodal-ideation-sprint", // Ch. 10, P. 236 — Creativity & Culture
  "prompt-scaffolding-canvas",  // Ch. 10, P. 244 — Creativity & Culture
];

/** Featured tools in the editorial order above (skips any slug that's missing). */
export const featuredTools: SalonTool[] = featuredToolSlugs
  .map((slug) => tools.find((t) => t.slug === slug))
  .filter((t): t is SalonTool => Boolean(t));

/** Featured tools filtered by area. */
export const featuredToolsByArea = (areaId: string) =>
  featuredTools.filter((t) => t.areaId === areaId);

export interface ToolAreaMeta {
  id: string;
  title: string;
  accent: "cyan" | "pink";
  blurb: string;
}

export const toolAreas: ToolAreaMeta[] = [
  { id: "identity-purpose", title: "Identity & Purpose", accent: "pink",
    blurb: "Who are you when output is no longer the proof of who you are?" },
  { id: "education-development", title: "Education & Development", accent: "cyan",
    blurb: "Protecting the struggle and the curiosity that grows a person." },
  { id: "work-economic", title: "Work & Economic Life", accent: "pink",
    blurb: "Conducting between the efficient answer and the human one." },
  { id: "wellbeing", title: "Well-Being & Mental Health", accent: "cyan",
    blurb: "The pause is where wisdom catches up with capability." },
  { id: "relationships-community", title: "Relationships & Community", accent: "pink",
    blurb: "Three people showing up is the smallest unit of resistance." },
  { id: "creativity-culture", title: "Creativity & Culture", accent: "cyan",
    blurb: "Not \"is it art?\" but \"is it human?\"" },
  { id: "reader-to-convener", title: "Become a Convener", accent: "pink",
    blurb: "Turn the reading into a circle. Turn the circle into a flywheel." },
];
