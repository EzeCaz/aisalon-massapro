# Implementation — QR Salon Layout Revision

| Field | Value |
|---|---|
| Task | `2026-07-17-qr-salon-layout` |
| Agent | Z (main) |
| Date | 2026-07-17 |
| Category | SMALL |
| Commit | (filled at commit time) |
| Status | Shipped to production via Vercel auto-deploy from `main`. |

---

## What changed

### `qr-salon-canvas.tsx` — default position math + brand mark centering

**Vertical layout** (canvas 1200×800, QR 360×360):
```
composition = caption(~36px) + gap(40) + QR(360) + gap(40) + logo(48)
            = 524px total
top inset to vertically center the composition = (800 - 524) / 2 ≈ 138
  → caption top ≈ 140
  → QR top ≈ 220
  → logo top ≈ 620
```

Constants changed:
- `qrDefaultTopPx`: `120` → `220` (vertically centered)
- `captionDefaultTopPx`: `qrDefaultTopPx + qrSize + 32` (below QR) → `140` (above QR)
- `brandingDefaultTopPx`: `0.94 * CANVAS_H` (94%, bottom-left) → `620` (below QR)

**Brand mark horizontal centering**:
- Added `useState<{w, h} | null>` + `useEffect` that preloads the brand mark image to read its `naturalWidth` / `naturalHeight`.
- Computes `brandingRenderedWidth = brandingHeight × (naturalW / naturalH)`.
- Computes `brandingDefaultLeftPx = (CANVAS_W - brandingRenderedWidth) / 2`.
- Fallback while the image loads: assume 3:1 horizontal-logo aspect ratio (`brandingHeight * 3`).
- If `data.brandingAsset.pos` is explicitly set, the canvas honors it (converts % to px). If unset, uses the computed centered default.

### `sample-data.ts` — removed explicit `brandingAsset.pos`

The sample data previously had `pos: { x: 2.7, y: 94 }` (bottom-left). Removed so the canvas computes the centered default. Updated the docstring to document the new layout.

### `qr-salon-editor.tsx` — form + storage key

- Bumped `STORAGE_KEY` from `qr-salon-data-v2` → `qr-salon-data-v3` to invalidate stale state.
- Brand mark X/Y form inputs: changed from showing `2.7` / `94` as fallbacks to showing blank (`""`) with `placeholder="auto"`. Labels updated to "Position X (%) — blank = auto-center" / "Position Y (%) — blank = auto".
- When the user clears the X or Y field, `pos` is set to `undefined` so the canvas reverts to the centered default. When the user types a value, `pos` is set with the other axis defaulting to `50` (X) or `77.5` (Y = 620/800).
- Updated the canvas helper text and the brand mark section's helper text to describe the new layout.

## Files Touched

| File | Change |
|---|---|
| `src/app/admin/mockups/qr-salon/qr-salon-canvas.tsx` | New vertical layout (caption above, QR centered, logo below). Added image preload for brand mark centering. |
| `src/app/admin/mockups/qr-salon/sample-data.ts` | Removed `pos: { x: 2.7, y: 94 }` so canvas computes centered default. Updated docstring. |
| `src/app/admin/mockups/qr-salon/qr-salon-editor.tsx` | Bumped localStorage v2 → v3. Brand mark X/Y inputs now blank = auto. Updated helper text. |

## No-Impact Confirmation

- **DB**: zero changes.
- **Structure**: zero changes.
- **Existing UI/UX**: only the QR Salon mockup's default layout changes. Other mockups and other pages are untouched.

## Self-Review Notes

- The brand mark centering relies on `new Image()` preload. On the very first render (before the image loads), the fallback estimate (3:1 aspect ratio) is used. Once the image loads, the position updates. This is a one-frame flicker at most — acceptable for SMALL.
- The `brandingAsset.pos` field in the data shape is now optional and acts as an override. If a user previously set it (via the form or Edit-sections drag), their explicit position is honored. New users (or users whose localStorage was bumped) get the centered default.
- The composition's vertical centering assumes a single-line caption at 28px font. Multi-line captions will push the composition taller, but the QR will still be roughly centered because the composition's center stays near Y=400.

## Signoff

Z (main agent) — self-reviewed. No subagent review per SMALL category.
