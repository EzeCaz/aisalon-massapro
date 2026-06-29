# AI Salon Mockup Editor — Worklog

---
Task ID: i0-research
Agent: general-purpose
Task: Research image resize implementation across 4 mockup editors

Work Log:
- Read worklog.md (did not exist — created fresh).
- Read meet-the-speaker-canvas.tsx (1038 lines, REFERENCE/correct) and meet-the-speaker-editor.tsx + types.ts.
- Read speaker-intro-canvas.tsx (1365 lines, BROKEN) + speaker-intro-editor.tsx + types.ts.
- Read agenda-profile-canvas.tsx (1115 lines, BROKEN) + agenda-profile-editor.tsx + types.ts.
- Read event-profile-canvas.tsx (927 lines, same pattern — also affected) + event-profile-editor.tsx.
- Read shared/section-edit.tsx (1430 lines) for SectionBox / HeroOverlayControl / clampScale / useNonPassiveWheel.
- Read shared/image-picker-modal.tsx (406 lines) — not relevant to resize bug, only image picking.
- Cross-compared the `EditableImage` component, `handleResizeMouseDown`, `handleWheel`, `applySizeChange`, and the hero-container sizing math across all four canvases.
- Identified the root cause: hero image in speaker-intro/agenda-profile/event-profile uses SEPARATE `imageScale` (X) and `imageScaleY` (Y) fields, but the corner-handle resize callback only updates `imageScale` (X). The Y dimension is never updated by the corner handle, so the hero only shrinks horizontally and the `object-fit: cover` image is CROPPED rather than visibly SHRUNK. The user perceives this as "doesn't shrink below original size".
- Verified meet-the-speaker is correct because its speaker-photo + meerkat-graphic use a SINGLE uniform multiplier (`photoSize` / `graphic.imageScale`) for BOTH width and height, so the corner handle scales them proportionally.

Stage Summary:

## Root Cause

In `speaker-intro`, `agenda-profile`, and `event-profile`, the hero image is rendered inside a container whose width and height are driven by TWO SEPARATE fields:

```ts
// speaker-intro-canvas.tsx lines 190-201
const scale  = Math.max(0.01, data.heroOverlay.imageScale  ?? 1); // X only
const heroWidth  = 58 * scale;
const heroLeft   = Math.max(0, 100 - heroWidth);
const scaleY = Math.max(0.01, data.heroOverlay.imageScaleY ?? 1); // Y only
const heroHeight = 100 * scaleY;
```

```ts
// agenda-profile-canvas.tsx line 141
<div style={{
  width:  `${100 * Math.max(0.01, data.heroOverlay.imageScale  ?? 1)}%`,
  height: `${450 * Math.max(0.01, data.heroOverlay.imageScaleY ?? 1)}px`,
  ...
}}>
```

```ts
// event-profile-canvas.tsx lines 164-173
const scaleX = Math.max(0.01, data.heroOverlay.imageScale  ?? 1);
const scaleY = Math.max(0.01, data.heroOverlay.imageScaleY ?? 1);
<div style={{ width: `${100*scaleX}%`, height: `${100*scaleY}%` }}>
```

The corner handle on the hero's `EditableImage` calls `onSizeChange({kind:"hero"}, newMultiplier)`, which routes to the editor's `applySizeChange`. In all three editors, that function ONLY sets `imageScale` (X) and leaves `imageScaleY` (Y) untouched:

```ts
// speaker-intro-editor.tsx lines 269-270  (BROKEN)
if (slot.kind === "hero") {
  next.heroOverlay.imageScale = newMultiplier;   // only X
}

// agenda-profile-editor.tsx lines 201-202  (BROKEN)
if (slot.kind === "hero") {
  next.heroOverlay.imageScale = newMultiplier;   // only X
}

// event-profile-editor.tsx lines 201-202  (BROKEN — same pattern)
if (slot.kind === "hero") {
  next.heroOverlay.imageScale = newMultiplier;   // only X
}
```

Result: dragging the SE corner inward shrinks `heroWidth` (X) but `heroHeight` (Y) stays at 100%/450px. The hero container becomes NARROWER but not SHORTER. Because the inner `<Image>` uses `objectFit: "cover"`, the image is re-cropped to fill the narrower container — it is NOT visibly shrunk. The user sees the hero "not shrinking below original size".

## Why meet-the-speaker is correct

meet-the-speaker's resizable images (speaker photo + meerkat graphic) use a SINGLE uniform multiplier for both width AND height:

