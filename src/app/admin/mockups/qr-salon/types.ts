/**
 * Type definitions for the AI Salon "QR Salon" mockup.
 *
 * A minimal QR-code-only mockup: a single QR code centered on the canvas,
 * a caption printed below it, and the small AI Salon brand mark in the
 * bottom-left corner. Used for flyers / social posts where the only call
 * to action is "scan to register".
 *
 * Every field maps 1:1 to something on the canvas — no field is
 * "for future use"; if it's here, the canvas renders it.
 */

/**
 * TextStyle — per-text-section font size + color + alignment overrides.
 * All fields optional; the canvas falls back to per-section defaults
 * when a field is unset.
 */
export type TextStyle = {
  /** Font size in px. When undefined, the canvas uses the section default. */
  fontSize?: number;
  /** Text color (any CSS color string). When undefined, the section default. */
  color?: string;
  /** Horizontal alignment: "left" | "center" | "right". When undefined, the
   *  section's default alignment is used. */
  align?: "left" | "center" | "right";
  /** Font weight as a CSS string. Default "700". */
  fontWeight?: string;
};

export type QrSalonData = {
  /**
   * The URL the QR code encodes. Renders as a black-on-white QR code in
   * the center of the canvas.
   */
  qrCodeUrl: string;
  /**
   * Size of the QR code in canvas px. Default 360 (about 30% of the
   * 1200px canvas width).
   */
  qrSize?: number;
  /**
   * Free-form position of the QR code container, as % of canvas
   * (0–100 for x and y). When set, the QR is anchored at this point
   * (top-left corner) instead of its default centered position.
   */
  qrPos?: { x: number; y: number };
  /**
   * Margin around the QR code itself (whitespace "quiet zone"). The QR
   * library calls this `margin`; 0 = no margin. Default 2.
   */
  qrMargin?: number;
  /**
   * Foreground ("dark") color of the QR modules. Default "#000000".
   */
  qrDarkColor?: string;
  /**
   * Background ("light") color of the QR modules. Default "#FFFFFF".
   */
  qrLightColor?: string;

  /**
   * Caption text rendered below the QR code. Multi-line supported via
   * newlines. Falls back to the qrCodeUrl when empty.
   */
  caption: {
    text: string;
    style?: TextStyle;
  };
  /**
   * Free-form position of the caption, as % of canvas (0–100 for x and y).
   * When set, the caption is anchored at this point (top-left corner)
   * instead of its default position directly below the QR code.
   */
  captionPos?: { x: number; y: number };
  /**
   * Width of the caption text box, as % of canvas width. Default 80
   * (caption wraps inside a 80%-wide box centered horizontally).
   */
  captionWidthPct?: number;

  /**
   * Background fill of the canvas. Default white ("#FFFFFF").
   */
  background?: string;

  /**
   * Branding asset (small AI Salon logo) anchored at the bottom-left
   * corner by default. Replaceable via the editor form or by clicking
   * the image in edit mode.
   *
   * Per user spec 2026-07-15: defaults to
   *   https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png
   * with height 48px and X=2.7%.
   */
  brandingAsset: {
    imageUrl?: string;
    /** Height in px. Default 48. */
    height?: number;
    /** Free-form position as % of canvas. Default = { x: 2.7, y: 94 }. */
    pos?: { x: number; y: number };
  };
};

/** Default branding asset URL — the AI Salon logo on Vercel Blob. */
export const DEFAULT_BRANDING_ASSET_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png";

/** Helper: clamp a number to [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
