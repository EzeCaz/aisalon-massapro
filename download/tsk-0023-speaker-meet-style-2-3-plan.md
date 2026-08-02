# TSK-0023 — Speaker Intro × Meet the Speaker × QR Salon — Style 2/3 Comprehensive Spec & Execution Plan

> **Document type**: Preview file (saved, NOT deployed)
> **Created**: 2026-07-31
> **Serial ID**: TSK-0023
> **Author**: Super Z (main agent)
> **Source material**:
> - User's 6-message spec dump in the live conversation (covering all 3 mockups, all 3 styles, QR defaults, toolbar reorder, layer order)
> - Uploaded reference image: `/home/z/my-project/upload/Speaker Intro Style 2.png` (1400 × 933 PNG) — vision-analysed via VLM
> - Existing source files audited (see Part 5 — File Map)
> - PDFs audited: `upload/3-tier-platform-plan.pdf` (64 pages) and `upload/4-tier-platform-plan.pdf` (43 pages)
>
> **Status**: APPROVED — user decisions received 2026-07-31. Phase 0 (audit) complete. Phase 1+ pending execution.
> **Deployment**: NONE yet. Will push to origin/main after Phase 9 per user Decision 7 = B.

---

## Part —1 — User Decisions (Received 2026-07-31)

| Decision | User's answer | Effect on plan |
|---|---|---|
| **D1** — PDF reference gap | **A** + uploaded `Variant B — Meet the Speaker Style 3.png` as Style 3 reference | Use Speaker Intro Style 2.png + HTML snippets for speaker-intro Style 2. **Style 3 of meet-the-speaker IS in scope** — VLM-analyzed the new image, spec added to Part 2 §2.3. |
| **D2** — Speaker card company position | **A** — below the title, separate line | Card layout: name → title → company → bio (4 lines, not 3). |
| **D3** — QR-Salon "middle-aligned" | **D** — keep same QR size, only change positions to X=15.3 Y=10 (QR) + X=17.8 Y=2.8 (caption) | qrSize STAYS at 360 (do NOT change to 180). Only positions are updated. Phase 2 simplified. |
| **D4** — topLogoUrl sync with favicon | **A** — auto-fill from chapter favicon on event picker | When event picker auto-fills the form, also fetch chapter branding and set `topLogoUrl` from the chapter's favicon URL. User can override. |
| **D5** — style2LayerZ rename | **A** — rename `background` → `gradient` with backward-compat alias | Existing JSON with `background` key still works (read both, write `gradient`). |
| **D6** — Execution order | **A** — phase-by-phase, commit after each | 10 phases (0 → 9), each independently committable. User verifies after each. |
| **D7** — Deploy trigger | **B** — after Phase 9, push to origin/main (triggers Vercel auto-deploy) | Local commits through Phases 1-9, then `git push origin main` as the final step. |

---

## Part 0 — Critical Findings (READ THIS FIRST)

### 0.1 PDF "Variant A" / "Variant B" references — NOT FOUND

The user's spec says:

> *"Create a new style called style 2, using this mockup design from your original 3-tier-platform-plan.pdf on page 20 above the text 'Variant A — Speaker Intro mockup, showing a 4-speaker roster for an AI Salon Tel Aviv event.'"*

> *"Create a new variant called style 3 to the meet-the-speaker mockup, from page 21 above the text 'Variant B Style 1 — Meet the Speaker with geometric gradient overlay.'"*

I scanned both PDFs in full. **Neither PDF contains the strings "Variant A" or "Variant B" anywhere.** Page 20 of the 3-tier PDF covers URL routing (Section 3.2 "Next.js route segments to add/modify"). Page 21 covers homepage behavior (Section 3.5) and the start of "Section 4 — Admin UI Completion". Page 20 of the 4-tier PDF covers `/admin/payments` routes. Page 21 covers `/admin/payments/[id]` and `/admin/users/[id]`.

**Likely explanation**: The user is referring to a different PDF — possibly an earlier draft, a mockups-specific deck, or a Figma export — that was never saved to `/home/z/my-project/upload/`. The two PDFs in the upload folder are platform-tier engineering specs, not visual mockup decks.

**Mitigation**: The user uploaded the Style 2 reference image (`Speaker Intro Style 2.png`) which I vision-analysed. That image, combined with the user's detailed HTML snippets pasted in the spec, IS the authoritative source for Style 2. For Style 3 of meet-the-speaker (no reference image provided), I will defer the design until the user supplies either a PNG or a verbal description. See Part 2 §2.3 for the deferred decision.

### 0.2 Speaker-Intro Style 2 — current implementation status

A Style 2 canvas ALREADY EXISTS at `src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx` (692 lines). It was built as part of TSK-0002 (2026-07-30). The current state is:

| Spec item | Status | Notes |
|---|---|---|
| Hero image fills entire canvas (background) | ✅ Present | `speaker-intro-style2-canvas.tsx:412-423` |
| Configurable gradient SHAPE (13 options: 8 2D + 5 3D) | ✅ Present | `GradientShape` component, lines 83-235 |
| Gradient direction (0-360°) | ✅ Present | `style2HeroGradient.direction` |
| Gradient opacity (0-1) | ✅ Present | `style2HeroGradient.opacity` |
| Shape rotation (0-360°) | ✅ Present | `style2HeroGradient.rotation` |
| Header section (event name + date + venue) | ✅ Present | Lines 436-492, includes venue at line 489 |
| Topic section | ✅ Present | Lines 494-536 |
| Speakers section (2-col card grid, white panel) | ✅ Present | Lines 538-593 |
| QR code section | ✅ Present | Lines 595-625, default size 120px |
| Sponsors section | ⚠️ Partial | Renders `sp.name` as text pill (line 662); user wants `sp.logoUrl` as image |
| Layer z-order (style2LayerZ) | ⚠️ Buggy | `background` defaults to z=1, `hero` defaults to z=2 → gradient is BEHIND hero (invisible). User wants gradient ON TOP of hero. See Part 4 §4.1. |
| Branding asset (bottom-left) | ❌ Missing | Not rendered in Style 2 canvas |
| Top-left logo / topLogoUrl field | ❌ Missing | No top-left badge rendered, no `topLogoUrl` field in types |
| Meerkat 🦫 badge (bottom-right) | ❌ Erased | User wants it ERASED — currently not rendered in Style 2. ✅ matches spec. |
| Edit Images mode enabled for Style 2 | ❌ Missing | `speaker-intro-editor.tsx:941-951` — Style2Canvas is not passed `editable={editMode}` or `onPickImage`. Only `sectionsEditable` is wired. |
| Edit Sections mode enabled for Style 2 | ✅ Present | `sectionsEditable={sectionsEditMode}` passed at line 945 |
| Form view controls for style2LayerZ (Front/Back buttons) | ❌ Missing | Type exists (`style2LayerZ`) but no form fields |
| Form view controls for style2HeroGradient | ⚠️ Partial | Shared form-view (`shared/speaker-intro-form-view.tsx` — not yet inspected) may have controls; will verify in Phase 0 |
| Speakers photo auto-pulled from speaker profile | ⚠️ Partial | `Speaker.photoUrl` exists and is rendered, but no auto-pull from event speaker records |
| Event name / date / time font size + color + align for Style 2 | ❌ Missing | Style 2 canvas uses hard-coded `fontSize: 32px`, `color: #FFFFFF`, no `textStyles.eventName` lookup |
| Speaker card: company below title (new line) | ❌ Missing | Current card combines title·company in one `<p>` (line in Style2Card component) |
| Speaker grid: 2-3 columns configurable | ❌ Missing | Hard-coded `gridTemplateColumns: "1fr 1fr"` (line 587) — ignores `speakersLayout.columns` |
| QR code 3× larger + movable | ❌ Missing | Hard-coded `size={120}` (line 623). Edit Sections can move the QR box but not resize the QR render itself. |
| Sponsors: pick up `logoUrl` instead of `name` | ❌ Missing | Line 662: `{sp.name}` text |

### 0.3 Meet-the-Speaker — current implementation status

| Spec item | Status | Notes |
|---|---|---|
| Style 1 (geometric gradient triangles) | ✅ Present | `meet-the-speaker-canvas.tsx:222-260` — SVG triangles with gradient stops |
| Style 2 (network image, `heroStyle2Url`) | ✅ Present | `meet-the-speaker-canvas.tsx:938-1050` (DraggableHeroStyle2Image) |
| Style 3 | ❌ Missing | `heroStyle?: 1 \| 2` only (types.ts:230) |
| Style selector location | ⚠️ Wrong | In form-view under "Hero overlay (gradient)" section (`shared/meet-the-speaker-form-view.tsx:598-626`), NOT in top toolbar. User wants it moved to the new top toolbar. |
| Style selector: Style 1 / Style 2 / Style 3 buttons | ❌ Missing | Only Style 1 / Style 2 buttons today |
| Style 2: venue rendered | ❌ Missing | Style 2 path does not render venue text |
| Style 2: topic rendered | ❌ Missing | Style 2 path does not render topic text |
| Style 2: editable background shape (13 options) | ❌ Missing | Style 2 renders a single hero image, no shape selector |
| Style 2: speaker cards (translucent white + blur + border) | ⚠️ Partial | Per TSK-0022 audit, cards use solid white — user wants translucent white + backdrop-blur + border |

