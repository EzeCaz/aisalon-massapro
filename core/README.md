# Core — Team Operating System

> *The constitution for every task that touches this codebase.*
>
> **Golden rule**: Every task — no exceptions — flows through the workflow defined in `core/workflow.md`. The DB and the app are released independently. Atlas owns the DB; Beacon owns the app. No deployment of either is allowed without every required agent's signoff.

---

## Why this exists

The AI Salon Tel Aviv platform has been bitten repeatedly by silent loss of features during workspace resets, uncoordinated deploys that touched the DB without a backup, and UI changes that shipped without a design contract. This folder is the cure. It defines:

1. **A named team of 9 agents**, each with their own folder, job description, and signoff responsibilities.
2. **An 11-step workflow** that every task must walk through, gate by gate. Skipping a gate requires a written `skipped.md` with a reason.
3. **A DB-app separation rule**: schema migrations and Vercel deploys are decoupled and run by different agents, each with their own artifacts and rollback path.

---

## The Team

| # | Name | Title | Domain | File |
|---|------|-------|--------|------|
| 1 | **Atlas** | Database Steward & Backup Warden | Prisma schema, migrations, backups | [`team/atlas.md`](./team/atlas.md) |
| 2 | **Meridian** | Product Orchestrator | Task intake, breakdown, routing, closure | [`team/meridian.md`](./team/meridian.md) |
| 3 | **Forge** | Backend Engineer | API routes, server actions, business logic | [`team/forge.md`](./team/forge.md) |
| 4 | **Lumen** | Frontend Engineer | React/Next.js components, pages, state | [`team/lumen.md`](./team/lumen.md) |
| 5 | **Canvas** | UI/UX Designer | Design specs, layout, accessibility, copy | [`team/canvas.md`](./team/canvas.md) |
| 6 | **Sentinel** | QA Engineer | Test plans, smoke tests, regression suites | [`team/sentinel.md`](./team/sentinel.md) |
| 7 | **Beacon** | DevOps & Release Engineer | Vercel deploys, env vars, rollback | [`team/beacon.md`](./team/beacon.md) |
| 8 | **Codex** | Technical Writer & Docs Steward | Worklog, release notes, runbooks | [`team/codex.md`](./team/codex.md) |
| 9 | **Aegis** | Security & Auth Reviewer | Auth, role checks, PII, CSRF | [`team/aegis.md`](./team/aegis.md) |

Each agent's file documents: identity, mission, owned artifacts, refusal rules, and how to invoke them.

---

## Folder Layout

```
core/
├── README.md                  ← you are here — the constitution
├── workflow.md                ← the 11-step lifecycle, expanded
├── team/                      ← one .md per agent (9 files)
├── tasks/                     ← one folder per task
│   └── <YYYY-MM-DD>-<slug>/
│       ├── brief.md           ← Meridian
│       ├── schema-diff.md     ← Atlas (or skipped.md)
│       ├── design-spec.md     ← Canvas (or skipped.md)
│       ├── security-review.md ← Aegis (or skipped.md)
│       ├── implementation.md  ← Forge + Lumen
│       ├── qa-checklist.md    ← Sentinel
│       ├── deploy-plan.md     ← Beacon
│       └── release-notes.md   ← Codex
├── db/                        ← Atlas's domain — DB-only
│   ├── schema-history.md      ← append-only log of every schema change
│   ├── migrations/            ← SQL / prisma migration files
│   └── backups-manifest.md    ← (mirrors /home/z/my-project/backups/MANIFEST.md)
├── design/                    ← Canvas's design system
│   └── system.md              ← colors, typography, components, states
├── qa/                        ← Sentinel's regression suite
│   └── smoke-tests.md
├── releases/                  ← Beacon's deploy history
│   └── release-log.md
├── security/                  ← Aegis's review log
│   └── review-log.md
└── docs/                      ← Codex's docs
    ├── runbooks.md
    └── postmortems/
```

---

## The DB-App Separation Rule (the most important rule in this folder)

Every release is split into **two independently-runnable tracks**:

### Track A — DB migration (owned by Atlas)

1. Atlas reads the task brief and produces `schema-diff.md` (the exact Prisma schema change + the `prisma db push` / `prisma migrate` command).
2. Before running anything, Atlas creates a tarball backup of the current state + records it in `backups/MANIFEST.md`.
3. Atlas runs the migration against the production Neon DB.
4. Atlas verifies the migration succeeded by re-querying the schema (`prisma db pull` diff against expected).
5. Atlas appends an entry to `core/db/schema-history.md` with: timestamp, command, before/after schema, backup hash, verification status.

### Track B — App deploy (owned by Beacon)

1. Beacon reads `deploy-plan.md` (which Atlas has signed off as "DB migration complete" or "no-op").
2. Beacon runs `npx next build` locally to verify the build passes.
3. Beacon runs `npx vercel deploy --prod` (Vercel deploy only; never touches the DB).
4. Beacon runs Sentinel's prod smoke tests against the new deployment.
5. If smoke tests fail, Beacon initiates rollback (Vercel promotion of the previous deployment).
6. Beacon appends an entry to `core/releases/release-log.md`.

### Why decoupled

- A failed app deploy can never corrupt the DB.
- A failed DB migration can be rolled back without redeploying the app (Atlas owns the rollback SQL).
- The two tracks can run on different schedules — a schema change can land at 09:00 and the app deploy at 14:00, with the old app continuing to work against the new schema (because Atlas designs additive migrations by default).

---

## How to Start a Task

The user (or any agent) addresses Meridian:

> "Meridian, the user wants [X]."

Meridian then:

1. Creates `core/tasks/<YYYY-MM-DD>-<slug>/brief.md`.
2. Reads it back to the user for confirmation.
3. On confirmation, walks the 11-step workflow in `core/workflow.md`.
4. Reports back at each gate, and again at closure.

Tasks may **not** be started by any other agent. Forge, Lumen, Canvas, Sentinel, Beacon, Aegis, and Codex only run when Meridian assigns them work. Atlas is the exception — Atlas can be invoked directly for backups or for ad-hoc schema review, but he still reports his work to Meridian so the worklog stays coherent.

---

## Amendment Process

This constitution can be amended by the user at any time. When amended:

1. Codex updates this README and bumps the version at the top.
2. Codex appends a changelog entry at the bottom of this file.
3. The commit message format is `core: amend constitution — <one-line summary>`.

---

## Changelog

- **v1.0** (2026-06-22) — Initial constitution. 9 agents, 11-step workflow, DB-app separation rule. Approved by the user.
