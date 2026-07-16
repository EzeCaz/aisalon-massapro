# Task Brief — QR Salon Mockup

| Field | Value |
|---|---|
| Task ID | `2026-07-17-qr-salon-mockup` |
| Date | 2026-07-17 |
| **Category** | **SMALL** |
| Owner | Z (main agent) — direct execution, no subagent review |
| User request (verbatim) | "On the mockups, can you generate a 'QR Salon' mockup for a QR code only mockup image, with the url to insert, and a text to add below + the small aisalon logo branded on the left bottom small https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png Height (px) 48 Position X (%) 2.7 And enable to edit the text and the small logo" |

---

## Category Justification — SMALL

Per `core/TASK_CATEGORIES.md`:

- ✅ **No DB impact** — no Prisma schema changes, no migrations, no new tables/columns. The mockup is pure client-side rendering.
- ✅ **No structural impact** — adds a new route (`/admin/mockups/qr-salon`) but does not alter existing routes, auth, or middleware.
- ✅ **No existing UI/UX change** — adds a new mockup template alongside the existing 4; doesn't redesign any existing page.
- ✅ **Additive only** — new files only; no existing files have their behavior changed (the one edit to `mockups-client.tsx` is purely appending a new card to the templates array).

All 9 agents are auto-skipped per the SMALL category definition. Z self-reviews.

---

## Restated Goal

Add a fifth mockup template ("QR Salon") to `/admin/mockups` that renders a QR-code-only promotional image: a single QR code centered on a 1200×800 canvas, a caption printed below it, and the small AI Salon brand mark anchored at the bottom-left corner (height 48px, X=2.7%, Y=94% by default per user spec). Every element must be editable — the QR URL, the caption text + font + color + alignment + position, the brand mark image URL + height + position. The brand mark must be replaceable via the brand library picker, draggable on the canvas, and scroll-resizable. Output is a print-quality PNG.

## Acceptance Criteria

- [x] New page at `/admin/mockups/qr-salon` with the same auth gate as the other mockups (ADMIN + SUPER_ADMIN or CO_HOST).
- [x] Canvas (1200×800) renders: QR code (centered, biased upward), caption below QR, brand mark at bottom-left.
- [x] Brand mark defaults to the user-specified URL, height 48px, X=2.7%, Y=94%.
- [x] Form view: QR URL, QR size, QR margin, QR colors, QR position (X/Y %), caption text + style + position, brand mark image URL + height + position, canvas background.
- [x] JSON view for power users.
- [x] Edit images mode: click brand mark to replace from brand library, drag to reposition, scroll to resize.
- [x] Download PNG (2× pixelRatio, edit-outline stripped from export).
- [x] State persists in localStorage across refreshes.
- [x] Card added to `/admin/mockups` template grid.

## Implementation

See `implementation.md`.

## Closure

See `CLOSED.md`.
