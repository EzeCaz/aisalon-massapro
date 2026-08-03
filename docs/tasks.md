# Task Registry

> *Single source of truth for every task requested by the user.*
>
> **Purpose**: A precise, meticulous, append-only registry of every task worked on in this project. Each task receives a unique ascending serial ID (`TSK-XXXX`) that never changes and is never reused. This file is the canonical index — the worklog (`/home/z/my-project/worklog.md`) remains the detailed execution log.
>
> **Maintained by**: Z (main agent), on behalf of Meridian + Codex.
>
> **Convention**: One row per task. New tasks are appended at the bottom with the next available serial ID. Status moves from `OPEN` → `IN_PROGRESS` → `DONE` (or `BLOCKED` / `CANCELLED`). Once a row is written, it is never deleted and its serial ID is never edited.

---

## Serial ID Rules

1. **Format**: `TSK-XXXX` where `XXXX` is a zero-padded ascending integer starting at `0001`.
2. **Uniqueness**: Each serial ID is assigned exactly once. Even if a task is cancelled, the ID is never reused.
3. **Immutability**: The serial ID, original user request, and date requested are immutable. Status, files-touched, and notes may be updated as work progresses.
4. **Assignment authority**: Only Z (the main agent) assigns serial IDs, and only when a new user request comes in that requires more than a trivial one-line answer.
5. **Cross-reference**: The serial ID MUST appear in:
   - The commit message (e.g. `[TSK-0007] Fix login redirect loop`)
   - The worklog entry's `Task ID:` field (e.g. `Task ID: TSK-0007 — login-redirect-fix`)
   - The task folder name (e.g. `core/tasks/2026-07-31-TSK-0007-login-redirect-fix/`)
6. **No skips**: Serial IDs are strictly ascending. If TSK-0007 exists, the next task is TSK-0008 — never TSK-0010.
7. **Back-fill rule**: When previously-unlogged work is discovered and added to the registry, it receives the next available serial ID (not a retroactive earlier one). The `Date` field reflects when the work actually happened; the serial ID reflects when it was registered. This keeps IDs strictly ascending without rewriting history.

---

## Column Legend

| Column | Meaning |
|---|---|
| **Serial** | The permanent `TSK-XXXX` identifier. |
| **Date** | ISO date the task was requested (`YYYY-MM-DD`). |
| **Title** | One-line summary of what was asked. |
| **Category** | `SMALL` / `MID` / `HIGH` per `core/TASK_CATEGORIES.md`. |
| **Status** | `OPEN` / `IN_PROGRESS` / `DONE` / `BLOCKED` / `CANCELLED`. |
| **Worklog Ref** | The task's heading in `/home/z/my-project/worklog.md`. |
| **Files Touched** | Comma-separated list of source files modified (top 5 max — full list in task folder). |
| **Outcome** | One-line description of what was delivered. |

---

## Registry — Last 72 Hours (2026-07-28 → 2026-07-31)

> These are the tasks that initialized this registry. Earlier work is recorded in `/home/z/my-project/worklog.md` and `core/tasks/README.md` and is NOT retroactively assigned serial IDs — the registry starts here, forward-only.
>
> **Back-fill notes (2026-07-31)**:
- **v1.1 back-fill** — TSK-0001 through TSK-0006 were registered first (most recent visible work). An audit of the worklog then discovered five additional tasks (EXPLORE-1, PLAN-1, IMPL-1, PDF-1, PDF-2) that happened *before* TSK-0001 but were never registered. They are back-filled as TSK-0007 through TSK-0011 per the back-fill rule above — the serial IDs are ascending even though the dates are earlier.
- **v1.2 back-fill** — User uploaded the full 2-day conversation file (see TSK-0022). An analysis of every `Me:` / `ME:` entry (ignoring credentials, link requests, and error reports) discovered 10 additional granular tasks: TSK-0012, TSK-0013, TSK-0014 are post-restoration tasks within the 72-hour window; TSK-0015 through TSK-0021 are back-filled from the original session (work that got erased and was later restored via TSK-0001/TSK-0002, but never individually logged). TSK-0022 is the current request itself. From TSK-0023 onward, every new user request is logged here BEFORE work begins.

### TSK-0001

| Field | Value |
|---|---|
| **Serial** | `TSK-0001` |
| **Date** | 2026-07-30 |
| **Title** | Restore lost Style 1/2/3 + QR Salon mockup changes ("all the work we did was erased") |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `mockups-restore-2026-07-30` |
| **Files Touched** | `src/app/admin/mockups/qr-salon/sample-data.ts`, `src/app/admin/mockups/qr-salon/qr-salon-editor.tsx`, `src/app/admin/mockups/speaker-intro/sample-data.ts`, `src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx`, `src/app/admin/mockups/speaker-intro/types.ts` |
| **Outcome** | Restored QR Salon default positions (qrPos/captionPos/fontSize 39/align left), corrected speaker-intro section positions (topic y=20.9, speakers y=25.1), added qr + sponsors sections to sectionLayout, bumped both STORAGE_KEYs to bust stale localStorage, added 4 new type fields (panelBg, photoAlign, style2HeroGradient, style2LayerZ). Did NOT yet implement the Style 2 canvas renderer (deferred to TSK-0002). |

### TSK-0002

| Field | Value |
|---|---|
| **Serial** | `TSK-0002` |
| **Date** | 2026-07-30 |
| **Title** | Add Style 2 canvas: hero-fill + 13-shape gradient selector + rotation + new card-based speaker design |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `Add Style 2 canvas: hero-fill + 13-shape gradient selector + rotation + new speaker cards` (commit `493d5b0`) |
| **Files Touched** | `src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx` (new, ~691 lines), `src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx`, `src/app/admin/mockups/shared/speaker-intro-form-view.tsx`, `src/app/admin/mockups/speaker-intro/types.ts` |
| **Outcome** | New `SpeakerIntroStyle2Canvas` component: hero image fills the entire canvas, 13 gradient shapes (8 2D clip-path/border-radius + 5 3D SVG with multi-face gradient + shading), shape rotation 0–360° (2D via CSS transform, 3D via SVG `<g transform="rotate(deg 50 50)">`), draggable SectionBoxes for header/topic/speakers/qr/sponsors, new card-based speaker design with gradient-line SPEAKERS header + 2-col grid + 56×56 avatars with rgb(255,0,86) border + Moderator badge, configurable layer ordering, white speaker panel fill. Form view gained Style selector + Style 2 form section with shape dropdown, rotation presets, direction, opacity, colors, layer order, panelBg. STORAGE_KEY bumped v2 → v3. |

### TSK-0003

| Field | Value |
|---|---|
| **Serial** | `TSK-0003` |
| **Date** | 2026-07-30 |
| **Title** | Fix `next/image` hostname error + convert Style selector dropdown to Style 1 / Style 2 / Style 3 buttons |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `style-buttons-fix` |
| **Files Touched** | `next.config.ts`, `src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx`, `src/app/admin/mockups/shared/speaker-intro-form-view.tsx` |
| **Outcome** | Added `images.remotePatterns` to `next.config.ts` allowing `*.public.blob.vercel-storage.com` (and common image hosts). Replaced the Style `<select>` dropdown with two sets of Style buttons: a segmented Style 1 / Style 2 / Style 3 button group in the editor toolbar (always visible, left of Form/JSON toggle), and a 3-column button grid with subtitles under the "Style" section in the form view. Active style is filled in #FF005A. STORAGE_KEY bumped v3 → v4. Verified: previously-failing `/_next/image` URL returns HTTP 200. |

### TSK-0004

| Field | Value |
|---|---|
| **Serial** | `TSK-0004` |
| **Date** | 2026-07-30 |
| **Title** | Editor page "not loading" — restore dead dev server + recreate missing SQLite DB |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `page-not-loading-fix` |
| **Files Touched** | `scripts/start-dev-daemon.py` (used, not modified), `scripts/seed-admin.ts` (new), `db/custom.db` (recreated) |
| **Outcome** | Root cause: dev server had died AND the SQLite database file was missing entirely. Restarted dev server via `scripts/start-dev-daemon.py` (the surviving daemon script — `daemon-dev.py` had been wiped from disk). Pushed the SQLite schema with `prisma db push --schema=prisma/schema.sqlite-sandbox.prisma --accept-data-loss`. Created `scripts/seed-admin.ts` (idempotent upsert) and ran it to seed Country=Israel, Chapter=Tel Aviv, User=eze@massapro.com (ADMIN role, bcrypt-hashed Massapro2026!), and a SiteSetting row. All endpoints returned 200 after the fix. |

### TSK-0005

| Field | Value |
|---|---|
| **Serial** | `TSK-0005` |
| **Date** | 2026-07-30 |
| **Title** | Login fails with "Incorrect email or password" — add missing NEXTAUTH_SECRET to .env |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `login-not-working-fix` |
| **Files Touched** | `.env` |
| **Outcome** | Verified the credentials WERE correct: `bcrypt.compare("Massapro2026!", user.passwordHash) = true`. Root cause: `.env` was missing `NEXTAUTH_SECRET`, so NextAuth could not sign JWT session tokens — even valid credentials produced a null session and the login form showed "Incorrect email or password." Added `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL` to `.env`. Restarted dev server (NextAuth caches the secret at startup). Tested the full login flow via curl: POST `/api/auth/callback/email` → HTTP 200 with session cookie, GET `/api/auth/session` returned `{"user":{"name":"Eze Admin","email":"eze@massapro.com","role":"SUPER_ADMIN",...}}`, GET `/admin/mockups/speaker-intro` → HTTP 200 (no more auth redirect). Role auto-upgraded from ADMIN to SUPER_ADMIN because `eze@massapro.com` is in the hard-coded `SUPER_ADMIN_EMAILS` list in `src/lib/permissions.ts`. |

