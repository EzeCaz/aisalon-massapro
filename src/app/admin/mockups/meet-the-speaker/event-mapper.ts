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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const day = d.getUTCDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${months[d.getUTCMonth()]} ${day}${suffix} ${d.getUTCFullYear()}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
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
    collaborators: [],
    sponsors: [],
    qrCodeUrl:
      event.rsvpUrl ||
      `https://aisalon.massapro.com/events/${event.slug}`,
    footerCredit: "Platform by MassaPro",
  };
}
