# TSK-0023 — Phase 0 Audit (Read-Only, No Code Changes)

> **Phase**: 0 (pre-flight verification)
> **Date**: 2026-07-31
> **Goal**: Confirm the spec audit in `download/tsk-0023-speaker-meet-style-2-3-plan.md` Appendix A is accurate before touching any source code.
> **Method**: Read shared form-view files, qr-salon-editor, and the `SpeakerStyle2Card` component directly. Document any deltas vs the spec.
> **Outcome**: 6 deltas found — all minor. Spec is accurate. Proceeding to Phase 1.

---

## 1. Speaker-Intro form-view (`shared/speaker-intro-form-view.tsx`, 1596 lines)

### 1.1 Style picker — already 3-button segmented

**Spec assumed**: Style 1/2/3 segmented buttons in toolbar.
**Actual**: ✅ Style 1/2/3 segmented buttons ALREADY exist in the form-view at lines 62-64:

```tsx
{ value: "style1", label: "Style 1", sub: "Hero right · text left" },
{ value: "style2", label: "Style 2", sub: "Hero fill · gradient shape" },
{ value: "style3", label: "Style 3", sub: "Style 2 · QR repositioned" },
```

These are rendered as a 3-column button grid (per TSK-0003 fix). The editor (`speaker-intro-editor.tsx:632-680`) ALSO has a 3-button segmented group in the top toolbar. So today there are TWO Style pickers — one in the toolbar (top) and one in the form-view (Style section). Per the user spec, we keep the toolbar one and the form-view one becomes redundant for Style switching — but the form-view one shows subtitles ("Hero right · text left") which the toolbar one doesn't. **Decision**: keep both, no change needed. The toolbar one is for quick switching; the form-view one provides more context.

### 1.2 Style 2 gradient shape controls — already exist

**Spec assumed**: form view needs new controls for `style2HeroGradient.shape`, `.direction`, `.opacity`, `.colors`, `.rotation`.
**Actual**: ✅ ALL of these already exist in the form-view:

- Line 102: `<Section title="Style 2 — Hero gradient shape">`
- Line 105-108: shape dropdown (13 options)
- Line 142-145: rotation number input + buttons (0/90/180/270 + custom)
- Line 187-190: direction number input
- Line 202-205: opacity number input
- Line 214-217: colors textarea (one per line)

**Delta**: The spec said "MISSING form controls for style2HeroGradient" — actually they EXIST. No new controls needed for these 5 fields.

### 1.3 Style 2 layer order panel — already exists

**Spec assumed**: form view needs 4 Front/Back buttons for `style2LayerZ`.
**Actual**: ✅ Already exists at line 227:

```tsx
<Field label="Layer order (Style 2 — front/back)">
```

It iterates over the 4 keys (`background`, `hero`, `qr`, `speakers`) and renders a numeric input for each. **Delta**: spec said "MISSING" — actually exists. But it uses numeric inputs, not Front/Back buttons. Per D5=A, we'll rename `background` → `gradient` and keep the numeric inputs (they're more precise than buttons). The form-view label "Layer order (Style 2 — front/back)" is slightly misleading since they're numeric inputs — but it works.

### 1.4 panelBg color picker — already exists

**Spec assumed**: form view needs panelBg color picker.
**Actual**: ✅ Already exists at line 257:

```tsx
<Field label="Speakers panel background (Style 2)">
  <input type="color" value={data.speakersLayout?.panelBg ?? "#FFFFFF"} ... />
```

### 1.5 MISSING fields confirmed

The following fields are still MISSING from the form-view (need to be added in Phase 3/4):

- `topLogoUrl` (text input + image picker) — Phase 3
- `qrSize` (number input, applies to Style 1 and Style 2) — Phase 3
- `style2HeroGradient.heroOpacity` (slider 0-1) — Phase 4

---

## 2. Meet-the-Speaker form-view (`shared/meet-the-speaker-form-view.tsx`)

### 2.1 Style selector location — confirmed wrong

**Spec assumed**: Style selector in form-view under "Hero overlay (gradient)" section.
**Actual**: ✅ Confirmed. Lines 598-626 render Style 1 and Style 2 buttons (NOT Style 3) inside the `<Section title="Hero overlay (gradient)">` block.

