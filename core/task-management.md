# Task Management Protocol

> *Every task — no exceptions — flows through this protocol.*
>
> **Purpose**: Defines the step-by-step process that Z (the main agent) MUST follow for every task requested by the user, starting from the last 72 hours of tasks (TSK-0001 onward). This file sits alongside `core/workflow.md` (the 11-gate agent workflow) and `core/TASK_CATEGORIES.md` (the SMALL/MID/HIGH tier definitions) — it is the **intake + tracking** layer that runs BEFORE the workflow picks a tier.
>
> **Owner**: Z (the main agent), acting as Meridian's proxy for intake + Codex's proxy for the registry.
>
> **Companion file**: [`/home/z/my-project/docs/tasks.md`](../docs/tasks.md) — the actual registry. This document describes how to add to it.

---

## Why this protocol exists

Over the last 72 hours (2026-07-28 → 2026-07-31), eleven tasks were worked on (TSK-0001 → TSK-0011) without a shared registry initially. The worklog (`/home/z/my-project/worklog.md`) captured the *execution detail*, but there was no single index that answered:

- *What was asked, in the user's words?*
- *What serial ID does this task have?*
- *Which files were touched?*
- *Is it done?*
- *What was the outcome?*

That gap made it easy to lose track of which changes had actually shipped vs. which had been claimed but never persisted. This protocol closes that gap. Every task — from a one-line CSS tweak to a full platform restructure — gets a serial ID, a row in `docs/tasks.md`, and a folder under `core/tasks/`.

---

## The 7-Step Protocol (runs for every task)

### Step 1 — Intake (within the first reply to the user)

When the user sends a request that requires more than a trivial one-line answer:

1. **Read the existing registry** at `/home/z/my-project/docs/tasks.md` and find the highest serial ID in use.
2. **Assign the next serial ID** — increment by 1, zero-pad to 4 digits (e.g. after `TSK-0005` comes `TSK-0006`).
3. **Add a new `### TSK-XXXX` section** to the registry with:
   - `Date`: today's ISO date (`YYYY-MM-DD`).
   - `Title`: one-line summary in plain English.
   - `Category`: `SMALL` / `MID` / `HIGH` per `core/TASK_CATEGORIES.md` (Z triages — see "Triage questions" below).
   - `Status`: `OPEN`.
   - `Worklog Ref`: the slug you will use when appending to `worklog.md` (e.g. `TSK-0006-tasks-registry-and-protocol`).
   - `Files Touched`: leave as `(none yet)` — update as work progresses.
   - `Outcome`: leave as `(pending)` — fill in when the task closes.
4. **State the serial ID out loud** in your first reply to the user, so they can reference it in follow-ups: *"Logging this as TSK-0006."*

### Step 2 — Triage (decide the category)

Run the four triage questions from `core/TASK_CATEGORIES.md`:

1. **Does it touch `prisma/schema.prisma` or require a migration?**
   - Yes → at least MID. If the migration is breaking (rename/drop) → HIGH.
   - No → continue.
2. **Does it change an existing page's UI/UX that users already depend on?**
   - Yes → HIGH.
   - No → continue.
3. **Does it add new UI + new DB?**
   - Yes → MID.
   - No → continue.
4. **Is it a small addition (new field, new helper, new sample data, tweak) with no DB or structural impact?**
   - Yes → SMALL.
   - No → default to MID (when in doubt, more process is safer than less).

Record the chosen category in the registry row and in the task folder's `brief.md`. The user can override the category at any time.

### Step 3 — Create the task folder

Create `core/tasks/<YYYY-MM-DD>-TSK-<XXXX>-<slug>/` with at minimum:

- `brief.md` — the user's verbatim request, the restated goal, acceptance criteria, and the chosen category.
- (other artifacts — `schema-diff.md`, `design-spec.md`, `security-review.md`, `implementation.md`, `qa-checklist.md`, `deploy-plan.md`, `release-notes.md` — are added per the workflow tier; SMALL tasks skip most of these with a single `skipped.md` per `core/TASK_CATEGORIES.md`).

The folder name embeds the serial ID so it is searchable across the codebase:

```
core/tasks/2026-07-31-TSK-0006-tasks-registry-and-protocol/
├── brief.md
└── (other artifacts as the tier requires)
```

### Step 4 — Implement (per the workflow tier)

Hand off to the appropriate workflow:

- **SMALL** → Z implements directly. No subagent review. Write `implementation.md` (one paragraph).
- **MID** → Z implements directly, then invokes the relevant subset of the 9 agents for post-implementation review. Iterate until all green or user overrides.
- **HIGH** → Full 11-gate workflow per `core/workflow.md`. Forge + Lumen implement as subagents; Z coordinates as Meridian's proxy.

While implementing, **update the registry row's `Files Touched` column** every time a new file is modified — at minimum, update it once at the end of implementation before committing.

### Step 5 — Reference the serial ID everywhere

The serial ID MUST appear in:

