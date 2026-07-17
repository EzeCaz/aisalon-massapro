# Workflow — The 11-Step Task Lifecycle

> *Every task walks this path. No exceptions. No skipping without a written reason.*
>
> **Triage first** (added v1.1, 2026-07-17): Before any work starts, Z categorizes the task as **SMALL**, **MID**, or **HIGH** per [`core/TASK_CATEGORIES.md`](./TASK_CATEGORIES.md). The category determines which gates apply:
> - **SMALL** — Z implements directly, all 9 agents auto-skipped, no 11-gate walk.
> - **MID** — Z implements directly, then the relevant subset of 9 agents reviews post-implementation.
> - **HIGH** — Full 11-gate workflow below. All 9 agents engaged. Forge + Lumen implement as subagents.
>
> The 11 gates below are the **HIGH** path. SMALL and MID paths are defined in `core/TASK_CATEGORIES.md`.

---

## Overview

```
  ┌──────────────────────────────────────────────────────────────┐
  │                    USER REQUEST                              │
  │                  (chat / IM / voice)                         │
  └──────────────────────────┬───────────────────────────────────┘
                             ▼
                   ┌─────────────────┐
                   │  1. INTAKE      │  Meridian writes brief.md
                   └────────┬────────┘
                            ▼
                   ┌─────────────────┐
                   │  2. SCHEMA      │  Atlas writes schema-diff.md
                   │                 │  (+ pre-migration backup)
                   └────────┬────────┘
                            ▼
              ┌─────────────┴──────────────┐
              ▼                            ▼
   ┌──────────────────┐         ┌──────────────────┐
   │  3. DESIGN       │         │  4. SECURITY     │
   │  Canvas writes   │         │  Aegis writes    │
   │  design-spec.md  │         │  security-       │
   │                  │         │  review.md       │
   └────────┬─────────┘         └────────┬─────────┘
            └──────────────┬─────────────┘
                           ▼
              ┌─────────────┴──────────────┐
              ▼                            ▼
   ┌──────────────────┐         ┌──────────────────┐
   │  5. BACKEND      │         │  6. FRONTEND     │
   │  Forge impls +   │         │  Lumen impls +   │
   │  signs impl.md   │         │  signs impl.md   │
   └────────┬─────────┘         └────────┬─────────┘
            └──────────────┬─────────────┘
                           ▼
                ┌────────────────────┐
                │  7. QA             │  Sentinel writes qa-checklist.md
                │                    │  + runs tests against preview
                └─────────┬──────────┘
                          ▼
                ┌────────────────────┐
                │  8. DEPLOY PLAN    │  Beacon writes deploy-plan.md
                │                    │  (DB track + App track split)
                └─────────┬──────────┘
                          ▼
              ┌───────────┴───────────┐
              ▼                       ▼
   ┌─────────────────────┐  ┌─────────────────────┐
   │  9a. DB MIGRATE     │  │  9b. APP DEPLOY     │
   │  Atlas runs         │  │  Beacon runs        │
   │  migration          │  │  vercel --prod      │
   └─────────┬───────────┘  └─────────┬───────────┘
             └─────────────┬───────────┘
                           ▼
                ┌────────────────────┐
                │ 10. PROD VERIFY    │  Sentinel smoke-tests prod
                └─────────┬──────────┘
                          ▼
                ┌────────────────────┐
                │ 11. CLOSE          │  Codex writes release-notes.md
                │                    │  Meridian closes task
                └────────────────────┘
```

---

## Gate Details

### Gate 1 — INTAKE (Meridian)

**Inputs**: User request (chat, IM, voice).

**Outputs**: `core/tasks/<YYYY-MM-DD>-<slug>/brief.md`

**brief.md contents**:
- Task ID (e.g. `2026-06-22-cohost-role`)
- User's verbatim request
- Restated goal in plain English (1 paragraph)
- Acceptance criteria (bullet list — what must be true for this task to be "done")
- Scope (what's IN, what's OUT)
- Risks / unknowns
- Proposed owner per subtask (Atlas? Forge? Lumen? Both?)
- Suggested gate skips (e.g. "no UI change → skip Gate 3")

**Meridian's responsibilities at this gate**:
- Read back the brief to the user.
- Wait for explicit approval ("yes", "go", "approved") before proceeding.
- If the user amends, update brief.md and re-read.
- Once approved, create the task folder and hand off to Atlas.

---

### Gate 2 — SCHEMA (Atlas)

**Inputs**: `brief.md`

**Outputs**: `schema-diff.md` (or `skipped.md`)

**schema-diff.md contents**:
- Current schema (relevant models only)
- Proposed schema (with diff)
- Migration command (`prisma db push` vs `prisma migrate dev --name <slug>`)
- Migration type: **additive** (new column/table — safe, no downtime) vs **breaking** (column rename/drop — needs coordination)
- Pre-migration backup tarball hash + timestamp
- Post-migration verification query
- Rollback SQL

