/**
 * Type definitions for the AI Salon Event Profile mockup.
 *
 * This is the third canonical mockup template — a full event-page-style
 * layout. Unlike Speaker Intro (multi-speaker grid) or Meet the Speaker
 * (single-speaker feature), Event Profile shows the WHOLE event:
 *   - Hero image + event title + date/time + venue
 *   - Topic / subtitle
 *   - Agenda list (each session with time, title, speaker, type)
 *   - Speakers grid (all speakers, even those not on a specific session)
 *   - QR code for RSVP
 *
 * Both `speakers[]` and `sessions[]` have an optional `visible` field —
 * set to false to hide a row without removing it from the data. When
 * auto-filled from an event, BREAK and NETWORKING sessions auto-set
 * `visible: false` (per product spec).
 */

// Re-export SectionLayout from the shared module so callers can import
// everything from this file.
export type { SectionLayout, SectionPos, SectionId } from "../shared/section-edit";
import type { SectionLayout } from "../shared/section-edit";

/**
 * TextStyle — per-text-section font size + color + alignment overrides.
 * All fields optional; the canvas falls back to per-section defaults
 * when a field is unset.
 *
 * Per user spec 2026-07-02: "Add to all mockups and all text fields and
 * sections the align left, center or right options, and also font size
 * to each text field".
 *
 * Re-declared inline (mirroring ../shared/text-style-row.tsx) to avoid
 * a circular type import.
 */
export type TextStyle = {
  /** Font size in px. When undefined, the canvas uses the section default. */
  fontSize?: number;
  /** Text color (any CSS color string). When undefined, the section default. */
  color?: string;
  /** Horizontal alignment: "left" | "center" | "right". When undefined, the
   *  section's default alignment is used. */
  align?: "left" | "center" | "right";
};

export type ImagePlacement = {
  focusX?: number;
  focusY?: number;
  zoom?: number;
};

/** Session type — drives icon + auto-hide behavior. */
export type SessionType =
  | "WELCOME"
  | "TALK"
  | "PANEL"
  | "FAST_PITCH"
  | "BREAK"
  | "NETWORKING"
  | "CHECKIN"
  | "OTHER";

/** One agenda row in the event profile. */
export type Session = {
  /** Sort order (1 = top). Derived from agenda startsAt. */
  order: number;
  type: SessionType;
  /** Original title from the agenda item (e.g. "Welcome by Ezequiel"). */
  title: string;
  /** Optional longer description. */
  description?: string;
  /** Start time formatted as "18:30". */
  startTime?: string;
  /** End time formatted as "19:00" (optional). */
  endTime?: string;
  /** Speaker name (lead speaker / moderator). */
  speakerName?: string;
  /** Speaker ID (used for cross-linking to speakers[]). */
  speakerId?: string;
  /**
   * Whether this session is rendered. Auto-set to false for BREAK and
   * NETWORKING when the event is picked from the dropdown. User can
   * toggle manually.
   */
  visible?: boolean;
};

/** One speaker card in the speakers grid. */
export type Speaker = {
  /** Sort order (matches Speaker.order from DB, or derived from agenda). */
  order: number;
  fullName: string;
  title: string;
  company: string;
  bio?: string;
  photoUrl: string;
  /** Session start time (HH:MM of their first agenda item). */
  sessionTime?: string;
  /** Session title (their talk / panel topic). */
  sessionTitle?: string;
  /** Role derived from agenda context. */
  role?: "Speaker" | "Moderator" | "Panelist" | "Host";
  /** Hide/show on canvas. */
  visible?: boolean;
  /** Pan/zoom for the headshot. */
  photoPlacement?: ImagePlacement;
  /** Size multiplier for the photo. 1 = 96px circle default. */
  photoSize?: number;
};

export type Sponsor = {
  name: string;
  logoUrl: string;
  theme?: "light" | "dark";
  logoSize?: number;
};

