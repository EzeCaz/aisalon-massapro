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
 *
 * === 2026-07-13 update (per user spec, Style 1) ======================
 *   1. Topic:    fontSize 20, color #000000, align left
 *   2. Bio:      fontSize 22, color #000000, align left
 *   3. Event-meta section position → (1.9%, 64.5%)
 *   4. Event name / date / time / venue → align left
 *   5. Event name 22px, date 18px, time 18px, venue 20px, color #000000
 *   6. QR code position → (39.8%, 2.6%)
 *   7. Branding asset height 48px, position (2.7%, 89.576%)
 *   8. Footer credit → "MassaPro"
 *   9. Layer z-indices (both styles): hero=9, photo=3, graphic=10
 * =======================================================================
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
  // ─── Per-section text style overrides (user spec 2026-07-13) ────────
  //   1. Topic:    fontSize 20, color #000000, align left
  //   2. Bio:      fontSize 22, color #000000, align left
  //   4 + 5. Event name / date / time / venue → all left-aligned,
  //         font sizes 22 / 18 / 18 / 20, color #000000 for all four.
  //   (Note: time alignment is inherited from the date paragraph, so
  //    setting eventDate.align = "left" left-aligns both date + time.)
  textStyles: {
    topic: { fontSize: 20, color: "#000000", align: "left" },
    bio: { fontSize: 22, color: "#000000", align: "left" },
    eventName: { fontSize: 22, color: "#000000", align: "left" },
    eventDate: { fontSize: 18, color: "#000000", align: "left" },
    eventTime: { fontSize: 18, color: "#000000", align: "left" },
    venue: { fontSize: 20, color: "#000000", align: "left" },
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
  // Branding asset at the bottom-LEFT corner. Defaults to the AI Salon
  // brand image hosted on Vercel Blob. Replaceable via the canvas Replace
  // button (edit mode) or the form view URL input.
  // Per user spec 2026-07-02.
  //
  // 2026-07-13 update (item 7): height 48px (unchanged), position
  //   X=2.7%, Y=89.57640750670241%.
  brandingAsset: {
    imageUrl:
      "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png",
    height: 48,
    pos: { x: 2.7, y: 89.57640750670241 },
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
    "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782940769382-r2twkn.png",
  // "Local Street" pins — overlaid on hero style #2.
  // Per user spec 2026-07-02: default to Mobileye / Wiz / Waze / Elementor
  // at the four canonical positions on the network graph image.
  localStreetPins: [
    { x: 49, y: 28, label: "Mobileye" },
    { x: 90, y: 6, label: "Wiz" },
    { x: 95, y: 43, label: "Waze" },
    { x: 53, y: 79, label: "Elementor" },
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
  // 2026-07-13 update (item 8): footer credit → "MassaPro".
  footerCredit: "MassaPro",
  // ─── Section layout overrides (user spec 2026-07-13) ────────────────
  //   3. Event-meta section position → (1.9%, 64.5%)
  //   6. QR code position → (39.8%, 2.6%)
  //   Coordinates are % of canvas (1200×800). Setting pos clears the
  //   inline right/bottom anchors and switches the section to a
  //   left/top-anchored position.
  sectionLayout: {
    "event-meta": { pos: { x: 1.9, y: 64.5 } },
    qr: { pos: { x: 39.8, y: 2.6 } },
  },
  // ─── Layer z-indices (user spec 2026-07-13, item 9 — both styles) ───
  //   Hero (gradient triangles / style-2 image) z=9
  //   Speaker photo                                   z=3
  //   Brand graphic (meerkat)                        z=10
  //   Text sections remain at z≥50 (unchanged).
  //   Photo at z=3 sits BELOW hero at z=9 — so the gradient overlay
  //   tints the photo. Graphic at z=10 sits ABOVE both.
  heroZ: 9,
  photoZ: 3,
  graphicZ: 10,
};
