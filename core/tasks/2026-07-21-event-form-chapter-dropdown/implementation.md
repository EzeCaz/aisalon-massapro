# Implementation — Event Form: Chapter Dropdown + Auto-fill Country/City

**Task ID**: `2026-07-21-event-form-chapter-dropdown`
**Category**: MID
**Status**: Implementation complete; awaiting post-implementation review
**Date**: 2026-07-21

## Summary

Replaced the free-form text `<input>` for **Chapter** on `/admin/events/new` with a `<select>` populated from the `Chapter` table (scoped to the creator's `UserScope`). When a chapter is chosen, **Country** and **City** auto-fill from the chapter's `country.code` and `chapter.city` — both fields remain editable text inputs. The chosen chapter is persisted as `Event.chapterId` (the real FK); the legacy `Event.chapter: String` is also written as a denormalized cache of `Chapter.name` for backward compatibility.

## Files created / modified

### Modified

1. **`src/app/admin/events/new/page.tsx`** (server component)
   - Now fetches chapters the current user can act on:
     - SUPER_ADMIN → all active chapters (ordered by country name then chapter name)
     - ADMIN → chapters in their country only
     - CHAPTER_ORGANIZER / CO_HOST → their own chapter only
   - Maps Prisma's `{ country: { name, code, flagEmoji } }` shape to a flat `ChapterOption` type (passed to the client) so the form can auto-fill Venue without a round-trip.
   - Computes `lockedChapterId` for CHAPTER_ORGANIZER / CO_HOST (passed to client to disable the select + pre-select their chapter).
   - Computes `defaultChapter` for locked-scope users so the form is ready to submit out of the box (city/country pre-filled).

2. **`src/app/admin/events/new/new-event-form.tsx`** (client component)
   - Added `chapters`, `lockedChapterId`, `defaultChapter` props.
   - Exports `ChapterOption` type (imported by page.tsx).
   - Replaced the free-text Chapter `<input>` with a `<select>` grouped by country (`<optgroup>`).
   - When `lockedChapterId` is set, the select renders disabled with a `Lock` icon overlay.
   - Added `useEffect` that fires when `chapterId` changes (not on initial mount) — auto-fills `country` from `selectedChapter.countryCode` and `city` from `selectedChapter.city`, then fires an info toast: "Venue updated from chapter: 🇮🇱 Tel Aviv — Israel".
   - City/Country inputs now show a hint that they were auto-filled from the chapter, with "edit if needed" copy.
   - `handleSubmit` now sends `chapterId` (the FK) alongside the legacy `chapter` string. Defensively rejects the case where a CHAPTER_ORGANIZER somehow submits a different `chapterId` than their locked one.

3. **`src/app/api/admin/events/route.ts`** (POST handler)
   - Accepts `chapterId` in the request body alongside the legacy `chapter` string.
   - When `chapterId` is provided:
     - Looks up the chapter (id, name, countryId, isActive) — returns 404 if not found, 400 if inactive.
     - Calls `getUserScope(me.id)` and strictly checks:
       - country scope → `chapterRow.countryId === scope.countryId`
       - chapter scope → `chapterRow.id === scope.chapterId`
       - none scope → 403
     - Returns 403 with a clear message if scope check fails.
   - When `chapterId` is NOT provided: only SUPER_ADMIN / ADMIN can create events without a chapter (rare edge case). CHAPTER_ORGANIZER / CO_HOST get a 400 "Chapter is required".
   - Writes both `chapterId` (real FK) and the legacy `chapter: String` cache (set to `chapterRow.name`) on the new Event row.

### Not modified (out of scope per brief)

- Existing event editor (`/admin/events/[id]/...`) — separate task if needed
- Public event pages (`/events/...`)
- Events LIST page (`/admin/events`) — already has scope filtering
- Legacy `Event.chapter: String` field removal — tracked as a follow-up

## Schema diff

**None.** `Event.chapterId` (the FK to `Chapter`) already exists in `prisma/schema.prisma` as a nullable String with `onDelete: SetNull`. No migration needed.

## API changes

- `POST /api/admin/events`:
  - **New body field**: `chapterId: string | null` (the FK to Chapter)
  - **Existing field preserved**: `chapter: string` (legacy free-form — still written as a denormalized cache of `Chapter.name` when `chapterId` is provided)
  - **New validation**: 403 if `chapterId` is outside the caller's UserScope
  - **New validation**: 400 if `chapterId` is omitted by a non-SUPER_ADMIN/ADMIN user

## Auth + security

- Page-level: `/admin/events/new` already required `can(me.role, "members.view")` (unchanged).
- Server-side chapter fetch is scoped by role:
  - SUPER_ADMIN → all chapters
  - ADMIN → chapters in `me.countryId`
  - CHAPTER_ORGANIZER / CO_HOST → only `me.chapterId`
- API-level: `chapterId` is scope-checked server-side via `getUserScope`. A CHAPTER_ORGANIZER cannot create events in another chapter even if they tamper with the client-side disabled select.
- Client-level: the select is disabled for CHAPTER_ORGANIZER / CO_HOST (defense in depth, not the primary enforcement).

## UI/UX decisions

- **Country grouping in the select**: chapters are grouped by country via `<optgroup>` so SUPER_ADMIN sees `🇮🇱 Israel → Tel Aviv`, `🇮🇱 Israel → Jerusalem`, `🇺🇸 USA → NYC` instead of a flat list. This scales as more countries/chapters are added.
- **Auto-fill overwrite semantics**: per spec, selecting a chapter OVERWRITES the city/country fields (not "only if empty"). The toast makes this explicit so the user knows their edits were overwritten. The user can still edit afterwards.
- **Hint copy under City/Country**: "Auto-filled from 'Tel Aviv' chapter — edit if needed." Makes the data lineage visible.
- **Lock state for CHAPTER_ORGANIZER**: select is visually disabled with a `Lock` icon overlay. Field label changes to "Chapter (locked to your chapter)" and hint reads "You can only create events in your assigned chapter."

## Smoke test plan (for Sentinel)

After deploy to prod:

1. As SUPER_ADMIN (`eze@massapro.com`):
   - Visit `/admin/events/new`. Confirm the Chapter select shows all chapters grouped by country.
   - Select "Tel Aviv". Confirm City → "Tel Aviv-Yafo" (or whatever's set on the chapter) and Country → "IL". Confirm toast appears.
   - Edit City to "Herzliya". Save the event. Confirm the new event row in the DB has `chapterId = <Tel Aviv's id>`, `city = "Herzliya"`, `country = "IL"`, `chapter = "Tel Aviv"`.
2. As ADMIN (a country-scoped admin):
   - Visit `/admin/events/new`. Confirm the select shows only chapters in their country.
3. As CHAPTER_ORGANIZER:
   - Visit `/admin/events/new`. Confirm the select is locked to their chapter, with the Lock icon visible. Confirm city/country are pre-filled.
   - Attempt to submit a different `chapterId` via devtools — confirm the API returns 403.
4. Regression: create an event without selecting a chapter (SUPER_ADMIN only, edge case). Confirm the event is created with `chapterId = null`.

## tsc / eslint

- `bunx tsc --noEmit` — passes cleanly on all 3 modified files (no new errors introduced; pre-existing errors in unrelated files like `non-member-dashboard.tsx` remain but are out of scope).
- `bunx eslint <3 files>` — passes cleanly (0 errors, 0 warnings).

## Signoff

- **Implementation signoff**: Z (main agent), 2026-07-21, tsc=pass, eslint=pass
- **Post-implementation review**: pending Canvas, Forge, Aegis (invoked in parallel)
