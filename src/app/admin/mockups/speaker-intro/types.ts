/**
 * Type definitions for the AI Salon Speaker Intro mockup.
 *
 * This shape is what an admin edits in the JSON editor on the left side
 * of /admin/mockups/speaker-intro. Every field maps 1:1 to a component
 * on the canvas — no field is "for future use"; if it's here, the
 * canvas renders it.
 *
 * The same shape is also valid as input to the AI Event Mockup Template
 * Generator system prompt — pass it as JSON to Grok Imagine / Flux /
 * Midjourney to generate a fresh visual matching this structure.
 */

export type SpeakerRole = "Speaker" | "Moderator" | "Panelist" | "Host";

/**
 * ImagePlacement — per-image pan/zoom that controls how an image is
 * cropped inside its container. Stored as part of the JSON so it
 * round-trips through the editor and is reproducible on export.
 *
 *   - focusX / focusY: which point of the image is centered in the
 *     container, as a percentage (0 = left/top, 50 = center,
 *     100 = right/bottom). Translates to CSS `object-position`.
 *   - zoom: scale factor on top of `object-cover` (1 = fit, 2 = 2×).
 *     Translates to CSS `transform: scale(zoom)`.
 *
 * All fields optional; defaults are 50 / 50 / 1.
 */
export type ImagePlacement = {
  focusX?: number;
  focusY?: number;
  zoom?: number;
};

export type Speaker = {
  /** Sort order in the vertical stack (1 = top). */
  order: number;
  role: SpeakerRole;
  fullName: string;
  title: string;
  company: string;
  /** Optional one-line bio shown under the title. */
  bio?: string;
  /** Square headshot URL (rendered in a circle). */
  photoUrl: string;
  /** Optional session title (e.g. " fireside chat"). */
  sessionTitle?: string;
  /**
   * Session start time (HH:MM 24h, e.g. "18:30"). Auto-filled from the
   * speaker's first agenda item when the event dropdown is used. Rendered
   * as a small time pill next to the speaker's name.
   */
  sessionTime?: string;
  /**
   * Whether this speaker is rendered on the canvas. Set to false in the
   * JSON (or via the editor sidebar checkbox) to hide a speaker without
   * removing them from the data. Defaults to true.
   */
  visible?: boolean;
  /** Pan/zoom for the headshot — set by dragging the photo in edit mode. */
  photoPlacement?: ImagePlacement;
  /**
   * Size multiplier for the headshot. 1 = default (56px circle),
   * 2 = double (112px), 0.5 = half (28px). Useful for emphasizing
   * the keynote speaker.
   */
  photoSize?: number;
};

export type Sponsor = {
  name: string;
  logoUrl: string;
  /** Light/dark variant for the logo. */
  theme?: "light" | "dark";
  /**
   * Size multiplier for the logo. 1 = default (32px height),
   * 2 = double (64px), 0.5 = half (16px). Useful for giving
   * title sponsors more prominence.
   */
  logoSize?: number;
};

export type LocationPin = {
  label: string;
  /** Position on the hero canvas, in % from left/top. */
  x: number;
  y: number;
};

export type SpeakerIntroData = {
  event: {
    name: string;
    date: string;
    time: string;
    venue: string;
    topic: string;
    /** Optional event logo URL (defaults to AI Salon mark). */
    logoUrl?: string;
    /** Two-color brand gradient used for the triangle overlays. */
    brandColors: [string, string];
    /** ID of the source event (set when the data was auto-filled from an event). */
    sourceEventId?: string;
    /** Slug of the source event (for re-fetching / linking). */
    sourceEventSlug?: string;
    /** Font scale multiplier for the event name (1 = default 32px). */
    nameFontScale?: number;
    /** Font scale multiplier for the topic (1 = default 16px). */
    topicFontScale?: number;
  };
  /** Vertical stack of speakers on the left column. */
  speakers: Speaker[];
  /** "In collaboration with:" logos (bottom-right). */
  collaborators: Sponsor[];
  /** "Sponsored by:" logos (bottom-right, below collaborators). */
  sponsors: Sponsor[];
  /** Geometric triangle overlays on the hero visual. */
  heroOverlay: {
    /** Background hero image URL (Tel Aviv skyline + meerkat). */
    imageUrl: string;
    /** Triangle gradient colors, left to right. */
    gradientColors: string[];
    /** Opacity of the gradient overlay (0-1). */
    gradientOpacity: number;
    /** Pan/zoom for the hero image — set by dragging the image in edit mode. */
    imagePlacement?: ImagePlacement;
    /**
     * Horizontal size multiplier for the hero image container. 1 = default
     * (58% of canvas width), 1.5 = 87%, 2 = 116% (overflows — usually
     * unwanted). Useful for letting the hero bleed further left if desired.
     */
    imageScale?: number;
    /**
     * Vertical size multiplier for the hero image container. 1 = full canvas
     * height (default). 0.5 = top half only, 1.5 = bleeds 50% beyond bottom.
     * Useful for cropping the hero vertically (e.g. showing only the top
     * portion of a tall skyline image).
     */
    imageScaleY?: number;
    /**
     * Whether to render the geometric triangle SVG overlay on top of the
     * hero image. Defaults to true. Automatically set to false when the
     * user picks a new hero image (per user spec: "when the hero image is
     * changed, the triangle overlay should be erased"). Can be toggled
     * back on manually in the form/JSON editor.
     */
    showTriangleOverlay?: boolean;
  };
  /** Location pins overlaid on the hero visual. */
  locationPins: LocationPin[];
  /** URL the QR code points to (usually the RSVP / registration page). */
  qrCodeUrl: string;
  /** Optional small footer credit text. */
  footerCredit?: string;
  /**
   * Branding image (bottom-right corner). Defaults to the meerkat
   * brand image. Override imageUrl to swap, height to resize.
   */
  branding?: {
    imageUrl?: string;
    /** Height in px. Default 48. */
    height?: number;
  };
};

/**
 * ImageSlot — identifies which image in the data a picker / drag
 * operation is targeting. Used by the editor to route edits.
 */
export type ImageSlot =
  | { kind: "hero" }
  | { kind: "speaker"; index: number }
  | { kind: "sponsor"; group: "collaborators" | "sponsors"; index: number };

/**
 * PickListItem — lightweight event entry for the dropdown.
 * Mirrors the shape returned by GET /api/events.
 */
export type EventPickListItem = {
  id: string;
  slug: string;
  title: string;
  startsAt: string; // ISO
  venue?: string | null;
};

/** Helper: clamp a number to [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Helper: merge a partial placement with defaults. */
export function resolvePlacement(p?: ImagePlacement): {
  focusX: number;
  focusY: number;
  zoom: number;
} {
  return {
    focusX: clamp(p?.focusX ?? 50, 0, 100),
    focusY: clamp(p?.focusY ?? 50, 0, 100),
    zoom: clamp(p?.zoom ?? 1, 1, 4),
  };
}
