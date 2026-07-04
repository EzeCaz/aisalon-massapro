import type {
  SpeakerIntroData,
  Speaker,
  SpeakerRole,
  ImagePlacement,
} from "./types";

/**
 * Map a DB Event (with speakers + agenda included) to a
 * SpeakerIntroData object that the canvas can render.
 *
 * This is the auto-fill path: pick an event in the dropdown →
 * we fetch GET /api/events/[slug] → run it through this function →
 * drop the result into the editor's `data` state.
 *
 * Field mapping:
 *   event.name        ← Event.title
 *   event.date        ← Event.startsAt formatted "June 18th 2026"
 *   event.time        ← Event.startsAt formatted "18:00"
 *   event.venue       ← Event.venue (+ address + city, comma-joined)
 *   event.topic       ← Event.subtitle ?? Event.description
 *   speakers[].order  ← Re-derived: speakers are sorted by their FIRST
 *                       agenda item's startsAt (so the list matches the
 *                       actual session timeline). Speakers with no agenda
 *                       item fall to the bottom, ordered by Speaker.order.
 *   speakers[].role   ← derived: PANEL moderator → "Moderator",
 *                                  PANEL panelist → "Panelist",
 *                                  else "Speaker"
 *   speakers[].fullName ← Speaker.name
 *   speakers[].title    ← first half of Speaker.role split on comma
 *   speakers[].company  ← Speaker.company ?? second half of Speaker.role
 *   speakers[].bio      ← Speaker.bio
 *   speakers[].photoUrl ← Speaker.photoUrl ?? DEFAULT_AVATAR
 *   speakers[].sessionTitle ← Speaker.topic
 *   speakers[].sessionTime  ← HH:MM of their first agenda item's startsAt
 *                              (empty string when no agenda item exists)
 *   speakers[].visible  ← true (user can toggle off in the editor)
 *   heroOverlay.imageUrl ← Event.mainImage?.fileUrl ?? DEFAULT_HERO
 *   qrCodeUrl          ← Event.rsvpUrl ?? /events/<slug>
 */