**Atlas's responsibilities at this gate**:
- Create a tarball backup of the current state BEFORE designing the migration.
- Run `prisma db pull` to confirm the current production schema matches what's in `schema.prisma`.
- If no schema change is needed → write `skipped.md` with one line: "No schema change required for this task."
- If a schema change is needed → design it additive-first; only propose breaking changes if there's no alternative.
- Run the migration against production **only after** the user has approved the deploy plan (Gate 8). At Gate 2, Atlas only writes the plan — he doesn't execute.

---

### Gate 3 — DESIGN (Canvas)

**Inputs**: `brief.md`, `schema-diff.md`

**Outputs**: `design-spec.md` (or `skipped.md`)

**design-spec.md contents**:
- Component tree (which components get added/modified)
- Layout sketch (ASCII or markdown table)
- Responsive behavior (mobile / tablet / desktop)
- States: empty, loading, error, success
- Copy (exact text for buttons, headers, error messages)
- Accessibility notes (aria-*, keyboard nav, color contrast)
- Edge cases (what if the list is empty? what if the user has 1000 items?)

**Canvas's responsibilities at this gate**:
- Write the spec BEFORE Lumen starts coding. Lumen is not allowed to begin Gate 6 until Canvas has signed `design-spec.md` (or `skipped.md`).
- Reference the design system in `core/design/system.md` for colors/typography/components — no off-system styles.
- If the user supplied a screenshot, HTML snippet, or Word file as reference, attach a copy under `core/tasks/<slug>/assets/` and reference it from the spec.

**Skip condition**: Task has no visible UI (e.g. a cron job, a DB migration, an internal API). Canvas writes `skipped.md` with reason.

---

### Gate 4 — SECURITY (Aegis)

**Inputs**: `brief.md`, `schema-diff.md`, `design-spec.md`

**Outputs**: `security-review.md` (or `skipped.md`)

