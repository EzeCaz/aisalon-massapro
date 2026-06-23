# V3.0 Plan Execution — PREVIEW

**Generated:** 2026-06-23
**Source plan:** `download/AISalon-Team-Plan-V3.0.docx`
**Status:** PREVIEW ONLY — nothing in this directory is wired into production paths. No DB migrations, no production feature changes, no CI activation, no git tags created.

## Purpose

This directory contains ready-to-use artifacts that implement the V3.0 Team Plan's Q1 priorities. Each artifact is a real, working file that can be promoted to its production location with a single `cp` or `mv` once you approve. Until then, they sit here inert.

## What's Inside

### `ci/` — Goal 2: Deploy Stability
| File | Purpose | Activation step |
|------|---------|-----------------|
| `ci/ci.yml` | GitHub Actions workflow: lint + typecheck + build on every PR & push to main | Copy to `.github/workflows/ci.yml` and push to GitHub |
| `ci/pre-deploy-check.sh` | 8-point pre-deploy checklist (clean build, clean tree, no drift, smoke test, env-var drift check, etc.) | Copy to `scripts/pre-deploy-check.sh` and run before every deploy |
| `ci/vercel-github-integration.md` | Step-by-step Vercel-GitHub auto-deploy setup guide | Follow in Vercel dashboard (no code change) |

### `scripts/` — Goal 2 + Goal 3
| File | Purpose | Activation step |
|------|---------|-----------------|
| `scripts/prod-smoke-test-extended.mjs` | Extends existing smoke test to cover all V3.0 endpoints (companies, bulk-import, image reorder, agenda) | Copy over `scripts/prod-smoke-test.mjs` (review diff first) |
| `scripts/backup-to-github.sh` | Tag → GitHub Release → upload tarball asset (idempotent) | Copy to `scripts/backup-to-github.sh`, requires `gh` CLI authenticated |
| `scripts/branch-reconciliation.sh` | DRY-RUN branch reconciliation: shows 52-ahead/39-behind diff, does NOT force-push | Copy to `scripts/`, run with `--apply` to actually rebase (after backup tag) |

### `docs/` — Goal 3: External Backup structure
| File | Purpose | Activation step |
|------|---------|-----------------|
| `docs/adr/TEMPLATE.md` | ADR template (Context · Decision · Consequences · Alternatives) | Copy to `docs/adr/` at repo root |
| `docs/adr/0001-record-architecture-decisions.md` | First ADR — adopts the ADR pattern itself | Copy to `docs/adr/` |
| `docs/adr/0002-rbac-four-roles.md` | ADR draft for the in-progress RBAC work (SUPER_ADMIN/ADMIN/CO_HOST/MEMBER) | Review against actual RBAC implementation before promoting |
| `docs/runbooks/deploy.md` | Deploy runbook | Copy to `docs/runbooks/` |
| `docs/runbooks/rollback.md` | Vercel instant rollback runbook | Copy to `docs/runbooks/` |
| `docs/runbooks/secrets-rotation.md` | 90/180-day secrets rotation runbook | Copy to `docs/runbooks/` |
| `docs/postmortems/TEMPLATE.md` | Postmortem template (timeline · impact · root cause · action items) | Copy to `docs/postmortems/` |
| `docs/test-plans/TEMPLATE.md` | Test plan template (scope · environment · test cases · expected) | Copy to `docs/test-plans/` |
| `docs/retrospectives/TEMPLATE.md` | Quarterly retro template | Copy to `docs/retrospectives/` |

### `audit-config/` — Goal 1: Capability (Performance + A11y)
| File | Purpose | Activation step |
|------|---------|-----------------|
| `audit-config/lighthouserc.json` | Lighthouse CI config with 90+ budget on Performance/A11y/Best Practices/SEO for all top-level routes | Install `@lhci/cli` and reference in CI workflow |
| `audit-config/axe-audit.mjs` | axe-core Playwright script — runs against all top-level routes, reports serious/critical violations | Install `@axe-core/playwright`, add to CI |

### `github-release/` — Goal 2 + Goal 3
| File | Purpose | Activation step |
|------|---------|-----------------|
| `github-release/v3.0.0-release-notes.md` | Draft release notes for v3.0.0 tag (covers all V3.0 features) | Use when creating the GitHub Release |
| `github-release/v3.0.0-tag-plan.md` | Step-by-step tag + release creation procedure | Follow after branch reconciliation |

## What This Preview Does NOT Do

- ❌ Does NOT create the `v3.0.0` git tag
- ❌ Does NOT push anything to GitHub
- ❌ Does NOT install the GitHub Actions workflow
- ❌ Does NOT run any migrations
- ❌ Does NOT modify `prisma/schema.prisma` (the WIP RBAC comment change in the working tree is unrelated and stays stashed in working tree)
- ❌ Does NOT modify any production API route
- ❌ Does NOT create the `docs/` folder at the repo root (only inside `preview/`)
- ❌ Does NOT install any new dependencies

## What It Would Take to Activate (Per Goal)

### Goal 2 — Deploy Stability (highest priority per plan §18)
1. Review `ci/ci.yml` → copy to `.github/workflows/ci.yml` → push to GitHub
2. Run `scripts/branch-reconciliation.sh` (dry-run first, then `--apply` after backup tag)
3. Follow `ci/vercel-github-integration.md` in Vercel dashboard
4. Run `scripts/backup-to-github.sh v3.0.0` to create the first tagged release
5. Promote `scripts/pre-deploy-check.sh` and `scripts/prod-smoke-test-extended.mjs`

### Goal 3 — External Backup
1. Promote all `docs/adr/`, `docs/runbooks/`, `docs/postmortems/`, `docs/test-plans/`, `docs/retrospectives/` to repo root
2. Commit + push (this is the "external drive" per the plan)

### Goal 1 — Capability (Performance + A11y)
1. Install dev deps: `bun add -D @lhci/cli @axe-core/playwright`
2. Promote `audit-config/lighthouserc.json` and `audit-config/axe-audit.mjs` to repo root
3. Add Lighthouse + axe steps to CI workflow
4. Run first audit, file issues for any violations

## Next Steps for User

1. **Review this preview.** Open the files that interest you most.
2. **Tell me which goal to activate first.** Default recommendation per plan §18: Goal 2 (deploy stability) → Goal 3 (docs structure) → Goal 1 (audits).
3. **For each goal you approve**, I'll promote the files to their production locations, commit, and (if you want) push to GitHub.

---

**Note on RBAC:** The WIP RBAC work (Task 10 from the previous session) is still in the working tree as uncommitted changes. It is NOT part of this preview. When you're ready to resume RBAC, let me know and I'll complete and test it separately.