- **Commit messages**: `[TSK-0006] Build task registry + protocol` (the square-bracket prefix makes it greppable).
- **Worklog `Task ID:` field**: `Task ID: TSK-0006 — tasks-registry-and-protocol`.
- **Task folder name**: `2026-07-31-TSK-0006-tasks-registry-and-protocol/`.
- **PR title** (if a PR is used): `[TSK-0006] …`.
- **User-facing status updates**: *"TSK-0006 is now DONE — the registry is live at docs/tasks.md."*

This is what makes a task traceable end-to-end: from user request → registry row → task folder → commits → worklog → user-visible reply.

### Step 6 — Verify (before marking DONE)

Before changing Status from `IN_PROGRESS` to `DONE`:

1. **Run the dev server** and exercise the affected route(s). Capture the HTTP status code(s).
2. **Run `npx tsc --noEmit`** if any TypeScript files were touched. Capture whether it passes (note: `next.config.ts` has `typescript.ignoreBuildErrors: true`, so a clean `tsc` is NOT guaranteed by the build — run it explicitly).
3. **Run any task-specific acceptance criteria** listed in `brief.md`.
4. **If the task touches the DB**, verify the migration landed (Atlas's responsibility for HIGH tasks; Z for SMALL/MID).
5. **If the task ships to production**, run Sentinel's smoke tests post-deploy.

Record the verification result in `implementation.md` (or `qa-checklist.md` for HIGH tasks).

### Step 7 — Close

1. **Update the registry row**: set `Status` to `DONE`, fill in `Files Touched` (top 5 max — full list in the task folder), and write a one-line `Outcome`.
2. **Append a section to `worklog.md`** using the existing template (`---`, `Task ID:`, `Agent:`, `Task:`, `Work Log:`, `Stage Summary:`). Include the serial ID in the `Task ID:` field.
3. **Write `CLOSED.md`** in the task folder (one paragraph — what shipped, what was deferred, any follow-up serial IDs opened).
4. **Update `core/tasks/README.md`** "Closed Tasks" table with a one-line summary.
5. **Commit** with message format: `[TSK-XXXX] <one-line summary>`.
6. **Reply to the user** with a concise summary (≤100 words) and the serial ID for reference.

If the task is BLOCKED (cannot complete due to an external dependency) or CANCELLED (user changed their mind), set Status accordingly and explain in the Outcome column. The serial ID is never reused.

---

## Worked Example — TSK-0001 through TSK-0011

The eleven tasks below are the seed of this registry. They show the protocol applied to real work over the last 72 hours. TSK-0001 → TSK-0006 were registered first (most recent visible work); TSK-0007 → TSK-0011 were back-filled after a worklog audit discovered five additional tasks (EXPLORE-1, PLAN-1, IMPL-1, PDF-1, PDF-2) that pre-dated TSK-0001 but had never been registered.

| Serial | Date | Title | Category | Status | Tier-justification |
|---|---|---|---|---|---|
| **TSK-0001** | 2026-07-30 | Restore lost Style 1/2/3 + QR Salon mockup changes | MID | DONE | Touches 5 source files in 2 mockup editors. No DB impact, no existing-UI change — additive restoration of lost fields. |
| **TSK-0002** | 2026-07-30 | Add Style 2 canvas: hero-fill + 13-shape gradient selector + rotation + new card-based speaker design | HIGH | DONE | New 691-line canvas component + new form section + new type fields. Major new UI surface; treated as HIGH per `core/TASK_CATEGORIES.md`. |
| **TSK-0003** | 2026-07-30 | Fix `next/image` hostname error + convert Style selector dropdown to Style 1 / Style 2 / Style 3 buttons | SMALL | DONE | `next.config.ts` add only + small UI tweak to swap a `<select>` for buttons. No DB, no existing-UI change beyond the dropdown swap. |
| **TSK-0004** | 2026-07-30 | Editor page "not loading" — restore dead dev server + recreate missing SQLite DB | MID | DONE | Touched infrastructure (dev server, DB file) but no source code beyond a new seed script. MID because it touched multiple systems. |
| **TSK-0005** | 2026-07-30 | Login fails with "Incorrect email or password" — add missing NEXTAUTH_SECRET to .env | SMALL | DONE | Single-file fix (`.env`). No source code changes. SMALL. |
| **TSK-0006** | 2026-07-31 | Build this task registry (`docs/tasks.md`) + task-management protocol (`core/task-management.md`) | MID | DONE | New docs + protocol update. No DB, but new persistent artifact + cross-references to existing core/ system. Seeded with TSK-0001 → TSK-0005, then back-filled TSK-0007 → TSK-0011 after user feedback that the registry was missing 72-hour work. |
| **TSK-0007** | 2026-07-28 | Inventory current platform codebase for 3-tier multi-tenancy planning *(back-filled from `EXPLORE-1`)* | MID | DONE | Read-only inventory (no source modifications). MID because it produced a comprehensive 15-section inventory that fed into a HIGH planning task. |
| **TSK-0008** | 2026-07-28 | Architect 3-tier (Global→Country→City/Chapter) completion plan — 7-phase migration *(back-filled from `PLAN-1`)* | HIGH | DONE | 12-section plan covering schema, scope switcher, brand assets, email tier resolver, timezone, scope enforcement, cleanup + i18n. HIGH because it touches `prisma/schema.prisma`, ~30 API routes, and every admin page. |
| **TSK-0009** | 2026-07-29 | Stress-test PLAN-1 + produce Implementation Feasibility Addendum *(back-filled from `IMPL-1`)* | HIGH | DONE | Read-only feasibility analysis. HIGH because it discovered 5 critical risk hotspots (build-script footgun, EmailQueue write-path gap, Socket.IO scope gap, timezone scope, Event.chapter drop audit) that block PLAN-1's Phase 1. |
| **TSK-0010** | 2026-07-29 | Create downloadable PDF of the 3-tier platform plan *(back-filled from `PDF-1`)* | MID | DONE | 36-page PDF using ReportLab + Cover Template 07 Crystal Blue. MID because it's a new artifact with persistent build scripts, but no source code or DB impact. |
| **TSK-0011** | 2026-07-30 | Apply 9 user decisions to the PDF + erase Z.ai mentions → MassaPro team *(back-filled from `PDF-2`)* | MID | DONE | 64-page PDF rewrite + new ~920-line build script. MID because it's a substantial revision of an existing artifact with brand-level changes. |

For the full per-task detail (files touched, outcome, worklog reference), see [`/home/z/my-project/docs/tasks.md`](../docs/tasks.md).

---

## Anti-Patterns (what NOT to do)

These are the failure modes that this protocol exists to prevent. They all happened in the last 72 hours; the protocol is the cure.

### ❌ Anti-pattern 1 — "Claimed done but never persisted"

> The previous session's assistant claimed Style 2 changes were "implemented and the dev server compiles cleanly" — but the changes were never written to disk. The next session found an empty codebase.

**Protocol cure**: Step 1 (assign serial ID) + Step 5 (reference the serial ID in commits) means the registry row's `Files Touched` column is the source of truth. If the column says `(none yet)`, the task is NOT done — regardless of what any chat message claimed. The serial ID makes the claim falsifiable.

### ❌ Anti-pattern 2 — "Silent context loss across sessions"

> Each new session had no idea what the previous session had worked on. The user had to re-explain everything: "review all chats from yesterday until today and re-do all changes."

**Protocol cure**: The registry is a single file (`docs/tasks.md`) that any new session reads first. The serial IDs give an instant overview of the last 72 hours without needing to grep the 7,400-line worklog.

### ❌ Anti-pattern 3 — "No traceability from request to commit"

> Commits like `493d5b0 Add Style 2 canvas...` exist, but there was no way to link them back to the user's original request or to a task folder.

**Protocol cure**: Step 5 mandates `[TSK-XXXX]` prefixes in commit messages. `git log --grep "TSK-0002"` now returns the exact commits that closed TSK-0002.

### ❌ Anti-pattern 4 — "Wrong tier applied"

> TSK-0002 (Style 2 canvas — 691 new lines, new component, new form section) was treated informally, when it should have been HIGH per `core/TASK_CATEGORIES.md`.

**Protocol cure**: Step 2 forces an explicit triage decision recorded in the registry. Anyone reviewing the registry can see "this was classified HIGH, here's why" — and can challenge it.

### ❌ Anti-pattern 5 — "Infrastructure fixes mixed with feature work"

> TSK-0004 (dead dev server + missing DB) and TSK-0005 (missing NEXTAUTH_SECRET) were both infrastructure issues that blocked ALL feature work. They were tracked as one-off chat messages, not as tasks.

**Protocol cure**: Every fix — even a one-line `.env` change — gets a serial ID. The registry now shows that 2 of the last 5 tasks were infrastructure, not features. That's actionable signal: the dev environment is fragile and needs hardening.

---

## Current Task

> **No task in flight.** TSK-0006 (the registry + protocol itself) is now `DONE` — the registry at `docs/tasks.md` holds all 11 back-filled tasks (TSK-0001 → TSK-0011) covering the last 72 hours (2026-07-28 → 2026-07-31). The next task the user requests will be logged as `TSK-0012` BEFORE work begins, per Step 1 of the protocol.

When a new session starts, read this section first to know what's in flight. Update it before ending a session so the next agent can pick up seamlessly.

---

## Amendment Process

This protocol can be amended by the user at any time. When amended:

1. Z updates this file and bumps the version at the top.
2. Z appends a changelog entry below.
3. The commit message format is `core: amend task-management protocol — <one-line summary>`.

---

## Changelog

- **v1.0** (2026-07-31) — Initial protocol. 7-step intake-to-close process. Serial ID format `TSK-XXXX`. Back-filled with TSK-0001 → TSK-0006 (the last 48 hours of work) as the seed registry. Approved by the user.
- **v1.1** (2026-07-31) — After user feedback that the registry was missing tasks from the last 72 hours, audited the worklog and back-filled 5 additional tasks (EXPLORE-1, PLAN-1, IMPL-1, PDF-1, PDF-2) as TSK-0007 → TSK-0011. Expanded the registry window from 48h to 72h. Added the "Back-fill rule" to the Serial ID Rules in `docs/tasks.md` to formalize the ascending-ID-even-with-earlier-dates pattern. TSK-0006 marked DONE. Next user request will be TSK-0012.
