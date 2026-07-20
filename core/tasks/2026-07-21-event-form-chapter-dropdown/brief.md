# Task 2026-07-21 — Event Form: Chapter Dropdown + Auto-fill Country/City

- **Task ID**: `2026-07-21-event-form-chapter-dropdown`
- **Category**: **MID** (per `core/TASK_CATEGORIES.md`)
- **Status**: In progress
- **Owner (Meridian proxy)**: Z (main agent)
- **Implements**: Z directly
- **Reviewers (post-implementation, parallel)**: Canvas, Forge, Aegis, Sentinel, Beacon, Codex

---

## User's verbatim request

> 1. Under https://aisalon.massapro.com/admin/events/new make sure the new event form, has a Drop down menu for the chapter field
> 2. Under Venue, make sure the country and city is automatically selected when the Chapter field is filled, and can be edited by the event creator, admin, and Super Admin.

## Restated goal

Replace the free-form text `<input>` for **Chapter** on `/admin/events/new` with a `<select>` populated from the `Chapter` table (scoped to the creator's `UserScope`). When a chapter is chosen, the form auto-fills **Country** (from `Chapter.country.code`) and **City** (from `Chapter.city`) in the Venue section — but both fields remain editable text inputs so the creator can override them. The chosen chapter is persisted as `Event.chapterId` (the real FK); the legacy free-form `Event.chapter: String` field is still written as a denormalized cache of `Chapter.name` for backward compatibility.

## Acceptance criteria

- [ ] `/admin/events/new` renders a `<select>` for **Chapter** instead of a text input.
- [ ] The dropdown lists only chapters the current user can act on:
  - SUPER_ADMIN → all chapters (grouped by country, e.g. `Israel — Tel Aviv`, `Israel — Jerusalem`, `USA — NYC`)
  - ADMIN → chapters in their country
  - CHAPTER_ORGANIZER / CO_HOST → their own chapter only (the select is rendered as a disabled lock with the chapter preselected)
- [ ] When a chapter is selected, **Country** and **City** auto-fill from the chapter's `country.code` and `chapter.city`. Both fields remain editable.
- [ ] If the user changes the chapter after editing city/country, the city/country are re-overwritten with the new chapter's values (with a toast notification "Updated venue from chapter: <name>").
- [ ] The form POSTs `chapterId` (the FK) to `/api/admin/events` in addition to the legacy `chapter` string. The API persists `chapterId` and the denormalized `chapter`/`city`/`country` strings.
- [ ] `npx tsc --noEmit` passes on all touched files.
- [ ] Page builds cleanly (`npx next build` not required at MID tier — Vercel will build on push).
- [ ] No regression: an event created without selecting a chapter (edge case for SUPER_ADMIN) still works — `chapterId` null is allowed by the schema.

## Scope

### IN

- `src/app/admin/events/new/page.tsx` (server component — fetch chapters + scope, pass to client)
- `src/app/admin/events/new/new-event-form.tsx` (client component — add `<select>`, auto-fill logic, send `chapterId`)
- `src/app/api/admin/events/route.ts` (POST handler — accept and persist `chapterId`)

### OUT

- Editing existing events (that's `/admin/events/[id]/...` — separate task if needed)
- The legacy `Event.chapter: String` field's eventual removal (track in a follow-up)
- Any change to public event pages (`/events/...`)
- Any change to the events LIST page (`/admin/events`)

## Risks / unknowns

1. **Existing events without `chapterId`**: schema allows null. New form will always send one (except in the SUPER_ADMIN "no chapter selected" edge case). No backfill needed.
2. **Timezone**: chapters have a `timezone` field (default `Asia/Jerusalem`). The new-event form currently hardcodes `Asia/Jerusalem` in its datetime conversion. Out of scope for this task — tracked separately.
3. **Auto-fill override semantics**: if the user manually edits city/country, then changes the chapter, we overwrite their edits. The toast makes this explicit. Alternative would be "only auto-fill if empty" but the user's spec says "automatically selected when the Chapter field is filled" → overwrite is the requested behavior.

## Suggested gate skips

- **Gate 3 (Design)**: skip pre-implementation design gate (MID tier allows this). Canvas will review post-implementation.
- **Gate 4 (Security)**: skip pre-implementation security gate (MID tier allows this). Aegis will review post-implementation.
- All other gates: handled post-implementation per MID workflow.

## Owner per subtask

- **Z (main)**: All implementation (page.tsx, new-event-form.tsx, route.ts)
- **Canvas (subagent, post-impl)**: Review dropdown UX, grouping, lock state for CHAPTER_ORGANIZER
- **Forge (subagent, post-impl)**: Review API route change, `chapterId` persistence
- **Aegis (subagent, post-impl)**: Review auth scope on chapters fetch, verify no chapter organizer can create events in chapters outside their scope
- **Sentinel (subagent, post-impl)**: Smoke test on prod after deploy
- **Beacon (subagent, post-impl)**: Deploy plan awareness (Vercel auto-deploy)
- **Codex (subagent, post-impl)**: Release notes + worklog entry