```ts
// meet-the-speaker-canvas.tsx lines 201-203 (speaker photo)
const sizeMult  = Math.max(0.01, data.speaker.photoSize ?? 1);
const widthPct  = 45 * sizeMult;   // <-- same sizeMult
const heightPct = 60 * sizeMult;   // <-- same sizeMult
```

```ts
// meet-the-speaker-canvas.tsx lines 238-240 (meerkat graphic)
const sizeMult  = Math.max(0.01, data.graphic.imageScale ?? 1);
const widthPct  = 18 * sizeMult;   // <-- same sizeMult
const heightPct = 30 * sizeMult;   // <-- same sizeMult
```

And the editor's `applySizeChange` sets that single field:

```ts
// meet-the-speaker-editor.tsx lines 233-236  (CORRECT)
if (slot.kind === "speaker-photo") {
  next.speaker.photoSize = newMultiplier;   // single field drives BOTH W & H
} else if (slot.kind === "graphic") {
  next.graphic.imageScale = newMultiplier;  // single field drives BOTH W & H
}
```

So dragging the corner scales the photo/graphic PROPORTIONALLY (both dimensions). The container shrinks on both axes, and the `object-fit: cover` image fills the smaller box → the user sees the image visibly shrink.

Note: meet-the-speaker's `heroOverlay` (gradient triangles) is a pure SVG with `pointer-events-none` and NO `EditableImage` — it has no corner handles and is only resizable via the X/Y sliders (`onHeroScaleXChange` / `onHeroScaleYChange`). That is why the "hero doesn't shrink" bug doesn't manifest there.

## The `EditableImage` component itself is identical across all 4 canvases

The `handleResizeMouseDown` (corner handles) and `handleWheel` (wheel zoom) implementations are byte-for-byte equivalent (modulo the `ResizeHandle` sub-component vs inline divs) across meet-the-speaker / speaker-intro / agenda-profile / event-profile:

```ts
// handleResizeMouseDown (all 4 canvases)
const startSize = sizeMultiplier ?? 1;
const sensitivity = 100 * previewScale;
const delta = signedDiag / sensitivity;
const next = Math.max(0.01, r.startSize + delta);   // min 0.01 — allows shrink below 1
onSizeChange(slot, next);
```

```ts
// handleWheel (all 4 canvases)
const step = e.deltaY < 0 ? 0.1 : -0.1;
const nextZoom = Math.max(0.01, zoom + step);        // step 0.1, min 0.01
onPlacementChange(slot, { focusX, focusY, zoom: nextZoom });
```

So the corner-handle and wheel logic is NOT the bug. The bug is purely in how the editor's `applySizeChange` maps the single `newMultiplier` onto the hero's TWO fields (`imageScale` + `imageScaleY`).

## Wheel zoom note (secondary observation)

`resolvePlacement` in ALL FOUR `types.ts` files clamps `zoom` to `[1, 4]`:

```ts
zoom: clamp(p?.zoom ?? 1, 1, 4),
```

So even though `handleWheel` writes `nextZoom = Math.max(0.01, zoom + step)` (allowing 0.01), the next render's `resolvePlacement` re-clamps it back to 1. The wheel therefore CANNOT shrink the image below its `object-fit: cover` baseline in ANY of the four mockups. The user's "0.1 min" description most likely refers to the 0.1 step size (each wheel notch = 0.1 zoom delta), not a 0.1 minimum. If the user wants the wheel to zoom OUT below 1×, the clamp in `resolvePlacement` would also need to change (e.g. `clamp(p?.zoom ?? 1, 0.1, 4)`) — but that is a separate change and would apply to all four mockups identically.

## Comparison Table

| Aspect | meet-the-speaker (CORRECT) | speaker-intro / agenda-profile / event-profile (BROKEN) |
|---|---|---|
| Hero overlay element | Pure SVG, `pointer-events-none`, NO EditableImage, NO corner handles | `EditableImage` with 4 corner handles + wheel zoom |
| Hero container width | `55 * imageScale` (X only, slider-controlled) | `58 * imageScale` (X) or `100 * imageScale` (X) |
| Hero container height | `85 * imageScaleY` (Y only, slider-controlled) | `100 * imageScaleY` (Y) or `450 * imageScaleY` (Y) |
| Hero corner handle | N/A (no handles on hero) | Calls `onSizeChange({kind:"hero"}, n)` → editor sets ONLY `imageScale` (X); `imageScaleY` (Y) UNCHANGED |
| Resizable images that DO work | speaker photo (`photoSize` single field → W&H), meerkat graphic (`graphic.imageScale` single field → W&H) | speaker headshots (`photoSize` single field → W&H) work fine; sponsor logos (`logoSize` single field) work fine; ONLY the hero is broken |
| Visible result of corner-drag inward | Photo/graphic shrinks PROPORTIONALLY (both W & H shrink) | Hero shrinks only HORIZONTALLY; height stays full; `object-fit:cover` re-crops → user sees "not shrinking" |

