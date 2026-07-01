import type { MeetTheSpeakerData, SpeakerRole } from "./types";

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
    event: {
      name: event.title,
      date: formatDate(event.startsAt),
      time: formatTime(event.startsAt),
      venue: formatVenue(event),
      brandColors: ["#00FFFF", "#8B00FF"],
      sourceEventId: event.id,
      sourceEventSlug: event.slug,
    },
    graphic: {
      imageUrl: DEFAULT_GRAPHIC,
      imagePlacement: { focusX: 50, focusY: 50, zoom: 1 },
      imageScale: 1,
    },
    heroOverlay: {
      gradientColors: ["#6A5ACD", "#FF005C"],
      gradientOpacity: 0.45,
    },
    // Default to Style 1 (gradient triangles). Admin can switch to 2
    // in the form view to use the pre-designed hero image with 4
    // editable "Local Street" pins at the corners.
    heroStyle: 1,
    heroStyle2Url:
      "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782931538498-jh1lom.png",
    localStreetPins: [
      { x: 18, y: 22, label: "Local Street 1" },
      { x: 82, y: 18, label: "Local Street 2" },
      { x: 85, y: 78, label: "Local Street 3" },
      { x: 15, y: 80, label: "Local Street 4" },
    ],
    collaborators: [],
    sponsors: [],
    qrCodeUrl:
      event.rsvpUrl ||
      `https://aisalon.massapro.com/events/${event.slug}`,
    footerCredit: "Platform by MassaPro",
  };
}
