import type { SpeakerIntroData } from "./types";

/**
 * Sample data for the Speaker Intro mockup editor.
 *
 * Pulled directly from the analyzed reference mockup
 * (https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782397996559-ouqlmk.jpg).
 * Editable in the live JSON editor on /admin/mockups/speaker-intro.
 *
 * The speaker photos use placeholder avatar URLs so the editor works
 * out-of-the-box without needing real headshots. Replace `photoUrl`
 * with the actual speaker photo URL when generating a real mockup.
 */

export const SAMPLE_DATA: SpeakerIntroData = {
  event: {
    name: "AI Salon Tel Aviv",
    date: "June 18th 2026",
    time: "18:00",
    venue: "Google For Startups, Ha-Umanim St 12, Tel Aviv-Yafo",
    topic: "The AI CMO Blueprint: Scaling Growth & Agentic Innovation",
    // Per user spec 2026-07-09 (item G): brand colors are #ff0056 + #8f0080.
    brandColors: ["#ff0056", "#8f0080"],
  },
  speakers: [
    {
      order: 1,
      role: "Speaker",
      fullName: "Ohad Ronen",
      title: "AI Product Lead",
      company: "Amdocs",
      bio: "Leads AI product strategy at Amdocs, driving agentic AI innovation across telecom.",
      photoUrl:
        "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg",
      sessionTitle: "Opening keynote",
    },
    {
      order: 2,
      role: "Speaker",
      fullName: "Ellad Kushnir Matarasso",
      title: "VP Marketing",
      company: "Alison.ai",
      bio: "VP Marketing at Alison.ai, scaling AI-driven creative for global brands.",
      photoUrl:
        "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg",
    },
    {
      order: 3,
      role: "Speaker",
      fullName: "Boris Mergold",
      title: "Google Cloud Data & AI Sales Specialist",
      company: "Google",
      bio: "Helps enterprises adopt generative AI on Google Cloud.",
      photoUrl:
        "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg",
    },
    {
      order: 4,
      role: "Moderator",
      fullName: "Miri Fenton",
      title: "Principal",
      company: "Maverick Ventures",
      bio: "Invests in early-stage AI startups. Moderates the AI Salon fireside chats.",
      photoUrl:
        "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg",
    },
  ],
  collaborators: [
    {
      name: "Alison.AI",
      logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
      theme: "light",
    },
    {
      name: "Amdocs",
      logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
      theme: "light",
    },
  ],
  sponsors: [
    {
      name: "HI4AI",
      logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
      theme: "light",
    },
  ],
  heroOverlay: {
    imageUrl:
      "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782987131384-reozea.png",
    gradientColors: ["#8A2BE2", "#1E90FF", "#20B2AA"],
    gradientOpacity: 0.55,
  },
  locationPins: [
    { label: "Sarona", x: 78, y: 18 },
    { label: "Dizengoff", x: 60, y: 12 },
    { label: "Neve Tzedek", x: 90, y: 48 },
    { label: "Yafo", x: 70, y: 78 },
  ],
  qrCodeUrl: "https://aisalon.massapro.com/events",
  // Per user spec 2026-07-09 (item I): footer credit is "MassaPro".
  footerCredit: "MassaPro",
  /**
   * Branding asset at the bottom-LEFT corner of the canvas. Defaults to
   * the AI Salon brand image hosted on Vercel Blob (per user spec
   * 2026-07-02). Replaceable + draggable — see speaker-intro-canvas.tsx.
   *
   * Per user spec 2026-07-09 (item H): default position is X≈3.10%,
   * Y≈87.57% (bottom-left corner). Height=48px.
   */
  brandingAsset: {
    imageUrl:
      "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png",
    height: 48,
    pos: { x: 3.1021447721179625, y: 87.5656836461126 },
  },
  /**
   * Default section layout per user spec 2026-07-09:
   *   - D (speakers): pos X=-7.5% Y=29.3%, box W=891px, scale=0.76, z=front
   *   - E (header):   pos X=1.7%  Y=0.5%,  box W=100% (1200px)
   *   - F (topic):    pos X=-12.8% Y=23.5%, box W=951px, scale=0.65
   * The canvas's SectionBox reads these and overrides the inline default
   * left/top/width when present. User edits in the editor override these
   * via the same sectionLayout path.
   */
  sectionLayout: {
    header: {
      pos: { x: 1.7, y: 0.5 },
      boxSize: { width: 1200 },
    },
    topic: {
      pos: { x: -12.8, y: 23.5 },
      boxSize: { width: 951 },
      scale: 0.65,
    },
    speakers: {
      pos: { x: -7.5, y: 29.3 },
      boxSize: { width: 891 },
      scale: 0.76,
      // "Layer front all" — render above other text sections (TEXT_Z=50)
      // and above the branding asset (z=52).
      z: 60,
    },
  },
};