**security-review.md contents**:
- Auth check: which routes need `getServerSession`? Which role (ADMIN / CO_HOST / USER)?
- PII check: does the task touch user emails, names, photos? How are they exposed?
- CSRF check: are all mutations POST/PUT/DELETE with proper session validation?
- OAuth config changes (if any)
- Rate-limiting recommendations
- New env vars required (and whether they're secrets)

**Aegis's responsibilities at this gate**:
- Review every new API route Forge will write.
- Review every new server component that reads user data.
- Sign off ONLY if every check passes. If a check fails, write the issue + recommended fix and return to Meridian for re-routing.

**Skip condition**: Task is purely cosmetic (CSS tweak, copy change) with no auth or data implications. Aegis writes `skipped.md` with reason.

---

### Gate 5 — BACKEND (Forge)

**Inputs**: `brief.md`, `schema-diff.md`, `design-spec.md`, `security-review.md`

**Outputs**: Backend half of `implementation.md`

**implementation.md (backend section) contents**:
- Files created / modified (with paths)
- API routes added (with method + path + auth)
- Prisma queries added (with the model + operation)
- Server actions added
- Env vars consumed
- Any business logic notes (algorithms, edge cases handled)

**Forge's responsibilities at this gate**:
- Implement per the design spec + security review. No deviations without Canvas/Aegis signoff on the change.
- Run `npx tsc --noEmit` after implementation — must pass cleanly.
- Run `npx eslint <new files>` — must pass (warnings OK, errors not).
- Sign the bottom of `implementation.md` with: `Backend signoff: Forge, <date>, tsc=pass, eslint=pass`.

---

### Gate 6 — FRONTEND (Lumen)

**Inputs**: same as Gate 5, plus Forge's backend half of `implementation.md`

**Outputs**: Frontend half of `implementation.md` (appended below Forge's section)

**implementation.md (frontend section) contents**:
- Components created / modified (with paths)
- Pages created / modified (with paths)
- Client vs server component decisions
- State management approach (useState / URL params / server cache)
- Copy used (must match Canvas's spec exactly)
- Accessibility verification (axe-core if available, manual keyboard nav otherwise)

**Lumen's responsibilities at this gate**:
- Implement per Canvas's design-spec.md. No off-spec styles.
- All copy must match Canvas's spec verbatim (no paraphrasing).
- Sign the bottom of `implementation.md` with: `Frontend signoff: Lumen, <date>, tsc=pass, eslint=pass`.

---

### Gate 7 — QA (Sentinel)

**Inputs**: All prior artifacts

**Outputs**: `qa-checklist.md`

**qa-checklist.md contents**:
- Test plan (manual + automated)
- Smoke test commands (curl URLs, click through flows)
- Regression checklist (which existing features could this break?)
- Browser matrix (Chrome, Firefox, Safari, mobile)
- Test execution log (date, tester, result per item)

**Sentinel's responsibilities at this gate**:
- Run the smoke tests against the **preview** deployment (Beacon deploys to preview first if requested).
- Run the regression suite from `core/qa/smoke-tests.md`.
- If any test fails → return to Forge/Lumen with the failure log.
- Sign off ONLY when every test passes.
- Sign with: `QA signoff: Sentinel, <date>, all tests pass`.

**Skip condition**: Never skipped. Even pure-DB tasks get a smoke test ("can the app still read the new schema?").

---

### Gate 8 — DEPLOY PLAN (Beacon)

**Inputs**: All prior artifacts, including Sentinel's signoff

**Outputs**: `deploy-plan.md`

**deploy-plan.md contents**:
- **DB track**: Atlas's migration command, backup hash, expected duration, rollback SQL
- **App track**: Vercel project ID, environment (production / preview), expected duration, rollback deployment URL
- **Order**: DB first or app first? (Default: DB first, additive migrations only.)
- **Communication**: who to notify, when
- **Rollback plan**: if app deploy fails → promote previous Vercel deployment; if DB migration fails → Atlas runs rollback SQL

**Beacon's responsibilities at this gate**:
- Write the plan, get Atlas's signature on the DB track, get Aegis's signature on the security track.
- Wait for the user's explicit "deploy" approval before executing Gate 9.

---

### Gate 9 — DEPLOY (Atlas + Beacon, parallel or sequenced)

**9a — DB MIGRATE (Atlas)**:
1. Confirm the pre-migration backup tarball exists and its SHA-256 matches the manifest.
2. Run the migration command against production Neon.
3. Run `prisma db pull` to verify the schema now matches what was designed.
4. Append `core/db/schema-history.md`.
5. Sign off to Beacon: "DB migration complete, schema verified."

**9b — APP DEPLOY (Beacon)**:
1. Confirm Atlas has signed off (or that the DB track is `skipped.md`).
2. Run `npx next build` locally — must pass.
3. Run `npx vercel deploy --prod --yes`.
4. Capture the deployment URL + commit SHA.
5. Append `core/releases/release-log.md`.
6. Hand off to Sentinel for prod verification.

---

### Gate 10 — PROD VERIFY (Sentinel)

**Inputs**: Deployed URL from Beacon

**Outputs**: Update to `qa-checklist.md` with prod test results

**Sentinel's responsibilities at this gate**:
- Re-run the smoke tests against the **production** URL (not preview).
- For each route, verify HTTP 200 (or expected redirect) and check for runtime errors in the response.
- If any prod test fails → immediately notify Beacon, who initiates rollback.
- Sign with: `Prod verify: Sentinel, <date>, prod URL=https://..., all tests pass`.

---

### Gate 11 — CLOSE (Codex + Meridian)

**Codex's responsibilities**:
- Write `release-notes.md` with:
  - One-paragraph summary the user can read
  - Bullet list of what changed (files, routes, schema)
  - Any caveats / follow-ups
  - Backup version (if Atlas created one)
  - Deploy URL + commit SHA
- Append the same paragraph to `/home/z/my-project/worklog.md` under the task ID.

**Meridian's responsibilities**:
- Confirm every gate has a signoff (or a `skipped.md` with reason).
- Mark the task folder as closed by creating `core/tasks/<slug>/CLOSED.md` with the closure timestamp.
- Update the task index in `core/tasks/README.md` (if it exists; Meridian creates it on first close).
- Report back to the user: "Task <slug> is closed. Summary: <Codex's paragraph>."

---

## Skipping Gates

A gate can only be skipped with a written `skipped.md` in the task folder, containing:

```markdown
# Skipped: <Gate name>

Reason: <one sentence>

Approved by: <agent name>, <date>
```

Meridian reviews every `skipped.md`. If Meridian disagrees, the gate is unskipped and the responsible agent is invoked.

---

## Parallelism

Gates 3 (Design) and 4 (Security) can run in parallel — both read the same inputs.
Gates 5 (Backend) and 6 (Frontend) can run in parallel only if the data contract is fully specified in `design-spec.md` and `schema-diff.md`. Otherwise Backend goes first, Frontend reads `implementation.md` backend section, then proceeds.

---

## Amendment

This workflow can be amended by the user. Codex updates this file, bumps the version, and appends a changelog entry. The commit message format is `core: amend workflow — <one-line summary>`.

---

## Changelog

- **v1.0** (2026-06-22) — Initial 11-step workflow. Approved by the user.
- **v1.1** (2026-07-17) — Added triage preamble pointing to `core/TASK_CATEGORIES.md`. The 11 gates below are now defined as the HIGH-tier path; SMALL and MID tiers have their own abbreviated paths defined in `TASK_CATEGORIES.md`.
