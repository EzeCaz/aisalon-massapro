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
    /** Horizontal scale multiplier for the hero image. 1 = full canvas
     *  width (default). 0.5 = half width, 2 = double width (overflows). */
    imageScale?: number;
    /** Vertical scale multiplier for the hero image. 1 = full canvas
     *  height (default). 0.5 = top half only, 2 = double height. */
    imageScaleY?: number;
    /** Whether to render the triangle gradient overlay. Defaults true.
     *  Per layer-management spec: when "Yes", the triangle strictly
     *  renders BEHIND the hero image (controlled by triangleZ default). */
    showTriangleOverlay?: boolean;
  };
  /** Optional location pins overlaid on the hero. Used by the
   *  visual-first Event Profile layout. Defaults to the 4 canonical
   *  TLV pins if absent. */
  locationPins?: { x: number; y: number; label: string }[];
  /** Agenda list — sessions in chronological order. */
  sessions: Session[];
  /** Speakers grid — all speakers, ordered by first session time. */
  speakers: Speaker[];
  /** Sponsors at the bottom. */
  sponsors: Sponsor[];
  collaborators: Sponsor[];
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
   * Hero overlay z-index. Default 2 (above triangle, below text).
   * Set higher to bring the hero on top of other layers, lower to send
   * it behind. Controlled by the Front/Back buttons in section edit mode.
   */
  heroZ?: number;
  /**
   * Triangle overlay z-index. Default 1 (BEHIND hero, below text).
   *
   * Per layer-management spec: "The 'Show Triangle Overlay' must
   * strictly remain behind the 'Hero Image' component whenever the
   * visibility toggle is set to 'Yes.'" The Front/Back buttons let the
   * user override this if they want, but the default respects the spec.
   */
  triangleZ?: number;
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
