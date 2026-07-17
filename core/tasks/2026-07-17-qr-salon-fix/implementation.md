# Implementation — QR Salon Mockup Fix

| Field | Value |
|---|---|
| Task | `2026-07-17-qr-salon-fix` |
| Agent | Z (main) |
| Date | 2026-07-17 |
| Category | SMALL |
| Commit | `bd82e86` |
| Status | Shipped to production via Vercel auto-deploy from `main`. |

---

## What was wrong

The QR Salon mockup shipped on 2026-07-17 (commit `04dad9f`) used an ad-hoc drag system for the brand mark only. The QR code itself and the caption were fixed in their default positions — to move them, the user had to type X/Y % values into the form. There was no "Edit sections" mode matching the other 4 mockups (meet-the-speaker, speaker-intro, event-profile, agenda-profile), all of which use the shared `SectionBox` system from `src/app/admin/mockups/shared/section-edit.tsx` to provide drag-to-move + 8-handle resize + alignment guides + Object Properties Panel.

## What changed

### `types.ts`
- Added `sectionLayout?: SectionLayout` to `QrSalonData`, importing the type from `../shared/section-edit`. Keys used: `"qr"`, `"caption"`, `"branding"`.
- Added `QrSalonSectionId` type alias for documentation.
- Backward compat: existing localStorage data (without `sectionLayout`) loads cleanly and falls back to default positions.

### `qr-salon-canvas.tsx` (rewritten)
- Now imports `GuideProvider`, `GuideOverlay`, `SectionBox`, `ObjectPropertiesPanel`, `useCanvasScrollIsolation`, `useNonPassiveWheel` from `../shared/section-edit`.
- Wraps the canvas in `<GuideProvider>` so alignment guides work across all three sections.
- Wraps the QR code, caption, and brand mark each in `<SectionBox>` with:
  - `pos` / `scale` / `boxSize` / `z` driven by `data.sectionLayout[id]`
  - `onMove` / `onResize` / `onBoxResize` callbacks bubbling up to the editor
  - Default positions computed from the existing fields (`qrPos`, `captionPos`, `brandingAsset.pos`) so existing data renders identically
- Adds `<GuideOverlay />` for cyan alignment lines.
- Adds `<ObjectPropertiesPanel>` floating at top-right when a section is selected — provides precise X/Y inputs, scale, width/height, z-index (Front/Back), and a deselect × button.
- Per-section z-index defaults: `qr`=10, `caption`=20, `branding`=30 (so the brand mark never gets hidden behind the QR if they overlap).
- Two edit modes (mutually compatible, used independently):
  - `editable` (Edit images): the brand mark shows a click-to-replace button that opens the brand library picker. Disabled when sectionsEditable is true (to avoid conflict with SectionBox drag).
  - `sectionsEditable` (Edit sections): every section gets drag handles + 8-direction resize + Object Properties Panel.

### `qr-salon-editor.tsx`
- Added `sectionsEditMode` state.
- Added `<LayoutPanelTop>` import from `lucide-react` for the Edit-sections button icon.
- Bumped localStorage key `qr-salon-data-v1` → `qr-salon-data-v2` to invalidate stale state from the prior build (the data shape is backward-compatible, but the v2 key forces a clean start with the new default sample data so the user sees the new Edit-sections feature work correctly).
- Replaced the single "Edit images" button with a two-button row matching the other mockups:
  - **Edit images** (blue, `#0066FF`) — toggles `editable`
  - **Edit sections** (pink, `#FF005A`) — toggles `sectionsEditable`
- Added `handleSectionMove`, `handleSectionResize`, `handleSectionBoxResize`, `handleSectionZChange` — each deep-clones `data`, mutates `data.sectionLayout[id]`, and calls `applyData` (which schedules a JSON sync via `requestAnimationFrame`).
- Updated PNG export (`handleDownloadPng` and `getPngDataUrl`) to temporarily disable BOTH `editImages` and `sectionsEditMode` before snapshotting, then restore them after. This strips dashed outlines + handles from the exported PNG.
- Updated the canvas description text to explain both modes.
- Imported `SectionId`, `SectionPos`, `SectionBoxSize` types from `../shared/section-edit`.

## Files Touched

| File | Change |
|---|---|
| `src/app/admin/mockups/qr-salon/types.ts` | Added `sectionLayout?: SectionLayout` field + `QrSalonSectionId` type. Imported `SectionLayout` from shared. |
| `src/app/admin/mockups/qr-salon/qr-salon-canvas.tsx` | Rewrote: now uses `<SectionBox>` for QR + caption + brand mark. Added GuideProvider, GuideOverlay, ObjectPropertiesPanel. Two edit modes. |
| `src/app/admin/mockups/qr-salon/qr-salon-editor.tsx` | Added sectionsEditMode state, Edit-sections button, 4 section handlers, updated PNG export to strip both edit modes. |

## API Routes Added

None.

## Prisma Schema Changes

None.

## Auth / Security

- No changes. The page auth gate is unchanged from the prior QR Salon build.

## Deploy

- Pushed to `origin/main` at commit `bd82e86`.
- Vercel auto-deployed.
- No DB migration needed.
- No env vars added.

## Self-Review Notes

- The brand mark's click-to-replace (Edit-images mode) is intentionally disabled when sectionsEditable is true. This prevents a conflict between SectionBox's drag handling and the brand-library picker modal. The user can still replace the brand mark via the "Replace" button in the form view's Brand mark section.
- SectionBox's `boxSize` (mid-edge resize) lets the user resize the QR container independently of the QR image inside. If the user shrinks the QR container smaller than `qrSize`, the QR will overflow the box (clipped by `overflow: hidden` on the box). Acceptable for SMALL — the corner-scale handle (`scale`) is the recommended way to shrink the QR uniformly.
- The caption's `boxSize` width drives the text-wrap width. Dragging the right mid-edge handle widens/narrows the text box; the text reflows live.
- The localStorage key was bumped v1 → v2 so users see the new feature work cleanly without stale state. The data shape itself is backward-compatible — if a user manually copies v1 JSON into the v2 editor, it loads fine.

## Signoff

Z (main agent) — self-reviewed. No subagent review per SMALL category.