### 0.4 QR-Salon — current defaults vs. user spec

| Field | User spec | Current default (`sample-data.ts`) | Match? |
|---|---|---|---|
| `qrSize` | 180 (50% smaller than 360) | 360 | ❌ |
| `qrMargin` | 2 | 2 | ✅ |
| `qrPos.x` | 15.3 | 15.3 | ✅ |
| `qrPos.y` | 10 | 10 | ✅ |
| `caption.text` | "Scan to register" | "Scan to register" | ✅ |
| `caption.style.fontSize` | 39 | 39 | ✅ |
| `caption.style.fontWeight` | Bold (700) | "700" | ✅ |
| `caption.style.color` | (unspecified — default black) | "#000000" | ✅ |
| `caption.style.align` | Left | "left" | ✅ |
| `captionPos.x` | 17.8 | 17.8 | ✅ |
| `captionPos.y` | 2.8 | 2.8 | ✅ |
| "QR 50% smaller + middle-aligned" | ⚠️ Contradiction | QR is at 15.3, 10 (top-left, not centered). Caption is at 17.8, 2.8 (top, not centered). | ⚠️ |

**Contradiction to resolve**: User says both "QR at X=15.3 Y=10" AND "QR 50% smaller + middle-aligned". These two cannot both be true. My interpretation: positions 15.3/10 and 17.8/2.8 are the **default starting positions**, and "middle-aligned" refers to vertical alignment between QR and caption (the caption should be vertically centered relative to the QR, not stacked above/below). Will confirm in Part 7 decision points.

### 0.5 Toolbar reorder — current state across all 3 mockups

| Mockup | Style selector location | Style options | Edit Images / Edit Sections location |
|---|---|---|---|
| Speaker-Intro | Top toolbar (segmented buttons) | Style 1 / Style 2 / Style 3 | Floating `absolute top-2 right-2` INSIDE the Live Preview canvas frame |
| Meet-the-Speaker | Form view "Hero overlay" section | Style 1 / Style 2 only | Floating `absolute top-2 right-2` INSIDE the Live Preview canvas frame |
| QR-Salon | (no style selector — only one style) | n/a | `Edit sections` button — need to verify location |
| Agenda-Profile | (not in scope — out of date July 5) | n/a | n/a |
| Event-Profile | (not in scope) | n/a | n/a |

**User wants (across all mockups)**:

1. Style 1 / 2 / 3 buttons at the very top of the toolbar (segmented group)
2. Edit Images button immediately after, in the same toolbar row
3. Edit Sections button immediately after Edit Images
4. All three button groups OUTSIDE the canvas frame (not floating `absolute` inside)
5. Order: `Style 1 | Style 2 | Style 3` · `Edit Images` · `Edit Sections` · (rest: Form/JSON toggle, Reset, Copy JSON, Download PNG, Save as default)

The user also wants the canvas caption `Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser` to appear above the canvas frame, presumably right above the new toolbar.

---

## Part 1 — Speaker-Intro Style 2 Spec (Authoritative)

> Source: user's HTML snippets + uploaded `Speaker Intro Style 2.png` + VLM analysis of that image.

### 1.1 Overall layout — split-screen asymmetric

```
┌────────────────────────────────────────────────────────────────────┐
│ [TOP HEADER BAR — solid magenta, full width]                       │
│  AI Salon Tel Aviv · Marketing in the Age of AI                    │
│  An evening with industry leaders · October 15, 2025    [AI SALON] │
├──────────────────────────────────────────┬─────────────────────────┤
│ LEFT 55% — white background              │ RIGHT 45% — hero image  │
│                                          │                         │
│  ┌─Header──────┐  ┌─Topic──────┐         │  Deep purple gradient   │
│  │ Event name  │  │ ▌Topic text│         │  overlay (opacity 0.55) │
│  │ Date · Time │  └────────────┘         │  on top of hero image   │
│  │ Venue       │                          │                         │
│  └─────────────┘                          │  Mountain silhouette    │
│                                           │  SVG along bottom      │
│  ┌─Speakers (2×2 grid)──────────────┐    │                         │
│  │ ┌─Card─┐  ┌─Card─┐                │    │  4 floating location    │
│  │ │○ Name│  │○ Name│  ← 56×56 circle │    │  pins: Sarona, Yafo,    │
│  │ │ title│  │ title│    photos with  │    │  Dizengoff, Neve Tzedek │
│  │ │company│ │company│  pink border   │    │                         │
│  │ │ bio  │  │ bio  │                │    │  ┌──┐                   │
│  │ └──────┘  └──────┘                │    │  │🦫│  ← ERASED per spec │
│  │ ┌─Card─┐  ┌─Card─┐                │    │  └──┘   (no meerkat)    │
│  │ │○ Name│  │○ Name│                │    │                         │
│  │ │ title│  │ title│                │    │                         │
│  │ │company│ │company│                │    │                         │
│  │ │ bio  │  │ bio  │                │    │                         │
│  │ └──────┘  └──────┘                │    │                         │
│  └────────────────────────────────────┘    │                         │
│                                            │                         │
│  [QR — top-right, large]                  │                         │
│                                            │                         │
│  ┌─Sponsors──────────────────────────┐    │                         │
│  │ IN COLLAB WITH: [logo] [logo]      │    │                         │
│  │ SPONSORED BY:  [logo]              │    │                         │
│  └────────────────────────────────────┘    │                         │
│                                            │                         │
│  [Branding asset — bottom-left]           │                         │
└──────────────────────────────────────────┴─────────────────────────┘
```

### 1.2 Layer order (z-index stack, from back to front)

Per user spec (latest message):

> *"the order of the front should be image color background, then the hero image, then the qr code, and on top of everyone is the speaker section"*

| Layer | z-index | Element |
|---|---|---|
| 1 (back) | `style2LayerZ.background` (default 1) | Gradient color background (the 13-shape gradient layer) |
| 2 | `style2LayerZ.hero` (default 2) | Hero image (the dark purple / network image) |
| 3 | `style2LayerZ.qr` (default 3) | QR code (3× current size, positioned top-right below date/time) |
| 4 (front) | `style2LayerZ.speakers` (default 4) | Speakers section (card grid) |

