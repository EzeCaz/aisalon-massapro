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

## Registry — Last 48 Hours (2026-07-29 → 2026-07-31)

> These are the tasks that initialized this registry. Earlier work is recorded in `/home/z/my-project/worklog.md` and `core/tasks/README.md` and is NOT retroactively assigned serial IDs — the registry starts here, forward-only.

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
| **Status** | IN_PROGRESS |
| **Worklog Ref** | `tasks-registry-and-protocol` |
| **Files Touched** | `docs/tasks.md` (this file, new), `core/task-management.md` (new), `core/README.md` (updated to reference the protocol) |
| **Outcome** | Establishing a permanent, meticulous task registry with ascending serial IDs and a step-by-step protocol that every future task must follow. Back-filled the last 48 hours (TSK-0001 → TSK-0005) so the registry starts with real history, not an empty page. From TSK-0006 onward, every user request is logged here BEFORE work begins. |

---

## Registry — Pre-Registry History (Reference Only)

> Tasks completed before 2026-07-29 are NOT back-filled with serial IDs. They are listed here for context only. For full details, see `/home/z/my-project/worklog.md` and `core/tasks/README.md`.

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
2. **Add a new `### TSK-XXXX` section** at the bottom of the "Registry — Last 48 Hours" table (or start a new dated section if the date rolls past 48 hours).
3. **Fill in every column** — Date, Title, Category, Status (`OPEN` initially), Worklog Ref, Files Touched (update as work progresses), Outcome (one line; expand in the task folder).
4. **Update `core/task-management.md`'s "Current Task" header** to point at the new serial ID so any agent picking up the session knows what's in flight.
5. **Reference the serial ID everywhere** — commit messages, worklog `Task ID:`, task folder name.
6. **When work completes**, update Status to `DONE` and fill in the Outcome column. Do NOT delete the row.

For the full step-by-step protocol that every task must follow, see [`core/task-management.md`](../core/task-management.md).