/** Fallbacks used when DB fields are empty. */
const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
       <rect width='200' height='200' fill='#e5e7eb'/>
       <circle cx='100' cy='80' r='36' fill='#9ca3af'/>
       <path d='M40 180 Q100 110 160 180 Z' fill='#9ca3af'/>
     </svg>`,
  );

const DEFAULT_HERO = "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782987131384-reozea.png";

const DEFAULT_PINS = [
  { label: "Sarona", x: 78, y: 18 },
  { label: "Dizengoff", x: 60, y: 12 },
  { label: "Neve Tzedek", x: 90, y: 48 },
  { label: "Yafo", x: 70, y: 78 },
];

const DEFAULT_PLACEMENT: ImagePlacement = { focusX: 50, focusY: 50, zoom: 1 };

/**
 * Minimal shape of `event` returned by GET /api/events/[slug].
 * We type it here (instead of importing the Prisma type) so the
 * mapper is decoupled from the DB layer and easier to test.
 *
 * NOTE: agenda items include `startsAt`, `endsAt`, `title`, `type`
 * so we can order speakers by their first session time and surface
 * the session time on each speaker card.
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
    id?: string;
    type: string; // TALK | PANEL | BREAK | NETWORKING | FAST_PITCH | WELCOME | etc.
    title?: string | null;
    startsAt?: string | null; // ISO
    endsAt?: string | null;
    speakerId?: string | null;
    panelists?: Array<{ id: string }> | null;
  }>;
};

/** Split "AI Product Lead, Amdocs" → ["AI Product Lead", "Amdocs"]. */
function splitRole(role?: string | null): [string, string] {
  if (!role) return ["", ""];
  const idx = role.indexOf(",");
  if (idx === -1) return [role.trim(), ""];
  return [role.slice(0, idx).trim(), role.slice(idx + 1).trim()];
}

/**
 * Derive Speaker/Moderator/Panelist from agenda context.
 * A speaker is a "Moderator" if they're the speakerId on a PANEL item;
 * "Panelist" if they're in the panelists[] of a PANEL item;
 * otherwise "Speaker".
 */
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

/**
 * Find the earliest agenda startsAt for a given speaker.
 * Returns null if the speaker isn't on any agenda item.
 * Checks both `speakerId` (lead) and `panelists[]` (panelist).
 */
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

/**
 * Format an ISO date as "June 18th 2026" — in Asia/Jerusalem local time.
 *
 * IMPORTANT: This must use the same timezone as the admin agenda tab
 * (admin-agenda-tab.tsx → Intl.DateTimeFormat with timeZone: "Asia/Jerusalem")
 * so the mockup shows the same wall-clock time the admin entered. Using
 * getUTCDate()/getUTCMonth() here would display the UTC date, which can
 * be a day off for events that start near midnight Israel time.
 */
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

/**
 * Format an ISO date as "18:00" (HH:MM, 24h) — in Asia/Jerusalem local time.
 *
 * Previously this used `d.getUTCHours()`, which returned UTC hours. That
 * caused the mockup to display times 3 hours behind (in summer) or 2 hours
 * behind (in winter) the wall-clock time the admin entered in the agenda
 * tab. Switching to Intl.DateTimeFormat with timeZone: "Asia/Jerusalem"
 * makes the mockup match what the admin sees.
 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Build a venue string from the available address fragments. */
function formatVenue(e: DbEventForMapping): string {
  const parts = [e.venue, e.address, e.city, e.country].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  return parts.join(", ");
}

/**
 * Build the SpeakerIntroData from a DB event.
 *
 * Speakers are ordered by their FIRST agenda item's startsAt (so the
 * list reflects the actual session timeline). Speakers with no agenda
 * item fall to the bottom, ordered by Speaker.order.
 *
 * Each speaker gets:
 *   - `sessionTime` (HH:MM of their first agenda item, or "" if none)
 *   - `visible: true` (user can toggle off in the editor)
 */
export function mapEventToSpeakerIntroData(
  event: DbEventForMapping,
): SpeakerIntroData {
  // Pre-compute each speaker's first session time so we can sort.
  const speakersWithSort: Array<{
    s: DbEventForMapping["speakers"][number];
    firstSessionAt: string | null; // ISO or null
    role: SpeakerRole;
    sessionTime: string; // HH:MM or ""
  }> = event.speakers
    .filter((s) => s.name && s.name.trim().length > 0)
    .map((s) => {
      const firstAt = findFirstSessionTime(s.id, event.agenda);
      return {
        s,
        firstSessionAt: firstAt,
        role: deriveRole(s.id, event.agenda),
        sessionTime: firstAt ? formatTime(firstAt) : "",
      };
    });

  // Sort: by firstSessionAt ascending (nulls last), then by Speaker.order.
  speakersWithSort.sort((a, b) => {
    if (a.firstSessionAt && b.firstSessionAt) {
      return a.firstSessionAt < b.firstSessionAt ? -1 :
             a.firstSessionAt > b.firstSessionAt ? 1 : 0;
    }
    if (a.firstSessionAt && !b.firstSessionAt) return -1;
    if (!a.firstSessionAt && b.firstSessionAt) return 1;
    return a.s.order - b.s.order;
  });

  // Build the Speaker[] array — assign new sequential `order` values
  // starting at 1 so the canvas's `sort((a,b) => a.order - b.order)`
  // produces the timeline order we just computed.
  const speakers: Speaker[] = speakersWithSort.map((entry, idx) => {
    const s = entry.s;
    const [title, roleCompany] = splitRole(s.role);
    const company = s.company?.trim() || roleCompany;
    return {
      order: idx + 1,
      role: entry.role,
      fullName: s.name,
      title,
      company,
      bio: s.bio ?? undefined,
      photoUrl: s.photoUrl ?? DEFAULT_AVATAR,
      sessionTitle: s.topic ?? undefined,
      sessionTime: entry.sessionTime || undefined,
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
      brandColors: ["#00FFFF", "#8B00FF"],
      sourceEventId: event.id,
      sourceEventSlug: event.slug,
    },
    speakers,
    collaborators: [],
    sponsors: [],
    heroOverlay: {
      imageUrl: event.mainImage?.fileUrl ?? DEFAULT_HERO,
      gradientColors: ["#8A2BE2", "#1E90FF", "#20B2AA"],
      gradientOpacity: 0.55,
      imagePlacement: { ...DEFAULT_PLACEMENT },
    },
    locationPins: DEFAULT_PINS.map((p) => ({ ...p })),
    qrCodeUrl:
      event.rsvpUrl ||
      `https://aisalon.massapro.com/events/${event.slug}`,
    footerCredit: "Platform by MassaPro",
  };
}

/** Exposed for tests / re-use. */
export const _internals = {
  DEFAULT_AVATAR,
  DEFAULT_HERO,
  DEFAULT_PINS,
  DEFAULT_PLACEMENT,
  splitRole,
  deriveRole,
  findFirstSessionTime,
  formatDate,
  formatTime,
  formatVenue,
};