**Bug fix required**: current code has `background` default z=1 and `hero` default z=2, BUT the gradient shape div is rendered with `zIndex: layerZ(data, "background")` (line 426) while hero is at `layerZ(data, "hero")` (line 412). Since 1 < 2, **the gradient shape is rendered BEHIND the hero image and is therefore invisible**. The user wants the gradient shape to sit ON TOP of the hero image (per spec A: "enable me to select a gradient color behind the hero image" — note "behind" here means visually behind = below z-order, BUT also visible through the hero's opacity. The uploaded Style 2 PNG clearly shows the gradient OVER the hero image, dimming it).

**Resolution**: The hero image will render at low opacity (e.g. opacity 0.55 as in the current `linear-gradient(135deg, ...); opacity: 0.55` div) and the gradient shape will render ON TOP at full opacity. This matches the uploaded PNG. Z-order:

- Layer 1: hero image (z=1, opacity 0.55)
- Layer 2: gradient shape (z=2, opacity 0.85 default, ON TOP of hero — this dims/colours the hero)
- Layer 3: QR (z=3)
- Layer 4: speakers (z=4, on top of everything)

I will rename the layer keys to avoid confusion:
- `style2LayerZ.hero` → z=1 (back)
- `style2LayerZ.gradient` → z=2 (renamed from `background` to avoid the "behind hero" confusion)
- `style2LayerZ.qr` → z=3
- `style2LayerZ.speakers` → z=4 (front)

Each layer gets a **Front/Back** button in the form (per user spec: *"Also add the front back for each of those sections on the form"*).

### 1.3 Section-by-section spec — Speaker-Intro Style 2

#### A. Hero image & gradient overlay

| Property | Spec | Default |
|---|---|---|
| Hero image URL | `heroOverlay.imageUrl` (existing field) | `https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782509086094-n5wlon.png` |
| Hero image fit | `heroOverlay.fit` ("cover" / "contain") | "cover" |
| Hero image opacity | NEW field `style2HeroGradient.heroOpacity` | 0.55 (matches existing `opacity: 0.55` div) |
| Gradient shape | `style2HeroGradient.shape` (13 options) | "rectangle" |
| Gradient colors | `style2HeroGradient.colors` (comma-separated) | `["#8A2BE2", "#1E90FF", "#20B2AA"]` (purple→blue→teal, matching existing div) |
| Gradient direction | `style2HeroGradient.direction` (0-360°) | 135 |
| Gradient opacity | `style2HeroGradient.opacity` (0-1) | 0.85 |
| Gradient rotation | `style2HeroGradient.rotation` (0-360°) | 0 |

The existing `<div class="absolute inset-0" style="background: linear-gradient(135deg, rgb(138, 43, 226), rgb(30, 144, 255), rgb(32, 178, 170)); opacity: 0.55;">` (user's snippet #1) is REPLACED by the gradient shape layer. The hero image is moved to its own layer below the gradient.

#### B. Sponsors ("Collab with" / "Sponsored by")

| Property | Spec |
|---|---|
| Render as | **Logo IMAGE** (`<img src={sp.logoUrl}>`), not text |
| Logo size | `sp.logoSize` (default 1 = 32px height; 2 = 64px) |
| Logo theme | `sp.theme` ("light"/"dark") — for selecting which variant |
| Container | Pills with white background, rounded corners, shadow (same as current) |
| Position | `sectionLayout.sponsors.pos` — defaults `{ x: 85.5, y: 84.6 }` |

**Today**: renders `{sp.name}` text. **Fix**: replace with `<img src={sp.logoUrl || ''} alt={sp.name} height={32 * (sp.logoSize ?? 1)} />`. Fall back to text if `logoUrl` is empty.

#### C. Edit Images / Edit Sections enabled for Style 2

Currently `speaker-intro-editor.tsx:941-951` does NOT pass `editable` or `onPickImage` to `<SpeakerIntroStyle2Canvas>`. **Fix**: pass them; extend the Style2 canvas to accept them; wire `onPickImage` for slots `{kind: "hero"}`, `{kind: "speaker", index}`, `{kind: "branding-asset"}`, `{kind: "sponsor", group, index}`.

For Style 2 the `onPickImage` slots need to support a new kind: `{kind: "top-logo"}` (see item F below).

#### D. Speaker card redesign

Current Style 2 card (per `SpeakerStyle2Card` component, location to be confirmed in Phase 0):

```html
<div class="flex items-start gap-3 ...">
  <div class="rounded-full ... w-16 h-16"> <img /> </div>
  <div>
    <span class="font-bold text-base">{name}</span>
    <p class="text-xs">{title} · {company}</p>  <!-- COMBINED -->
    <p class="text-xs">{bio}</p>
  </div>
</div>
```

**New spec** (matches user's snippet #3):

```html
<div class="flex items-start gap-3 rounded-lg bg-white/95 backdrop-blur-sm border border-black/10 p-2.5 shadow-sm">
  <div class="rounded-full border-2 border-[#FF0056] w-14 h-14"> <img /> </div>
  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="font-bold text-base leading-tight">{name}</span>
      {isModerator && <span class="rounded-full bg-[#FF0056] text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5">Moderator</span>}
    </div>
    <p class="text-xs text-black/70 mt-0.5">{title}<span class="mx-1 text-black/30">·</span><span class="font-semibold">{company}</span></p>
    <p class="text-[11px] text-black/50 mt-1">{bio}</p>
  </div>
</div>
```

**Key changes**:
1. Photo border color: `border-2 border-[#FF0056]` (pink) — was generic
2. Card background: `bg-white/95 backdrop-blur-sm border border-black/10` (translucent white + blur + border) — was solid white
3. Moderator badge: inline-block, only if `speaker.role === "Moderator"`
4. Company on SAME line as title with `·` separator — **WAIT** — user spec item D says "display the company name below the title". This contradicts the user's snippet #3 which has `title · company` on the same line.

**Contradiction to resolve** (Part 7): User spec item D ("display the company name below the title") vs. user's HTML snippet #3 (title · company on same line). My recommendation: follow the snippet (same line, with `·` separator) since it's more specific. Will confirm.

#### E. Branding asset (bottom-left)

Currently the Style 2 canvas does NOT render `brandingAsset`. **Fix**: render it.

```jsx
{data.brandingAsset?.imageUrl && (
  <img
    src={data.brandingAsset.imageUrl}
    alt="Brand"
    style={{
      position: "absolute",
      left: `${(data.brandingAsset.pos?.x ?? 2.7)}%`,
      top: `${(data.brandingAsset.pos?.y ?? 84)}%`,
      height: `${data.brandingAsset.height ?? 48}px`,
      zIndex: 50,
    }}
  />
)}
```

Default URL: `https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png` (matches existing default in `qr-salon/types.ts:DEFAULT_BRANDING_ASSET_URL`).

#### F. Top-left logo (replaces "AI SALON" text badge)

User wants the existing `<div class="rounded px-2 py-1 text-[10px] font-extrabold tracking-wider" style="background: rgb(255, 255, 255); color: rgb(255, 0, 86);">AI SALON</div>` REPLACED with an `<img>` tag using a new `topLogoUrl` field.

| Property | Spec |
|---|---|
| Field name | `topLogoUrl` (NEW, top-level on `SpeakerIntroData`) |
| Default value | `https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393632010-jeorqc.png` |
| Sync with favicon | When the main favicon changes, `topLogoUrl` should also change. **Decision needed**: sync via form (auto-fill from site settings when event picker is used) OR via a "Sync from site favicon" button. Default: auto-fill from site settings on event pick. |
| Render position | Top-left of canvas, ~12px from edges |
| Render style | `<img src={topLogoUrl} style="height: 32px; width: auto;" />` |

#### G. Meerkat 🦫 badge — ERASED

User wants the existing `<div class="absolute rounded-lg ... 🦫 ...">` REMOVED entirely.

**Current Style 2 state**: already not rendered. ✅ matches spec.
**Style 1 state**: still rendered. Needs removal per user's earlier spec.

Also per user's spec: replace with nothing (just erase — no replacement graphic).

#### H. QR code — 3× larger + movable

| Property | Current | New |
|---|---|---|
| QR render size | Hard-coded `size={120}` (line 623) | `size={360}` (3× larger) |
| Edit Sections can move the QR box | ✅ Already wired | ✅ No change |
| Edit Sections can resize the QR render | ❌ SectionBox resize only scales the CONTAINER, not the QR | ✅ Add a `qrSize` field on `SpeakerIntroData` (top-level), default 360. Form control: number input + slider. Edit Sections resize also updates `qrSize`. |
| Position | `sectionLayout.qr.pos` defaults `{ x: 46.7, y: 3.8 }` (top-right, below date/time) | Same — matches spec |

#### I. Speaker grid columns — configurable 2-3

| Property | Current | New |
|---|---|---|
| Grid template | Hard-coded `gridTemplateColumns: "1fr 1fr"` (line 587) | Read from `speakersLayout.columns` (1-6). Default 2. |
| Auto-pull photo URL | `Speaker.photoUrl` is set in the JSON, manual | When event picker is used, auto-fill `photoUrl` from the speaker's profile (DB `Speaker.photoUrl` field) |
| Auto-pull company | `Speaker.company` field | Same — already auto-filled |

#### J. Event name / date / time font size + color + align for Style 2

Currently Style 2 uses hard-coded values:
- Event name: `fontSize: 32px`, `color: #FFFFFF`, no align (left default)
- Event date: `fontSize: 14px`, `color: #FFFFFF`
- Event venue: `fontSize: 13px`, `color: #FFFFFF`

**Fix**: respect `textStyles.eventName`, `textStyles.eventDate`, `textStyles.eventVenue` (these fields already exist in the type at `speaker-intro/types.ts:233-249`). The Style 2 canvas should look them up:

```js
const eventNameStyle = data.textStyles?.eventName ?? {};
// fontSize = eventNameStyle.fontSize ?? 32
// color = eventNameStyle.color ?? "#FFFFFF"
// align = eventNameStyle.align ?? "left"
```

Same for eventDate, eventVenue. The form view already has controls for these textStyles (per `shared/text-style-row.tsx`) — they just need to be applied to Style 2.

---

## Part 2 — Meet-the-Speaker Spec

### 2.1 Style 1 — defaults unchanged except where noted

| Section | Current default | User spec | Match? |
|---|---|---|---|
| Header | `{ x: 1.7, y: 0.5, w: 1200, h: auto, scale: 100 }` | Same | ✅ |
| Topic | `{ x: -12.4, y: 20.9, w: 951, h: auto, scale: 65 }` | Same | ✅ |
| Speakers | `{ x: -7.5, y: 25.1, w: 891, h: auto, scale: 76, z: 60 }` | Same | ✅ |
| QR | `{ x: 46.7, y: 3.8, w: auto, h: auto, scale: 131, z: 50 }` | Same | ✅ |

Style 1 of meet-the-speaker is considered COMPLETE — no changes needed.

### 2.2 Style 2 — fixes required

#### A. Show venue (currently hidden)

Currently the Style 2 path in `meet-the-speaker-canvas.tsx` does not render `data.event.venue`. **Fix**: render it as a SectionBox at the same default position as Style 1: `{ x: 1.7, y: 0.5, w: 1200, h: auto, scale: 100, z: 50 }` (the "header" section).

#### B. Show topic (currently hidden)

Same — Style 2 path doesn't render `data.event.topic`. **Fix**: render it at the same default position as Style 1: `{ x: -12.4, y: 20.9, w: 951, h: auto, scale: 65, z: 50 }`.

#### C. Editable background shape (13 options)

| Property | Spec |
|---|---|
| Field name | `style2HeroGradient` (NEW, top-level on `MeetTheSpeakerData`) — mirrors the speaker-intro field of the same name |
| Default shape | "rectangle" |
| Default colors | `["#8A2BE2", "#1E90FF", "#20B2AA"]` (matching Style 2's network image overlay) |
| Default direction | 135 |
| Default opacity | 0.85 |
| Default rotation | 0 |
| Shape options | Same 13: rectangle, circle, oval, triangle, square, pentagon, hexagon, octagon, sphere, cube, cone, cylinder, pyramid |

The Style 2 hero image renders at z=1 (back) with opacity 0.55, the gradient shape renders at z=2 (on top of hero), text sections at z=50, speakers at z=60.

#### D. Speaker cards — translucent white + blur + border

Per TSK-0022 audit, current cards use solid white. **Fix**: change to `bg-white/95 backdrop-blur-sm border border-black/10` (same as speaker-intro Style 2).

### 2.3 Style 3 — Single-speaker spotlight layout (NEW)

> Source: user uploaded `/home/z/my-project/upload/Variant B — Meet the Speaker Style 3.png` (1400 × 933 PNG) on 2026-07-31. VLM-analyzed via glm-5v-turbo. Spec below is the authoritative reference for Phase 8.

#### 2.3.1 Overall layout — 50/50 vertical split, single speaker

```
┌────────────────────────────────────┬───────────────────────────────────┐
│ LEFT 50% — info area               │ RIGHT 50% — visual area           │
│                                    │                                   │
│ ┌─[🚀 MEET THE SPEAKER]─┐          │     ┌───────────────────┐         │
│ │  pink pill badge      │          │     │                   │         │
│ └───────────────────────┘          │     │  Beige arch       │         │
│                                    │     │  (rounded top)    │         │
│  Boris Mergold                     │     │                   │         │
│  Lead Cloud Strategist             │     │   [stylized 3D    │         │
│  Google Cloud                      │     │    avatar inside] │         │
│                                    │     │                   │         │
│  TOPIC                             │     │                   │         │
│  Transforming Marketing with AI    │     │                   │         │
│  Description paragraph...          │     └───────────────────┘         │
│                                    │                                   │
│  │ ABOUT BORIS                     │              [QR]  ← top-right   │
│  │ Bio text...                     │                                   │
│                                    │                                   │
│  │ EXPERTISE                       │   ┌─────────────────────────┐    │
│  │ AI strategy · Marketing · ...   │   │ Ai Salon Tel Aviv · ... │    │
│                                    │   │ Wed, Oct 15 · 19:45-21  │    │
│                                    │   │ 📍 Sarona Studio : 1... │    │
│                                    │   └─────────────────────────┘    │
│                                    │                          [AI] ←  │
└────────────────────────────────────┴───────────────────────────────────┘
```

Background: vibrant **deep purple → magenta gradient** (left `#6B21A8` to right `#D946EF`). Subtle thin white diagonal lines + faint polygonal shapes overlaid on the gradient at low opacity for "tech/salon" aesthetic.

#### 2.3.2 Section-by-section spec

| Section | Position | Spec |
|---|---|---|
| Background gradient | Full canvas | Purple `#6B21A8` (left) → magenta `#D946EF` (right), linear horizontal. Read colors from `style2HeroGradient.colors` (re-use the same field). Direction fixed at 90° (horizontal) unless user overrides. |
| Decorative diagonal lines | Full canvas | Thin white lines at ~5% opacity, crossing top-left to bottom-right. Static SVG, not editable. |
| Decorative faint polygons | Top-right + bottom-right corners | Low-opacity triangle/quad shapes. Static SVG, not editable. |
| "🚀 MEET THE SPEAKER" pill badge | Top-left, ~2% X, ~5% Y | Pink/magenta background (`#D946EF`), white text, pill shape (rounded-full), padding `px-3 py-1.5`, font-size 11px uppercase bold tracking-wider. Text is editable via a new field `style3MeetSpeakerLabel` (default "🚀 MEET THE SPEAKER"). |
| "AI SALON · TEL AVIV" floating badge | Top-center, straddling the split, ~42% X, ~2% Y | White background, rounded-md, small red diamond icon + text "AI SALON · TEL AVIV" in black/purple. Reads from `topLogoUrl` field (same as speaker-intro) — if `topLogoUrl` is set, render the image instead of the text badge. |
| Speaker name (H1) | Upper-left quadrant, ~5% X, ~14% Y | Large bold white sans-serif, font-size 36px. Reads from the FIRST speaker in `data.speakers[0].fullName`. |
| Speaker title | Below name, ~5% X, ~22% Y | Bold white, font-size 16px. Reads from `data.speakers[0].title`. |
| Speaker company | Below title, ~5% X, ~26% Y | Regular white, font-size 14px, opacity 0.85. Reads from `data.speakers[0].company`. |
| TOPIC label | ~5% X, ~32% Y | Pink uppercase, font-size 10px, tracking-wider. Hardcoded "TOPIC" or reads from a new field `style3TopicLabel`. |
| Topic title | Below label, ~5% X, ~34% Y | Bold white, font-size 22px. Reads from `data.event.topic`. |
| Topic description | Below title, ~5% X, ~40% Y | Light gray/white, font-size 13px, opacity 0.8. Reads from `data.speakers[0].bio` (or a new field `style3TopicDescription`). |
| ABOUT [SPEAKER FIRST NAME] | ~5% X, ~52% Y | Tiny uppercase, font-size 9px, tracking-wider, opacity 0.7. Hardcoded "ABOUT {firstName}" derived from speaker name. |
| About bio text | Below label, ~5% X, ~54% Y | White, font-size 12px, opacity 0.85. Vertical pink line bullet on the left (`border-l-2 border-[#D946EF] pl-3`). Reads from `data.speakers[0].bio` (longer bio — may need a new field `style3AboutBio`). |
| EXPERTISE | ~5% X, ~68% Y | Tiny uppercase, font-size 9px, tracking-wider, opacity 0.7. Hardcoded "EXPERTISE". |
| Expertise tags | Below label, ~5% X, ~70% Y | White, font-size 11px, opacity 0.85. Vertical teal line bullet on the left (`border-l-2 border-[#20B2AA] pl-3`). Tags separated by ` · `. Reads from a new field `style3ExpertiseTags: string[]`. |
| Beige arch (right side) | Right 50%, vertically centered, ~50% X, ~10% Y, width ~45%, height ~70% | SVG/CSS shape: rectangle with fully rounded top (use `border-radius: 50% 50% 0 0 / 30% 30% 0 0` or SVG path). Fill: warm beige `#E8D5B7`. |
| Stylized 3D avatar | Inside the arch, vertically centered | Minimalist 3D-style vector illustration of head + shoulders. Skin tone slightly darker tan `#D4B896`. Clothing: dark navy semi-circle `#1A1A2E`. **For MVP**: render `data.speakers[0].photoUrl` as a circle inside the arch (with `object-fit: cover`), styled with a beige border. If no photoUrl, fall back to the stylized illustration (or just initials in a circle). |
| QR code | Top-right corner, ~88% X, ~5% Y | Square QR with white border/padding `p-2 bg-white rounded-md`. Size 120px default. Reads from `data.qrCodeUrl`. Edit Sections can move/resize. |
| Event details card | Bottom-right, ~50% X, ~78% Y, width ~45% | Dark translucent rounded rectangle `bg-black/60 backdrop-blur-sm rounded-lg p-4`. Contains: event title (white bold, font-size 14px), date/time (pink `#D946EF`, font-size 12px), location with pin icon (gray, font-size 11px). Reads from `data.event.name`, `data.event.date`, `data.event.time`, `data.event.venue`. |
| AI branding badge | Bottom-right corner, ~92% X, ~92% Y | Gold/yellow gradient circle, ~48px diameter, with "AI" text in white. Static branding element (not editable for now). |

#### 2.3.3 New data model fields (Meet-the-Speaker types.ts)

```typescript
// Extend existing heroStyle
heroStyle?: 1 | 2 | 3;

// New top-level fields for Style 3
style3MeetSpeakerLabel?: string;        // default "🚀 MEET THE SPEAKER"
style3TopicLabel?: string;              // default "TOPIC"
style3TopicDescription?: string;        // default: data.speakers[0].bio
style3AboutBio?: string;                // default: data.speakers[0].bio
style3ExpertiseTags?: string[];         // default: ["AI strategy", "Marketing transformation"]
style3ArchColor?: string;               // default "#E8D5B7" (beige)
style3AvatarUrl?: string;               // default: data.speakers[0].photoUrl
```

#### 2.3.4 Layer z-order

| Layer | z-index | Element |
|---|---|---|
| 1 (back) | `style3LayerZ.background` (default 1) | Purple→magenta gradient + decorative lines/polygons |
| 2 | `style3LayerZ.arch` (default 2) | Beige arch shape |
| 3 | `style3LayerZ.avatar` (default 3) | Stylized 3D avatar or speaker photo inside arch |
| 4 | `style3LayerZ.text` (default 4) | All text sections (badges, name, title, topic, about, expertise) |
| 5 | `style3LayerZ.qr` (default 5) | QR code |
| 6 (front) | `style3LayerZ.eventCard` (default 6) | Dark translucent event details card |

Each layer gets Front/Back buttons in the form (mirror the Style 2 pattern).

#### 2.3.5 Single-speaker focus

Style 3 is **single-speaker focused** — it renders only `data.speakers[0]`. If the speaker list has more than 1 entry, Style 3 ignores the rest (does NOT render a grid). This is per the reference image (1 speaker featured prominently).

The form view should show a hint when Style 3 is active: *"Style 3 highlights a single speaker. Only the first speaker in the list will be rendered."*

#### 2.3.6 Implementation note — backward compatibility

Existing meet-the-speaker JSON without `heroStyle` defaults to Style 1 (current behavior preserved). Existing JSON with `heroStyle: 1` or `heroStyle: 2` is unaffected. New `heroStyle: 3` triggers the Style 3 layout. The new `style3*` fields are all optional with sensible defaults so existing JSON continues to work without modification.

---

## Part 3 — QR-Salon Spec

### 3.1 Defaults (per user Decision 3 = D)

| Field | Spec | Current | Action |
|---|---|---|---|
| `qrSize` | **360** (unchanged — per D3=D, keep same QR size) | 360 | ✅ no change |
| `qrMargin` | 2 | 2 | ✅ no change |
| `qrPos.x` | 15.3 | 15.3 | ✅ already correct |
| `qrPos.y` | 10 | 10 | ✅ already correct |
| `caption.text` | "Scan to register" | "Scan to register" | ✅ no change |
| `caption.style.fontSize` | 39 | 39 | ✅ no change |
| `caption.style.fontWeight` | "700" (Bold) | "700" | ✅ no change |
| `caption.style.color` | "#000000" (default) | "#000000" | ✅ no change |
| `caption.style.align` | "left" | "left" | ✅ no change |
| `captionPos.x` | 17.8 | 17.8 | ✅ already correct |
| `captionPos.y` | 2.8 | 2.8 | ✅ already correct |

**Per Decision 3 = D**: keep QR size at 360, only ensure positions are X=15.3 Y=10 (QR) and X=17.8 Y=2.8 (caption). All defaults already match. **Phase 2 effectively requires NO code changes to sample-data.ts** — the only QR-Salon change is updating the canvas caption text in the editor (Phase 1 covers this).

### 3.2 Canvas size

| Property | Spec |
|---|---|
| Canvas dimensions | 1200 × 800 (3:2) — same as speaker-intro and meet-the-speaker |
| Caption above canvas | "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser" |

QR-salon canvas is already 1200 × 800. ✅ matches spec.

### 3.3 Phase 2 simplified

Since D3=D keeps qrSize at 360 and all positions are already correct, Phase 2 is effectively a no-op for sample-data.ts. The QR-Salon caption text update happens in Phase 1 (toolbar reorder). Phase 2 may be skipped entirely or merged into Phase 1.

---

## Part 4 — Toolbar Reorder Spec (All Mockups)

### 4.1 New toolbar layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Style 1] [Style 2] [Style 3]  ·  [Edit Images]  [Edit Sections]  ·     │
│ [Form] [JSON]  ·  [Reset] [Copy JSON] [Download PNG] [Save as default]  │
└─────────────────────────────────────────────────────────────────────────┘
Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                    [LIVE PREVIEW CANVAS]                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key changes**:

1. Style 1 / Style 2 / Style 3 buttons REMAIN at the start of the toolbar (segmented group). For mockups with only 2 styles (meet-the-speaker), the third button is omitted. For mockups with only 1 style (qr-salon), the entire group is omitted.
2. **Edit Images** and **Edit Sections** buttons MOVE OUT of the canvas frame (`absolute top-2 right-2`) and into the toolbar, immediately after the Style group.
3. The "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser" caption renders ABOVE the canvas frame, BELOW the toolbar.
4. The canvas frame itself has NO floating buttons inside it.

### 4.2 Per-mockup changes

| Mockup | Style buttons | Edit Images | Edit Sections | Canvas caption |
|---|---|---|---|---|
| Speaker-Intro | Move existing toolbar Style buttons to position 1; keep Style 1/2/3. | Move from `absolute top-2 right-2` to toolbar position 2. | Move from `absolute top-2 right-2` to toolbar position 3. | Add "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser" above the canvas. |
| Meet-the-Speaker | MOVE Style selector FROM form-view "Hero overlay" section TO toolbar position 1. Add Style 3 button (if implementing) or keep Style 1/2 only (if deferring). | Move from `absolute top-2 right-2` to toolbar position 2. | Move from `absolute top-2 right-2` to toolbar position 3. | Add canvas caption. |
| QR-Salon | (No Style buttons — single style.) | (No Edit Images button — only QR + caption + brand mark, all set via form.) | Move from current location to toolbar position 1 (or 2 if a Style group is ever added). | Update canvas caption to match: "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser" (already partially present at line 379). |
| Agenda-Profile | (Out of scope for TSK-0023 — user did not request changes.) | n/a | n/a | n/a |
| Event-Profile | (Out of scope.) | n/a | n/a | n/a |

---

## Part 5 — File Map (Source Code to Modify)

| File | Mockup | Changes |
|---|---|---|
| `src/app/admin/mockups/speaker-intro/types.ts` | Speaker-Intro | Add `topLogoUrl?: string` (top-level). Add `qrSize?: number` (top-level, default 360). Rename `style2LayerZ.background` → `style2LayerZ.gradient` (with backward-compat alias). Add `style2HeroGradient.heroOpacity?: number`. |
| `src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx` | Speaker-Intro | Fix layer z-order (hero=1, gradient=2, qr=3, speakers=4). Render `brandingAsset`. Render `topLogoUrl`. Apply `textStyles.eventName/Date/Venue` to header text. Read `speakersLayout.columns` for grid (default 2). Replace sponsors text with logo images. Use `data.qrSize ?? 360` for QR render size. Update `SpeakerStyle2Card` to: translucent white + blur + border, moderator badge inline-block, title·company on same line. Accept `editable` + `onPickImage` props, wire image slots. |
| `src/app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx` | Speaker-Intro Style 1 | Remove 🦫 meerkat badge. Replace top-left "AI SALON" badge with `<img src={topLogoUrl}>`. Apply spec section positions (header, topic, speakers, qr) as defaults. |
| `src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx` | Speaker-Intro | Reorder toolbar: Style group → Edit Images → Edit Sections → Form/JSON → Reset/Copy/Download/Save. Move Edit Images/Edit Sections OUT of `absolute top-2 right-2` div, INTO the toolbar. Add "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser" caption above the canvas. Pass `editable` + `onPickImage` to `<SpeakerIntroStyle2Canvas>`. |
| `src/app/admin/mockups/shared/speaker-intro-form-view.tsx` | Speaker-Intro | Add form controls for: `topLogoUrl`, `qrSize`, `style2LayerZ` (4 Front/Back buttons), `style2HeroGradient.heroOpacity`. Verify existing `style2HeroGradient` controls (shape, colors, direction, opacity, rotation). Ensure all `textStyles.event*` controls work for both Style 1 and Style 2. |
| `src/app/admin/mockups/meet-the-speaker/types.ts` | Meet-the-Speaker | Add `heroStyle?: 1 \| 2 \| 3` (extend from `1 \| 2`). Add `style2HeroGradient?` (mirror of speaker-intro field). |
| `src/app/admin/mockups/meet-the-speaker/meet-the-speaker-canvas.tsx` | Meet-the-Speaker | Add Style 3 branch (or stub if deferred). Fix Style 2: render venue, render topic, render gradient shape layer with 13 options, apply translucent card style. |
| `src/app/admin/mockups/meet-the-speaker/meet-the-speaker-editor.tsx` | Meet-the-Speaker | Reorder toolbar (same as speaker-intro). Add Style 1/2/3 segmented buttons to toolbar (MOVE from form-view). Move Edit Images/Edit Sections out of `absolute`. Add canvas caption. |
| `src/app/admin/mockups/shared/meet-the-speaker-form-view.tsx` | Meet-the-Speaker | REMOVE the "Hero style" / Style 1/Style 2 buttons from the "Hero overlay (gradient)" section (moved to toolbar). Add form controls for `style2HeroGradient` (shape, colors, direction, opacity, rotation). |
| `src/app/admin/mockups/qr-salon/sample-data.ts` | QR-Salon | Change `qrSize: 360` → `qrSize: 180`. |
| `src/app/admin/mockups/qr-salon/qr-salon-editor.tsx` | QR-Salon | Reorder toolbar (no Style group). Update canvas caption to "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser". |
| `src/app/admin/mockups/qr-salon/qr-salon-canvas.tsx` | QR-Salon | If "middle-aligned" interpretation B is chosen, override `qrPos`/`captionPos` to center. (Likely NO change — keep current positions.) |

**Estimated lines changed**: ~1,200 across 11 files.

---

## Part 6 — Execution Phases

> Each phase is independently committable. After each phase, the dev server is restarted (HMR usually suffices) and the user can preview at the existing URL. NO git push, NO production deploy until the user explicitly approves.

### Phase 0 — Pre-flight verification (no code changes)

**Goal**: Confirm my source audit is accurate before touching anything.

**Steps**:
1. Read `src/app/admin/mockups/shared/speaker-intro-form-view.tsx` in full — confirm what `style2HeroGradient` form controls already exist.
2. Read `src/app/admin/mockups/shared/meet-the-speaker-form-view.tsx` in full — confirm Style selector location + Style 2 form controls.
3. Read `src/app/admin/mockups/qr-salon/qr-salon-editor.tsx` in full — confirm Edit Sections button location + canvas caption.
4. Read the `SpeakerStyle2Card` component in `speaker-intro-style2-canvas.tsx` — confirm current card JSX.
5. Verify dev server is up (port 3000, PID in `.dev-server.pid`).

**Verification**: write the audit findings to `/home/z/my-project/download/tsk-0023-phase-0-audit.md` (a one-page reference for Phases 1-9).

**Commit**: none (research only).

### Phase 1 — Toolbar reorder across all 3 mockups

**Goal**: Move Style buttons + Edit Images + Edit Sections into a unified toolbar OUTSIDE the canvas frame. Add "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser" caption.

**Files**:
- `src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx`
- `src/app/admin/mockups/meet-the-speaker/meet-the-speaker-editor.tsx`
- `src/app/admin/mockups/shared/meet-the-speaker-form-view.tsx` (remove Style selector)
- `src/app/admin/mockups/qr-salon/qr-salon-editor.tsx`

**Verification**:
- All 3 mockups render the toolbar in the new order.
- No floating `absolute` buttons inside the canvas frame.
- The canvas caption appears above the canvas frame.
- For meet-the-speaker, the Style 1/2 buttons appear in the toolbar (Style 3 added in Phase 6 if implementing).

**Commit**: `[TSK-0023] Phase 1: Reorder toolbar across speaker-intro, meet-the-speaker, qr-salon`

### Phase 2 — QR-Salon defaults

**Goal**: Update `qrSize` default to 180.

**Files**:
- `src/app/admin/mockups/qr-salon/sample-data.ts`

**Verification**:
- Reload `/admin/mockups/qr-salon` → QR renders at 180px (half of previous 360px).
- Caption still renders at fontSize=39, align=left, X=17.8, Y=2.8.
- QR still positioned at X=15.3, Y=10.

**Commit**: `[TSK-0023] Phase 2: QR-Salon qrSize default 360 → 180`

### Phase 3 — Speaker-Intro Style 1 fixes

**Goal**: Apply spec items for Style 1 (positions, remove 🦫, replace AI SALON badge with `topLogoUrl`, apply text styles).

**Files**:
- `src/app/admin/mockups/speaker-intro/types.ts` (add `topLogoUrl`, `qrSize`)
- `src/app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx`
- `src/app/admin/mockups/shared/speaker-intro-form-view.tsx`

**Verification**:
- Style 1 canvas: no 🦫 meerkat badge.
- Style 1 canvas: top-left shows the `topLogoUrl` image (default `1782393632010-jeorqc.png`), not the "AI SALON" text badge.
- Style 1 canvas: section positions match spec (header 1.7/0.5, topic -12.4/20.9, speakers -7.5/25.1 scale 76, qr 46.7/3.8 scale 131).
- Form view: `topLogoUrl` field appears with default URL prefilled.
- Form view: `qrSize` field appears (default 360 for Style 1).

**Commit**: `[TSK-0023] Phase 3: Speaker-Intro Style 1 — remove meerkat, add topLogoUrl, apply section position defaults`

### Phase 4 — Speaker-Intro Style 2 layer fix + brandingAsset + topLogoUrl

**Goal**: Fix the z-order bug so the gradient shape renders ON TOP of the hero image (currently rendered behind, invisible). Add `brandingAsset` rendering. Add `topLogoUrl` rendering.

**Files**:
- `src/app/admin/mockups/speaker-intro/types.ts` (rename `style2LayerZ.background` → `style2LayerZ.gradient`, add `heroOpacity`)
- `src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx`
- `src/app/admin/mockups/shared/speaker-intro-form-view.tsx`

**Verification**:
- Style 2 canvas: gradient shape is VISIBLE on top of the hero image (dimming it).
- Style 2 canvas: hero image renders at `heroOpacity` (default 0.55).
- Style 2 canvas: `brandingAsset.imageUrl` renders at bottom-left (default `1782505047256-bpy1ln.png`).
- Style 2 canvas: `topLogoUrl` renders at top-left (default `1782393632010-jeorqc.png`).
- Style 2 canvas: no 🦫 meerkat badge (already not rendered — verify).
- Form view: 4 Front/Back buttons for `style2LayerZ` (hero, gradient, qr, speakers).
- Form view: `heroOpacity` slider (0-1).

**Commit**: `[TSK-0023] Phase 4: Speaker-Intro Style 2 — fix layer z-order, add brandingAsset + topLogoUrl`

### Phase 5 — Speaker-Intro Style 2 sponsors + QR + speaker grid + textStyles

**Goal**: Replace sponsor text with logo images. Make QR 3× larger (default 360) and respect `data.qrSize`. Make speaker grid read `speakersLayout.columns`. Apply `textStyles.event*` to header text.

**Files**:
- `src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx`
- `src/app/admin/mockups/shared/speaker-intro-form-view.tsx`

**Verification**:
- Style 2 canvas: sponsors render as logo images (not text). Falls back to text if `logoUrl` is empty.
- Style 2 canvas: QR renders at `data.qrSize ?? 360` (3× larger than before).
- Style 2 canvas: speaker grid uses `speakersLayout.columns` (default 2). Try setting columns=3 in JSON → grid changes to 3 columns.
- Style 2 canvas: event name font size, color, align respect `textStyles.eventName`. Try setting `textStyles.eventName.fontSize = 48` in JSON → header text grows.
- Form view: `qrSize` field for Style 2 (default 360).
- Form view: `speakersLayout.columns` dropdown (1-6, default 2).

**Commit**: `[TSK-0023] Phase 5: Speaker-Intro Style 2 — sponsors as logos, QR 3× larger, configurable grid columns, textStyles applied`

### Phase 6 — Speaker-Intro Style 2 card redesign + Edit Images wiring

**Goal**: Update `SpeakerStyle2Card` to the new translucent card with moderator badge. Wire `editable` + `onPickImage` for Style 2.

**Files**:
- `src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx`
- `src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx`

**Verification**:
- Style 2 canvas: speaker cards have `bg-white/95 backdrop-blur-sm border border-black/10` styling.
- Style 2 canvas: speaker photo has `border-2 border-[#FF0056]` (pink border).
- Style 2 canvas: moderator speakers show the pink "Moderator" badge inline-block.
- Style 2 canvas: title and company on same line with `·` separator (per snippet #3 — pending user confirmation in Part 7).
- Edit Images mode toggles correctly for Style 2: hovering the hero image shows a Replace button. Clicking opens the image picker.
- Edit Images mode: hovering a speaker photo shows Replace button.
- Edit Images mode: hovering the branding asset shows Replace button.

**Commit**: `[TSK-0023] Phase 6: Speaker-Intro Style 2 — card redesign + Edit Images mode wired`

### Phase 7 — Meet-the-Speaker Style 2 fixes

**Goal**: Show venue, show topic, add editable background shape (13 options), apply translucent card style.

**Files**:
- `src/app/admin/mockups/meet-the-speaker/types.ts`
- `src/app/admin/mockups/meet-the-speaker/meet-the-speaker-canvas.tsx`
- `src/app/admin/mockups/shared/meet-the-speaker-form-view.tsx`

**Verification**:
- Meet-the-Speaker Style 2 canvas: venue text renders at header position (1.7/0.5).
- Meet-the-Speaker Style 2 canvas: topic text renders at topic position (-12.4/20.9).
- Meet-the-Speaker Style 2 canvas: gradient shape renders on top of the network image. Try changing `style2HeroGradient.shape = "circle"` → shape changes.
- Meet-the-Speaker Style 2 canvas: speaker cards have translucent white + blur + border.
- Form view: `style2HeroGradient` controls appear under "Hero overlay (gradient)" section when Style 2 is selected.

**Commit**: `[TSK-0023] Phase 7: Meet-the-Speaker Style 2 — show venue + topic, add gradient shape selector, translucent cards`

### Phase 8 — Meet-the-Speaker Style 3 (single-speaker spotlight layout)

**Goal**: Implement the Style 3 layout per Part 2 §2.3 spec — 50/50 split, purple→magenta gradient, beige arch with avatar, pink MEET THE SPEAKER pill, single speaker, dark translucent event card bottom-right.

**Files**:
- `src/app/admin/mockups/meet-the-speaker/types.ts` — extend `heroStyle?: 1 | 2 | 3`, add 8 new `style3*` fields, add `style3LayerZ` field
- `src/app/admin/mockups/meet-the-speaker/meet-the-speaker-canvas.tsx` — add Style 3 branch with all sections per §2.3.2
- `src/app/admin/mockups/meet-the-speaker/meet-the-speaker-editor.tsx` — Style 3 button added to toolbar in Phase 1; no additional changes here unless form-view wiring is needed
- `src/app/admin/mockups/shared/meet-the-speaker-form-view.tsx` — add Style 3-specific form controls (style3MeetSpeakerLabel, style3TopicLabel, style3TopicDescription, style3AboutBio, style3ExpertiseTags, style3ArchColor, style3AvatarUrl, style3LayerZ Front/Back buttons)

**Verification**:
- Style 3 button appears in toolbar (added in Phase 1).
- Clicking Style 3 → canvas switches to single-speaker spotlight layout.
- Background gradient is purple→magenta.
- Beige arch with speaker avatar renders on right side.
- "🚀 MEET THE SPEAKER" pink pill badge renders top-left.
- Speaker name (H1) + title + company render in left column.
- TOPIC label + topic title + description render.
- ABOUT [firstName] + bio with pink left border render.
- EXPERTISE + tags with teal left border render.
- QR code renders top-right.
- Dark translucent event details card renders bottom-right.
- All 6 layers respond to Front/Back z-order changes.
- Form view shows all `style3*` fields when Style 3 is active.

**Commit**: `[TSK-0023] Phase 8: Meet-the-Speaker Style 3 — single-speaker spotlight layout`

### Phase 9 — Final verification + status updates

**Goal**: End-to-end smoke test of all 3 mockups. Update task registry.

**Steps**:
1. Visit `/admin/mockups/speaker-intro` → switch Style 1 → Style 2 → Style 3 (no Style 3 for speaker-intro — should not exist). Verify all spec items.
2. Visit `/admin/mockups/meet-the-speaker` → switch Style 1 → Style 2 → Style 3 (if implemented). Verify all spec items.
3. Visit `/admin/mockups/qr-salon` → verify QR is 180px, caption is fontSize 39 align left, positions match.
4. Verify all 3 toolbars have the new layout (Style → Edit Images → Edit Sections → Form/JSON → Reset/Copy/Download/Save).
5. Verify no floating `absolute` buttons inside any canvas frame.
6. Verify "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser" caption appears above all 3 canvases.
7. Update `docs/tasks.md` — change TSK-0023 status from `IN_PROGRESS` to `DONE`.
8. Update `core/task-management.md` "Current Task" pointer.

**Commit**: `[TSK-0023] Phase 9: Final verification + status updates`

---

## Part 7 — Decision Points (User Must Answer Before Phase 1)

> These are the contradictions / ambiguities identified during spec analysis. I will NOT proceed past Phase 0 until you answer each one.

### Decision 1 — PDF reference gap

The PDFs you cited (`3-tier-platform-plan.pdf` page 20 "Variant A" and page 21 "Variant B") do not contain those strings. How should I proceed?

- **Option A**: Use the uploaded `Speaker Intro Style 2.png` + your HTML snippets as the authoritative Style 2 spec. **Defer Style 3 of meet-the-speaker** until you provide a reference. *(Recommended)*
- **Option B**: Use the uploaded image + snippets for Style 2. **Best-guess Style 3** for meet-the-speaker (Style 1's gradient triangles as full-canvas background, no hero image).
- **Option C**: Pause TSK-0023. You will upload the correct PDF / image, then I resume.
- **Option D**: Other (describe).

### Decision 2 — Speaker card: company position

Your spec item D says "display the company name below the title". Your HTML snippet #3 shows `title · company` on the same line. Which is correct?

- **Option A**: Below the title (separate line). Card layout: name → title → company → bio. *(Matches your spec text)*
- **Option B**: Same line as title, with `·` separator. Card layout: name → title · company → bio. *(Matches your HTML snippet — recommended)*
- **Option C**: Other (describe).

### Decision 3 — QR-Salon "middle-aligned" interpretation

You said "QR code mockup should be 50% smaller, and all the text and qr code image should be aligned to the middle". You also specified positions X=15.3 Y=10 for QR and X=17.8 Y=2.8 for caption. These two specs conflict.

- **Option A**: Keep the explicit positions (15.3/10 for QR, 17.8/2.8 for caption). "Middle-aligned" means the caption is horizontally aligned with the QR (both left-aligned at similar X). qrSize = 180. *(Recommended — explicit positions are more specific)*
- **Option B**: Ignore the positions. Horizontally center both QR and caption on the canvas. qrSize = 180.
- **Option C**: Vertically center both on the canvas (ignore X positions). qrSize = 180.
- **Option D**: Other (describe).

### Decision 4 — `topLogoUrl` sync with favicon

You said "when the main favicon changes, that should also change". How should the sync work?

- **Option A**: When the event picker auto-fills the form, also auto-fill `topLogoUrl` from the chapter's favicon URL (resolved via `getChapterBrandingForRoute`). User can override manually. *(Recommended — matches existing auto-fill pattern)*
- **Option B**: Add a "Sync from site favicon" button in the form. User clicks to pull the current favicon.
- **Option C**: Real-time sync — `topLogoUrl` is always the current site favicon, cannot be overridden.
- **Option D**: Other (describe).

### Decision 5 — `style2LayerZ` rename

The current field is `style2LayerZ.background` (default z=1, BEHIND hero). The user spec calls this the "gradient color background". Renaming to `style2LayerZ.gradient` makes the code clearer (avoids the "background is behind hero" confusion).

- **Option A**: Rename `background` → `gradient`. Add a backward-compat alias so existing JSON with `background` still works. *(Recommended)*
- **Option B**: Keep `background` name. Document that it sits ON TOP of hero (counterintuitive).
- **Option C**: Other (describe).

### Decision 6 — Execution order

I propose phases 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → (8 if Option B chosen) → 9. Each phase is independently committable and you can preview at the URL after each.

- **Option A**: Approve the phase order. I proceed phase-by-phase, committing after each. *(Recommended)*
- **Option B**: Approve, but commit only after every 2 phases (less noise in git log).
- **Option C**: Approve, but DO NOT commit at all until the end (one big commit).
- **Option D**: Skip Phase 8 (defer Style 3). I proceed 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9.
- **Option E**: Other (describe).

### Decision 7 — Deploy trigger

After Phase 9, the work is committed locally but NOT pushed to origin/main, NOT deployed to production. When should the deploy happen?

- **Option A**: Never auto-deploy. You will manually `git push` + trigger Vercel deploy when ready. *(Recommended — matches your "dont deploy" instruction)*
- **Option B**: After Phase 9, push to origin/main (triggers Vercel auto-deploy).
- **Option C**: Deploy after each phase.
- **Option D**: Other (describe).

---

## Part 8 — Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PDF reference gap (Decision 1) forces a re-do of Style 3 | High | Medium | Defer Style 3 unless user provides reference. Style 2 is well-specified by image + snippets. |
| `style2LayerZ` rename breaks existing saved JSON | Medium | High | Backward-compat alias: read both `background` and `gradient`, write `gradient`. |
| `topLogoUrl` sync (Decision 4) requires chapter branding lookup that may not exist in the current event picker flow | Medium | Medium | Phase 3 will inspect the existing `handleEventPick` flow; if no chapter branding is fetched, fall back to default URL with a console warning. |
| Toolbar reorder breaks keyboard navigation / focus order | Low | Low | Test with Tab key after Phase 1. |
| Edit Images mode for Style 2 requires significant new event wiring | Medium | Medium | Phase 6 is dedicated to this; if it slips, Phase 5 still ships the visual fixes. |
| Speaker grid columns=3 may overflow the 891px container at 4+ speakers | Medium | Low | Test with 4, 6, 8 speakers at columns=2 and columns=3. Adjust card padding if needed. |
| QR at 360px (3× larger) may overlap with header text | Medium | Medium | Default QR position is 46.7/3.8 (top-right, below date/time at 0.5/1.7). Should not overlap. Verify in Phase 5. |
| Meet-the-Speaker Style 2 gradient shape on top of network image may obscure the image entirely | Medium | Medium | Default `style2HeroGradient.opacity` = 0.85 (slightly transparent). User can lower it. Network image is still visible underneath. |
| Phase 8 (Style 3 best-guess) may be wrong → wasted effort | High (if Option B) | Medium | Only execute Phase 8 if user picks Option B in Decision 1. Otherwise skip. |

---

## Part 9 — Approval Gate

> **DO NOT PROCEED past Phase 0 until you reply with answers to Decisions 1-7.**

### 9.1 What I need from you

Reply with a single message in this format:

```
Decision 1: <A|B|C|D> — <optional comment>
Decision 2: <A|B|C|D>
Decision 3: <A|B|C|D>
Decision 4: <A|B|C|D>
Decision 5: <A|B|C|D>
Decision 6: <A|B|C|D|E>
Decision 7: <A|B|C|D>

Additional notes: <anything else you want me to know>
```

### 9.2 What happens after you reply

1. I log your decisions in `docs/tasks.md` under TSK-0023.
2. I execute Phase 0 (pre-flight verification — no code changes, just reading files and writing a one-page audit).
3. I share the Phase 0 audit with you.
4. I execute Phase 1 (toolbar reorder) — first code change. After commit, I tell you to reload the URL and verify.
5. You verify Phase 1. Reply "approved" or "fix X".
6. I proceed to Phase 2. Repeat for each phase.
7. After Phase 9, you decide whether to deploy (Decision 7).

### 9.3 If you want to modify the spec

If any spec item in Part 1-4 is wrong, reply with:

```
Spec change: <Part X, section Y> — <what to change>
```

I will update this preview document and re-share before proceeding.

---

## Appendix A — Source audit summary (file-by-file)

### A.1 `src/app/admin/mockups/speaker-intro/types.ts` (466 lines)

- ✅ `style?: "style1" | "style2" | "style3"` (line 140)
- ✅ `speakersLayout.panelBg` (line 202, default white)
- ✅ `speakersLayout.photoAlign` (line 210, default left)
- ✅ `textStyles.eventName/Date/Venue/Topic` etc. (lines 233-249)
- ✅ `brandingAsset.imageUrl` (line 340)
- ✅ `style2HeroGradient` with 13 shape options (lines 386-405)
- ✅ `style2LayerZ` (lines 419-424, defaults: background=1, hero=2, qr=3, speakers=4) — **BUG**: background < hero means gradient is invisible
- ❌ `topLogoUrl` — MISSING
- ❌ `qrSize` (top-level) — MISSING
- ❌ `style2HeroGradient.heroOpacity` — MISSING

### A.2 `src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx` (692 lines)

- ✅ Hero image fills canvas (line 412-423)
- ✅ GradientShape component with 13 shapes (lines 83-235)
- ✅ Header section renders venue (line 489)
- ✅ Topic section (lines 494-536)
- ✅ Speakers section with 2-col grid (lines 538-593)
- ✅ QR section (lines 595-625, hard-coded size=120)
- ⚠️ Sponsors render `sp.name` text, NOT `sp.logoUrl` image (line 662)
- ❌ `brandingAsset` NOT rendered
- ❌ `topLogoUrl` NOT rendered
- ❌ `textStyles.event*` NOT applied (hard-coded font sizes / colors)
- ❌ `speakersLayout.columns` NOT respected (hard-coded 2 columns)
- ❌ `data.qrSize` NOT respected (hard-coded 120)
- ❌ `editable` / `onPickImage` props NOT accepted
- ❌ Layer z-order bug (gradient BEHIND hero)

### A.3 `src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx` (1014+ lines)

- ✅ Style 1/2/3 segmented buttons in top toolbar (lines 632-680)
- ⚠️ Edit Images / Edit Sections buttons at `absolute top-2 right-2` INSIDE canvas frame (lines 891-921) — **needs to move OUTSIDE**
- ⚠️ Style 2 canvas does NOT receive `editable` or `onPickImage` (lines 941-951)
- ❌ No "Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser" caption above canvas (current caption is `Live Preview · {scale}% scale · exported PNG is 2400 × 1600`)

### A.4 `src/app/admin/mockups/meet-the-speaker/types.ts`

- ⚠️ `heroStyle?: 1 | 2` (line 230) — no Style 3
- ❌ `style2HeroGradient` — MISSING
- ✅ `heroStyle2Url`, `heroStyle2Placement`, `heroStyle2Scale`, `heroStyle2Pos`, `heroStyle2Rotation` (lines 235-262)

### A.5 `src/app/admin/mockups/meet-the-speaker/meet-the-speaker-canvas.tsx`

- ✅ Style 1 geometric gradient triangles via SVG (lines 222-260)
- ✅ Style 2 network image hero (lines 938-1050)
- ❌ Style 3 — MISSING
- ❌ Style 2 does not render venue
- ❌ Style 2 does not render topic
- ❌ Style 2 has no gradient shape selector
- ⚠️ Style 2 speaker cards — solid white (per TSK-0022 audit), need translucent

### A.6 `src/app/admin/mockups/meet-the-speaker/meet-the-speaker-editor.tsx`

- ⚠️ Style selector in form-view (`shared/meet-the-speaker-form-view.tsx:598-626`), NOT in toolbar — **needs to move**
- ⚠️ Edit Images / Edit Sections at `absolute top-2 right-2` — **needs to move**
- ❌ No Style 3 button in toolbar
- ❌ No canvas caption

### A.7 `src/app/admin/mockups/qr-salon/sample-data.ts`

- ⚠️ `qrSize: 360` — should be 180
- ✅ All other defaults match user spec

### A.8 `src/app/admin/mockups/qr-salon/qr-salon-editor.tsx`

- ⚠️ Edit Sections button location — needs verification in Phase 0
- ✅ Canvas caption partially present (line 379: "Canvas: 1200×800 (3:2). Default layout: caption above...") — needs update to match user's exact wording

---

## Appendix B — VLM analysis of `Speaker Intro Style 2.png`

> Vision model output (glm-5v-turbo) — used to confirm the spec.

**Overall layout**: Split-screen asymmetric. Left ~55% white background with header + speaker cards. Right ~45% hero image area with dark purple gradient, mountain silhouette, and 4 floating location pins.

**Hero image area**: Deep purple (#6b21a8) at top, transitioning to dark navy/black at bottom. Subtle vertical gradient. Mountain range silhouette in solid black/dark grey along the bottom edge. 4 location pin badges: Sarona, Yafo, Dizengoff, Neve Tzedek.

**Speaker section**: 4 speakers in a 2×2 grid. White cards with rounded corners (~12-16px radius) and soft drop shadow. Circular profile photos (~50-60px diameter) on the left of each card, with magenta/pink background and white initials. Left-aligned text. Card content: speaker name (bold) → title & company (grey) → session topic (pink/magenta pill) → bio description (small grey) → time & session type (teal/green icon + bold text).

**Header**: Solid vibrant magenta/pink (#db2777) bar spanning full width. Left/center: "AI Salon Tel Aviv · Marketing in the Age of AI" (large, white, bold). Below: "An evening with industry leaders · October 15, 2025" (white, lighter weight). Right: "AI SALON" logo text (white, uppercase, letter-spaced).

**Topic section**: Inside each speaker card as a pink pill/badge (NOT a separate canvas section).

**Venue**: Floating location pin badges within the hero image area.

**QR code**: Bottom-right corner, inside the dark footer bar. Small (~40-50px).

**Sponsors**: Bottom center, inside the dark footer bar. Text-based badges/pills. "IN COLLAB WITH" (magenta) → Amdocs, Google (dark grey pills). "SPONSORED BY" (teal/green) → Alison.ai (dark grey pill).

**Top-left badge**: Not present as a separate badge — event title is integrated into the header bar.

**Bottom-left branding**: Square magenta icon with "AI" initials in white, followed by "AI SALON · TEL AVIV" text.

**Bottom-right meerkat**: Cute stylized yellow/gold rounded character with simple black dot eyes and straight line mouth. Flat minimalist vector look. (User wants this ERASED.)

**Decorative SVG shapes**: Mountain range silhouette + 4 map marker icons (teardrop shape with circle hole).

---

## Appendix C — Glossary

- **SectionBox**: Shared draggable/resizable container component from `shared/section-edit.tsx`. Each text section (header, topic, speakers, qr, sponsors) is wrapped in a SectionBox.
- **style2LayerZ**: Per-layer z-index overrides for Style 2. 4 keys: background/gradient, hero, qr, speakers.
- **style2HeroGradient**: Style 2 gradient shape configuration. 5 fields: shape (13 options), colors, direction, opacity, rotation.
- **textStyles**: Per-text-section font size + color + alignment overrides. 15 keys covering every text element on the canvas.
- **SectionLayout**: Per-section drag/resize state stored in the JSON. Keys are SectionId strings.
- **ImageSlot**: Identifies which image a picker is targeting. Kinds: hero, speaker, branding-asset, sponsor, (NEW: top-logo).

---

*End of preview document. Awaiting user decisions in Part 7 before proceeding to Phase 0.*
