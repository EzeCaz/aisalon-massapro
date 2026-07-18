# V7 — Global → Country → Chapter Hierarchy

**Started:** 2026-07-18
**Status:** DRAFT — not yet deployed

V7 turns the platform from a single-chapter deployment (Tel Aviv) into
a federation of country-level organizations, each containing
city-level chapters. See [`V7-START.md`](../../V7-START.md) for the
high-level summary and [`plan.md`](./plan.md) for the full
architectural design.

## Files in this directory

| File | Purpose |
|---|---|
| `plan.md` | Full architectural plan — roles, permissions, schema, migration, branding, reports |

## Files outside this directory (also part of V7)

| File | Purpose |
|---|---|
| `V7-START.md` (project root) | V7 series start marker, mirrors V6-START.md format |
| `prisma/migrations/V7-add-hierarchy/migration.sql` | Draft SQL migration (NOT applied) |
| `scripts/v7-seed-israel-tel-aviv.ts` | Seed script: creates Israel + Tel Aviv, backfills all records, migrates V6 roles |
| `src/lib/v7-scope.ts` | V7 scope helpers (getUserScope, scopeWhere, canActOnChapter, etc.) |

## What V7 changes (one-paragraph summary)

The V6 single-admin / single-chapter model is replaced with a
three-tier hierarchy: **Super Admin** (global) → **Admin** (country)
→ **Chapter Organizer** (single chapter). The `Country` and `Chapter`
tables are new; `User.countryId`, `User.chapterId`, and
`Event.chapterId` are new nullable columns. The existing free-form
`Event.chapter String @default("Tel Aviv")` column stays as a
denormalized cache of `Chapter.name` for backwards compatibility.
Branding (logo, hero, email domain, email templates) becomes
per-chapter with country-level and global fallbacks. All existing
members, speakers, registrants, and events are backfilled to Israel +
Tel Aviv during migration. The migration is purely additive — no V6
columns are dropped or modified — so rollback is safe.

## Migration order

1. Review [`plan.md`](./plan.md) and answer the 6 open questions at the bottom.
2. Apply `prisma/migrations/V7-add-hierarchy/migration.sql` to staging DB.
3. Run `npx tsx scripts/v7-seed-israel-tel-aviv.ts` against staging.
4. Verify counts (Israel exists, Tel Aviv exists, all users attached, all events attached).
5. Update `src/lib/permissions.ts` to use V7 role names (CO_HOST → CHAPTER_ORGANIZER; SPEAKER no longer a User role).
6. Wire `src/lib/v7-scope.ts` helpers into admin pages + API routes.
7. Update branding system for per-chapter assets.
8. Update email orchestrator for chapter-scoped sending.
9. Apply migration + run seed against production.
10. Deploy to Vercel.
11. Add V7 entry to `core/releases/release-log.md`.

## Not yet implemented (deferred until plan is approved)

- [ ] Update `src/lib/permissions.ts` `ROLES` map to V7 values
- [ ] Update `src/lib/auth.ts` `resolveInitialRole` for V7
- [ ] Wire `scopeWhere` into `src/app/admin/page.tsx` + `/api/admin/members`
- [ ] Wire `scopeWhere` into `/admin/dashboard`, `/admin/analytics`, `/admin/email/flows`
- [ ] New `/admin/chapters` page (CRUD)
- [ ] New `/admin/chapters/[id]` page (per-chapter branding editor)
- [ ] New `/admin/reports` page (cross-chapter analytics)
- [ ] Header chapter switcher for Super Admin + Admin
- [ ] `getBrandingForContext(chapterId)` resolver in `src/lib/site-settings.ts`
- [ ] Email orchestrator: resolve `fromEmail` / `replyTo` from chapter branding
- [ ] Public event pages: resolve branding from `event.chapterId`
