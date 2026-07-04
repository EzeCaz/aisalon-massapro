/**
 * Type definitions for the AI Salon "Meet the Speaker" mockup.
 *
 * Single-speaker focused mockup: large photo on the right, speaker bio
 * + topic on the left, event details at the bottom. Used to introduce
 * one featured speaker ahead of an event.
 *
 * Every field maps 1:1 to a component on the canvas — no field is
 * "for future use"; if it's here, the canvas renders it.
 */

// Re-export SectionLayout from the shared module so callers can import
// everything from this file.
export type { SectionLayout, SectionPos, SectionId } from "../shared/section-edit";
import type { SectionLayout } from "../shared/section-edit";

export type SpeakerRole = "Speaker" | "Moderator" | "Panelist" | "Host";

/**
 * TextStyle — per-text-section font size + color + alignment overrides.
 * All fields optional; the canvas falls back to per-section defaults
 * when a field is unset.
 *
 * Per user spec 2026-07-02: "Add to all mockups and all text fields and
 * sections the align left, center or right options, and also font size
 * to each text field".
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

export type Sponsor = {
  name: string;
  logoUrl: string;
  /** Light/dark variant for the logo. */
  theme?: "light" | "dark";
  /**
   * Size multiplier for the logo. 1 = default (32px height),
   * 2 = double (64px), 0.5 = half (16px).
   */
  logoSize?: number;
};

