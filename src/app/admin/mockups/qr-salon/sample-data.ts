import type { QrSalonData } from "./types";
import { DEFAULT_BRANDING_ASSET_URL } from "./types";

/**
 * Sample data for the QR Salon mockup editor.
 *
 * Default layout per user spec 2026-07-17 (third revision):
 *   - Caption text ABOVE the QR code, centered horizontally.
 *   - QR code CENTERED on the canvas (horizontally + vertically).
 *   - Brand mark BELOW the QR code, centered horizontally.
 *
 * The brand mark's `pos` is intentionally LEFT UNSET so the canvas
 * computes the centered X dynamically (it preloads the image to get
 * its natural aspect ratio, then centers based on the rendered width).
 * If you set `pos` explicitly, the canvas will honor it instead.
 *
 * QR points to the AI Salon events page. Caption: "Scan to register" —
 * bold, black, center-aligned. Brand mark: AI Salon logo on Vercel Blob,
 * height 48px.
 *
 * Editable in the live JSON editor on /admin/mockups/qr-salon.
 */
export const SAMPLE_DATA: QrSalonData = {
  qrCodeUrl: "https://aisalon.massapro.com/events",
  qrSize: 360,
  qrMargin: 2,
  qrDarkColor: "#000000",
  qrLightColor: "#FFFFFF",
  caption: {
    text: "Scan to register",
    style: {
      fontSize: 28,
      color: "#000000",
      align: "center",
      fontWeight: "700",
    },
  },
  captionWidthPct: 80,
  background: "#FFFFFF",
  brandingAsset: {
    imageUrl: DEFAULT_BRANDING_ASSET_URL,
    height: 48,
    // pos intentionally unset — canvas computes centered default.
  },
};
