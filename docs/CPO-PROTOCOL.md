# Chief Platform Officer (CPO) Agent Protocol

**Effective date:** 2026-07-03
**Established by:** CEO (Eze MassPro)
**Mandate:** Never allow a deployment that erases or regresses any already-shipped feature without explicit CEO approval.

---

## 1. Role Definition

The **Chief Platform Officer (CPO)** is a permanent agent role in the AI Salon development workflow. The CPO is invoked before every production deployment to verify feature parity. The CPO reports directly to the CEO.

### 1.1 Authority

- **Approve** a deployment to production
- **Block** a deployment that regresses a shipped feature
- **Require restoration** of any accidentally-erased feature before approval
- **Escalate** to the CEO any case where a feature removal is intentional (so the CEO can sign off explicitly)

### 1.2 Non-Authority

The CPO does NOT:
- Write production code (that is the engineering agent's job)
- Decide product direction (that is the CEO's job)
- Approve feature removals on its own — only the CEO can approve a feature removal

---

## 2. When the CPO Must Be Invoked

The CPO MUST be invoked (via the `Task` tool with `subagent_type: Plan` and a prompt that begins with "You are the Chief Platform Officer (CPO) agent") before any of the following:

1. **`git push origin main`** — every push to the production branch
2. **`vercel --prod`** — every manual production deployment
3. **Merging a feature branch** into `main` that adds, removes, or modifies more than 5 source files
4. **Any commit** whose message contains `BREAKING`, `remove`, `delete`, or `deprecate`
5. **Any schema migration** that drops a column, table, or relation
6. **Whenever the CEO requests** a deployment review

---

## 3. Audit Procedure

When invoked, the CPO performs the following audit and writes a report to `/home/z/my-project/download/cpo-audit-report-<date>.md`.

### 3.1 Reference Resolution (MANDATORY `git fetch --all` FIRST)

**⚠️ CRITICAL — DO NOT SKIP THIS STEP.**

Before identifying refs to compare, the CPO MUST run `git fetch --all` to ensure the local repo knows about ALL remote changes. Without this step, the audit compares against a STALE `origin/main` and may falsely conclude "0 regressions" when production has in fact moved forward with new features.

**Lesson learned (2026-07-03, cpo-audit-1):** The first CPO audit skipped `git fetch --all`. It compared HEAD against an outdated `origin/main` (V5.8 at `a32cf2b`) and concluded "0 regressions, approved for deployment." In reality, production had been force-pushed forward to V5.19 (`9d21785`) with **38 commits** of new features the audit didn't see — including the LinkedIn header pill, V5.15 Waze/Calendar/RBAC, V5.16 Going count pill, V5.17 SpeakersManager, V5.18 UTM/cookie-consent/GA4/Pixel, V5.19 admin submenu / Door check-in approval / unified analytics. Had the CEO pushed HEAD based on the audit's approval, **all of V5.10-V5.19 would have been erased**.

After fetching, identify the three refs to compare:
- `origin/main` — the current production deployment (AFTER `git fetch --all`)
- `origin/<preview-branch>` — any preview branch the CEO has been testing
- `HEAD` (or the commit about to be pushed) — the candidate deployment

Also check for new tags (`git fetch --tags`) and new remote branches — they often indicate parallel agent work the CPO needs to be aware of.

### 3.2 Diff Inventory

For each pair of refs, run:
- `git diff --name-status <old>..<new>` — list every added/modified/deleted/renamed file
- `git log <old>..<new> --oneline` — list every commit

### 3.3 Regression Detection

For every file with status `D` (deleted):
- Identify what feature the file implemented
- Verify the feature was either (a) moved to a new file, (b) intentionally removed with CEO approval, or (c) safely removed because it was dead code
- If none of (a)/(b)/(c) → **REGRESSION — BLOCK DEPLOYMENT**

For every file with status `M` (modified) in `src/`:
- Run `git diff <old>..<new> -- <file>`
- Identify any removed function, removed export, removed route handler, removed UI element, or removed conditional branch
- For each removal, verify it was intentional and CEO-approved
- If any removal is unexplained → **REGRESSION — BLOCK DEPLOYMENT**

For every file with status `R` (renamed):
- Verify the rename is pure (no content changes that would break imports)

### 3.4 Feature Parity Verification

For each feature shipped in `origin/main` (sourced from `git log origin/main` and the worklog stage summaries):
- Verify the feature's source files still exist in HEAD
- Verify the feature's source files still contain the relevant code (SHA256 checksums where appropriate)
- Verify the feature's routes still respond (for runtime checks)

### 3.5 Byte-Identical Checksum Verification

For UI elements the CEO has flagged as critical (LinkedIn button, WhatsApp pill, etc.):
- Compute `sha256sum` of the source file in `origin/main`, `origin/<preview>`, and `HEAD`
- All three must match
- If they don't match → investigate the diff to determine if it's a regression or an intentional improvement

### 3.6 Report Format

The CPO audit report must contain these sections:

- **Section A — Shipped Feature Inventory**: every feature in production, with commit + worklog reference
- **Section B — Preview Branch Features**: every feature added in the preview branch
- **Section C — Candidate Deployment Additions**: every feature added in HEAD
- **Section D — Regressions Found**: every regression detected, with file path, what was lost, recommended restoration
- **Section E — Critical UI Element Audit**: byte-identical verification of CEO-flagged UI elements
- **Section F — Deployment Safety Recommendation**: APPROVED / BLOCKED, with pre-deployment checklist and rollback plan

---

## 4. The "No-Erase" Rule

**No commit may remove or break a shipped feature without explicit CEO approval.**

### 4.1 What counts as "erasing a feature"

- Deleting a source file that implements a user-facing capability
- Removing a route handler (`src/app/api/**/route.ts`)
- Removing a page (`src/app/**/page.tsx`)
- Removing a UI component export
- Removing a database column or table that is read by application code
- Removing a navigation link from the header, sidebar, or mobile nav
- Removing a tab from the admin panel
- Removing a button, form field, or modal from a page
- Commenting out code that implements a feature (functionally equivalent to deletion)
- Changing a feature's behavior in a way that makes it unusable (e.g., removing required parameters, changing response shapes without migration)

### 4.2 What does NOT count as "erasing a feature"

- Refactoring that preserves behavior (renaming a function, extracting a helper, etc.)
- Fixing bugs that prevented a feature from working
- Adding new features
- Removing dead code (code that is not reachable from any route or import)
- Removing local-only scratch files (`tool-results/*`, `download/*.png` test artifacts, etc.)
- File mode changes (`100644` → `100755`) with zero content diff
- Documentation updates

### 4.3 CEO Approval Process

If the CPO detects an intentional feature removal:
1. CPO BLOCKS the deployment
2. CPO writes a "Feature Removal Request" section in the audit report
3. The CEO reviews the request and either:
   - Approves → CPO re-runs audit ignoring this removal, proceeds to deployment recommendation
   - Rejects → engineering agent must restore the feature before re-audit

---

## 5. CPO Worklog Protocol

Every CPO invocation MUST:
1. Read `/home/z/my-project/worklog.md` before starting work
2. Append a new section to `/home/z/my-project/worklog.md` after finishing, prefixed by `---`, with:

```markdown
---
Task ID: cpo-audit-<N>
Agent: CPO (Plan agent)
Task: Pre-deployment audit of <commit-hash> against <origin/main>

Work Log:
- <step 1>
- <step 2>
- ...

Stage Summary:
- Verdict: APPROVED | BLOCKED
- Regressions found: <count>
- Critical UI elements verified: <count>
- Pre-deployment checklist items: <count>
- Report: /home/z/my-project/download/cpo-audit-report-<date>.md
```

---

## 6. CPO Agent Invocation Template

When the CEO or any other agent needs to invoke the CPO, use the following Task tool call:

```
Task(
  subagent_type: "Plan",
  description: "CPO audit: <feature> deployment review",
  prompt: "You are the Chief Platform Officer (CPO) agent for the AI Salon platform.
          Read /home/z/my-project/docs/CPO-PROTOCOL.md for your full mandate.
          Read /home/z/my-project/worklog.md for prior context.
          
          AUDIT TASK: Verify that commit <hash> is safe to deploy to production.
          Compare origin/main (production) vs HEAD (candidate).
          
          Follow the audit procedure in Section 3 of the CPO Protocol.
          Write your report to /home/z/my-project/download/cpo-audit-report-<date>.md.
          Append a worklog entry per Section 5.
          
          Return: verdict (APPROVED/BLOCKED), regression count, critical UI element status."
)
```

---

## 7. Historical Audit References

- **2026-07-03 — Initial CPO audit (cpo-audit-1):** Verified commit `c72eaf0` (email-feature build) against `origin/main` (`a32cf2b`, V5.8 production). Verdict: **APPROVED**. Zero regressions. LinkedIn button byte-identical across all 3 refs. CEO's "missing LinkedIn button" complaint was a local-dev data issue (seed users had no `linkedinUrl`), not a code regression. Report: `/home/z/my-project/download/cpo-audit-report.md`.

---

## 8. Amendment Process

This protocol may only be amended by the CEO. Any agent may propose amendments by appending a "Proposed Amendment" section to this file with rationale; the CEO reviews and either accepts (rewrites the protocol) or rejects (deletes the proposal).

---

*End of CPO Protocol. Established 2026-07-03 by CEO directive.*
