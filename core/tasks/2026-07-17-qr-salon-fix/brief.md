# Task Brief — QR Salon Mockup Fix (Edit Position + Brand Mark)

| Field | Value |
|---|---|
| Task ID | `2026-07-17-qr-salon-fix` |
| Date | 2026-07-17 |
| **Category** | **SMALL** |
| Owner | Z (main agent) — direct execution, no subagent review |
| User request (verbatim) | "fix the qr code: A-make sure i am able to move the qr code position with the Edit position feature as the other mockups. B- add a text below the qr code. C- add the small aisalon logo branded on the left bottom small (URL, h=48, X=2.7). D- And enable to edit the text and the small logo" |

---

## Category Justification — SMALL

Per `core/TASK_CATEGORIES.md`:

- ✅ **No DB impact** — no Prisma changes, no migrations.
- ✅ **No structural impact** — only edits files inside `src/app/admin/mockups/qr-salon/` (the existing QR Salon feature). No new routes, no auth/middleware changes.
- ✅ **No existing UI/UX change** — only the QR Salon mockup itself is touched; other mockups, other admin pages, and the public site are not affected.
- ✅ **Additive + corrective only** — wraps existing canvas elements in `SectionBox` (drag/resize handles) and ensures the brand mark + caption render at user-spec defaults. The QR Salon feature shipped yesterday; this is a same-week bug-fix pass.

All 9 agents auto-skipped per SMALL. Z self-reviews.

---

## Restated Goal

The QR Salon mockup shipped on 2026-07-17 (commit `04dad9f`) implemented its own ad-hoc drag system for the brand mark only. The QR code itself and the caption could only be repositioned by typing X/Y % values into the form — they were NOT draggable on the canvas, and they didn't get the 8-handle resize + alignment guides + Object Properties Panel that every other mockup (meet-the-speaker, speaker-intro, event-profile, agenda-profile) provides via `SectionBox`.

This task upgrades the QR Salon canvas to use the shared `SectionBox` system from `src/app/admin/mockups/shared/section-edit.tsx`, so that:
- The QR code, the caption, and the brand mark are each wrapped in `SectionBox`.
- An "Edit sections" toggle (pink) appears alongside the existing "Edit images" toggle (blue) — matching the other mockups.
- In Edit-sections mode, the user can drag any of the three elements, resize with 8 handles, and use the Object Properties Panel for precise position/size/z control.
- The brand mark keeps its existing "click to replace from brand library" behavior in Edit-images mode (unchanged).

The user's four sub-requirements (A/B/C/D) are already satisfiable in the current build via form fields — this fix upgrades the *interaction* to match the other mockups.

## Acceptance Criteria

- [ ] "Edit sections" (pink) button appears next to "Edit images" (blue) on the QR Salon editor.
- [ ] In Edit-sections mode, clicking the QR code selects it and shows 8 resize handles + drag-to-move.
- [ ] In Edit-sections mode, clicking the caption selects it and shows 8 resize handles + drag-to-move.
- [ ] In Edit-sections mode, clicking the brand mark selects it and shows 8 resize handles + drag-to-move.
- [ ] The Object Properties Panel appears when a section is selected, with position, scale, box size, z-index, and a deselect × button.
- [ ] Layout persists in `data.sectionLayout[id]` and round-trips through the JSON view.
- [ ] Backward-compat: existing localStorage data (without `sectionLayout`) loads cleanly and uses default positions.
- [ ] PNG export still works (no dashed outlines, no handles in the export).
- [ ] Default brand mark: URL = user-supplied, height = 48px, X = 2.7%, Y = 94% (unchanged from prior defaults).
- [ ] TypeScript: `npx tsc --noEmit` introduces no new errors in QR Salon files.

## Implementation

See `implementation.md`.

## Closure

See `CLOSED.md`.
