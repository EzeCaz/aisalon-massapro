import type {
  EventProfileData,
  Session,
  SessionType,
  Speaker,
  ImagePlacement,
} from "./types";
import {
  classifySessionType,
  isAutoHiddenSessionType,
} from "./types";

/**
 * Map a DB Event (with speakers + agenda) to an EventProfileData object.
 *
 * Auto-fill behavior:
 *   - Sessions come from EventAgendaItem[] (chronological by startsAt).
 *   - BREAK, NETWORKING, CHECKIN sessions auto-set visible=false.
 *   - Speakers come from Speaker[] and are ordered by their first agenda
 *     startsAt (so the grid matches the session timeline). Speakers with
 *     no agenda item fall to the bottom, ordered by Speaker.order.
 *   - Each speaker gets sessionTime (HH:MM of their first agenda item).
 */

const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
       <rect width='200' height='200' fill='#e5e7eb'/>
       <circle cx='100' cy='80' r='36' fill='#9ca3af'/>
       <path d='M40 180 Q100 110 160 180 Z' fill='#9ca3af'/>
     </svg>`,
  );

const DEFAULT_HERO = "https://aisalon.massapro.com/images/TLV-2.jpg";

const DEFAULT_PLACEMENT: ImagePlacement = { focusX: 50, focusY: 50, zoom: 1 };

export type DbEventForMapping = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  startsAt: string;
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
    id?: string;
    type: string;
    title?: string | null;
    description?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    speakerId?: string | null;
    speaker?: { id: string; name: string } | null;
    panelists?: Array<{ id: string; name: string }> | null;
  }>;
};

function splitRole(role?: string | null): [string, string] {
  if (!role) return ["", ""];
  const idx = role.indexOf(",");
  if (idx === -1) return [role.trim(), ""];
  return [role.slice(0, idx).trim(), role.slice(idx + 1).trim()];
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

/**
 * Derive a speaker's role from the agenda. PANEL moderator → "Moderator",
 * PANEL panelist → "Panelist", else "Speaker". If they're on a WELCOME
 * session, "Host".
 */
function deriveRole(
  speakerId: string,
  agenda: DbEventForMapping["agenda"],
): Speaker["role"] {
  for (const item of agenda) {
    if (item.type === "WELCOME" && item.speakerId === speakerId) return "Host";
  }
  for (const item of agenda) {
    if (item.type === "PANEL") {
      if (item.speakerId === speakerId) return "Moderator";
      if (item.panelists?.some((p) => p.id === speakerId)) return "Panelist";
    }
  }
  return "Speaker";
}

/** Find the earliest agenda startsAt for a given speaker. */
function findFirstSessionTime(
  speakerId: string,
  agenda: DbEventForMapping["agenda"],
): string | null {
  let earliest: string | null = null;
  for (const item of agenda) {
    const isLead = item.speakerId === speakerId;
    const isPanelist = item.panelists?.some((p) => p.id === speakerId);
    if (!isLead && !isPanelist) continue;
    if (!item.startsAt) continue;
    if (earliest === null || item.startsAt < earliest) {
      earliest = item.startsAt;
    }
  }
  return earliest;
}

/** Find the title of the speaker's first agenda item. */
function findFirstSessionTitle(
  speakerId: string,
  agenda: DbEventForMapping["agenda"],
): string | undefined {
  let bestAt: string | null = null;
  let bestTitle: string | undefined = undefined;
  for (const item of agenda) {
    const isLead = item.speakerId === speakerId;
    const isPanelist = item.panelists?.some((p) => p.id === speakerId);
    if (!isLead && !isPanelist) continue;
    if (!item.startsAt) continue;
    if (bestAt === null || item.startsAt < bestAt) {
      bestAt = item.startsAt;
      bestTitle = item.title ?? undefined;
    }
  }
  return bestTitle;
}

export function mapEventToEventProfileData(
  event: DbEventForMapping,
): EventProfileData {
  // Build sessions from agenda.
  const sessions: Session[] = event.agenda
    .filter((a) => a.startsAt) // skip agenda items without a time
    .sort((a, b) => (a.startsAt! < b.startsAt! ? -1 : a.startsAt! > b.startsAt! ? 1 : 0))
    .map((a, idx) => {
      const sessionType: SessionType = classifySessionType(a.type);
      const speakerName =
        a.speaker?.name ??
        event.speakers.find((s) => s.id === a.speakerId)?.name ??
        undefined;
      return {
        order: idx + 1,
        type: sessionType,
        title: a.title ?? "(untitled session)",
        description: a.description ?? undefined,
        startTime: formatTime(a.startsAt!),
        endTime: a.endsAt ? formatTime(a.endsAt) : undefined,
        speakerName,
        speakerId: a.speakerId ?? undefined,
        // Auto-hide BREAK / NETWORKING / CHECKIN per product spec.
        visible: !isAutoHiddenSessionType(sessionType),
      } satisfies Session;
    });

  // Build speakers ordered by first session time.
  const speakersWithSort = event.speakers
    .filter((s) => s.name && s.name.trim().length > 0)
    .map((s) => {
      const firstAt = findFirstSessionTime(s.id, event.agenda);
      return {
        s,
        firstSessionAt: firstAt,
        role: deriveRole(s.id, event.agenda),
        sessionTime: firstAt ? formatTime(firstAt) : undefined,
        sessionTitle: findFirstSessionTitle(s.id, event.agenda),
      };
    });

  speakersWithSort.sort((a, b) => {
    if (a.firstSessionAt && b.firstSessionAt) {
      return a.firstSessionAt < b.firstSessionAt ? -1 :
             a.firstSessionAt > b.firstSessionAt ? 1 : 0;
    }
    if (a.firstSessionAt && !b.firstSessionAt) return -1;
    if (!a.firstSessionAt && b.firstSessionAt) return 1;
    return a.s.order - b.s.order;
  });

  const speakers: Speaker[] = speakersWithSort.map((entry, idx) => {
    const s = entry.s;
    const [title, roleCompany] = splitRole(s.role);
    const company = s.company?.trim() || roleCompany;
    return {
      order: idx + 1,
      fullName: s.name,
      title,
      company,
      bio: s.bio ?? undefined,
      photoUrl: s.photoUrl ?? DEFAULT_AVATAR,
      sessionTime: entry.sessionTime,
      sessionTitle: entry.sessionTitle ?? s.topic ?? undefined,
      role: entry.role,
      visible: true,
      photoPlacement: { ...DEFAULT_PLACEMENT },
    } satisfies Speaker;
  });

  return {
    event: {
      name: event.title,
      date: formatDate(event.startsAt),
      time: formatTime(event.startsAt),
      venue: formatVenue(event),
      topic: event.subtitle?.trim() || event.description?.trim() || "",
      description: event.description?.trim() || undefined,
      brandColors: ["#00FFFF", "#8B00FF"],
      sourceEventId: event.id,
      sourceEventSlug: event.slug,
    },
    heroOverlay: {
      imageUrl: event.mainImage?.fileUrl ?? DEFAULT_HERO,
      gradientColors: ["#8A2BE2", "#1E90FF", "#20B2AA"],
      gradientOpacity: 0.55,
      imagePlacement: { ...DEFAULT_PLACEMENT },
      imageScale: 1,
    },
    sessions,
    speakers,
    sponsors: [],
    collaborators: [],
    qrCodeUrl:
      event.rsvpUrl ||
      `https://aisalon.massapro.com/events/${event.slug}`,
    footerCredit: "Platform by MassaPro",
  };
}

export const _internals = {
  DEFAULT_AVATAR,
  DEFAULT_HERO,
  DEFAULT_PLACEMENT,
  splitRole,
  deriveRole,
  findFirstSessionTime,
  findFirstSessionTitle,
  formatDate,
  formatTime,
  formatVenue,
};
