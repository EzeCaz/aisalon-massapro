# Source Protocol: Prevent Server-Component Render Crashes

> **Created:** 2026-06-28 — triggered by the `/admin/registrants` production crash (digest `1148739576`).
> **Agent responsible for the original regression:** `main (Super Z)` — Task ID 14 (V3.3.1 hotfix, 2026-06-25) which fixed an earlier TDZ crash on the same page but failed to add a regression test or a referential-integrity check.

---

## 1. What happened

On 2026-06-28, the deployed production site returned a 500 on `/admin/registrants` with the message *"An error occurred in the Server Components render."*

### Root cause (three layers of failure)

1. **Missing FK constraint in production Postgres.** The `EventRsvp.eventId → Event.id` foreign key was never created on the production Neon database. The Prisma schema declared it (`onDelete: Cascade`), but `prisma db push` was never run with the production `DATABASE_URL` after the schema was first deployed. As a result, **none** of the 29 schema-declared FK constraints existed in production Postgres.

2. **Orphan RSVP row accumulated.** Because the FK was missing, when an Event row was deleted (likely via an admin "delete event" action or a raw SQL cleanup), its child `EventRsvp` rows were **not** cascaded. One such orphan row survived: `id=cmqsndhjf0001ld04q1di4gyk`, pointing to deleted event `cmqsl1jmr0000jv041etu0tui`.

3. **Prisma's strict include crashed the page.** The Server Component query
   ```ts
   db.eventRsvp.findMany({
     include: {
       event: { select: { id, title, slug, startsAt } },
       user: { select: { id, email, name } },
     },
   })
   ```
   throws `"Inconsistent query result: Field event is required to return data, got null instead."` when ANY row's required relation comes back null. There was no try/catch around the query, so the entire page crashed.

### Why the previous hotfix didn't prevent this

Task ID 14 (V3.3.1, 2026-06-25) fixed a TDZ bug on the same page. That fix was correct, but it was a one-line patch with:
- ❌ No regression test
- ❌ No DB referential-integrity check
- ❌ No defensive try/catch on the failing query
- ❌ No documented protocol for verifying FK constraints after `prisma db push`

So when the next data-integrity issue arose (the orphan row), the page crashed again.

---

## 2. The protocol (apply to every future change)

This protocol is **mandatory** for any agent (main or subagent) touching:
- A Server Component (`page.tsx`, `layout.tsx`, `route.ts`) that runs Prisma queries
- The Prisma schema (`prisma/schema.prisma`)
- A database migration / `prisma db push` / raw SQL on production

### Rule 1 — Every `findMany({ include: ... })` on a required relation must be wrapped

Any Prisma query that `include`s a **required** relation (non-nullable `@relation`) MUST be wrapped in a try/catch with a documented fallback. The fallback either:

- (a) re-runs the query as a raw SQL `LEFT JOIN` that filters out orphan rows, OR
- (b) returns an empty result + logs `console.error` with a unique tag, so the page renders but the team is alerted.

**Example (canonical — see `src/app/admin/registrants/page.tsx`):**

```ts
let rsvps = [];
let orphanCount = 0;
try {
  rsvps = await db.eventRsvp.findMany({
    orderBy: [{ event: { startsAt: "desc" } }, { createdAt: "desc" }],
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });
} catch (err) {
  console.error("[/admin/registrants] Primary RSVP query failed — falling back to orphan-safe raw query.", err);
  // Fall back to raw LEFT JOIN that filters out orphans
  const rawRows = await db.$queryRaw`SELECT ... FROM "EventRsvp" r LEFT JOIN "Event" e ON ...`;
  orphanCount = rawRows.filter(r => !r.eventIdFk).length;
  rsvps = rawRows.filter(r => r.eventIdFk).map(...);
}
```

### Rule 2 — After every `prisma db push`, run `scripts/audit-all-fk-constraints.mjs`

This script compares the FK constraints declared in `prisma/schema.prisma` against the FK constraints that actually exist in the production Postgres DB. It will:

- List missing FKs
- List FKs with wrong `onDelete` behavior
- Clean up orphan rows that would block `ADD CONSTRAINT`
- Create the missing FKs with correct `onDelete`

**Run this script:**
- After every `prisma db push` against production
- After every schema migration script (`scripts/apply-*.mjs`)
- Before every production deploy (see Rule 4)
- Any time a "Something went wrong in Server Components render" error is reported

Command:
```bash
node scripts/audit-all-fk-constraints.mjs
```

### Rule 3 — When `prisma/schema.prisma` is edited, update the audit script's DECLARED_FKS list

The `DECLARED_FKS` array in `scripts/audit-all-fk-constraints.mjs` is the source of truth for what the production DB should look like. Any time a relation is added, renamed, or its `onDelete` rule is changed in `schema.prisma`, the matching entry in `DECLARED_FKS` MUST be updated in the same commit.

