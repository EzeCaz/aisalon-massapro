# Task Categories — Small / Mid / High

> *Not every task needs the full 9-agent workflow. Some need it more than others. This file defines the three tiers and which agents apply to each.*

---

## Why categorize

The 11-step workflow in `core/workflow.md` is the gold standard — every gate, every agent, every artifact. But running 9 agents on a 1-line CSS tweak wastes time and money. Conversely, shipping a DB schema change to production with only Z's review is how outages happen.

This file defines **three categories** so the right amount of process is applied to each task. Z (the main agent) triages every incoming request into one of these three categories **before** starting work, and states the category explicitly in the task folder.

---

## Tier 1 — SMALL

**Definition**: A small new feature or fix that has **no impact** on:
- The database (no Prisma schema changes, no migrations, no new columns)
- The platform's core structure (no new routes outside the immediate feature, no changes to auth/middleware)
- Existing UI/UX patterns (no redesign of existing pages, no changes to the design system)

**Examples**:
- Add a new field to an existing mockup editor (e.g. the QR Salon mockup)
- Tweak a dialog width or copy on a single component
- Add a new helper function or refactor inside one file
- Fix a typo, color, or spacing bug
- Add a new sample-data file or constant

**Who handles it**: **Z (the main agent) directly.** No subagent review required.

**Workflow**:
1. Z creates `core/tasks/<YYYY-MM-DD>-<slug>/brief.md` with the category marked as **SMALL**.
2. Z implements the change directly.
3. Z writes `implementation.md` (one paragraph — what changed, which files).
4. Z writes `CLOSED.md` and updates `core/tasks/README.md`.
5. No subagent review. No deploy plan (Z pushes to `main` and Vercel auto-deploys).

**Skip rule**: All 9 agents are auto-skipped. Z writes a single `skipped.md` in the task folder stating "SMALL category — handled by Z directly per `core/TASK_CATEGORIES.md`."

---

## Tier 2 — MID

**Definition**: A task that touches **both**:
- **UI/UX** (visible changes to existing pages or new pages/components)
- **DB** (new Prisma model, new column, new migration — additive only)

…but does **not** change existing features' behavior or the platform's core structure. It adds new capability without altering what already exists.

**Examples**:
- Add a new admin tab with a new Prisma model (e.g. the original email-templates task)
- Add a new API route + new UI page that consumes it
- Add a new role with new permissions (additive — doesn't change existing roles)
- Add a new event type or session type to the agenda

**Who handles it**: **The subset of the 9 agents relevant to the task.** Z still implements, but after implementation the relevant agents review and sign off (or flag required changes) before Z pushes to `main`.

**Workflow**:
1. Z creates `core/tasks/<YYYY-MM-DD>-<slug>/brief.md` with the category marked as **MID** + the list of agents that will review.
2. Z implements directly (no pre-implementation design/security gate — speed preserved).
3. Z writes `implementation.md` (full — files, routes, schema diff, copy).
4. **Post-implementation review pass** — Z invokes the relevant agents in parallel. Each returns `APPROVED` or `REQUIRED CHANGES [list]`.
5. Z shows the consolidated feedback to the user.
6. On user approval, Z applies the required changes.
7. Re-review only the agents who flagged issues (until all green or user overrides).
8. Z pushes to `main`. Vercel auto-deploys.
9. Sentinel (or Z on Sentinel's behalf) verifies prod after deploy.
10. Codex (or Z on Codex's behalf) writes release notes + closes the task.

**Agent relevance matrix** (Z decides which to invoke — irrelevant ones get `skipped.md`):

| Agent | Invoke when… |
|---|---|
| **Atlas** | Task touches `prisma/schema.prisma` or needs a migration |
| **Canvas** | Task adds or changes visible UI |
| **Aegis** | Task adds new API routes, touches auth, or handles PII |
| **Forge** | Task adds API routes / server actions / Prisma queries |
| **Lumen** | Task adds React components / pages / client interactivity |
| **Sentinel** | Always (post-deploy prod verify) |
| **Beacon** | Always (deploy plan + rollback awareness) |
| **Codex** | Always (release notes + worklog) |
| **Meridian** | Skipped — Z coordinates in this flow |

---

## Tier 3 — HIGH

**Definition**: A robust change that does any of:
- **Modifies the DB/structure** of existing features (column rename, table drop, breaking migration)
- **Changes the UI/UX of existing platform pages** (redesigns, layout shifts, removing/renaming existing flows)
- **Alters existing behavior** users depend on (changing how registration works, how auth flows, how emails are sent)
- **Touches multiple existing systems** (e.g. agenda + email + quiz all in one task)
- **Has elevated risk** — data loss potential, prod outage potential, or affects every user

**Examples**:
- Redesign the event page hero section (existing UI/UX change)
- Rename a Prisma model or drop a column (breaking migration)
- Change how RSVPs are counted or displayed (affects existing events)
- Restructure the email orchestration flow (touches existing system)
- Add a new user role that changes what existing users see
- The tracking-revert emergency from this session (HIGH — site was down)

**Who handles it**: **All 9 agents.** The full 11-step workflow from `core/workflow.md` applies — Meridian intake, Atlas schema-diff BEFORE implementation, Canvas design-spec BEFORE Lumen codes, Aegis security review BEFORE backend, Forge + Lumen implementation, Sentinel QA, Beacon deploy plan, Atlas migration + Beacon deploy, Sentinel prod verify, Codex closure.

**Workflow**: Full 11-gate workflow per `core/workflow.md`. No skips without a written `skipped.md` approved by Meridian.

**Special rule for HIGH tasks**: Z does **not** implement directly. Forge and Lumen (invoked as subagents) implement. Z coordinates as Meridian's proxy. This is the only tier where Z hands off implementation to other agents.

---

## How Z triages

When a new user request comes in, Z asks:

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

Z states the chosen category in the task brief and creates the task folder before starting work. The user can override the category at any time ("this is actually HIGH, treat it as such").

---

## Summary Table

| Tier | DB impact | UI/UX impact | Existing feature change | Who implements | Who reviews | Workflow |
|---|---|---|---|---|---|---|
| **SMALL** | None | None (additive only) | None | Z | Nobody (Z self-reviews) | Direct |
| **MID** | Additive only | New UI (not changing existing) | None | Z | Relevant subset of 9 agents (post-implementation) | Z implements → agents review → Z fixes → deploy |
| **HIGH** | Any (incl. breaking) | Any (incl. existing UI) | Yes | Forge + Lumen (as subagents) | All 9 agents (full 11-gate workflow) | Full `core/workflow.md` |

---

## Amendment

This file can be amended by the user. Codex updates this file, bumps the version, and appends a changelog entry. The commit message format is `core: amend task categories — <one-line summary>`.

---

## Changelog

- **v1.0** (2026-07-17) — Initial definition. Three tiers (SMALL / MID / HIGH). QR Salon mockup classified as the first SMALL task. Approved by the user.
