import type { EventProfileData } from "./types";

/**
 * Sample data for the Event Profile mockup editor. Used as the initial
 * state when the user first loads the page (before they pick an event
 * from the dropdown). Mirrors the structure of a real AI Salon event.
 */
export const SAMPLE_DATA: EventProfileData = {
  event: {
    name: "AI CMO Blueprint",
    date: "June 18th 2026",
    time: "18:00",
    venue: "MassaPro HQ, 12 Yigal Alon St, Tel Aviv",
    topic: "The 2026 AI Playbook for CMOs",
    description:
      "An evening with the marketing leaders rewriting the playbook for an AI-native world. Three talks, one panel, and structured networking.",
    brandColors: ["#00FFFF", "#8B00FF"],
    sourceEventId: undefined,
    sourceEventSlug: undefined,
  },
  heroOverlay: {
    imageUrl: "https://aisalon.massapro.com/images/TLV-2.jpg",
    gradientColors: ["#8A2BE2", "#1E90FF", "#20B2AA"],
    gradientOpacity: 0.55,
    imagePlacement: { focusX: 50, focusY: 50, zoom: 1 },
    imageScale: 1,
  },
  sessions: [
    {
      order: 1,
      type: "CHECKIN",
      title: "Doors open & registration",
      startTime: "18:00",
      endTime: "18:30",
      visible: false, // auto-hidden
    },
    {
      order: 2,
      type: "WELCOME",
      title: "Welcome by Ezequiel Sznaider",
      startTime: "18:30",
      endTime: "18:40",
      speakerName: "Ezequiel Sznaider",
      visible: true,
    },
    {
      order: 3,
      type: "TALK",
      title: "The 2026 AI Marketing Stack",
      startTime: "18:40",
      endTime: "19:10",
      speakerName: "Boris Mergold",
      speakerId: "boris",
      visible: true,
    },
    {
      order: 4,
      type: "BREAK",
      title: "Coffee break",
      startTime: "19:10",
      endTime: "19:25",
      visible: false, // auto-hidden
    },
    {
      order: 5,
      type: "PANEL",
      title: "Building AI-native marketing teams",
      startTime: "19:25",
      endTime: "20:10",
      speakerName: "Anya Levitt (moderator)",
      speakerId: "anya",
      visible: true,
    },
    {
      order: 6,
      type: "FAST_PITCH",
      title: "Community fast pitches (5 min each)",
      startTime: "20:10",
      endTime: "20:40",
      visible: true,
    },
    {
      order: 7,
      type: "NETWORKING",
      title: "Networking & drinks",
      startTime: "20:40",
      endTime: "21:30",
      visible: false, // auto-hidden
    },
  ],
  speakers: [
    {
      order: 1,
      fullName: "Ezequiel Sznaider",
      title: "Founder",
      company: "AI Salon",
      role: "Host",
      bio: "Founder of AI Salon Tel Aviv. Builds community for AI builders since 2023.",
      photoUrl: "data:image/svg+xml;utf8," + encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='#e5e7eb'/><circle cx='100' cy='80' r='36' fill='#9ca3af'/><path d='M40 180 Q100 110 160 180 Z' fill='#9ca3af'/></svg>`,
      ),
      sessionTime: "18:30",
      sessionTitle: "Welcome",
      visible: true,
    },
    {
      order: 2,
      fullName: "Boris Mergold",
      title: "VP Marketing",
      company: "Google",
      role: "Speaker",
      bio: "Boris leads marketing innovation at Google, focusing on how generative AI is transforming campaigns at scale.",
      photoUrl: "data:image/svg+xml;utf8," + encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='#e5e7eb'/><circle cx='100' cy='80' r='36' fill='#9ca3af'/><path d='M40 180 Q100 110 160 180 Z' fill='#9ca3af'/></svg>`,
      ),
      sessionTime: "18:40",
      sessionTitle: "The 2026 AI Marketing Stack",
      visible: true,
    },
    {
      order: 3,
      fullName: "Anya Levitt",
      title: "Founder & CEO",
      company: "NarrativeAI",
      role: "Moderator",
      bio: "Anya founded NarrativeAI in 2023 to give every small business an AI marketing team.",
      photoUrl: "data:image/svg+xml;utf8," + encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='#e5e7eb'/><circle cx='100' cy='80' r='36' fill='#9ca3af'/><path d='M40 180 Q100 110 160 180 Z' fill='#9ca3af'/></svg>`,
      ),
      sessionTime: "19:25",
      sessionTitle: "Building AI-native marketing teams (Panel)",
      visible: true,
    },
  ],
  sponsors: [],
  collaborators: [],
  qrCodeUrl: "https://aisalon.massapro.com/events/ai-cmo-blueprint-2026-06-18",
  footerCredit: "Platform by MassaPro",
  /**
   * Branding asset at the bottom-LEFT corner. Defaults to the AI Salon
   * brand image hosted on Vercel Blob (user spec 2026-07-02). Replaceable
   * via the canvas Replace button (edit mode) or the form view URL input.
   * Draggable via the "⠿ Move branding" handle.
   */
  brandingAsset: {
    imageUrl:
      "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png",
    height: 48,
  },
};
