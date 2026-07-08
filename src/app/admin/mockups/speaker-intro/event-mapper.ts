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
 *   heroOverlay.imageUrl ← DEFAULT_HERO (always — per spec A, ignore Event.mainImage)
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
 * Names that should be hidden by default when auto-filling from an event.
 *
 * Per user spec 2026-07-09 (item B): "Avoid to show Ezequiel Sznaider by
 * default". We mark matching speakers as `visible: false` (rather than
 * removing them from the data) so the user can re-enable them in the
 * editor if needed.
 *
 * Match is case-insensitive on the full name. Trims whitespace.
 */
const HIDDEN_BY_DEFAULT_NAMES = ["ezequiel sznaider"];

/**
 * Default section layout for the Speaker Intro mockup.
 *
 * Per user spec 2026-07-09:
 *   - D (speakers): pos X=-7.5% Y=29.3%, box W=891px, scale=0.76, z=front
 *   - E (header):   pos X=1.7%  Y=0.5%,  box W=100% (1200px)
 *   - F (topic):    pos X=-12.8% Y=23.5%, box W=951px, scale=0.65
 *   - H (branding): pos X≈3.10% Y≈87.57% (handled separately on brandingAsset)
 *
 * These defaults are baked into the data so the canvas renders the
 * canonical layout on first event-pick, before the user has touched
 * anything. The user can still drag/resize sections in the editor —
 * their edits override these defaults via the same sectionLayout path.
 */
const DEFAULT_SECTION_LAYOUT = {
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
    // "Layer front all" — render the speakers grid above other text
    // sections (default TEXT_Z=50) and above the branding asset (52).
    z: 60,
  },
} as const;

/**
 * Default branding-asset position (bottom-left corner) per user spec
 * 2026-07-09 (item H): X=3.1021447721179625%, Y=87.5656836461126%.
 */
const DEFAULT_BRANDING_ASSET_POS = {
  x: 3.1021447721179625,
  y: 87.5656836461126,
} as const;

/**
 * Brand colors per user spec 2026-07-09 (item G):
 *   Brand color 1 = #ff0056 (pink/magenta)
 *   Brand color 2 = #8f0080 (deep purple/magenta)
 */
const DEFAULT_BRAND_COLORS: [string, string] = ["#ff0056", "#8f0080"];

/** Footer credit per user spec 2026-07-09 (item I). */
const DEFAULT_FOOTER_CREDIT = "MassaPro";

/** Branding asset image URL — AI Salon mark on Vercel Blob. */
const DEFAULT_BRANDING_ASSET_IMAGE =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png";

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
  //
  // Per user spec 2026-07-09 (item B): speakers whose trimmed name
  // matches HIDDEN_BY_DEFAULT_NAMES are marked `visible: false` so they
  // don't render on the canvas by default. The user can re-enable them
  // in the editor's form view (per-speaker "Visible" dropdown).
  const speakers: Speaker[] = speakersWithSort.map((entry, idx) => {
    const s = entry.s;
    const [title, roleCompany] = splitRole(s.role);
    const company = s.company?.trim() || roleCompany;
    const normalized = (s.name || "").trim().toLowerCase();
    const hidden = HIDDEN_BY_DEFAULT_NAMES.some((n) => n === normalized);
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
      visible: !hidden,
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
      // Per user spec 2026-07-09 (item G): brand colors are #ff0056 + #8f0080.
      brandColors: [...DEFAULT_BRAND_COLORS] as [string, string],
      sourceEventId: event.id,
      sourceEventSlug: event.slug,
    },
    speakers,
    collaborators: [],
    sponsors: [],
    heroOverlay: {
      // Per user spec 2026-07-09 (item A): the default hero image is the
      // canonical brand asset on Vercel Blob. This MUST always be used for
      // every event — we deliberately ignore event.mainImage so the canvas
      // never shows the event's own photo as the hero background. The user
      // can still override this in the editor's form view.
      imageUrl: DEFAULT_HERO,
      gradientColors: ["#8A2BE2", "#1E90FF", "#20B2AA"],
      gradientOpacity: 0.55,
      imagePlacement: { ...DEFAULT_PLACEMENT },
    },
    locationPins: DEFAULT_PINS.map((p) => ({ ...p })),
    qrCodeUrl:
      event.rsvpUrl ||
      `https://aisalon.massapro.com/events/${event.slug}`,
    // Per user spec 2026-07-09 (item I): footer credit is "MassaPro".
    footerCredit: DEFAULT_FOOTER_CREDIT,
    // Per user spec 2026-07-09 (item H): branding asset at the bottom-left
    // corner by default — height 48px, X≈3.10% Y≈87.57%.
    brandingAsset: {
      imageUrl: DEFAULT_BRANDING_ASSET_IMAGE,
      height: 48,
      pos: { ...DEFAULT_BRANDING_ASSET_POS },
    },
    // Per user spec 2026-07-09 (items D, E, F): default section layout
    // for header / topic / speakers. The user can drag/resize in the
    // editor — their edits override these via the same sectionLayout path.
    sectionLayout: JSON.parse(JSON.stringify(DEFAULT_SECTION_LAYOUT)),
  };
}

/** Exposed for tests / re-use. */
export const _internals = {
  DEFAULT_AVATAR,
  DEFAULT_HERO,
  DEFAULT_PINS,
  DEFAULT_PLACEMENT,
  DEFAULT_BRAND_COLORS,
  DEFAULT_FOOTER_CREDIT,
  DEFAULT_BRANDING_ASSET_IMAGE,
  DEFAULT_BRANDING_ASSET_POS,
  DEFAULT_SECTION_LAYOUT,
  HIDDEN_BY_DEFAULT_NAMES,
  splitRole,
  deriveRole,
  findFirstSessionTime,
  formatDate,
  formatTime,
  formatVenue,
};
