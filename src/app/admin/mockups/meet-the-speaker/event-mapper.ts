import type { MeetTheSpeakerData, SpeakerRole } from "./types";

/**
 * Style 1 default customizations (per user spec 2026-07-13).
 *
 * These are applied to EVERY mapped event so that picking an event or
 * speaker from the dropdown does NOT wipe the user's chosen font sizes,
 * colors, alignments, section positions, branding asset placement,
 * footer credit, or layer z-indices.
 *
 *   1. Topic:    fontSize 20, color #000000, align left
 *   2. Bio:      fontSize 22, color #000000, align left
 *   3. Event-meta section position → (3.1%, 64.5%)   ← X 1.9 → 3.1
 *   4. Event name / date / time / venue → align left
 *   5. Event name 22px, date 18px, time 18px, venue 20px, color #000000
 *   6. QR code position → (39.8%, 2.6%)
 *   7. Branding asset height 48px, position (2.7%, 89.576%)
 *   8. Footer credit → "MassaPro"
 *   9. Layer z-indices (both styles): hero=9, photo=3, graphic=10
 *  10. Header (speaker-info section) position X → 3.1%   ← new
 *  11. Meerkat brand graphic: imageScale 1.70, pos (100, 60)   ← new
 */
const STYLE1_TEXT_STYLES: NonNullable<MeetTheSpeakerData["textStyles"]> = {
  topic: { fontSize: 20, color: "#000000", align: "left" },
  bio: { fontSize: 22, color: "#000000", align: "left" },
  eventName: { fontSize: 22, color: "#000000", align: "left" },
  eventDate: { fontSize: 18, color: "#000000", align: "left" },
  eventTime: { fontSize: 18, color: "#000000", align: "left" },
  venue: { fontSize: 20, color: "#000000", align: "left" },
};

const STYLE1_SECTION_LAYOUT: NonNullable<MeetTheSpeakerData["sectionLayout"]> = {
  // 2026-07-13 item 10: Header (speaker-info section) X = 3.1%
  //   Y kept at 5 (matches the default 40px/800px top inset) so the
  //   header stays at the same vertical position, only X shifts.
  "speaker-info": { pos: { x: 3.1, y: 5 } },
  // 2026-07-13 item 3: Event-meta X = 3.1 (was 1.9), Y = 64.5
  "event-meta": { pos: { x: 3.1, y: 64.5 } },
  // 2026-07-13 item 6: QR code position
  qr: { pos: { x: 39.8, y: 2.6 } },
};

const STYLE1_BRANDING_ASSET: NonNullable<MeetTheSpeakerData["brandingAsset"]> = {
  imageUrl:
    "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png",
  height: 48,
  pos: { x: 2.7, y: 89.57640750670241 },
};

const STYLE1_FOOTER_CREDIT = "MassaPro";
const STYLE1_HERO_Z = 9;
const STYLE1_PHOTO_Z = 3;
const STYLE1_GRAPHIC_Z = 10;

/**
 * Map a DB Event (with speakers + agenda included) to a
 * MeetTheSpeakerData object — focused on a single speaker.
 *
 * By default, picks the first speaker (lowest order). If a
 * `preferredSpeakerId` is passed, uses that one instead.
 *
 * Field mapping parallels the Speaker Intro event-mapper, but the
 * output shape is single-speaker-focused:
 *   - speaker.fullName  ← Speaker.name
 *   - speaker.title     ← first half of Speaker.role split on comma
 *   - speaker.company   ← Speaker.company ?? second half of Speaker.role
 *   - speaker.bio       ← Speaker.bio
 *   - speaker.topic     ← Speaker.topic
 *   - speaker.photoUrl  ← Speaker.photoUrl ?? DEFAULT_AVATAR
 *   - event.*           ← same as Speaker Intro mapping
 *
 * Style 1 customizations (text styles, section positions, branding
 * asset, footer credit, z-indices) are baked into the output so that
 * picking an event or speaker does not reset them.
 */

const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='800'>
       <rect width='600' height='800' fill='#e5e7eb'/>
       <circle cx='300' cy='320' r='120' fill='#9ca3af'/>
       <path d='M120 800 Q300 480 480 800 Z' fill='#9ca3af'/>
     </svg>`,
  );

const DEFAULT_GRAPHIC = "https://aisalon.massapro.com/images/falafel-meerkat.png";

/**
 * Minimal shape of `event` returned by GET /api/events/[slug].
 * Shared with the Speaker Intro event-mapper.
 */
export type DbEventForMapping = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  startsAt: string; // ISO
  description?: string | null;
  rsvpUrl?: string | null;
  mainImage?: { fileUrl: string } | null;
  speakers: Array<{
    id: string;
    name: string;
    role?: string | null;
    company?: string | null;
    bio?: string | null;
    topic?: string | null;
    photoUrl?: string | null;
    order: number;
  }>;
  agenda: Array<{
    type: string;
    speakerId?: string | null;
    panelists?: Array<{ id: string }> | null;
  }>;
};

function splitRole(role?: string | null): [string, string] {
  if (!role) return ["", ""];
  const idx = role.indexOf(",");
  if (idx === -1) return [role.trim(), ""];
  return [role.slice(0, idx).trim(), role.slice(idx + 1).trim()];
}

function deriveRole(
  speakerId: string,
  agenda: DbEventForMapping["agenda"],
): SpeakerRole {
  for (const item of agenda) {
    if (item.type === "PANEL") {
      if (item.speakerId === speakerId) return "Moderator";
      if (item.panelists?.some((p) => p.id === speakerId)) return "Panelist";
    }
  }
  return "Speaker";
}

/** Format an ISO date as "June 18th 2026" — in Asia/Jerusalem local time. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const day = parseInt(get("day"), 10);
  const monthIdx = parseInt(get("month"), 10) - 1;
  const year = parseInt(get("year"), 10);
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${months[monthIdx]} ${day}${suffix} ${year}`;
}

