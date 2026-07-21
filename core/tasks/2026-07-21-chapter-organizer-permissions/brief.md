# Task 2026-07-21 — Chapter Organizer Permissions Refactor

- **Task ID**: `2026-07-21-chapter-organizer-permissions`
- **Category**: **HIGH** (per `core/TASK_CATEGORIES.md`)
- **Status**: In progress — Gate 1 (INTAKE)
- **Coordinator**: Z (main agent) as Meridian's proxy
- **Implementers**: Forge (backend, subagent) + Lumen (frontend, subagent) — per HIGH tier rule "Z does NOT implement directly"
- **Reviewers**: All 9 agents (full 11-gate workflow)

---

## User's verbatim request

> Create a chapter organizer user type, below Admin. He can edit all events, view members data, reset password, check-in, edit users data, merge users, create email sequences, send emails, see orchestrations, flows, and edit the templates, register speakers, create a event prep, edit agenda, add co host and speakers to events, edit mockups, create quiz.
> Admin can edit, add, delete chapter organizers, chapter organizers cannot edit or delete same user type, or admin or super admin

## Restated goal

Refactor the existing `CHAPTER_ORGANIZER` role (rank 2, currently nearly inert — most permissions require ADMIN rank 3) into a fully capable sub-admin role that can manage everything inside their chapter scope EXCEPT user-role management. Specifically:

1. **Downgrade ~15 permissions from ADMIN → CHAPTER_ORGANIZER** in `CAN_MAP` so chapter organizers can access the corresponding admin features.
2. **Add a new permission `members.manageOrganizers`** = ADMIN, that lets Admins add/edit/delete CHAPTER_ORGANIZER users.
3. **Strengthen role-change guard** so CHAPTER_ORGANIZER users cannot:
   - Edit, delete, or change the role of another CHAPTER_ORGANIZER, ADMIN, or SUPER_ADMIN
   - Promote anyone to CHAPTER_ORGANIZER / ADMIN / SUPER_ADMIN
4. **Update all gate checks** across the codebase so the new permission matrix is enforced consistently — pages, API routes, server components, client components.

## Acceptance criteria

### Permissions matrix (after refactor)

| Permission | Min role (before) | Min role (after) | Notes |
|---|---|---|---|
| `members.view` | ADMIN | **CHAPTER_ORGANIZER** | View members in own chapter scope |
| `members.edit` | ADMIN | **CHAPTER_ORGANIZER** | Edit profile fields (name, company, photo) in own chapter scope |
| `members.merge` | ADMIN | **CHAPTER_ORGANIZER** | Merge duplicate users in own chapter |
| `members.export` | ADMIN | **CHAPTER_ORGANIZER** | Export members in own chapter |
| `members.bulkImport` | ADMIN | **CHAPTER_ORGANIZER** | Bulk import to own chapter |
| `members.delete` | SUPER_ADMIN | SUPER_ADMIN | **Unchanged** — only Super Admin |
| `members.changeRole` | SUPER_ADMIN | SUPER_ADMIN | **Unchanged** — only Super Admin |
| `members.manageOrganizers` | (new) | **ADMIN** | Add/edit/delete CHAPTER_ORGANIZER users |
| `members.resetPassword` | (new) | **CHAPTER_ORGANIZER** | Reset password for members in own chapter |
| `events.create` | ADMIN | **CHAPTER_ORGANIZER** | Create events in own chapter |
| `events.edit` | ADMIN | **CHAPTER_ORGANIZER** | Edit events in own chapter |
| `events.delete` | SUPER_ADMIN | SUPER_ADMIN | **Unchanged** |
| `agenda.edit` | ADMIN | **CHAPTER_ORGANIZER** | Edit agenda in own chapter |
| `speakers.create` | ADMIN | **CHAPTER_ORGANIZER** | Register speakers |
| `speakers.edit` | ADMIN | **CHAPTER_ORGANIZER** | Edit speakers in own chapter |
| `registrants.view` | ADMIN | **CHAPTER_ORGANIZER** | View registrants in own chapter |
| `registrants.edit` | ADMIN | **CHAPTER_ORGANIZER** | Edit registrants |
| `email.view` | ADMIN | **CHAPTER_ORGANIZER** | See orchestrator, flows, campaigns |
| `email.send` | ADMIN | **CHAPTER_ORGANIZER** | Send campaigns |
| `email.templates` | ADMIN | **CHAPTER_ORGANIZER** | Edit templates |
| `images.manageAny` | ADMIN | **CHAPTER_ORGANIZER** | Manage images in own chapter's events |
| `images.rotate` | ADMIN | **CHAPTER_ORGANIZER** | Rotate images |
| `tags.manage` | ADMIN | **CHAPTER_ORGANIZER** | Manage tags |
| `eventprep.create` | (new) | **CHAPTER_ORGANIZER** | Create event prep |
| `eventprep.view` | SPEAKER | SPEAKER | **Unchanged** |
| `quiz.host` | CO_HOST | **CHAPTER_ORGANIZER** | Create quiz (was already accessible to CO_HOST=2, so functionally same — but explicitly CHAPTER_ORGANIZER now) |
| `chat.moderate` | ADMIN | **CHAPTER_ORGANIZER** | Moderate chat in own chapter |
| `chat.createRoom` | ADMIN | **CHAPTER_ORGANIZER** | Create chat rooms |

### Role-change guard rules (server-side, enforced in API)