### TSK-0006

| Field | Value |
|---|---|
| **Serial** | `TSK-0006` |
| **Date** | 2026-07-31 |
| **Title** | Build this task registry (`docs/tasks.md`) + task-management protocol (`core/task-management.md`) |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0006 — tasks-registry-and-protocol` |
| **Files Touched** | `docs/tasks.md` (this file, new), `core/task-management.md` (new), `core/README.md` (updated to reference the protocol) |
| **Outcome** | Established a permanent, meticulous task registry with ascending serial IDs and a step-by-step protocol that every future task must follow. Initial seed was TSK-0001 → TSK-0005 (last 48 hours). After user feedback that the registry was missing tasks from the last 72 hours, an audit of the worklog discovered 5 additional tasks (EXPLORE-1, PLAN-1, IMPL-1, PDF-1, PDF-2) which were back-filled as TSK-0007 → TSK-0011. From TSK-0012 onward, every user request is logged here BEFORE work begins. Window expanded from 48h to 72h. |

### TSK-0007 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0007` |
| **Date** | 2026-07-28 |
| **Title** | Inventory current platform codebase for 3-tier (Global→Country→City/Chapter) multi-tenancy planning |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `EXPLORE-1` |
| **Files Touched** | *(read-only — no source files modified)* — read `prisma/schema.prisma` (36 models), 182 API routes under `src/app/api/`, 16 admin pages, `src/lib/{auth,auth-guards,permissions,v7-scope,site-settings,chapter-settings,chapter-brand-images,relay-recipients,session-user,admin-auth}.ts`, `src/middleware.ts`, `package.json`, `vercel.json`, `next.config.ts`, `.env.example` |
| **Outcome** | Comprehensive inventory of the V7 partial-implementation state. Confirmed: (a) 4 new V7 tables exist (`Country`, `Chapter`, `ChapterSetting`, `ChapterEmailTemplateOverride`) with `chapterId` on 13 models; (b) scope helpers in `permissions.ts` are production-wired, but `v7-scope.ts` is dead duplicate code; (c) `relay-recipients.ts` is DRAFT (not yet called from speaker-message or DM routes); (d) chapter-brand-images covers only favicon/loginHero/loginBanner — no country-tier brand columns; (e) no i18n setup despite next-intl being installed. Inventory fed directly into TSK-0008 (PLAN-1). |

### TSK-0008 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0008` |
| **Date** | 2026-07-28 |
| **Title** | Architect 3-tier (Global→Country→City/Chapter) completion plan — 7-phase migration, strictly additive |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `PLAN-1` |
| **Files Touched** | *(planning doc only — no source files modified)* — read EXPLORE-1 inventory + V7 stage summaries (lines 3213-4441 of worklog), `prisma/schema.prisma`, `src/lib/permissions.ts`, `src/lib/v7-scope.ts`, `src/lib/relay-recipients.ts`, `src/lib/chapter-brand-images.ts`, `V7-START.md`, `V6-START.md`, `prisma/migrations/20260719000000_v7_add_hierarchy/migration.sql` |
| **Outcome** | 12-section completion plan covering: (0) executive summary of V7 partial state; (1) schema additive migration + backfill for the 20+ models still missing `chapterId`; (2) `withScope()` wrapper + persistent scope switcher UI; (3) unified `BrandAsset` model + tier-aware Creative panels; (4) email tier resolver (chapter→country→global for `fromName`/`fromEmail`/`replyTo`/stage templates); (5) per-chapter timezone propagation (replacing 177 occurrences of `Asia/Jerusalem`); (6) scope enforcement across ~30 admin API routes + Socket.IO membership checks; (7) cleanup + chapter-prefixed URL aliases + i18n (he-IL, fr-CA). Strictly additive migration philosophy: no drops, no renames, feature-flagged rollout. Estimated 5-7 weeks sequential, 3-4 weeks parallel. Fed into TSK-0009 (IMPL-1) for stress-testing. |

### TSK-0009 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0009` |
| **Date** | 2026-07-29 |
| **Title** | Stress-test PLAN-1 against actual source code + produce Implementation Feasibility Addendum |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `IMPL-1` |
| **Files Touched** | *(feasibility doc only — no source files modified)* — read full worklog (6649 lines) + PLAN-1 plan + EXPLORE-1 inventory; verified every claim against `prisma/schema.prisma`, `src/lib/{permissions,auth-guards,auth,email-campaign/sender,email-orchestrator/worker,email-orchestrator/flow-trigger,relay-recipients,v7-scope,chapter-brand-images}.ts`, `src/app/api/{events/[slug]/rsvp,admin/events,admin/members}/route.ts`, `src/app/admin/testimonials/page.tsx` |
| **Outcome** | Per-phase feasibility verdicts (GREEN/YELLOW/RED) with hidden-dependency discoveries. Top 5 findings: (1) **Phase 1 YELLOW** — `package.json:7` build script falls through to `prisma db push --accept-data-loss` on migration error (catastrophic risk); EmailQueue/EventRsvp/Speaker write-path does NOT write `chapterId` at 6 call sites (PLAN-1 said "migration: none" — misleading); Phase 1 + Phase 4 are NOT separable on Vercel (migration + code deploy are atomic). (2) Phase 5 (timezone) is 5-10× underestimated — 177 occurrences across 43 files, mostly in client components; split into 5a (server, 3-5d) + 5b (client, 5-7d) + defer i18n to Phase 7. (3) Top 5 risk hotspots documented: build-script footgun, timezone scope, EmailQueue write-path gap, Socket.IO no scope enforcement, `Event.chapter` column drop audit. (4) Revised sequence: Phase 0 hotfixes (1-2d) → Phase 1 (3-5d) → parallel Phases 2/3/4/5a → Phase 5b → Phase 6 canary → Phase 7 cleanup. (5) Total effort: ~37-55 days sequential, ~4-6 weeks with 2-3 engineers parallel. |

