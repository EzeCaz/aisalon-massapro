# CORE Review Process — Mandatory Change Governance

> **Scope**: This document is the binding rulebook for every code change
> on the AI Salon / MassaPro platform. It applies to ALL agents
> (Atlas, Super Z, full-stack-developer, frontend-styling-expert, etc.)
> and to ALL human contributors.

## Why this exists

On multiple occasions, features that were shipped to production were
silently removed from the local working copy on the next session —
either by an environment reset or by an agent that "cleaned up" code
without checking whether it was still in use. The result was that
production was ahead of local for hours/days, and the user only
discovered the regression when they tried to use the feature.

This process exists to make sure **no feature, file, or function is
ever removed or disabled without explicit user approval**.

## The Rule (binding)

**Before removing, commenting out, deleting, or functionally disabling
any existing file, route, API endpoint, UI tab, component, DB field,
or feature flag, you MUST:**

1. **Stop** — do not proceed with the deletion.
2. **Check the worklog** at `/home/z/my-project/worklog.md` to see
   when and why the artifact was added.
3. **Check production** — `curl` the production URL to confirm whether
   the feature is currently live (e.g.
   `curl -sI https://aisalon.massapro.com/admin/check-in`).
4. **If the feature is live in production** → DO NOT remove it locally.
   Instead, treat the local code as broken/missing and **rebuild it
   from production behavior**, then verify with a type-check.
5. **If the feature is NOT in production** → post a "Change Review"
   entry in the worklog describing the artifact to be removed, the
   reason, and the impact. Wait for explicit user approval before
   proceeding. Approval must be one of:
   - A direct user message saying "yes, remove it" / "approved" /
     equivalent
   - The user's original prompt explicitly requesting the removal
     (e.g. "delete the X tab")

## What counts as "removal / disabling"

This list is non-exhaustive. When in doubt, treat it as removal:

- Deleting a file (any file — page, component, API route, lib, schema
  field, etc.)
- Commenting out code that is currently being executed
- Changing a permission gate so a feature is no longer reachable
- Removing a tab from a tab list (e.g. removing an entry from the
  `TABS` array in `admin-tabs.tsx` or `event-tabs.tsx`)
- Removing a route from `src/app/`
- Removing a column/field from the Prisma schema
- Removing an env var that a feature depends on
- Renaming a route without adding a redirect
- Disabling a button, form field, or call-to-action that was previously
  enabled
- Changing the role gate so a previously-allowed role is now blocked
- Removing a UI section (sidebar, header link, footer link, modal)

## What does NOT require approval

- Adding new features, files, routes, tabs, or fields
- Fixing bugs in existing code (behavior stays the same or improves)
- Refactoring that preserves public behavior
- Adding tests
- Updating dependencies (assuming no API breaks)
- Removing genuinely dead code that has zero references in the entire
  codebase AND was never deployed to production (verify with
  `rg "<symbol>"` first)

## CORE review entry template

When you need to remove or disable something, append to the worklog:

```markdown
---
Task ID: REVIEW-<n>
Agent: <name>
Task: CORE Review — proposed removal of <artifact>

Change Review:
- Artifact: <file path / route / symbol>
- Added in: <Task ID or "unknown">
- Currently in production: <yes/no> (verified via <command>)
- Reason for removal: <explanation>
- Impact if removed: <what breaks for users>
- User approval: PENDING

Action:
- AWAITING USER APPROVAL — do not remove until user confirms.
```

Only after the user explicitly approves may you append:

```markdown
---
Task ID: REVIEW-<n>-APPROVED
Agent: <name>
Task: CORE Review — removal approved

Action:
- User approved removal of <artifact> on <date>.
- Proceeding with deletion.
```

## Pre-deploy checklist (binding)

Before ANY deploy to Vercel production, run this checklist:

1. `npx tsc --noEmit` — must pass with zero errors
2. `bun run lint` — must pass (warnings acceptable, errors not)
3. **Diff audit**: review every changed file. For each REMOVED line,
   confirm it satisfies this CORE review process (either approved by
   user, or genuinely dead code with zero references).
4. **Production smoke test**: after deploy, `curl` every public route
   that existed before the deploy and confirm it still returns the
   expected status code.

## Agent contract

Every agent that touches this codebase MUST:

1. Read this file before making any change.
2. Read `/home/z/my-project/worklog.md` to understand prior context.
3. Append a worklog entry after completing its task.
4. Refuse to remove any artifact without following the CORE review
   process above.

Failure to follow this process is a critical error and must be
corrected by rebuilding the removed artifact immediately.
