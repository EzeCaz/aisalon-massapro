import type { MeetTheSpeakerData } from "./types";

/**
 * Sample data for the Meet the Speaker mockup editor.
 *
 * Mirrors the analyzed reference mockup
 * (https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782398067379-mtp26z.jpg).
 * Editable in the live JSON editor on /admin/mockups/meet-the-speaker.
 *
 * The speaker photo uses a placeholder avatar URL so the editor works
 * out-of-the-box without needing a real headshot. Replace `photoUrl`
 * with the actual speaker photo URL when generating a real mockup.
 */

export const SAMPLE_DATA: MeetTheSpeakerData = {
  header: {
    text: "Meet the speaker",
    color: "#FF005C",
  },
  speaker: {
    fullName: "Boris Mergold",
    title: "Google Cloud Data & AI Sales Specialist",
    company: "Google",
    role: "Speaker",
    topic: "Transforming Marketing with AI",
    topicDescription: "CMOs guide the AI-driven transformation",
    bio: "Boris Mergold is a Data Analytics & AI Sales Specialist at Google Cloud Israel and the creator of the widely recognized tech advisory brand \"AskBoris.\" With an extensive background in business intelligence and enterprise architecture, he partners with CTOs and executives to drive business growth using BigQuery, Vertex AI, and generative AI ecosystems.",
    expertise:
      "Known for bridging the gap between complex cloud engineering and practical business strategy, Boris acts as a trusted industry advisor and keynote speaker, helping startups and enterprises optimize their data structures and accelerate digital transformation.",
    photoUrl:
      "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg",
    photoPlacement: { focusX: 50, focusY: 35, zoom: 1 },
    photoSize: 1,
  },
  event: {
    name: "The AI CMO Blueprint: Scaling Growth & Agentic Innovation",
    date: "June 18th 2026",
    time: "18:00",
    venue: "Google For Startups, Ha-Umanim St 12, Tel Aviv-Yafo",
    brandColors: ["#00FFFF", "#8B00FF"],
  },
  graphic: {
    imageUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
    imagePlacement: { focusX: 50, focusY: 50, zoom: 1 },
    imageScale: 1,
  },
  heroOverlay: {
    gradientColors: ["#6A5ACD", "#FF005C"],
    gradientOpacity: 0.45,
  },
  // Hero style picker — defaults to 1 (geometric gradient triangles).
  // Switch to 2 to use the pre-designed low-poly network graph image
  // with 4 editable "Local Street" pins at the corners.
  heroStyle: 1,
  heroStyle2Url:
    "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782931538498-jh1lom.png",
  // "Local Street" pins — overlaid on hero style #2. Default labels
  // match the 4 "Placeholder N" positions baked into the source image
  // (top-left, top-right, bottom-right, bottom-left). Admin can rename
  // to actual neighborhoods (Sarona, Yafo, etc.) and reposition via
  // the form view.
  localStreetPins: [
    { x: 18, y: 22, label: "Local Street 1" },
    { x: 82, y: 18, label: "Local Street 2" },
    { x: 85, y: 78, label: "Local Street 3" },
    { x: 15, y: 80, label: "Local Street 4" },
  ],
  collaborators: [
    {
      name: "Alison.AI",
      logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
      theme: "light",
      logoSize: 1,
    },
    {
      name: "Amdocs",
      logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
      theme: "light",
      logoSize: 1,
    },
  ],
  sponsors: [
    {
      name: "HI4AI",
      logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
      theme: "light",
      logoSize: 1,
    },
  ],
  qrCodeUrl: "https://aisalon.massapro.com/events",
  footerCredit: "Platform by MassaPro",
};