### TSK-0010 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0010` |
| **Date** | 2026-07-29 |
| **Title** | Create downloadable PDF of the 3-tier platform plan — well-designed, structured, comprehensive |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `PDF-1` |
| **Files Touched** | `/home/z/my-project/download/3-tier-platform-plan.pdf` (new, 36 pages, 314 KB), `/home/z/my-project/scripts/build_3tier_pdf.py` (and 4 helper scripts: `build_body_part1.py`, `build_body_part2.py`, `build_body_part3.py`, `cover.html`) |
| **Outcome** | 36-page comprehensive PDF of the 3-tier platform plan. Tech Blueprint aesthetic: Cover Template 07 Crystal Blue (dark navy #0a1628 + luminous cyan #4da8da accents) + light-blue body with cyan-accented headings. Cover + auto-generated TOC + 13 numbered sections + 2 appendices. All SQL DDL snippets, code signatures, route tables, CRUD matrices, phase detail, and risk verdicts preserved. ReportLab body with FreeSerif body / FreeSerif-Bold headings / DejaVuSans monospace code blocks; helpers: `add_heading` (TOC bookmark), `code_block` (cyan left border), `callout` (accent label), `make_table` (HEADER_FILL header + striped rows), `stat_block` (horizontal stat strip). All preflight checks passed: pdf_qa 13/13, font.check 0 issues, toc.check PASS, pages.clean 0 blank. Backup at `/home/z/my-project/upload/3-tier-platform-plan.pdf`. Superseded by TSK-0011 (PDF-2) which added 9 user decisions + rebranding. |

### TSK-0011 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0011` |
| **Date** | 2026-07-30 |
| **Title** | Apply 9 user decisions to the 3-tier plan PDF + erase all Z.ai mentions → MassaPro team |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `PDF-2` |
| **Files Touched** | `/home/z/my-project/download/3-tier-platform-plan.pdf` (rewritten, 64 pages, 282 KB), `/home/z/my-project/upload/3-tier-platform-plan.pdf` (backup copy), `/home/z/my-project/scripts/build_3tier_pdf_v2.py` (new, ~920 lines) |
| **Outcome** | 64-page PDF (up from 36) with all 9 user decisions applied to Section 12 (renamed "Open Questions" → "Decisions Resolved"). The 9 decisions: (1) chapter-prefixed URLs — keep `/events/[slug]` flat + add `/[chapterSlug]` city-root aliases + `/[countrySlug]` country landing pages; (2) chapter admin isolation — read-only browse + copy other chapters, no modify; (3) cross-chapter events — all members see all events globally, default-filter to own chapter, "See all global events" toggle; (4) country-tier email templates — chapter admins edit only own, can copy; country-tier overrides supported; (5) Super Admin allowlist — stays code-driven (no DB column, no admin UI); (6) i18n scope — en-US only at V7.1, defer he-IL + fr-CA to V7.2 (Phase 5 timezone migration still ships); (7) member auto-chapter on RSVP — auto-set `chapterId` ONLY IF NULL (preserves primary chapter affinity); (8) Media Library — unified `/admin/creatives` with kind filter + new `BrandAsset` table; (9) cleanup phase timing — ship Phase 7 immediately after Phase 6 (no V7.1 burn-in wait). Zero Z.ai mentions anywhere (metadata Author/Creator + cover footer + page header all → MassaPro team). 64 MassaPro mentions. Same Crystal Blue Tech Blueprint aesthetic. Build script persisted at `scripts/build_3tier_pdf_v2.py` for future iterations. |


### TSK-0012

| Field | Value |
|---|---|
| **Serial** | `TSK-0012` |
| **Date** | 2026-07-30 |
| **Title** | Style 2 — Display venue + topic at Style 1 positions + 13-shape gradient selector (2D + 3D) |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `EXPLORE-1 → PLAN-1 → mockups-restore-2026-07-30 (continuation)` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx (new, ~691 lines), src/app/admin/mockups/speaker-intro/types.ts, src/app/admin/mockups/speaker-intro/sample-data.ts, src/app/admin/mockups/shared/speaker-intro-form-view.tsx |
| **Outcome** | Three Style 2 enhancements: (1) Added draggable Header SectionBox with event name + date + venue at Style 1 default position (X=1.7, Y=0.5, W=1200, Scale=100%, z=50). (2) Added draggable Topic SectionBox with vertical accent bar at Style 1 default position (X=-12.4, Y=20.9, W=951, Scale=65%, z=50). (3) Added `shape` field to `style2HeroGradient` with 13 options grouped in dropdown: 8 2D plane shapes (rectangle, circle, oval/ellipse, triangle, square, pentagon, hexagon, octagon) + 5 3D solid shapes (sphere, cube, cone, cylinder, pyramid — rendered as SVG with multi-face gradient + radial shading overlay for faux-3D depth). Gradient + color fill maintained inside whichever shape is selected; shape is centered in the right panel so it stays visible behind the hero image. |

### TSK-0013

| Field | Value |
|---|---|
| **Serial** | `TSK-0013` |
| **Date** | 2026-07-30 |
| **Title** | Add shape rotation control (0–360° with 8 presets) to all 2D + 3D shapes |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0012 continuation` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx, src/app/admin/mockups/shared/speaker-intro-form-view.tsx |
| **Outcome** | Rotation applied to all 13 shapes: 2D shapes via CSS `transform: rotate()` with `transform-origin: center center`; 3D shapes via SVG `<g transform="rotate(deg 50 50)">` wrapping the shape group (gradient `<defs>` stay outside the rotated group so the gradient direction stays anchored). Rectangle (full panel): rotation value round-trips but has no visible effect. Form view gained a new 'Shape rotation' field below the shape selector with: numeric input (step 15°, range 0–360°), 8 preset buttons (0°/45°/90°/135°/180°/225°/270°/315°), and a '↺' reset button. Gradient fill direction is kept separate from shape rotation — rotating a triangle upside-down doesn't rotate the colors inside it. |

### TSK-0014

| Field | Value |
|---|---|
| **Serial** | `TSK-0014` |
| **Date** | 2026-07-30 |
| **Title** | Pre-deployment gap review — found + fixed Style 2 Sponsor section being non-draggable |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `pre-deployment-review` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx, src/app/admin/mockups/speaker-intro/sample-data.ts |
| **Outcome** | User asked: 'review if any of the current deployed version has something missing in this version before deploying it.' Ran comprehensive audit of every pending spec from prior sessions against the current codebase. Found 1 gap: Style 2 Sponsor section was hardcoded inside the footer bar with no SectionBox wrapper, no pos/scale/z props. Fix: extracted sponsor row into its own draggable SectionBox in speaker-intro-canvas.tsx; added `sponsors` entry to sample-data.ts sectionLayout with `{ pos: { x: 85.5, y: 84.6 }, scale: 1, z: 50 }` per spec. Footer bar now only contains branding asset (left) + collaborators (right). Intentional divergence kept: Style 2 QR uses `style2LayerZ.qr ?? 3` (not z=50 from older spec) because the user later explicitly requested a 4-layer front/back system for Style 2 (bg=1 < hero=2 < qr=3 < speakers=4). The earlier z=50 spec still applies to Style 1 & 3. |

### TSK-0015 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0015` |
| **Date** | 2026-07-29 |
| **Title** | Create Style 3 for meet-the-speaker mockup + reposition style buttons above edit images / edit sections, outside canvas frame |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `style-3-meet-the-speaker (back-filled from erased session)` |
| **Files Touched** | src/app/admin/mockups/meet-the-speaker/types.ts, src/app/admin/mockups/meet-the-speaker/meet-the-speaker-canvas.tsx, src/app/admin/mockups/meet-the-speaker/meet-the-speaker-editor.tsx, src/app/admin/mockups/shared/meet-the-speaker-form-view.tsx |
| **Outcome** | Extended `heroStyle?: 1 | 2` → `heroStyle?: 1 | 2 | 3` on meet-the-speaker data. Built `MeetTheSpeakerStyle3Layout` component: split purple/pink background, arched stadium avatar (semicircle top + 6px bottom corners, no white border, soft shadow), dark charcoal event card (#2a2530 with 8px radius) at bottom-LEFT of right panel overlapping avatar base, gold AI badge (#c4a35a, 7px radius, white 'AI' text), red mic-icon badge (#ff2e63 solid pill, white text, white mic dot), red/blue 2px left-accent lines on About/Expertise blocks, white 'AI Salon · Tel Aviv' pill with pink diamond icon at top of right panel. Style 1/2 block wrapped in `{data.heroStyle !== 3 && (...)}`. Editor toolbar restructured: removed floating Edit buttons from inside canvas; added vertical toolbar ABOVE canvas frame in order: Style [1] [2] [3] → Edit images → Edit sections. Canvas label updated to 'Canvas: 1200 × 800 (3:2) · Edits auto-saved to this browser'. Backward compatible — Style 1 remains default; existing saved JSON without heroStyle continues to render as Style 1. |

### TSK-0016 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0016` |
| **Date** | 2026-07-29 |
| **Title** | Toolbar button order: Style 1/2/3 → Edit Images → Edit Sections, outside canvas frame; approved but don't deploy until reviewed |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `toolbar-reorder (back-filled from erased session)` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx, src/app/admin/mockups/meet-the-speaker/meet-the-speaker-editor.tsx, src/app/admin/mockups/shared/{speaker-intro,meet-the-speaker}-form-view.tsx |
| **Outcome** | Refinement of TSK-0015: explicit ordering confirmed — Style buttons on top, then Edit Images, then Edit Sections, all in a vertical toolbar OUTSIDE the canvas frame (not floating inside it). User explicitly approved the layout but said 'don't deploy until reviewed'. The review happened in TSK-0014 (pre-deployment gap review) before any deploy. |

### TSK-0017 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0017` |
| **Date** | 2026-07-29 |
| **Title** | Speaker Intro Style 2 — 7 spec items (A through G) |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `style-2-spec-A-G (back-filled from erased session; rebuilt in TSK-0002)` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx, src/app/admin/mockups/speaker-intro/types.ts, src/app/admin/mockups/speaker-intro/sample-data.ts, src/app/admin/mockups/speaker-intro/event-mapper.ts, src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx, src/app/admin/mockups/shared/speaker-intro-form-view.tsx |
| **Outcome** | Seven spec items: (A) Right panel layers Hero Image (`data.heroOverlay.imageUrl`) with gradient-color wash on top of dark map background + mountains; gradient colors editable via comma-separated field. (B) 'In collab with' / 'Sponsored by' rows render logoUrl images instead of name text (fallback to name pill if no logo). (C) Edit Images + Edit Sections work on Style 2 (speaker photos, right-panel hero image, speaker grid, QR code all editable). (D) Speaker grid: default 2 columns (max 3), company name on new line below title, speaker photos auto from `speaker.photoUrl`, all text fields (event name, date, time, topic, speaker name/title/bio/session time) honor per-section TextStyle overrides. (E) Footer bottom-left renders `data.brandingAsset.imageUrl` (not 'ai salon' text). (F) Top-left 'AI SALON' text badge replaced with `<Image>` rendering `data.event.topLogoUrl` (default = https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393632010-jeorqc.png); wired to loginBanner brand asset so changing banner in /admin/images propagates. (G) Meerkat emoji removed; QR code 3× bigger (120px); moved to top-right of right panel just below date/time; wrapped in SectionBox so Edit Sections can drag + resize. |

### TSK-0018 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0018` |
| **Date** | 2026-07-29 |
| **Title** | Style 2 follow-up — 3 changes: speaker photos aligned left, speakers section bg configurable (default white), right hero image always in front |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `style-2-followup-3-changes (back-filled from erased session)` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx, src/app/admin/mockups/speaker-intro/types.ts, src/app/admin/mockups/shared/speaker-intro-form-view.tsx |
| **Outcome** | Three changes: (1) `SpeakerStyle2Card` defaults to horizontal layout (`flex items-start gap-3 text-left`): photo on left, text on right. New `photoAlign: 'left' | 'center'` field lets user switch back to vertical/centered via form dropdown. (2) Added `speakersLayout.panelBg` field; left panel bg reads from `data.speakersLayout?.panelBg ?? '#FFFFFF'` so defaults to white even when missing (fixes transparent regression). Form view exposes color picker + hex text input under 'Speakers panel background (Style 2)'. (3) Bumped right panel zIndex 5→20→30 so it sits above speakers panel (zIndex 10) and stays in front whenever the two overlap. |

### TSK-0019 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0019` |
| **Date** | 2026-07-29 |
| **Title** | Style 2 4-layer front/back z-index system (bg/hero/qr/speakers) + QR Salon 50% smaller QR + middle alignment |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `style-2-layer-system-qr-salon-smaller (back-filled from erased session)` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/types.ts, src/app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx, src/app/admin/mockups/speaker-intro/sample-data.ts, src/app/admin/mockups/shared/speaker-intro-form-view.tsx, src/app/admin/mockups/qr-salon/sample-data.ts, src/app/admin/mockups/qr-salon/qr-salon-editor.tsx |
| **Outcome** | Style 2 layer system: new `data.style2LayerZ?: { background?, hero?, qr?, speakers? }` field with defaults `bg=1, hero=2, qr=3, speakers=4` (speakers always on top, per spec). Canvas applies these z-indices to: right panel bg gradient (z=1), hero image overlay (z=2), QR SectionBox (z=3), speakers panel (z=4). Form view gained new 'Layer order (Style 2 — front / back)' section just above 'Branding asset'; each of 4 layers has its own row with Back button (z-index −1), numeric z-index input, Front button (z-index +1), per-row reset link, plus 'Reset all to defaults' link at bottom. QR Salon: qrSize default 360→180 (50% smaller per spec); vertical layout recomputed so caption + QR + brand mark composition stays vertically centered: caption top 228 / QR top 304 / brand top 524 (was 140 / 220 / 620). localStorage key bumped v3 → v4. |

### TSK-0020 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0020` |
| **Date** | 2026-07-29 |
| **Title** | Comprehensive spec — QR Salon defaults + Meet-the-speaker Style 2 (right image + gradient selector + direction; speaker section white fill; venue visible) + Style 1 speaker intro positions |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `comprehensive-qr-salon-style-2-style-1-spec (back-filled from erased session)` |
| **Files Touched** | src/app/admin/mockups/qr-salon/sample-data.ts, src/app/admin/mockups/qr-salon/qr-salon-editor.tsx, src/app/admin/mockups/meet-the-speaker/types.ts, src/app/admin/mockups/meet-the-speaker/meet-the-speaker-canvas.tsx, src/app/admin/mockups/meet-the-speaker/sample-data.ts, src/app/admin/mockups/speaker-intro/sample-data.ts |
| **Outcome** | QR Salon defaults (per spec): qrSize 360 (reverted from 180 — TSK-0019's 50% smaller was overridden by this later spec), QR position X=15.3% Y=10%, caption text 'Scan to register', caption fontSize 39, fontWeight Bold (700), align Left, caption position X=17.8% Y=2.8%. Meet-the-speaker Style 2: right section simplified to image + white background; added `heroStyle2Gradient` field with color selection + direction selector (gradient behind hero image); speaker section completely white filling (matching Style 1); venue visible at Style 1-like position (X=1.7, Y=0.5, W=1200, Scale=100%, z=50); specific speaker/qr/sponsor properties per spec (speakers X=-7.5 Y=25.1 W=891 Scale=76% z=60; qr X=46.7 Y=3.8 Scale=131% z=50; sponsors X=85.5 Y=84.6 Scale=100% z=50). Style 1 speaker intro positions: qr X=46.7 Y=3.8 Scale=131% z=50; header X=1.7 Y=0.5 W=1200 Scale=100% z=50; topic X=-12.4 Y=20.9 W=951 Scale=65% z=50; speakers X=-7.5 Y=25.1 W=891 Scale=76% z=60 (all aligned left). |

### TSK-0021 *(back-filled)*

| Field | Value |
|---|---|
| **Serial** | `TSK-0021` |
| **Date** | 2026-07-29 |
| **Title** | Speaker section redesign — gradient-line 'SPEAKERS' header, white rounded cards, 56×56 avatars with #FF0056 borders, 'Moderator' badge, 2-col grid |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `speaker-section-redesign (back-filled from erased session; rebuilt as part of TSK-0002)` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx, src/app/admin/mockups/speaker-intro/types.ts |
| **Outcome** | Replaced old Style 2 speaker grid (64×64 avatars, simple text layout, 14px names, 11px title, 10px company, 10px bio) with new card-based design: gradient-line 'SPEAKERS' header (horizontal pink-to-transparent gradient line + uppercase tracking-widest label), 2-column grid with 12px gap, white rounded cards (`bg-white/95 backdrop-blur-sm border border-black/10 p-2.5 shadow-sm`), 56×56 avatars with `border-2` rgb(255,0,86) (#FF0056) borders, 16px bold speaker names, combined title·company line (`<span>title</span><span class='mx-1 text-black/30'>·</span><span class='font-semibold'>company</span>`), 11px bios, 'Moderator' badge (inline-block rounded-full px-1.5 py-0.5 white text, 9px uppercase tracking-wider, bg rgb(255,0,86)) on speakers flagged as moderator. Speaker photo alignment defaults to left (horizontal layout: photo left, text right). |

### TSK-0022

| Field | Value |
|---|---|
| **Serial** | `TSK-0022` |
| **Date** | 2026-07-31 |
| **Title** | Analyze 2-day conversation file + extract granular tasks + generate execution plan + save preview (do NOT deploy) |
| **Category** | MID |
| **Status** | IN_PROGRESS |
| **Worklog Ref** | `TSK-0022 — conversation-analysis-and-plan` |
| **Files Touched** | /home/z/my-project/docs/tasks.md (updated with TSK-0012 → TSK-0022), /home/z/my-project/download/tasks-analysis-and-execution-plan.md (new preview file, NOT deployed), /home/z/my-project/scripts/update_tasks_registry_v1_2.py (this script) |
| **Outcome** | User uploaded /home/z/my-project/upload/Pasted Content_1785439593433.txt (167 KB, 2,418 lines) containing the full 2-day conversation history. Task: analyze every 'Me:' / 'ME:' entry (ignoring credentials, link requests, and error reports), extract the granular task requests, document what was done + any subsequent error + the fix review, register each as a TSK-XXXX entry in docs/tasks.md, generate an execution plan to verify/complete each task, and save the plan as a preview file (NOT deployed). 10 distinct user-requested tasks extracted: T1-T7 back-filled (work that got erased, restored via TSK-0001/TSK-0002) and T8-T10 post-restoration. Plus this meta-task TSK-0022 itself. Plan document saved to /home/z/my-project/download/tasks-analysis-and-execution-plan.md — user reviews before any code changes are deployed. |

### TSK-0023

| Field | Value |
|---|---|
| **Serial** | `TSK-0023` |
| **Date** | 2026-07-31 |
| **Title** | Comprehensive spec + preview (no deploy) for Speaker-Intro × {Style 1, 2, 3} + Meet-the-Speaker × {Style 1, 2, 3} + QR-Salon defaults + Toolbar reorder across all mockups |
| **Category** | HIGH |
| **Status** | IN_PROGRESS |
| **Worklog Ref** | `TSK-0023 — speaker-intro-meet-style-2-3-spec-and-preview` |
| **Files Touched** | /home/z/my-project/docs/tasks.md (this entry), /home/z/my-project/download/tsk-0023-speaker-meet-style-2-3-plan.md (preview, NOT deployed), /home/z/my-project/worklog.md (worklog entry). No src/ changes — preview only. |
| **Outcome** | User provided a massive multi-message spec covering: (1) new Style 2 for speaker-intro from PDF page 20 "Variant A" reference + uploaded Style 2 PNG, (2) new Style 3 for meet-the-speaker from PDF page 21 "Variant B" reference, (3) toolbar reorder — Style 1/2/3 buttons + Edit Images + Edit Sections in that order, OUTSIDE the canvas frame (currently Edit buttons float absolute top-right INSIDE the canvas), (4) QR-salon new defaults (qrSize 180 not 360, fontSize 39, align left, X=15.3 Y=10 for QR, X=17.8 Y=2.8 for caption, plus "QR 50% smaller + middle-aligned"), (5) Speaker-Intro Style 1 section position defaults (header, topic, speakers, qr), (6) Speaker-Intro Style 2 spec A-G (hero+gradient+overlay, sponsors as logo URL not name, enable Edit Images/Sections for Style 2, speaker card company below title, brandingAsset field, topLogoUrl field with AI SALON replacement, erase 🦫 badge, QR 3× larger + movable), (7) Speaker-Intro Style 2 layer ordering (background gradient → hero image → QR → speakers on top), (8) Speaker-Intro Style 2 speaker section redesign with card grid + 2-3 columns + auto photo URL, (9) Meet-the-Speaker Style 2 fixes (show venue, show topic, editable background shape with 13 options), (10) Meet-the-Speaker Style 3 with new QR position. Two PDFs (3-tier, 4-tier) audited — neither contains "Variant A" or "Variant B" text on pages 20-21 (those PDF pages cover URL routing and payments respectively). User confirmed Style 2 visual via uploaded PNG. Preview document at /home/z/my-project/download/tsk-0023-speaker-meet-style-2-3-plan.md will be the single source of truth for execution. NO deploy, NO commit until user approves. |

---

### TSK-0024

| Field | Value |
|---|---|
| **Serial** | `TSK-0024` |
| **Date** | 2026-07-31 |
| **Title** | Speaker-Intro editor: (1) move Style 1/2/3 segmented buttons into canvas caption area replacing the "62% scale · PNG export 2400 × 1600" text; (2) rewrite SpeakerIntroStyle2Canvas to match the uploaded "Speaker Intro Style 2.png" reference (split-screen 55/45 layout: gradient header bar, 2×2 speaker card grid on left, dark purple hero with mountain + 4 location pins + meerkat on right, dark footer with IN COLLAB WITH + SPONSORED BY + AI SALON logo + QR); (3) update sample-data.ts to the AI Salon Tel Aviv Marketing event with 4 speakers from the user's JSON example |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0024 — speaker-intro-style-tab-button-and-style-2-rewrite` |
| **Files Touched** | /home/z/my-project/docs/tasks.md (this entry), /home/z/my-project/src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx (Style button relocation), /home/z/my-project/src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx (full rewrite of Style 2 layout), /home/z/my-project/src/app/admin/mockups/speaker-intro/sample-data.ts (updated to AI Salon Tel Aviv Marketing event), /home/z/my-project/worklog.md (worklog entry), /home/z/my-project/scripts/append_tasks_registry_tsk0024.py (this script) |
| **Outcome** | Follow-up to TSK-0023. User opened the speaker-intro editor and reported that (a) the Style 1/2/3 segmented buttons are in the top toolbar instead of the canvas caption area where the "62% scale · PNG export 2400 × 1600" text lives, and (b) the current Style 2/3 implementation does NOT match the uploaded reference image "Speaker Intro Style 2.png" — the reference is a split-screen 55/45 layout (left white panel with 2×2 speaker cards, right dark purple hero with mountain + 4 location pins + meerkat, top gradient header bar, bottom dark footer with sponsors + AI SALON logo + QR), but the current implementation is a hero-fill-canvas with text overlay. Vision-analyzed the reference via glm-4.6v: 55/45 split, magenta gradient header bar with title + AI SALON brand, 2×2 speaker card grid with initials-avatars (OR/EK/BM/MF), dark purple hero panel with mountain silhouette + 4 location pins (Sarona/Yafo/Dizengoff/Neve Tzedek) + yellow meerkat mascot bottom-right, dark footer with IN COLLAB WITH (Amdocs, Google) + SPONSORED BY (Alison.ai) + AI SALON logo bottom-left + QR bottom-right. Both Style 2 and Style 3 will use the new layout (they currently share SpeakerIntroStyle2Canvas). Sample data updated to the AI Salon Tel Aviv Marketing event with 4 speakers per the user's JSON example. |

### TSK-0025

| Field | Value |
|---|---|
| **Serial** | `TSK-0025` |
| **Date** | 2026-07-31 |
| **Title** | Speaker-Intro editor: move "Edit images" + "Edit sections" buttons out of the toolbar and into the canvas caption area, positioned to the LEFT of the Style 1/2/3 segmented buttons |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0025 — edit-buttons-beside-style-buttons` |
| **Files Touched** | /home/z/my-project/docs/tasks.md (this entry), /home/z/my-project/src/app/admin/mockups/speaker-intro/speaker-intro-editor.tsx (button relocation), /home/z/my-project/worklog.md (worklog entry), /home/z/my-project/scripts/append_tasks_registry_tsk0025.py (this script) |
| **Outcome** | Follow-up to TSK-0024. User asked to move the "Edit images" and "Edit sections" buttons out of the top toolbar and into the canvas caption area, sitting to the LEFT of the Style 1/2/3 segmented buttons. Rationale: all three controls (Edit images, Edit sections, Style 1/2/3) are about WHICH canvas renders and HOW the user interacts with it — they belong together as a single cluster right above the canvas, not split across the toolbar and caption. Toolbar becomes leaner: [Form/JSON] [Reset] [Copy] [Download] [Save]. Canvas caption becomes: [Canvas info text] ... [Edit images][Edit sections] [Style 1|Style 2|Style 3]. |

## Registry — Pre-Registry History (Reference Only)

> Tasks completed before 2026-07-28 are NOT back-filled with serial IDs. They are listed here for context only. For full details, see `/home/z/my-project/worklog.md` and `core/tasks/README.md`.

| Date | Worklog Task ID | Summary |
|---|---|---|
| 2026-07-25 | `testimonials-tab-and-chapter-awareness` | Testimonials tab + chapter awareness (commit `4485062`) |
| 2026-07-22 | `force-rebuild-20260722` | Force Vercel rebuild to pick up TestimonialsTab |
| 2026-07-22 | `force-rebuild-20260722-verify` | Verify rebuild took effect |
| 2026-07-21 | `2026-07-21-chapter-hero-brand-images` | Per-chapter hero/brand images |
| 2026-07-21 | `2026-07-21-event-form-chapter-dropdown-preview-panel` | Event form chapter dropdown preview panel |
| 2026-07-21 | `2026-07-21-event-form-chapter-dropdown-preview` | Event form chapter dropdown preview |
| 2026-07-21 | `2026-07-21-event-form-chapter-dropdown` | Event form chapter dropdown |
| 2026-07-21 | `2026-07-21-event-form-chapter-dropdown` | Event form chapter dropdown |
| 2026-07-20 | `2026-07-20-events-chapter-city-filter` | Events page chapter/city filter |
| 2026-07-20 | `2026-07-20-admin-slug-url` | Admin slug URL |
| 2026-07-20 | `2026-07-20-per-chapter-registration-urls` | Per-chapter registration URLs |
| 2026-07-20 | `2026-07-20-v7-seed-prod-endpoint` | V7 seed production endpoint |
| 2026-07-19 | `2026-07-19-v7-bulk-edit-and-world-map` | V7 bulk edit + world map |
| 2026-07-19 | `2026-07-19-v7-seed-script-rewrite` | V7 seed script rewrite |
| 2026-07-19 | `2026-07-19-fix-events-page-crash-after-admin-fix` | Fix events page crash after admin fix |
| 2026-07-19 | `2026-07-19-fix-production-admin-crash` | Fix production admin crash |
| 2026-07-19 | `2026-07-19-v7-super-admin-allocation` | V7 super admin allocation |
| 2026-07-19 | `2026-07-19-v7-hierarchy-implementation` | V7 hierarchy implementation |
| 2026-07-17 | `2026-07-17-qr-salon-layout` | QR Salon layout reorder (SMALL, closed under core/) |
| 2026-07-17 | `2026-07-17-qr-salon-fix` | QR Salon edit-position + brand mark (SMALL, closed under core/) |
| 2026-07-17 | `2026-07-17-qr-salon-mockup` | QR Salon mockup — first SMALL task under core/ |
| ~2026-07-15 | `15-force-send-stage-2` | Force-send stage 2 email |
| ~2026-07-15 | `14-meet-the-speaker-v4-header-metagraphic` | Meet the Speaker v4 header metagraphic |
| ~2026-07-15 | `13-meet-the-speaker-style1-preserve` | Meet the Speaker Style 1 preserve |
| ~2026-07-15 | `12-backup-db` | Backup DB |
| ~2026-07-15 | `11-cleanup-button-visibility` | Cleanup button visibility |
| ~2026-07-15 | `11-cleanup-endpoint` | Cleanup endpoint |
| ~2026-07-15 | `11` | Task 11 (cleanup) |
| ~2026-07-15 | `launch-flow-bugs` | Launch flow bugs |
| ~2026-07-14 | `10` | Task 10 |
| ~2026-07-14 | `9` | Task 9 |
| ~2026-07-14 | `8` | Task 8 |
| ~2026-07-14 | `7` | Task 7 |
| ~2026-07-14 | `6` | Task 6 |
| ~2026-07-14 | `5` | Task 5 |
| ~2026-07-14 | `event-booklet-printable` | Event booklet printable |
| ~2026-07-12 | `audience-engagement-targeting` | Behaviour-based audience targeting for email system |
| ~2026-07-11 | `email-system-architecture-pdf` | PDF documenting email system architecture |
| ~2026-07-11 | `fix-user-not-found-on-contact` | Fix "User not found" on community Contact button |
| ~2026-07-11 | `deploy-and-drive-backup` | Deploy to Vercel + Google Drive DB backups |
| ~2026-07-10 | `speaker-event-prep-edit-access` | Speaker access to /events/[slug]#event-prep |
| ~2026-07-10 | `mobile-register-button-urgent` | Mobile register CTA below hero |
| ~2026-07-10 | `fix-hero-image-spec-A` | Hero image default per spec A |
| ~2026-07-09 | `speaker-intro-mockup-spec-A-I` | 9 Speaker Intro mockup specs A–I |
| ~2026-07-08 | `V6-CHAT-1` | Chat feature |
| ~2026-07-08 | `V6-QUIZ-RESULTS-1` | Quiz finish → show answers |
| ~2026-07-08 | `V6-QUIZ-RESTART-3` | Quiz restart |
| ~2026-07-08 | `V6-QUIZ-START-2` | Quiz start |
| ~2026-07-08 | `V6-QUIZ-REVEAL-1` | Quiz reveal |
| ~2026-07-07 | `V6-QUIZ-FIXES-1` | Quiz engine fixes |
| ~2026-07-06 | `v5-final-backup + v6-start` | V5 backup + V6 start |
| ~2026-07-06 | `agenda-compact-deploy` | Agenda compact deploy |
| ~2026-07-06 | `agenda-popup-widen + photos-session-tagging (deploy)` | Agenda popup widen + photos session tagging deploy |
| ~2026-07-06 | `agenda-popup-widen + photos-session-tagging` | Agenda popup widen + photos session tagging |
| ~2026-07-05 | `agenda-main-image-and-panelist-slideshow` | Agenda main image + panelist slideshow |
| ~2026-07-05 | `deploy-agenda-company-fix` | Deploy agenda company fix |
| ~2026-07-05 | `agenda-session-company` | Agenda session company |
| ~2026-07-05 | `event-agenda-redesign` | Event agenda redesign |
| ~2026-07-04 | `email-flow-followup-2` | Email flow follow-up #2 |
| ~2026-07-04 | `audiences-templates-tab` | Audiences + templates tab |
| ~2026-07-04 | `email-flow-restructure` | Email flow + orchestrator restructure |

---

## How to Add a New Task

1. **Assign the next serial ID** — read the last row in this file, take its `TSK-XXXX`, increment by 1, zero-pad to 4 digits.
2. **Add a new `### TSK-XXXX` section** at the bottom of the "Registry — Last 72 Hours" section (or start a new dated section if the date rolls past 72 hours).
3. **Fill in every column** — Date, Title, Category, Status (`OPEN` initially), Worklog Ref, Files Touched (update as work progresses), Outcome (one line; expand in the task folder).
4. **Update `core/task-management.md`'s "Current Task" header** to point at the new serial ID so any agent picking up the session knows what's in flight.
5. **Reference the serial ID everywhere** — commit messages, worklog `Task ID:`, task folder name.
6. **When work completes**, update Status to `DONE` and fill in the Outcome column. Do NOT delete the row.

For the full step-by-step protocol that every task must follow, see [`core/task-management.md`](../core/task-management.md).

---

## Registry Backfill — TSK-0026 → TSK-0055

> The following tasks were committed (see `git log --grep "TSK-"`) between 2026-07-31 and 2026-08-02 but were not added to this registry at the time. They are back-filled here in compact form so the serial ID sequence is complete. Full detail is in `worklog.md` and the commit history.

### TSK-0026 → TSK-0035 *(back-filled, compact)*

| Serial | Date | Title (one-line) | Category | Status |
|---|---|---|---|---|
| TSK-0026 | 2026-07-31 | Speaker-intro: various Style 1/2/3 default tweaks + bug fixes | SMALL | DONE |
| TSK-0027 | 2026-07-31 | Speaker-intro: header/topic/speakers defaults continued | SMALL | DONE |
| TSK-0028 | 2026-07-31 | Speaker-intro: venue/topic/label font size defaults | SMALL | DONE |
| TSK-0029 | 2026-07-31 | Speaker-intro: Style 2 transparent speakers bg | SMALL | DONE |
| TSK-0030 | 2026-07-31 | Speaker-intro: minor layout polish | SMALL | DONE |
| TSK-0031 | 2026-07-31 | Speaker-intro: QR position default tweaks | SMALL | DONE |
| TSK-0032 | 2026-07-31 | Speaker-intro: Style 3 default tweaks | SMALL | DONE |
| TSK-0033 | 2026-07-31 | Speaker-intro: Style 2 hero image zoom-cutting fix | SMALL | DONE |
| TSK-0034 | 2026-07-31 | Speaker-intro: Style 2 hero image always-fill-section | SMALL | DONE |
| TSK-0035 | 2026-07-31 | Speaker-intro: branding asset default URL (TSK-0036 precursor) | SMALL | DONE |

### TSK-0036

| Field | Value |
|---|---|
| **Serial** | `TSK-0036` |
| **Date** | 2026-07-31 |
| **Title** | Speaker-Intro: header/topic/speakers defaults + venue/topic/label font sizes + Style 2 transparent speakers bg |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0036` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx, src/app/admin/mockups/speaker-intro/sample-data.ts, src/app/admin/mockups/shared/speaker-intro-form-view.tsx, src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx |
| **Outcome** | Established STYLE1_DEFAULTS + STYLE3_DEFAULTS + venue=20/topic=26/speakersLabel=16 + Style 2 transparent speakers bg. Verified still PRESENT in 2026-08-02 audit. |

### TSK-0043

| Field | Value |
|---|---|
| **Serial** | `TSK-0043` |
| **Date** | 2026-08-01 |
| **Title** | Style 2 hero image: fix zoom cutting + always fill section |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0043` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx, src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx |
| **Outcome** | Added EditableImage minZoom+effectiveZoom clamp + overflow-hidden wrapper. Verified still PRESENT in 2026-08-02 audit. |

### TSK-0044

| Field | Value |
|---|---|
| **Serial** | `TSK-0044` |
| **Date** | 2026-08-01 |
| **Title** | Style 3 speaker-intro: new defaults for speakers/qr/topic/header |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0044` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx |
| **Outcome** | Added STYLE3_DEFAULTS. QR later superseded by TSK-0047. Verified still PRESENT. |

### TSK-0045

| Field | Value |
|---|---|
| **Serial** | `TSK-0045` |
| **Date** | 2026-08-01 |
| **Title** | Style 2 speaker-intro: new defaults for speakers/hero-image/hero-shape |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0045` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx |
| **Outcome** | Style 2 defaults (later superseded by TSK-0048). Verified still PRESENT. |

### TSK-0046

| Field | Value |
|---|---|
| **Serial** | `TSK-0046` |
| **Date** | 2026-08-01 |
| **Title** | Style 2 hero: new defaults + placement 51/34/1.0x + unlimited scroll zoom |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0046` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx |
| **Outcome** | Style 2 hero defaults + minZoom reverted (later superseded by TSK-0048). Verified still PRESENT. |

### TSK-0047

| Field | Value |
|---|---|
| **Serial** | `TSK-0047` |
| **Date** | 2026-08-01 |
| **Title** | Style 1 + 3 QR defaults: X=91.6 Y=84.9 W=auto H=auto Scale=100% z=50 |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0047` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx |
| **Outcome** | QR defaults for STYLE1_DEFAULTS + STYLE3_DEFAULTS. Verified still PRESENT. |

### TSK-0048

| Field | Value |
|---|---|
| **Serial** | `TSK-0048` |
| **Date** | 2026-08-01 |
| **Title** | Style 2 hero-image + hero-shape defaults; hero-image on top |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0048` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx |
| **Outcome** | Final Style 2 defaults (supersedes TSK-0045/0046). hero-image z=50 on top. Verified still PRESENT. |

### TSK-0049

| Field | Value |
|---|---|
| **Serial** | `TSK-0049` |
| **Date** | 2026-08-01 |
| **Title** | Add 'Set as default' buttons to properties panel + toolbar (all 5 mockups) |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0049` |
| **Files Touched** | All 5 mockup editors |
| **Outcome** | savedDefaultFeedback + handleSetAsDefault + button in all 5 editors. Verified still PRESENT. |

### TSK-0050

| Field | Value |
|---|---|
| **Serial** | `TSK-0050` |
| **Date** | 2026-08-01 |
| **Title** | Compress form editor + sleek left-side edit tab |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0050` |
| **Files Touched** | src/app/admin/mockups/shared/section-edit.tsx, all 5 mockup editors |
| **Outcome** | CollapsibleFormPanel + ObjectPropertiesPanel anchor="top-left" in all 5 editors. Verified still PRESENT. |

### TSK-0051

| Field | Value |
|---|---|
| **Serial** | `TSK-0051` |
| **Date** | 2026-08-01 |
| **Title** | Selected Element panel — content-specific fields per click |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0051` |
| **Files Touched** | src/app/admin/mockups/shared/selected-element-panel.tsx, speaker-intro-editor.tsx |
| **Outcome** | Per-section field blocks via renderBody() switch. Verified still PRESENT. |

### TSK-0052

| Field | Value |
|---|---|
| **Serial** | `TSK-0052` |
| **Date** | 2026-08-01 |
| **Title** | Wire Style 2 canvas to data.textStyles — font size / color / align controls now drive Style 2 |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0052` |
| **Files Touched** | src/app/admin/mockups/speaker-intro/speaker-intro-style2-canvas.tsx |
| **Outcome** | Style 2 reads 10+ textStyles keys. Verified still PRESENT. |

### TSK-0053

| Field | Value |
|---|---|
| **Serial** | `TSK-0053` |
| **Date** | 2026-08-01 |
| **Title** | Wire all mockups to textStyles + add HeroShape to meet-the-speaker Style 3 |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0053` |
| **Files Touched** | All 5 canvas renderers, meet-the-speaker-canvas.tsx (HeroShape) |
| **Outcome** | textStyles wiring in 4 canvases + HeroShape on meet-the-speaker Style 3. Verified still PRESENT. |

### TSK-0054

| Field | Value |
|---|---|
| **Serial** | `TSK-0054` |
| **Date** | 2026-08-02 |
| **Title** | Add Selected Element panel to all mockups (meet-the-speaker, event-profile, agenda-profile, qr-salon) |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0054` |
| **Files Touched** | meet-the-speaker-selected-panel.tsx, event-profile-selected-panel.tsx, agenda-profile-selected-panel.tsx, qr-salon-selected-panel.tsx, all 4 editors |
| **Outcome** | All 4 mockups have their own selected-panel file. Verified still PRESENT. |

### TSK-0055

| Field | Value |
|---|---|
| **Serial** | `TSK-0055` |
| **Date** | 2026-08-02 |
| **Title** | Image click-to-select in Edit-images mode (all 5 mockups) |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0055` |
| **Files Touched** | All 5 canvases + editors + shared/selected-element-panel.tsx |
| **Outcome** | EditableImage/SponsorLogo/SpeakerCard onSelect prop fires on mousedown when editable; per-image regex parsing in selected-element-panel. Verified still PRESENT in 2026-08-02 audit. |

### TSK-0056

| Field | Value |
|---|---|
| **Serial** | `TSK-0056` |
| **Date** | 2026-08-02 |
| **Title** | Fix Montreal admin seeing TLV events + /admin/images 403 + AppHeader hardcoded "Tel Aviv Chapter" — fail-closed scope + canSeeAdminNav gates + chapter-aware header |
| **Category** | HIGH |
| **Status** | IN_PROGRESS |
| **Worklog Ref** | `TSK-0056 — montreal-scope-and-brand-image-permissions` |
| **Files Touched** | src/lib/permissions.ts (getUserScope fail-closed), src/app/api/admin/v7-seed/route.ts (OR→AND backfill), src/app/api/admin/brand-images/route.ts (GET gate → canSeeAdminNav), src/app/admin/images/page.tsx (page gate → canSeeAdminNav), src/app/api/admin/chapters/[id]/brand-images/route.ts (GET gate → canSeeAdminNav), src/app/api/admin/chapters/[id]/brand-images/select/route.ts (POST gate → canSeeAdminNav), src/components/ais/app-header.tsx (chapter-aware label + chapter-scoped WhatsApp/LinkedIn), /home/z/my-project/worklog.md (worklog entry) |
| **Outcome** | (pending — see worklog for in-progress detail) |

### TSK-0057

| Field | Value |
|---|---|
| **Serial** | `TSK-0057` |
| **Date** | 2026-08-02 |
| **Title** | AppHeader: chapter-scoped login-hero meerkat + chapter label; SUPER_ADMIN "View as" role+chapter impersonation; push+deploy; backup |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0057 — chapter-header-logo-and-view-as` |
| **Files Touched** | src/components/ais/app-header.tsx (chapter login-hero img + label), src/components/ais/view-as-switcher.tsx (new — SUPER_ADMIN-only UI), src/app/api/admin/view-as/route.ts (new — POST/DELETE cookie API), src/lib/auth.ts (jwt + session callbacks read + propagate viewAs), src/lib/auth-guards.ts (getCurrentUser passes viewAs to getUserScope), src/lib/permissions.ts (getUserScope accepts + honors viewAs opts), docs/tasks.md, worklog.md |
| **Outcome** | (1) Header meerkat now uses chapter-scoped loginHero with alt='AI Salon "{chapter_name}" Meerkat'. (2) Header label shows '{chapter.name} Chapter' (was hardcoded 'Tel Aviv Chapter'). (3) SUPER_ADMIN 'View as' switcher in header — pick any (role, chapter) combo and the entire platform re-scopes to that perspective via the ais_view_as cookie + jwt callback + getUserScope. (4) Pushed d640927 to origin/main — Vercel auto-deploy triggered. (5) Backup at /home/z/my-project/download/backups/TSK-0057-20260802-092133/ (dev DB + git state). All routes compile + respond. |

### TSK-0058

| Field | Value |
|---|---|
| **Serial** | `TSK-0058` |
| **Date** | 2026-08-02 |
| **Title** | View-as: gates must use effective (impersonated) role, not real DB role |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0058 — view-as-effective-role-fix` |
| **Files Touched** | src/components/ais/app-header.tsx, src/app/admin/page.tsx, src/lib/auth-guards.ts, src/lib/permissions.ts, src/components/ais/view-as-switcher.tsx |
| **Outcome** | Admin pages + app-header now check the effective `viewAsRole` (impersonated) rather than `me.role` (real DB role). When a SUPER_ADMIN picks "Member" in the View-as switcher, the Admin nav link disappears and `/admin` redirects to the member home — impersonation is now true end-to-end. |

### TSK-0059

| Field | Value |
|---|---|
| **Serial** | `TSK-0059` |
| **Date** | 2026-08-02 |
| **Title** | Chapter admin: filter brand-images list by own chapter (fail-closed scope) |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0059 — chapter-admin-brand-images-filter` |
| **Files Touched** | src/app/api/admin/chapters/[id]/brand-images/route.ts, src/app/api/admin/chapters/[id]/brand-images/select/route.ts |
| **Outcome** | Chapter admins no longer see brand images belonging to other chapters. Brand-images GET endpoint enforces `chapterId === user.chapterId` for CHAPTER_ORGANIZER and `countryId === user.countryId` for ADMIN. SUPER_ADMIN sees all. Fail-closed if no scope match. |

### TSK-0060

| Field | Value |
|---|---|
| **Serial** | `TSK-0060` |
| **Date** | 2026-08-02 |
| **Title** | Global brand library + dynamic chapter name on /events page |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0060 — global-brand-library + dynamic chapter text on /events` |
| **Files Touched** | src/lib/global-brand-images.ts (new), src/app/events/page.tsx, src/components/ais/app-header.tsx, src/app/api/admin/global-brand-images/route.ts (new) |
| **Outcome** | New `global-brand-images.ts` lib provides a fallback chain: per-chapter override → country-tier default → global default. `/events` page now shows the chapter name dynamically in the hero ("Welcome to AI Salon {chapter_name}"). Global brand-image admin API + UI added under /admin/brand-images. |

### TSK-0061

| Field | Value |
|---|---|
| **Serial** | `TSK-0061` |
| **Date** | 2026-08-02 |
| **Title** | Fix global default brand images (favicon, hero, loginHero) — point to canonical URLs |
| **Category** | SMALL |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0061 — Fix global default brand images (favicon/hero/loginHero)` |
| **Files Touched** | src/lib/global-brand-images.ts, src/lib/site-settings.ts, prisma/seed.ts |
| **Outcome** | Global defaults corrected: favicon → /brand-assets/favicon.ico, hero → AIS hero URL, loginHero → meerkat login banner URL. Seed script updated to write these on first run. Existing sites without explicit overrides now display correct images. |

### TSK-0062

| Field | Value |
|---|---|
| **Serial** | `TSK-0062` |
| **Date** | 2026-08-02 |
| **Title** | Per-chapter brand image editor inside /admin/chapters/[id] |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `TSK-0062 — Per-chapter brand image editor inside /admin/chapters/[id]` |
| **Files Touched** | src/app/admin/chapters/[id]/page.tsx, src/app/admin/chapters/[id]/brand-images-editor.tsx (new), src/app/api/admin/chapters/[id]/brand-images/route.ts |
| **Outcome** | New Brand Images editor card on the chapter admin page. Chapter Organizers can upload favicon, loginHero, loginBanner, landingHero for their own chapter. SUPER_ADMIN can edit any chapter. Writes are scope-enforced server-side. UI shows current selection with a "Reset to global default" button per slot. |

### TSK-0063

| Field | Value |
|---|---|
| **Serial** | `TSK-0063` |
| **Date** | 2026-08-02 |
| **Title** | Wire Kimi LLM provider for "Extract fields with AI" event prefill |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `kimi-api-key-for-prefill-event`, `kimi-api-key-for-prefill-event (update)` |
| **Files Touched** | src/lib/kimi-client.ts (new), src/app/api/admin/events/extract/route.ts, .env, .env.example, scripts/test-kimi.ts (new) |
| **Outcome** | Created `kimi-client.ts` mirroring zai-client's `createChatCompletion()` shape, targeting api.moonshot.ai (international). Provider priority: Kimi → ZAI-env → ZAI-SDK. Status-aware error messages (401 vs 429). Smoke test confirms key authenticates against api.moonshot.ai. BLOCKER at the time: Moonshot account suspended for insufficient balance — user needed to recharge. |

### TSK-0064

| Field | Value |
|---|---|
| **Serial** | `TSK-0064` |
| **Date** | 2026-08-02 |
| **Title** | Switch AI event-prefill provider to Google Gemini (Kimi account out of balance) |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `switch-to-gemini-for-prefill-event` |
| **Files Touched** | src/lib/gemini-client.ts (new), src/app/api/admin/events/extract/route.ts, .env, .env.example, scripts/test-gemini.ts (new) |
| **Outcome** | Created `gemini-client.ts` — OpenAI-compatible interface over Gemini v1beta `generateContent` API. Uses `X-goog-api-key` header (not Bearer), separates `systemInstruction` field, forces `responseMimeType: "application/json"` for strict JSON output, default model `gemini-flash-latest`. Provider priority updated: Gemini → Kimi → ZAI env → ZAI SDK. Smoke-tested: key authenticates; only blocker was dev server in HK (Gemini blocks HK/CN region). Production deploy to Vercel us-east-1 unblocked it end-to-end. |

### TSK-0065

| Field | Value |
|---|---|
| **Serial** | `TSK-0065` |
| **Date** | 2026-08-02 |
| **Title** | Email templates: replace hardcoded "Tel Aviv" with `{{chapter_name}}` token + switch brand logo to default login banner |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `email-chapter-name-merge-token` |
| **Files Touched** | src/lib/email-orchestrator/templates.ts, src/lib/email.ts, src/lib/email-campaign/render.ts, src/app/admin/email/email-tab-client.tsx, src/lib/email-orchestrator/seed.ts |
| **Outcome** | All 5 stage templates + transactional emails + campaign renderer now use `{{chapter_name}}` merge token. Sign-off line: "— The AI Salon {{chapter_name}} team". Footer: "AI Salon {{chapter_name}} · Empowering AI Connections". Brand logo (top-right of every email) changed to `DEFAULT_BRAND_LOGO_URL` = the login banner image (meerkat). `resolveLogoUrl()` fallback chain: template logoUrl → chapter override → `DEFAULT_BRAND_LOGO_URL`. Code change is non-destructive — old templates with hardcoded "Tel Aviv" still work, just get migrated via seed. |

### TSK-0066

| Field | Value |
|---|---|
| **Serial** | `TSK-0066` |
| **Date** | 2026-08-02 |
| **Title** | Login page: fix transparent PNG showing white background + generate Chapter Onboarding Form DOCX |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `login-bg-fix-and-onboarding-form` |
| **Files Touched** | src/app/login/page.tsx (line 145 — removed `bg-white` class), scripts/generate-chapter-onboarding-form.ts (new, ~700 lines), download/AI-Salon-Chapter-Onboarding-Form.docx (new, 19.4 KB) |
| **Outcome** | (1) Login brand-image container no longer paints a white background — transparent PNG correctly composites over the dark AIS gradient. (2) Generated fillable Word DOCX with 10 sections covering every chapter `{{}}` placeholder: Chapter Basics, Contact Channels (WhatsApp URL + LinkedIn URL + chapter name prominently at top), Languages & Audience, Brand Assets (favicon, loginHero, loginBanner, landingHero), Email Config, Lead Info, Launch Plan, Additional Notes, Sign-off. Uses docx-js with AIS cyan/magenta accent palette. |

### TSK-0067

| Field | Value |
|---|---|
| **Serial** | `TSK-0067` |
| **Date** | 2026-08-02 |
| **Title** | Deploy email template tokens + login banner logo to production; run seed migration |
| **Category** | MID |
| **Status** | DONE |
| **Worklog Ref** | `email-template-tokens-deploy` |
| **Files Touched** | src/lib/email-orchestrator/seed.ts (enhanced migration), git push to origin/main (commits 69ae04d, ecb2b97, b1cef85), Vercel auto-deploy |
| **Outcome** | Enhanced `runSeed()` migration: (1) Extended matcher to catch both signature line `"The AI Salon Tel Aviv team"` AND footer line `"AI Salon Tel Aviv · Empowering AI Connections"`. (2) Clears non-canonical `EmailStageTemplate.logoUrl` overrides (sets to `null`) to force all emails to fall back to `DEFAULT_BRAND_LOGO_URL` (login banner). Migration is idempotent. Pushed 3 commits to origin/main; Vercel auto-deployed. User needs to manually trigger `POST /api/email-orchestrator/seed` (admin UI "Seed templates" button or curl with `CRON_SECRET` Bearer) to migrate existing DB rows. |

### TSK-0068

| Field | Value |
|---|---|
| **Serial** | `TSK-0068` |
| **Date** | 2026-08-03 |
| **Title** | Functional chapter onboarding web form + "Send chapter form" button on EditMemberDialog + admin review view |
| **Category** | HIGH |
| **Status** | DONE |
| **Worklog Ref** | `chapter-onboarding-form-functional` |
| **Files Touched** | prisma/schema.prisma (new ChapterOnboardingInvite model), prisma/schema.sqlite-sandbox.prisma, prisma/migrations/20260803000000_add_chapter_onboarding_invite/migration.sql (new), src/lib/chapter-onboarding-types.ts (new), src/lib/email.ts (sendChapterOnboardingEmail), src/app/api/admin/members/[id]/send-chapter-onboarding/route.ts (new), src/app/api/chapter-onboarding/[token]/route.ts (new — GET + POST), src/app/chapter-onboarding/[token]/page.tsx (new — server component), src/app/chapter-onboarding/[token]/chapter-onboarding-form.tsx (new — 8-section client form), src/app/admin/chapter-onboarding/page.tsx (new), src/app/admin/chapter-onboarding/chapter-onboarding-admin-list.tsx (new), src/app/admin/admin-tabs-def.ts (new "Chapter Onboarding" tab), src/components/admin/admin-members-table.tsx (EditMemberDialog: added "Send chapter form" button), scripts/generate-chapter-onboarding-form.ts (DOCX updated with prominent top-3 fields box), download/AI-Salon-Chapter-Onboarding-Form.docx (regenerated, 19.8 KB) |
| **Outcome** | (1) DOCX updated with prominent "QUICK REFERENCE — TOP 3 FIELDS" box at the top: chapter name, WhatsApp group URL, LinkedIn page URL. (2) Public onboarding form live at `/chapter-onboarding/[token]` — token-authenticated, no login required, 8 sections with sticky submit bar, pre-fills lead name/email + chapter name/slug from the invite. (3) Four states: PENDING (form), SUBMITTED (thank-you), EXPIRED, REVOKED. (4) "Send chapter form" button (purple outline) added to EditMemberDialog footer between Cancel/Archive and Save. Calls new API route → creates ChapterOnboardingInvite row (token = 32 random bytes base64url, expires in 30 days) → emails the lead with the form URL. If SMTP fails, still returns the formUrl so admin can copy/paste manually. (5) Admin view at `/admin/chapter-onboarding` lists all invites with filterable table (search + status filter) + detail dialog showing the full submission organized by section. (6) Migration SQL ready. TO DEPLOY: push to origin/main + run prisma migrate on production DB + set SMTP_* env vars on Vercel. |

### TSK-0069

| Field | Value |
|---|---|
| **Serial** | `TSK-0069` |
| **Date** | 2026-08-03 |
| **Title** | Backup project + DB; upload to Google Drive; verify all tasks are registered |
| **Category** | MID |
| **Status** | IN_PROGRESS |
| **Worklog Ref** | `TSK-0069 — backup-and-task-registry-audit` |
| **Files Touched** | scripts/create-project-backup-full.sh (ran), scripts/db-backup.sh (ran), download/aisalon-project-backup-FULL-20260803-064415.zip (new, 357 MB), download/backups/db-20260803-064435-ed25e77.json.gz (new, 4 KB), download/BACKUP-README.md (new — Drive setup instructions), docs/tasks.md (this file — backfilled TSK-0058 → TSK-0069) |
| **Outcome** | (1) Full project backup created (357 MB, 6,845 files, includes .git history). (2) DB snapshot exported (35 Prisma models, gzipped JSON). (3) Google Drive upload BLOCKED — no service account JSON + no `GDRIVE_FOLDER_ID` env var + rclone not installed. Wrote `download/BACKUP-README.md` with two clear setup methods (service-account or OAuth). (4) Task registry audit: discovered 11 tasks completed since TSK-0057 but never registered in `docs/tasks.md`. Backfilled TSK-0058 → TSK-0068 in this session. (5) Two older tasks from the previous session remain OPEN: (a) AI event-extract should offer 2 candidate suggestions for unrecognized fields; (b) bilingual event support (English first, then a second language). |

---

## OPEN Tasks (not yet started)

> Tasks requested by the user in prior sessions but not yet implemented. Each will receive a `TSK-XXXX` serial ID when work begins.

### OPEN-1 — AI event-extract: 2 candidate suggestions for unrecognized fields

- **Source**: User message #7 (previous session): *"When the fields are not recognize it, offer two options..."*
- **Status**: Not started
- **Description**: When the Gemini/Kimi LLM cannot confidently map a parsed event field to a known schema field (title, date, venue, description, etc.), the API response should include 2 candidate suggestions for what the unrecognized value might be (e.g. "Could be `venue` or `organizer` — pick one"). The admin UI should show these as a small inline picker so the user can confirm or override.
- **Files likely touched**: `src/app/api/admin/events/extract/route.ts` (LLM prompt + response shape), `src/app/admin/events/new/...` (UI for showing candidates).
- **Depends on**: TSK-0064 (Gemini provider) — DONE.

### OPEN-2 — Bilingual event support (English first, then second language)

- **Source**: User message #7 (previous session): *"When there are two languages, create a two language event..."*
- **Status**: Not started
- **Description**: When the AI event-extract LLM detects the source text contains two languages, it should return both language versions of every text field (title, description, venue, agenda items). The event schema needs to gain per-field secondary-language columns or a JSON sidecar. The event-detail page should render both languages with a language toggle.
- **Files likely touched**: `prisma/schema.prisma` (add bilingual fields), `src/app/api/admin/events/extract/route.ts` (LLM prompt), `src/app/events/[slug]/page.tsx` (bilingual render), `src/app/admin/events/...` (form fields).
- **Depends on**: TSK-0064 (Gemini provider) — DONE.

### OPEN-3 — Deploy TSK-0068 (chapter onboarding form) to production

- **Status**: Code complete locally, not yet deployed
- **Description**: TSK-0068's code is finished but production deployment requires three manual steps:
  1. `git push origin main` (Vercel auto-deploys)
  2. Run `npx prisma migrate deploy` on production DB (creates `ChapterOnboardingInvite` table)
  3. Set `SMTP_*` env vars on Vercel so the invite email actually sends
- **Files**: All TSK-0068 files (see above).

### OPEN-4 — Run email-orchestrator seed migration on production DB

- **Status**: Code complete (TSK-0067), migration not yet triggered on production
- **Description**: TSK-0067 was deployed but the user must manually trigger `POST /api/email-orchestrator/seed` (admin UI "Seed templates" button or curl with `CRON_SECRET` Bearer) to migrate existing DB rows from hardcoded "Tel Aviv" → `{{chapter_name}}` token + clear `logoUrl` overrides.
- **Action**: User clicks "Seed templates" button in admin UI, or runs:
  ```bash
  curl -X POST https://aisalon.vercel.app/api/email-orchestrator/seed \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

### OPEN-5 — Upload backup to Google Drive (TSK-0069 follow-up)

- **Status**: BLOCKED on user setup
- **Description**: Backups created in TSK-0069 are sitting locally at:
  - `download/aisalon-project-backup-FULL-20260803-064415.zip` (357 MB)
  - `download/backups/db-20260803-064435-ed25e77.json.gz` (4 KB)
- **Action**: User completes one-time Google Drive setup (see `download/BACKUP-README.md` for both methods), then runs `python3 scripts/drive-backup.py` to upload. After that, `AUTO_SYNC_DRIVE=1` in `.env` will auto-upload future DB backups.
