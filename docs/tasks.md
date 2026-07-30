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
> **Back-fill note (2026-07-31)**: TSK-0001 through TSK-0006 were registered first because they were the most recent visible work. A subsequent audit of the worklog discovered five additional tasks (EXPLORE-1, PLAN-1, IMPL-1, PDF-1, PDF-2) that happened *before* TSK-0001 but were never registered. They are back-filled here as TSK-0007 through TSK-0011 per the back-fill rule above — the serial IDs are ascending even though the dates are earlier. From TSK-0012 onward, every new user request is logged here BEFORE work begins.

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

---

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
