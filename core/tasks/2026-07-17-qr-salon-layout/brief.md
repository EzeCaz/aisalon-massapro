# Task Brief — QR Salon Layout Revision (caption above / QR center / logo below)

| Field | Value |
|---|---|
| Task ID | `2026-07-17-qr-salon-layout` |
| Date | 2026-07-17 |
| **Category** | **SMALL** |
| Owner | Z (main agent) — direct execution, no subagent review |
| User request (verbatim) | "Ok, the qr code should be on the center, the logo https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png below aligned to the middle, and the text above the qr code" |

---

## Category Justification — SMALL

- ✅ No DB impact.
- ✅ No structural impact — only edits `qr-salon/` files.
- ✅ No existing UI/UX change beyond the QR Salon feature itself.
- ✅ Purely default-layout + centering-logic changes.

All 9 agents auto-skipped per SMALL. Z self-reviews.

---

## Restated Goal

Reorder the QR Salon default layout from the prior "QR top-biased + caption below + brand mark bottom-left" to a vertically centered composition:
1. **Caption text** at the top (above the QR), centered horizontally.
2. **QR code** in the center (horizontally + vertically centered on the 1200×800 canvas).
3. **Brand mark** below the QR, horizontally centered (NOT bottom-left).

The brand mark's horizontal centering must be computed dynamically based on the image's natural aspect ratio (since the rendered width depends on the image's `naturalWidth / naturalHeight` × the user-set height).

## Acceptance Criteria

- [x] Caption default position: top of the composition, centered horizontally.
- [x] QR code default position: vertically centered on the canvas.
- [x] Brand mark default position: below the QR, horizontally centered (computed from the image's natural dimensions).
- [x] Brand mark centering is robust to different logo aspect ratios (preloads the image to get natural dimensions).
- [x] Existing `brandingAsset.pos` field still honored when explicitly set (opt-in override).
- [x] Form view's brand mark X/Y inputs show blank (= auto) instead of the old 2.7 / 94 defaults.
- [x] localStorage key bumped v2 → v3 so users see the new layout on next load.
- [x] TypeScript: no new errors in QR Salon files.

## Implementation

See `implementation.md`.

## Closure

See `CLOSED.md`.