/** Format an ISO date as "18:00" (HH:MM, 24h) — in Asia/Jerusalem local time. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function formatVenue(e: DbEventForMapping): string {
  const parts = [e.venue, e.address, e.city, e.country].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  return parts.join(", ");
}

export function mapEventToMeetTheSpeakerData(
  event: DbEventForMapping,
  preferredSpeakerId?: string,
): MeetTheSpeakerData {
  // Pick the featured speaker: preferred ID → first by order → none.
  const sortedSpeakers = [...event.speakers].sort((a, b) => a.order - b.order);
  const featured =
    (preferredSpeakerId
      ? sortedSpeakers.find((s) => s.id === preferredSpeakerId)
      : null) ?? sortedSpeakers[0];

  const speaker: MeetTheSpeakerData["speaker"] = featured
    ? (() => {
        const [title, roleCompany] = splitRole(featured.role);
        const company = featured.company?.trim() || roleCompany;
        const role = deriveRole(featured.id, event.agenda);
        return {
          fullName: featured.name,
          title,
          company,
          role,
          topic: featured.topic ?? "",
          topicDescription: undefined,
          bio: featured.bio ?? "",
          expertise: undefined,
          photoUrl: featured.photoUrl ?? DEFAULT_AVATAR,
          photoPlacement: { focusX: 50, focusY: 50, zoom: 1 },
          photoSize: 1,
        };
      })()
    : {
        fullName: "Speaker TBA",
        title: "",
        company: "",
        role: "Speaker" as SpeakerRole,
        topic: "",
        bio: "",
        photoUrl: DEFAULT_AVATAR,
        photoPlacement: { focusX: 50, focusY: 50, zoom: 1 },
        photoSize: 1,
      };

  return {
    header: {
      text: "Meet the speaker",
      color: "#FF005C",
    },
    speaker,
    // ─── Per-section text style overrides (user spec 2026-07-13) ────────
    //   1. Topic:    fontSize 20, color #000000, align left
    //   2. Bio:      fontSize 22, color #000000, align left
    //   4 + 5. Event name / date / time / venue → all left-aligned,
    //         font sizes 22 / 18 / 18 / 20, color #000000 for all four.
    //   (Note: time alignment is inherited from the date paragraph, so
    //    setting eventDate.align = "left" left-aligns both date + time.)
    textStyles: STYLE1_TEXT_STYLES,
    event: {
      name: event.title,
      date: formatDate(event.startsAt),
      time: formatTime(event.startsAt),
      venue: formatVenue(event),
      brandColors: ["#00FFFF", "#8B00FF"],
      sourceEventId: event.id,
      sourceEventSlug: event.slug,
    },
    // 2026-07-13 item 11: meerkat brand graphic — imageScale 1.70,
    // pos (100, 60). Applies to both Style 1 and Style 2 (the graphic
    // is independent of the hero style choice).
    graphic: {
      imageUrl: DEFAULT_GRAPHIC,
      imagePlacement: { focusX: 50, focusY: 50, zoom: 1 },
      imageScale: 1.70,
      pos: { x: 100, y: 60 },
    },
    // Branding asset at the bottom-LEFT corner. Per user spec 2026-07-02
    // and 2026-07-13: height 48px, position X=2.7%, Y=89.576%.
    brandingAsset: STYLE1_BRANDING_ASSET,
    heroOverlay: {
      gradientColors: ["#6A5ACD", "#FF005C"],
      gradientOpacity: 0.45,
    },
    // Default to Style 1 (gradient triangles). Admin can switch to 2
    // in the form view to use the pre-designed hero image with 4
    // editable "Local Street" pins at the corners.
    heroStyle: 1,
    heroStyle2Url:
      "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782940769382-r2twkn.png",
    localStreetPins: [
      // Per user spec 2026-07-02: default to Mobileye / Wiz / Waze / Elementor
      // at the four canonical positions on the network graph image.
      { x: 49, y: 28, label: "Mobileye" },
      { x: 90, y: 6, label: "Wiz" },
      { x: 95, y: 43, label: "Waze" },
      { x: 53, y: 79, label: "Elementor" },
    ],
    collaborators: [],
    sponsors: [],
    qrCodeUrl:
      event.rsvpUrl ||
      `https://aisalon.massapro.com/events/${event.slug}`,
    // 2026-07-13 update (item 8): footer credit → "MassaPro".
    footerCredit: STYLE1_FOOTER_CREDIT,
    // ─── Section layout overrides (user spec 2026-07-13) ────────────────
    //   3. Event-meta section position → (1.9%, 64.5%)
    //   6. QR code position → (39.8%, 2.6%)
    sectionLayout: STYLE1_SECTION_LAYOUT,
    // ─── Layer z-indices (user spec 2026-07-13, item 9 — both styles) ───
    //   Hero (gradient triangles / style-2 image) z=9
    //   Speaker photo                                   z=3
    //   Brand graphic (meerkat)                        z=10
    //   Photo at z=3 sits BELOW hero at z=9 — so the gradient overlay
    //   tints the photo. Graphic at z=10 sits ABOVE both.
    heroZ: STYLE1_HERO_Z,
    photoZ: STYLE1_PHOTO_Z,
    graphicZ: STYLE1_GRAPHIC_Z,
  };
}