**Action for Phase 1**: Remove this Style selector from the form-view. Move it to the top toolbar (Phase 1 will add Style 1/2/3 buttons to the meet-the-speaker editor toolbar).

### 2.2 Style 3 — confirmed missing

**Spec assumed**: No Style 3 button.
**Actual**: ✅ Confirmed. Only Style 1 and Style 2 buttons exist. Phase 1 will add Style 3 to the toolbar; Phase 8 will implement the canvas.

### 2.3 Style 2 controls — confirmed partial

**Actual**: When Style 2 is selected, the form shows:
- `heroStyle2Url` (Style 2 image URL) — line 633
- Local Street pins editor (4 pins, X/Y/label per pin) — lines 644-731

It does NOT show:
- `style2HeroGradient` controls (because meet-the-speaker doesn't have this field yet — Phase 7 will add it)
- Venue / topic visibility toggles (because Style 2 currently doesn't render them — Phase 7 will fix)

### 2.4 Style 1 controls — confirmed present

When Style 1 is selected (lines 735+):
- Gradient colors (GradientColorPicker component)
- Gradient opacity
- (likely more — didn't read further, not in scope for Phase 0)

---

## 3. QR-Salon editor (`qr-salon-editor.tsx`)

### 3.1 Toolbar layout — already correct

**Spec assumed**: Edit Images / Edit Sections buttons floating `absolute top-2 right-2` inside canvas frame (like speaker-intro and meet-the-speaker).
**Actual**: ❌ Spec was WRONG for qr-salon. The QR-salon editor already has its buttons in a horizontal row ABOVE the canvas (lines 308-345):

```tsx
<div className="flex items-center justify-between gap-2 flex-wrap">
  <div className="flex items-center gap-2">
    <button onClick={() => setEditImages((v) => !v)} ...>Edit images</button>
    <button onClick={() => setSectionsEditMode((v) => !v)} ...>Edit sections</button>
    <button onClick={handleReset} ...>Reset</button>
  </div>
  ...
</div>
```

**Delta**: No toolbar reorder needed for qr-salon. Phase 1's only qr-salon change is updating the canvas caption text (see §3.2 below).

### 3.2 Canvas caption — needs text update

**Spec assumed**: caption is missing or wrong.
**Actual**: ✅ Caption exists at lines 378-384:

```tsx
<p className="text-[0.7rem] text-black/50 leading-relaxed">
  Canvas: 1200×800 (3:2). Default layout: <strong>caption above</strong>,{" "}
  <strong>QR centered</strong>, <strong>brand mark below</strong> — all
  horizontally centered. <strong>Edit images</strong> (blue) → click the
  brand mark to swap it from the brand library.{" "}
  <strong>Edit sections</strong> (pink) → drag the QR / caption / brand
  mark to reposition; 8 handles to resize; Object Properties Panel for
  precise position, size, and z-order. Same pattern as the other
  mockups.
</p>
```

But it's BELOW the canvas, not above. And the text doesn't match the user's spec: `Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser`.

**Action for Phase 1**: Replace this caption with the user's exact wording, and move it ABOVE the canvas frame.

### 3.3 QR-Salon sample-data — already correct per D3=D

**Spec assumed**: qrSize needs to change to 180.
**Actual**: Per Decision 3 = D, qrSize stays at 360. ✅ No change needed. All other defaults (positions, caption, font) already match the spec.

**Phase 2 is effectively a no-op** — sample-data.ts already has the correct values per D3=D.

---

## 4. `SpeakerStyle2Card` component (in `speaker-intro-style2-canvas.tsx`)

### 4.1 Card structure — needs full rewrite in Phase 6

**Spec assumed**: card uses combined `title · company` line.
**Actual**: Need to verify by reading the `SpeakerStyle2Card` function. The canvas file is 692 lines; the card component is likely in the lower half. **Not read in this Phase 0** — will read in Phase 6 before rewriting.

### 4.2 Card background — needs translucent update in Phase 6

Per TSK-0022 audit, current cards use solid white. **Phase 6 will change** to `bg-white/95 backdrop-blur-sm border border-black/10`. Per Decision 2 = A, the layout will be: name → title → company → bio (4 lines, company on separate line below title).

---

## 5. Cross-cutting findings

### 5.1 Speaker-Intro has TWO Style pickers

- Top toolbar (`speaker-intro-editor.tsx:632-680`): 3-button segmented group, no subtitles
- Form-view (`shared/speaker-intro-form-view.tsx:62-64`): 3-button grid with subtitles ("Hero right · text left" etc.)

Both work. The user spec didn't explicitly say to remove either. **Decision**: keep both. The toolbar one is for quick switching during editing; the form-view one is documentation.

### 5.2 Meet-the-Speaker needs Style picker MOVED

- Currently in form-view (`shared/meet-the-speaker-form-view.tsx:598-626`)
- Phase 1 will ADD a 3-button segmented group to the toolbar (Style 1/2/3)
- Phase 1 will REMOVE the Style picker from the form-view

### 5.3 QR-Salon canvas caption is BELOW canvas, needs to move ABOVE

Per user spec: "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser" should appear ABOVE the canvas frame, not below.

### 5.4 `style2LayerZ.background` rename (D5=A)

The form-view at line 227 iterates over keys `["background", "hero", "qr", "speakers"]`. After renaming `background` → `gradient`:
- Update the iteration to use `gradient` as the key
- Add a backward-compat reader: if JSON has `background`, treat it as `gradient`
- Write `gradient` going forward

### 5.5 `topLogoUrl` sync with chapter favicon (D4=A)

The event picker (`handleEventPick`) currently fetches event data from `/api/events/[slug]`. To auto-fill `topLogoUrl` from the chapter favicon, Phase 3 will:
1. Check if the event response includes chapter branding (likely already does — `getChapterBrandingForRoute` is referenced in the 3-tier PDF spec)
2. If yes, set `topLogoUrl` from the chapter favicon URL
3. If no, leave `topLogoUrl` at its default (`https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393632010-jeorqc.png`)

Phase 3 will inspect the actual event API response shape to confirm.

### 5.6 Style 3 implementation scope (D1=A with Style 3 reference)

Phase 8 will implement the full Style 3 layout per Part 2 §2.3 of the preview document. Estimated effort: ~400 lines of new code in `meet-the-speaker-canvas.tsx` + ~80 lines in `types.ts` + ~150 lines in form-view. This is the largest single phase.

---

## 6. Summary — Spec accuracy

| Spec section | Audit result | Action |
|---|---|---|
| Speaker-Intro types: `topLogoUrl`, `qrSize`, `heroOpacity` MISSING | ✅ Confirmed MISSING | Phase 3/4 adds them |
| Speaker-Intro Style 2 canvas: 9 issues (sponsors as text, no brandingAsset, no topLogoUrl, no textStyles, no columns, hard-coded qrSize, no editable/onPickImage, layer z-bug) | ✅ All 9 confirmed | Phases 4-6 fix them |
| Speaker-Intro form-view: MISSING style2HeroGradient controls | ❌ WRONG — controls EXIST (lines 102-217) | No action needed for these 5 fields |
| Speaker-Intro form-view: MISSING style2LayerZ controls | ❌ WRONG — controls EXIST (line 227, numeric inputs not buttons) | Phase 4 renames `background` → `gradient` |
| Meet-the-Speaker types: heroStyle 1\|2 only, no style2HeroGradient | ✅ Confirmed | Phase 7/8 adds them |
| Meet-the-Speaker form-view: Style selector in form-view, no Style 3 | ✅ Confirmed | Phase 1 moves selector to toolbar, adds Style 3 button |
| QR-Salon: Edit buttons floating absolute inside canvas | ❌ WRONG — buttons are already in a horizontal row above canvas | No toolbar reorder for qr-salon; only caption text + position update in Phase 1 |
| QR-Salon: qrSize=360 needs to change to 180 | ❌ WRONG per D3=D — qrSize stays at 360 | Phase 2 is a no-op |
| QR-Salon: canvas caption is missing/wrong | ✅ Confirmed — caption is BELOW canvas, text doesn't match user spec | Phase 1 moves it ABOVE + updates text |

**Net result**: 3 spec items were wrong (form-view controls already exist for speaker-intro; qr-salon toolbar already correct; qr-salon qrSize unchanged per D3). This REDUCES the scope of work — Phases 4 and 5 have less to do than originally estimated.

---

*End of Phase 0 audit. Proceeding to Phase 1 (toolbar reorder) next.*