If they drift, the audit script will report false positives (claiming FKs are missing when they aren't) or false negatives (missing real issues).

### Rule 4 — Pre-deploy checklist (run before every `vercel deploy --prod`)

```bash
# 1. Local build must pass
bun run build

# 2. No regression in routes (compare against last backup)
bash scripts/regression-audit.sh

# 3. Production FK constraints match schema
node scripts/audit-all-fk-constraints.mjs

# 4. Smoke test the deployed URL (must include all admin pages)
#    - GET /admin (auth-gated → 307 to /login)
#    - GET /admin/registrants (auth-gated → 307 to /login)
#    - GET /admin/speakers
#    - GET /admin/events
#    - GET /events
```

If any of these fail, **do not deploy**. Fix the issue first.

### Rule 5 — Add a regression test for every Server-Component crash fix

When a Server-Component crash is fixed, add a regression test that:

- Sets up the failing data condition (e.g. an orphan RSVP row)
- Calls the same Prisma query the page uses
- Asserts the query does NOT throw (or that the page renders successfully)

Tests live in `scripts/regression-*.mjs` and are run by the pre-deploy checklist.

**Example:** `scripts/regression-rsvp-orphan.mjs` — creates a temporary orphan RSVP row, runs the page.tsx query, verifies the try/catch fallback works, then cleans up.

### Rule 6 — Production Server-Component errors get a post-mortem entry in `worklog.md`

Every production crash with the pattern `"An error occurred in the Server Components render"` MUST produce:

1. A `worklog.md` entry tagged `Task ID: <next>` with:
   - The exact error message + digest
   - Root cause (three layers: schema/data/code)
   - Fix applied (code + DB)
   - Verification steps actually run (with output snippets)
   - Reference to this protocol if a new rule was added
2. A new entry in this document's §3 (Post-mortem log) summarizing the incident

### Rule 7 — Never bypass Prisma cascade via raw SQL

Raw SQL `DELETE FROM "Event" WHERE id = ...` does **not** trigger `ON DELETE CASCADE` if the FK constraint is missing. Always:

- Use `db.event.delete({ where: { id } })` (Prisma), OR
- Run `scripts/audit-all-fk-constraints.mjs` BEFORE any raw SQL delete to verify the FK exists

If you must use raw SQL deletes, manually cascade first:
```sql
DELETE FROM "EventRsvp"     WHERE "eventId" = $1;
DELETE FROM "EventCoHost"   WHERE "eventId" = $1;
DELETE FROM "Speaker"       WHERE "eventId" = $1;
DELETE FROM "EventAgendaItem" WHERE "eventId" = $1;
DELETE FROM "EventImage"    WHERE "eventId" = $1;
DELETE FROM "PresentationFile" WHERE "eventId" = $1;
DELETE FROM "Event"         WHERE "id" = $1;
```

---

## 3. Post-mortem log

### Incident 1 — 2026-06-28 — `/admin/registrants` 500 (digest 1148739576)

- **Symptom:** Production page returned "Something went wrong. An error occurred in the Server Components render."
- **Root cause:** Orphan `EventRsvp` row (eventId pointed to deleted Event) + missing FK constraint on `EventRsvp.eventId → Event.id` in production Postgres + no try/catch on the `findMany({ include: { event } })` call.
- **Scope of FK issue:** All 29 schema-declared FKs were missing from production (not just `EventRsvp.eventId`).
- **Fix applied:**
  1. Deleted 1 orphan RSVP row (`cmqsndhjf0001ld04q1di4gyk`).
  2. Created all 29 FK constraints with correct `onDelete` rules (CASCADE / SET NULL per schema) via `scripts/audit-all-fk-constraints.mjs`.
  3. Wrapped `page.tsx` rsvp query in try/catch with raw-SQL LEFT JOIN fallback + UI warning banner when orphans are detected.
- **Verification:**
  - Reproduction script `scripts/reproduce-registrants-error.mjs` confirmed the original error and the fix.
  - `bun run build` clean.
  - Production DB: 0 orphan RSVPs, 41 total FK constraints (29 schema + 12 implicit m:n join-table FKs).
- **Agent responsible:** `main (Super Z)` — was also responsible for Task ID 14 (V3.3.1 hotfix on 2026-06-25) which fixed an earlier crash on the same page but did not add this protocol.
- **Lessons incorporated into this protocol:** Rules 1, 2, 3, 5, 6 added.

---

## 4. Files governed by this protocol

| File | Role |
|------|------|
| `docs/SOURCE_PROTOCOL_SERVER_CRASH.md` | This document — the protocol |
| `scripts/audit-all-fk-constraints.mjs` | Idempotent FK audit + repair script |
| `scripts/find-orphan-rsvps.mjs` | Read-only orphan RSVP finder |
| `scripts/delete-orphan-rsvps.mjs` | Delete orphan RSVPs + recreate FK |
| `scripts/reproduce-registrants-error.mjs` | Reproduction test for the 2026-06-28 incident |
| `scripts/regression-audit.sh` | Pre-deploy route/file regression check |
| `src/app/admin/registrants/page.tsx` | Reference implementation of Rule 1 (defensive include) |

## 5. Review cadence

This protocol MUST be re-read by the main agent:
- At the start of every session that touches Server Components or the Prisma schema
- Before every production deploy
- After every "Something went wrong in Server Components render" report

The DECLARED_FKS list in `scripts/audit-all-fk-constraints.mjs` MUST be reviewed whenever `prisma/schema.prisma` is edited.