## Types differences

All four `types.ts` define `heroOverlay.imageScale` (X) and `heroOverlay.imageScaleY` (Y) as separate optional fields. The difference is whether the hero is an `EditableImage` (speaker-intro / agenda-profile / event-profile → YES, has corner handles) or a pure SVG (meet-the-speaker → NO corner handles).

`ImagePlacement` is identical across all four: `{ focusX?, focusY?, zoom? }` with `resolvePlacement` clamping `zoom` to `[1, 4]`.

`ImageSlot` differs only in the `kind` union:
- meet-the-speaker: `"speaker-photo" | "graphic" | {kind:"sponsor",...}`
- speaker-intro / agenda-profile / event-profile: `"hero" | "speaker" | {kind:"sponsor",...}`

## Code blocks that need to change (the fix)

### 1. `src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx` — `applySizeChange` (lines 267-280)

Current:
```ts
if (slot.kind === "hero") {
  next.heroOverlay.imageScale = newMultiplier;
}
```

Fix:
```ts
if (slot.kind === "hero") {
  next.heroOverlay.imageScale  = newMultiplier;
  next.heroOverlay.imageScaleY = newMultiplier;   // <-- ADD: proportional Y
}
```

### 2. `src/app/admin/mockups/agenda-profile/agenda-profile-editor.tsx` — `applySizeChange` (lines 199-212)

Current:
```ts
if (slot.kind === "hero") {
  next.heroOverlay.imageScale = newMultiplier;
}
```

Fix:
```ts
if (slot.kind === "hero") {
  next.heroOverlay.imageScale  = newMultiplier;
  next.heroOverlay.imageScaleY = newMultiplier;   // <-- ADD: proportional Y
}
```

### 3. `src/app/admin/mockups/event-profile/event-profile-editor.tsx` — `applySizeChange` (lines 199-212)

Current:
```ts
if (slot.kind === "hero") {
  next.heroOverlay.imageScale = newMultiplier;
}
```

Fix:
```ts
if (slot.kind === "hero") {
  next.heroOverlay.imageScale  = newMultiplier;
  next.heroOverlay.imageScaleY = newMultiplier;   // <-- ADD: proportional Y
}
```

### 4. (Optional) If the user also wants the WHEEL to zoom OUT below 1×

Change `resolvePlacement` in all four `types.ts` files:
```ts
// Current (all 4 files)
zoom: clamp(p?.zoom ?? 1, 1, 4),
// Fix
zoom: clamp(p?.zoom ?? 1, 0.1, 4),
```
This is a SEPARATE concern from the corner-handle bug. Only do this if the user confirms they want wheel-zoom-out below 1×.

## What does NOT need to change

- The `EditableImage` component in all four canvases — the corner-handle and wheel logic is already correct (`Math.max(0.01, ...)` allows shrink below 1).
- The `SectionBox` component in `shared/section-edit.tsx` — its `handleResizeMouseDown` uses `clampScale` (min 0.001, no upper limit) and is already correct.
- The `HeroOverlayControl` slider in `shared/section-edit.tsx` — it already supports X/Y independent scaling with min 0.05, and should remain independent for fine-grained slider control.
- The `image-picker-modal.tsx` — not related to resize.
- The `meet-the-speaker-canvas.tsx` / `meet-the-speaker-editor.tsx` — already correct, no changes needed.

## Next actions for the implementing agent

1. Apply the 3-line fix (add `next.heroOverlay.imageScaleY = newMultiplier;`) to `applySizeChange` in speaker-intro-editor.tsx, agenda-profile-editor.tsx, and event-profile-editor.tsx.
2. Verify the hero now shrinks PROPORTIONALLY when dragging any of the 4 corner handles inward.
3. Verify the X/Y sliders in `HeroOverlayControl` still work INDEPENDENTLY (they call `handleHeroScaleXChange` / `handleHeroScaleYChange`, which are NOT changed by this fix — they remain independent).
4. Optionally, if the user reports the wheel can't zoom out below 1×, change `resolvePlacement`'s zoom clamp from `[1, 4]` to `[0.1, 4]` in all four `types.ts` files.