| Action | SUPER_ADMIN | ADMIN | CHAPTER_ORGANIZER | Result |
|---|---|---|---|---|
| Edit own profile | ✅ | ✅ | ✅ | All can edit own profile |
| Edit another SUPER_ADMIN | ✅ | ❌ | ❌ | Only SUPER_ADMIN |
| Edit another ADMIN | ✅ | ❌ | ❌ | Only SUPER_ADMIN |
| Edit another CHAPTER_ORGANIZER | ✅ | ✅ | ❌ | ADMIN can edit CHAPTER_ORGANIZER; CHAPTER_ORGANIZER cannot edit peers |
| Edit a MEMBER | ✅ | ✅ | ✅ (own chapter only) | CHAPTER_ORGANIZER limited to own chapter scope |
| Delete a user | ✅ | ❌ | ❌ | Only SUPER_ADMIN |
| Change role to SUPER_ADMIN | ✅ | ❌ | ❌ | Only SUPER_ADMIN (via allowlist) |
| Change role to ADMIN | ✅ | ❌ | ❌ | Only SUPER_ADMIN |
| Change role to CHAPTER_ORGANIZER | ✅ | ✅ | ❌ | ADMIN can promote/demote CHAPTER_ORGANIZER |
| Promote MEMBER → CHAPTER_ORGANIZER | ✅ | ✅ | ❌ | ADMIN can promote within their country |

### Visible UI changes

- Chapter organizers will now see these admin tabs (previously hidden/redirected): Events, Members, Email, Images, Mockups, Quiz, Event Prep, Registrants, Check-in, Speakers
- For each of these tabs, the existing V7 scope filtering (`getUserScope`, `scopeEventWhere`, etc.) ensures they only see data within their chapter
- Admin-only actions in those tabs (delete member, change role) are visually hidden for chapter organizers — defense in depth on top of server enforcement
- New "Add chapter organizer" UI appears in /admin/members for ADMIN+ users (Super Admin + Admin)

## Scope

### IN

- `src/lib/permissions.ts` — bulk CAN_MAP changes + new permission strings + role-change guard helpers
- All `can(me.role, "...")` gate checks across `src/app/admin/**` + `src/app/api/admin/**` that need updating to match the new matrix
- New API endpoint (or extension of existing): `POST /api/admin/members/[id]/role` to change role with proper guards
- `/admin/members` page: add "Chapter Organizer" badge column + "Promote to Chapter Organizer" button (ADMIN+ only)
- Update `/admin/events/new` gate (currently `members.view`) — Forge's review of MID #1 flagged this as unreachable for CHAPTER_ORGANIZER; this HIGH task fixes it
- Update existing member-edit flow to enforce role-change guards

### OUT

- Bulk DB migration of existing users (no role data changes — only the permission matrix changes)
- Changes to SUPER_ADMIN or ADMIN behavior (those roles keep all current capabilities)
- Public-facing pages (events, member profile views) — no changes
- New UI components or design system changes — just wiring existing components with the new permission checks

## Risks / unknowns

1. **Surface area**: ~40-60 files may have `can(me.role, "members.view")` or similar checks that need updating. Need a thorough grep pass.
2. **Scope leak**: When CHAPTER_ORGANIZER gets `members.view`, every `/admin/members` query must already use `scopeUserWhere(scope)` to filter by chapter. Need to audit each list query.
3. **Role-change guard bugs**: The hardest part is the role-change API — easy to introduce a privilege escalation. Need comprehensive Aegis review.
4. **Backward compat**: Existing CO_HOST users (legacy V6) should be auto-treated as CHAPTER_ORGANIZER (already true via `normalizeRole`), but their permission set should match too.
5. **Quiz hosting**: `quiz.host` was previously at CO_HOST (rank 2). The user wants CHAPTER_ORGANIZER to "create quiz" — same rank, but the user spec says "create quiz" explicitly. Verify the quiz page gate uses `can(me.role, "quiz.host")` and that it resolves correctly for CHAPTER_ORGANIZER.
6. **Email send**: When CHAPTER_ORGANIZER can `email.send`, the email orchestrator must scope campaigns/templates/flows by their chapterId (already true per the V7 schema — see `EmailTemplate.chapterId`, `EmailCampaign.chapterId`, etc.). Audit each email query.

## Suggested owner per subtask

| Subtask | Owner |
|---|---|
| Permissions matrix refactor in `permissions.ts` | **Forge** (backend) |
| Role-change guard helpers (`canEditUser`, `canChangeRole`) | **Forge** |
| Update `can()` gates across admin pages + API routes | **Forge** |
| New role-change API endpoint with guards | **Forge** |
| `/admin/members` "Add chapter organizer" UI | **Lumen** (frontend) |
| Hide admin-only actions in member table for chapter organizers | **Lumen** |
| Verify scope filters on all list queries | **Forge** (with **Aegis** review) |
| Smoke test all affected admin pages | **Sentinel** |
| Deploy plan | **Beacon** |
| Release notes + close | **Codex** |

## Suggested gate skips

None. HIGH tier requires all 11 gates. If a gate turns out to be unnecessary (e.g. Atlas finds no schema change needed), that agent writes a `skipped.md` with reason — but the gate is still "walked".

## Dependencies on prior tasks

- **MID #1** (`2026-07-21-event-form-chapter-dropdown`): Forge flagged that the `/admin/events/new` page gate (`can(me.role, "members.view")`) blocks CHAPTER_ORGANIZER from reaching the new chapter-dropdown UI. This HIGH task fixes that gate. MID #1 should ideally be pushed first (or this HIGH task subsumes the fix).
- **HIGH epic** (`2026-07-21-images-mockups-quiz-chapter-scope`): Not yet started. Depends on this permissions refactor for the chapter organizer scope enforcement to be meaningful. Should be sequenced AFTER this task.
