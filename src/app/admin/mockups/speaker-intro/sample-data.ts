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
   * Style 2 default section layout. Per TSK-0024 rewrite, the Style 2
   * canvas uses a fixed split-screen layout (header 80px + main 640px +
   * footer 80px), so most position values are NOT used by Style 2 —
   * they're here for backward compatibility with Style 1 and with
   * saved JSON from before the rewrite.
   */
  sectionLayout: {
    header: { pos: { x: 0, y: 0 }, boxSize: { width: 1200, height: 80 }, scale: 1.0, z: 50 },
    topic: { pos: { x: 55, y: 10 }, boxSize: { width: 540, height: 640 }, scale: 1.0, z: 50 },
    speakers: { pos: { x: 0, y: 10 }, boxSize: { width: 660, height: 640 }, scale: 1.0, z: 60 },
    qr: { pos: { x: 92, y: 91 }, scale: 1.0, z: 50 },
    sponsors: { pos: { x: 0, y: 90 }, boxSize: { width: 1200, height: 80 }, scale: 1.0, z: 50 },
  },
};