export type EventProfileData = {
  event: {
    name: string;
    date: string;
    time: string;
    venue: string;
    topic: string;
    description?: string;
    logoUrl?: string;
    brandColors: [string, string];
    sourceEventId?: string;
    sourceEventSlug?: string;
  };
  /** Hero image at the top. */
  heroOverlay: {
    imageUrl: string;
    gradientColors: string[];
    gradientOpacity: number;
    imagePlacement?: ImagePlacement;
    /** Horizontal scale multiplier for the hero image. 1 = default
     *  (full canvas width). 0.5 = half, 2 = double. */
    imageScale?: number;
    /** Vertical scale multiplier for the hero image. 1 = default
     *  (top 450px). 0.5 = top 225px, 2 = 900px. */
    imageScaleY?: number;
    /**
     * Free-form position of the hero container as % of canvas (0-100).
     * When undefined, the hero renders at its default anchor (top-left:
     * `left = 0`, `top = 0`). When set, the canvas uses these coordinates
     * directly so the user can drag the hero anywhere on the canvas.
     *
     * Per user spec 2026-07-04: "make sure i am able to drag with my
     * mouse the hero image along the entire canvas and not only by using
     * the Photo position (X%, Y%)".
     */
    pos?: { x: number; y: number };
  };
  /** Agenda list — sessions in chronological order. */
  sessions: Session[];
  /** Speakers grid — all speakers, ordered by first session time. */
  speakers: Speaker[];
  /** Sponsors at the bottom. */
  sponsors: Sponsor[];
  collaborators: Sponsor[];
  /**
   * Per-text-section font + color + alignment overrides. Each key matches
   * a text element the canvas renders. When a value is set, the canvas
   * uses it instead of the default font size / color / align for that
   * section.
   *
   * Per user spec 2026-07-02:
   *   - "I should be able to select the font size and color of each
   *      specific text section".
   *   - "Add to all mockups and all text fields and sections the align
   *      left, center or right options, and also font size to each text
   *      field".
   *
   * The sessionXxx and speakerXxx keys apply uniformly to every agenda
   * row / speaker card (not per-row overrides) — they share one visual
   * treatment per the rest of the mockup's styling model.
   */
  textStyles?: {
    /** Hero "AI Salon Tel Aviv Presents" eyebrow line. */
    presentsLabel?: TextStyle;
    /** Large event title (h1, hero). */
    eventName?: TextStyle;
    /** "Date · Time · Venue" line under the event name. */
    eventDateVenue?: TextStyle;
    /** Event topic (h2 at bottom of hero). */
    eventTopic?: TextStyle;
    /** Event description under the topic. */
    eventDescription?: TextStyle;
    /** "Agenda" section header label. */
    agendaLabel?: TextStyle;
    /** "Speakers" section header label. */
    speakersLabel?: TextStyle;
    /** "In collaboration with" label above the collaborator logos. */
    collaboratorsLabel?: TextStyle;
    /** "Sponsored by" label above the sponsor logos. */
    sponsorsLabel?: TextStyle;
    /** "Register here" label next to the QR code. */
    registerHere?: TextStyle;
    /** "Scan to RSVP on the event page" hint under "Register here". */
    registerHint?: TextStyle;
    /** Optional footer credit (bottom-left). */
    footerCredit?: TextStyle;
    /** Agenda row: start time (e.g. "18:30"). */
    sessionStartTime?: TextStyle;
    /** Agenda row: optional end time (small, under start time). */
    sessionEndTime?: TextStyle;
    /** Agenda row: type pill text (e.g. "Talk" / "Panel"). */
    sessionTypePill?: TextStyle;
    /** Agenda row: session title. */
    sessionTitle?: TextStyle;
    /** Agenda row: speaker name line. */
    sessionSpeakerName?: TextStyle;
    /** Agenda row: optional description line. */
    sessionDescription?: TextStyle;
    /** Speaker card: optional session-time pill text. */
    speakerSessionTime?: TextStyle;
    /** Speaker card: optional role pill text (Moderator / Panelist / Host). */
    speakerRole?: TextStyle;
    /** Speaker card: full name. */
    speakerName?: TextStyle;
    /** Speaker card: "title, company" line. */
    speakerTitle?: TextStyle;
    /** Speaker card: optional session title (italic, in quotes). */
    speakerSessionTitle?: TextStyle;
    /** Speaker card: optional bio paragraph. */
    speakerBio?: TextStyle;
  };
  /** URL the QR code points to. */
  qrCodeUrl: string;
  footerCredit?: string;
  /**
   * Branding asset at the bottom-LEFT corner of the canvas. Defaults
   * to the AI Salon brand image hosted on Vercel Blob. Replaceable via
   * the canvas Replace button (edit mode) or the form view URL input.
   *
   * Per user spec 2026-07-02: "On all mockups, the bottom left branding
   * asset should be this as default, ...1782505047256-bpy1ln.png and
   * replaceable".
   */
  brandingAsset?: {
    imageUrl?: string;
    /** Height in px. Default 48. */
    height?: number;
    /** Free-form position as % of canvas. Default = bottom-left corner. */
    pos?: { x: number; y: number };
  };
  /**
   * Section layout — per-section draggable position + scale, set when
   * the user toggles "Edit sections" and drags/resizes text sections
   * (header, topic, description, agenda, speakers, sponsors, branding,
   * qr, footer). Stored as % of canvas so it survives preview-scale
   * changes.
   */
  sectionLayout?: SectionLayout;
  /**
   * Hero overlay z-index. Default 1.
   * Controlled by the Front/Back buttons in section edit mode.
   */
  heroZ?: number;
};

