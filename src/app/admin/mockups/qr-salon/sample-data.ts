import type { QrSalonData } from "./types";
import { DEFAULT_BRANDING_ASSET_URL } from "./types";

/**
 * Sample data for the QR Salon mockup editor.
 *
 * Defaults per user spec 2026-07-15:
 *   - QR code points to the AI Salon events page.
 *   - QR size 360px (about 30% of the 1200px canvas width).
 *   - Caption: "Scan to register" — bold, black, center-aligned.
 *   - Branding asset at the bottom-LEFT corner:
 *       imageUrl: AI Salon logo on Vercel Blob
 *       height:   48px
 *       pos:      X=2.7%, Y=94% (bottom-left with ~6% bottom inset)
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
    pos: { x: 2.7, y: 94 },
  },
};
