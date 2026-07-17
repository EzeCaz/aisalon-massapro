# CLOSED — QR Salon Layout Revision

| Field | Value |
|---|---|
| Task ID | `2026-07-17-qr-salon-layout` |
| Category | SMALL |
| Closed | 2026-07-17 |
| Closed by | Z (main agent) |
| Agent review | None (SMALL — auto-skipped per `core/TASK_CATEGORIES.md`) |

---

## Closure Summary

Reordered the QR Salon default layout from "QR top-biased + caption below + brand mark bottom-left" to a vertically centered composition: **caption above**, **QR centered**, **brand mark below** — all horizontally centered. The brand mark's horizontal centering is computed dynamically from the image's natural aspect ratio (via `new Image()` preload), so it works correctly regardless of which logo is used.

## Files Touched

- `src/app/admin/mockups/qr-salon/qr-salon-canvas.tsx` — new vertical layout + brand mark centering via image preload
- `src/app/admin/mockups/qr-salon/sample-data.ts` — removed explicit `pos` so canvas computes centered default
- `src/app/admin/mockups/qr-salon/qr-salon-editor.tsx` — bumped localStorage v2 → v3, form X/Y inputs now blank = auto

## Signoff

Z self-reviewed per the SMALL tier definition. No subagent review required.