/** Image slot identifiers for the picker. */
export type ImageSlot =
  | { kind: "hero" }
  | { kind: "speaker"; index: number }
  | { kind: "branding-asset" }
  | { kind: "sponsor"; group: "collaborators" | "sponsors"; index: number };

/** Lightweight event entry for the dropdown. */
export type EventPickListItem = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  venue?: string | null;
};

/** Helper: clamp a number. */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Helper: merge a partial placement with defaults. */
export function resolvePlacement(p?: ImagePlacement) {
  return {
    focusX: clamp(p?.focusX ?? 50, 0, 100),
    focusY: clamp(p?.focusY ?? 50, 0, 100),
    zoom: clamp(p?.zoom ?? 1, 0.1, 10),
  };
}

/** Classify an agenda type string into our SessionType union. */
export function classifySessionType(raw: string): SessionType {
  const t = (raw || "").toUpperCase().trim();
  if (t === "WELCOME" || t === "INTRO" || t === "OPENING") return "WELCOME";
  if (t === "TALK" || t === "KEYNOTE" || t === "PRESENTATION" || t === "FIREPLACE") return "TALK";
  if (t === "PANEL" || t === "FIRESIDE") return "PANEL";
  if (t === "FAST_PITCH" || t === "PITCH") return "FAST_PITCH";
  if (t === "BREAK" || t === "COFFEE" || t === "LUNCH") return "BREAK";
  if (t === "NETWORKING" || t === "MINGLE" || t === "COCKTAIL") return "NETWORKING";
  if (t === "CHECKIN" || t === "REGISTRATION") return "CHECKIN";
  return "OTHER";
}

/** Auto-hide these session types when auto-filling from an event. */
export function isAutoHiddenSessionType(t: SessionType): boolean {
  return t === "BREAK" || t === "NETWORKING" || t === "CHECKIN";
}

/** Human-readable label for a session type. */
export function sessionTypeLabel(t: SessionType): string {
  switch (t) {
    case "WELCOME": return "Welcome";
    case "TALK": return "Talk";
    case "PANEL": return "Panel";
    case "FAST_PITCH": return "Fast Pitch";
    case "BREAK": return "Break";
    case "NETWORKING": return "Networking";
    case "CHECKIN": return "Check-in";
    case "OTHER": return "Session";
  }
}
