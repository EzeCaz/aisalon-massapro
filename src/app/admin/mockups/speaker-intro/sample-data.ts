import type { SpeakerIntroData } from "./types";

/**
 * Sample data for the Speaker Intro mockup editor.
 *
 * PER USER SPEC 2026-07-31 (TSK-0024): updated to the AI Salon Tel Aviv
 * "Marketing in the Age of AI" event with the 4-speaker lineup the user
 * provided in their JSON example:
 *   - Ohad Ronen (VP Marketing, Amdocs) — Brand in the AI era — 18:30 keynote
 *   - Ellad Kushnir (CMO, Alison.ai) — Creative at machine speed — 19:00 fireside
 *   - Boris Mergold (Lead Cloud Strategist, Google) — Transforming Marketing with AI — 19:45 main keynote
 *   - Miri Fenton (Partner, Maverick Ventures) — Where AI capital flows — 20:30 investor panel
 * Collaborators: Amdocs, Google. Sponsored by: Alison.ai.
 *
 * Editable in the live JSON editor on /admin/mockups/speaker-intro.
 * The speaker photos use placeholder avatar URLs so the editor works
 * out-of-the-box without needing real headshots. Replace `photoUrl`
 * with the actual speaker photo URL when generating a real mockup.
 */

export const SAMPLE_DATA: SpeakerIntroData = {
  event: {
    name: "AI Salon Tel Aviv",
    date: "October 15, 2025",
    time: "18:30",
    venue: "An evening with industry leaders",
    topic: "Marketing in the Age of AI",
    // Per user spec 2026-07-09 (item G): brand colors are #ff0056 + #8f0080.
    brandColors: ["#ff0056", "#8f0080"],
  },
  speakers: [
    {
      order: 1,
      role: "Speaker",
      fullName: "Ohad Ronen",
      title: "VP Marketing",
      company: "Amdocs",
      topic: "Brand in the AI era",
      bio: "17 years scaling B2B tech brands. Led Amdocs' pivot to AI-first positioning across 90+ markets.",
      photoUrl:
        "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg",
      sessionTitle: "Opening keynote",
      sessionTime: "18:30",
      initials: "OR",
    },
    {
      order: 2,
      role: "Speaker",
      fullName: "Ellad Kushnir",
      title: "CMO",
      company: "Alison.ai",
      topic: "Creative at machine speed",
      bio: "Built Alison's go-to-market from seed to Series B. Former Wieden+Kennedy creative director.",
      photoUrl:
        "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg",
      sessionTitle: "Fireside chat",
      sessionTime: "19:00",
      initials: "EK",
    },
    {
      order: 3,
      role: "Speaker",
      fullName: "Boris Mergold",
      title: "Lead Cloud Strategist",
      company: "Google",
      topic: "Transforming Marketing with AI",
      bio: 'Helps Fortune 500 CMOs rewire their stacks. Author of "The AI-Native Marketing Playbook".',
      photoUrl:
        "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg",
      sessionTitle: "Main keynote",
      sessionTime: "19:45",
      initials: "BM",
    },
    {
      order: 4,
      role: "Moderator",
      fullName: "Miri Fenton",
      title: "Partner",
      company: "Maverick Ventures",
      topic: "Where AI capital flows",
      bio: "Leads Maverick's AI marketing portfolio. 12 investments, 3 unicorns, 1 IPO.",
      photoUrl:
        "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg",
      sessionTitle: "Investor panel",
      sessionTime: "20:30",
      initials: "MF",
    },
  ],
  collaborators: [
    { name: "Amdocs", logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png", theme: "light" },
    { name: "Google", logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png", theme: "light" },
  ],
  sponsors: [
    { name: "Alison.ai", logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png", theme: "light" },
  ],
  heroOverlay: {
    imageUrl:
      "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782987131384-reozea.png",
    gradientColors: ["#8A2BE2", "#1E90FF", "#20B2AA"],
    gradientOpacity: 0.55,
  },
  locationPins: [
    { label: "Sarona", x: 30, y: 18 },
    { label: "Dizengoff", x: 65, y: 12 },
    { label: "Neve Tzedek", x: 22, y: 48 },
    { label: "Yafo", x: 70, y: 60 },
  ],
  qrCodeUrl: "https://aisalon.massapro.com/events",
  // Per user spec 2026-07-09 (item I): footer credit is "MassaPro".
  footerCredit: "MassaPro",
  /**
   * Branding asset at the bottom-LEFT corner of the canvas. Defaults to
   * the AI Salon brand image hosted on Vercel Blob (per user spec
   * 2026-07-02). Replaceable + draggable — see speaker-intro-canvas.tsx.
   */
  brandingAsset: {
    imageUrl:
      "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png",
    height: 48,
    pos: { x: 3.1021447721179625, y: 87.5656836461126 },
  },
  /**
   * Branding mascot (meerkat) at the bottom-RIGHT corner of the right
   * hero panel in Style 2. Falls back to the falafel-meerkat image.
   */
  branding: {
    imageUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
    height: 80,
  },
  /**
   * Style 2 default section layout. PER USER SPEC 2026-07-31 (TSK-0026):
   * The user specified exact default positions/sizes/scales/z-indices for
   * the speakers, sponsors (footer), and topic (hero image) sections.
   * The "hero-shape" section is NEW — it's the editable gradient shape
   * behind the hero image (separated from the hero image per TSK-0026).
   *
   * PER USER SPEC 2026-07-31 (TSK-0027): renamed section id "topic" →
   * "hero-image" to stop colliding with Style 1's "topic" section (which
   * is the EVENT TOPIC text). Both styles now use "hero-image" as the
   * section id for the hero image element.
   */
  sectionLayout: {
    header:       { pos: { x: 0, y: 0 }, boxSize: { width: 1200, height: 80 }, scale: 1.0, z: 50 },
    "hero-shape": { pos: { x: 55, y: 10 }, boxSize: { width: 540, height: 640 }, scale: 1.0, z: 40 },
    speakers:     { pos: { x: -8.7, y: 5 }, boxSize: { width: 891 }, scale: 0.76, z: 60 },
    "hero-image": { pos: { x: 31.9, y: 10.4 }, boxSize: { width: 951 }, scale: 1.0, z: 50 },
    sponsors:     { pos: { x: 0.3, y: 89.4 }, scale: 1.0, z: 50 },
    qr:           { pos: { x: 92, y: 91 }, scale: 1.0, z: 50 },
  },
  /**
   * Style 2 — Hero gradient shape config. PER USER SPEC 2026-07-31 (TSK-0026):
   * "separate the hero image from the background colors gradient and set to
   * shapes with gradient colors that you can edit on the form."
   * The shape renders BEHIND the hero image (z=40 < hero image z=50).
   * Default: rectangle with the dark-purple 3-stop gradient matching the
   * original Style 2 reference.
   *
   * PER USER SPEC 2026-07-31 (TSK-0028): added `fillMode` ("solid" |
   * "gradient") + `solidColor` so the user can choose between solid fill
   * or multi-stop gradient. Default = "gradient" (preserves the original
   * look).
   */
  style2HeroGradient: {
    shape: "rectangle",
    fillMode: "gradient",
    solidColor: "#311B92",
    colors: ["#311B92", "#1A237E", "#0B0B2E"],
    direction: 180,
    opacity: 0.9,
    rotation: 0,
  },
  /**
   * Style 1 / 3 — Hero overlay SHAPE config (replaces legacy "Show triangle
   * overlay"). PER USER SPEC 2026-07-31 (TSK-0028):
   * "Then the Show triangle overlay change it to the shapes and allow to
   * change the color, from fill to gradient fill, and the direction of the
   * gradient."
   * Default: triangle with the same magenta→purple gradient as the legacy
   * overlay (so existing mockups look identical until the user picks a
   * different shape).
   */
  heroOverlayShapeConfig: {
    shape: "triangle",
    fillMode: "gradient",
    colors: ["#ff0056", "#8f0080"],
    direction: 135,
    opacity: 0.9,
    rotation: 0,
  },
};