export type MeetTheSpeakerData = {
  /** Pink "Meet the speaker" header at the top of the left column. */
  header: {
    text: string;
    color: string;
  };
  /** The featured speaker. */
  speaker: {
    fullName: string;
    title: string;
    company: string;
    role: SpeakerRole;
    /** "Topic:" label + the topic title. */
    topic: string;
    /** Optional one-liner under the topic title. */
    topicDescription?: string;
    /** Main bio paragraph. */
    bio: string;
    /** Optional second paragraph (expertise / recognition). */
    expertise?: string;
    /** Large portrait photo on the right side. */
    photoUrl: string;
    photoPlacement?: ImagePlacement;
    /**
     * Size multiplier for the portrait. 1 = default (45% canvas width),
     * 1.5 = 67%, 2 = 90%. Useful for tighter headshots.
     */
    photoSize?: number;
    /**
     * Free-form position of the speaker photo container, as % of canvas
     * (0–100 for x and y). When set, the photo container is positioned
     * at this point (top-left corner) instead of its default anchor
     * (top-right with 5% margin). Set by dragging the photo container
     * in edit mode — the photo can move anywhere on the canvas, with
     * only the canvas border clipping the bleed (per user spec
     * 2026-07-02: "Should be able to drag the Photo URL image all
     * around the canvas without limitation").
     */
    photoPos?: { x: number; y: number };
    /**
     * Rotation in degrees (0, 90, 180, 270). Each click of the "Rotate"
     * button in the z-index section advances by 90°. Applied via CSS
     * `transform: rotate(<deg>deg)` on the photo's container.
     */
    photoRotation?: number;
  };
  /**
   * Per-text-section font + color + alignment overrides. Each key matches
   * a text element on the canvas (fullName, title, company, role, topic,
   * topicDescription, bio, expertise, header). When a value is set, the
   * canvas uses it instead of the default font size / color / align.
   *
   * Per user spec 2026-07-02:
   *   - "I should be able to select the font size and color of each
   *      specific text section".
   *   - "Add to all mockups and all text fields and sections the align
   *      left, center or right options, and also font size to each text
   *      field".
   */
  textStyles?: {
    header?: TextStyle;
    fullName?: TextStyle;
    title?: TextStyle;
    company?: TextStyle;
    role?: TextStyle;
    topic?: TextStyle;
    topicDescription?: TextStyle;
    bio?: TextStyle;
    expertise?: TextStyle;
    /** Per user spec 2026-07-02: add align L/C/R + font size + color to the
     *  Event context section (event name / date / time / venue / footer). */
    eventName?: TextStyle;
    eventDate?: TextStyle;
    eventTime?: TextStyle;
    venue?: TextStyle;
    footer?: TextStyle;
  };
  /** Event context (auto-filled from the event picker). */
  event: {
    name: string;
    date: string;
    time: string;
    venue: string;
    /** Optional event logo URL. */
    logoUrl?: string;
    brandColors: [string, string];
    /** ID of the source event (set when auto-filled). */
    sourceEventId?: string;
    sourceEventSlug?: string;
  };
  /** Optional meerkat / brand graphic in the bottom-right corner. */
  graphic: {
    imageUrl: string;
    imagePlacement?: ImagePlacement;
    /**
     * Size multiplier for the graphic. 1 = default (20% canvas width),
     * 2 = 40%, 0.5 = 10%.
     */
    imageScale?: number;
    /**
     * Rotation in degrees (0, 90, 180, 270). Each click of the "Rotate"
     * button in the z-index section advances by 90°. Applied via CSS
     * `transform: rotate(<deg>deg)` on the graphic's container.
     */
    rotation?: number;
    /**
     * Free-form position of the graphic container, as % of canvas
     * (0–100 for x and y). When set, the graphic is positioned at
     * this point (top-left corner) instead of its default bottom-right
     * anchor. Set by dragging the graphic in edit mode — per user spec
     * 2026-07-02: "Graphic (z=8) should be able to drag with my mousse
     * all over the canvas without limitation".
     */
    pos?: { x: number; y: number };
  };
  /**
   * Branding asset at the bottom-LEFT corner of the canvas. Defaults to
   * the AI Salon brand image hosted on Vercel Blob. Replaceable via the
   * canvas Replace button (edit mode) or the form view URL input.
   *
   * Per user spec 2026-07-02: "On all mockups, the bottom left branding
   * asset should be this as default, https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png
   * and replaceable".
   */
  brandingAsset?: {
    imageUrl?: string;
    /** Height in px. Default 48. */
    height?: number;
    /** Free-form position as % of canvas. Default = bottom-left corner. */
    pos?: { x: number; y: number };
  };
  /** Geometric triangle overlays on the right side (behind speaker photo). */
  heroOverlay: {
    gradientColors: string[];
    gradientOpacity: number;
    /** Horizontal scale multiplier for the hero overlay container.
     *  1 = 55% canvas width (default). 0.5 = 27.5%, 2 = 110%. */
    imageScale?: number;
    /** Vertical scale multiplier for the hero overlay container.
     *  1 = 85% canvas height (default). 0.5 = 42.5%, 2 = 170%. */
    imageScaleY?: number;
    /**
     * Rotation in degrees (0, 90, 180, 270) for the hero overlay
     * (gradient triangles). Each click of the "Rotate" button in the
     * z-index section advances by 90°. Applied via CSS
     * `transform: rotate(<deg>deg)` on the overlay container.
     */
    rotation?: number;
  };
  /**
   * Hero style picker — selects which hero visual is rendered on the
   * right side of the canvas (behind/around the speaker photo).
   *
   *   1 = (default) Geometric gradient triangles via SVG (the original
   *       heroOverlay rendering — see `heroOverlay` field above).
   *   2 = Pre-designed hero image (low-poly network graph with 4
   *       "Placeholder" labels at the corners — see `heroStyle2Url`).
   *       When Style 2 is selected, the 4 `localStreetPins` are
   *       overlaid on top of the image and replace the placeholder
   *       labels visually.
   */
  heroStyle?: 1 | 2;
  /**
   * Image URL for hero style #2. Defaults to the AI Salon branded
   * low-poly network graph uploaded to Vercel Blob.
   */
  heroStyle2Url?: string;
  /**
   * Pan/zoom for the Style 2 hero image — set by dragging the image
   * (pan) and scrolling the wheel (zoom) in edit mode.
   */
  heroStyle2Placement?: ImagePlacement;
  /**
   * Size multiplier for the Style 2 hero image container. 1 = default
   * (55% canvas width × 85% height). Set by dragging the corner
   * handles in edit mode.
   */
  heroStyle2Scale?: number;
  /**
   * Free-form position of the Style 2 hero image container, as % of
   * canvas (0–100 for x and y). When set, the hero image container is
   * positioned at this point (top-left corner) instead of its default
   * anchor (top-right at 45% left, 0% top). Set by dragging the hero
   * image container in edit mode — per user spec 2026-07-02: "Should
   * be able to drag the image all around the canvas without any
   * limitations".
   */
  heroStyle2Pos?: { x: number; y: number };
  /**
   * Rotation in degrees (0, 90, 180, 270) for the Style 2 hero image.
   * Cycled by the Rotate button in the Layer z-index section. Applied
   * via CSS `transform: rotate(<deg>deg)` on the hero image container.
   */
  heroStyle2Rotation?: number;
  /**
   * "Local Street" pins — 4 editable labels overlaid on hero style #2
   * at the four corners (where the source image has "Placeholder 1–4"
   * baked into the pixels). The pin labels are user-editable so the
   * admin can rename "Local Street 1" to actual neighborhood names
   * (e.g. "Sarona", "Yafo") like the location pins in
   * speaker-intro / event-profile.
   *
   * Each pin's (x, y) is a percentage of the canvas (0–100). Defaults
   * to the four corners. Per user spec 2026-07-02, pins are draggable
   * on the canvas (not just editable via X/Y inputs).
   */
  localStreetPins?: { x: number; y: number; label: string }[];
  /** "In collaboration with:" logos (bottom-right). */
  collaborators: Sponsor[];
  /** "Sponsored by:" logos (bottom-right, below collaborators). */
  sponsors: Sponsor[];
  /** URL the QR code points to (RSVP / registration). */
  qrCodeUrl: string;
  /** Optional small footer credit text. */
  footerCredit?: string;
  /**
   * Section layout — per-section draggable position + scale, set when
   * the user toggles "Edit sections" and drags/resizes text sections
   * (header, speaker-info, topic, bio, event-meta, sponsors, branding,
   * qr, footer). Stored as % of canvas so it survives preview-scale
   * changes.
   */
  sectionLayout?: SectionLayout;
  /**
   * Hero overlay (gradient triangles) z-index. Default 1.
   * Controlled by the Front/Back buttons in section edit mode.
   */
  heroZ?: number;
  /**
   * Speaker photo z-index. Default 3 (above hero overlay).
   * Controlled by the Front/Back buttons in section edit mode.
   */
  photoZ?: number;
  /**
   * Brand graphic (meerkat) z-index. Default 4.
   */
  graphicZ?: number;
};

/**
 * ImageSlot — identifies which image in the data a picker / drag
 * operation is targeting. Used by the editor to route edits.
 */
export type ImageSlot =
  | { kind: "speaker-photo" }
  | { kind: "graphic" }
  | { kind: "hero-style2" }
  | { kind: "branding-asset" }
  | { kind: "sponsor"; group: "collaborators" | "sponsors"; index: number };

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
    zoom: clamp(p?.zoom ?? 1, 0.1, 10),
  };
}

/** Lightweight event entry for the dropdown. */
export type EventPickListItem = {
  id: string;
  slug: string;
  title: string;
  startsAt: string; // ISO
  venue?: string | null;
};
