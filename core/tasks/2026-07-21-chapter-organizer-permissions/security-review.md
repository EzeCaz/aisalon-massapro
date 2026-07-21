# Security Review — Gate 4 (SECURITY)

**Task**: `2026-07-21-chapter-organizer-permissions`
**Agent**: Aegis
**Date**: 2026-07-21
**Tier**: HIGH
**Verdict**: ⚠️ **REQUIRED CHANGES** — see Section 5. APPROVED to proceed to Gate 5 (BACKEND) only after Forge acknowledges and addresses every REQUIRED item in Section 4. The downgrade is *not* safe to ship as a pure `CAN_MAP` edit; ~28 routes need scope-filter hardening in the same PR.

---

## 0. Executive summary

The brief proposes downgrading ~15 permissions from `ADMIN` → `CHAPTER_ORGANIZER` in `CAN_MAP`. The `can()` helper only checks **role rank** — it does NOT check chapter scope. Therefore, every API route + page that gains CHAPTER_ORGANIZER access must **independently** scope its data via `getUserScope(me.id)` + `scopeUserWhere` / `scopeEventWhere` / `scopeChapterWhere`. If Forge only edits `CAN_MAP` and updates the `can(...)` strings, a CHAPTER_ORGANIZER will instantly gain cross-chapter and cross-country read/write access to members, events, RSVPs, quiz sessions, and the email orchestrator queue.

This review audited 66 files containing `can(me...)` calls and the 13 files that already use `scopeXxxWhere`. Findings:

- **3 critical privilege-escalation vectors** in routes that currently rely on `can(me.role, "members.view")` as a *surrogate* for "is admin" and return global data (members list, quiz sessions, email orchestrator queue).
- **28 routes** that don't yet scope their data by `UserScope` and MUST be hardened before the downgrade lands. Without this, a Tel-Aviv chapter organizer can read every member in Berlin, edit any event's date in NYC, or force-send emails to recipients in any event globally.
- **Role-change guard** is currently SAFE by accident (it hard-blocks role changes for non-Super-Admins). The brief's new ADMIN → CHAPTER_ORGANIZER promotion flow **requires** new `canEditUser` / `canChangeRole` / `canDeleteUser` helpers — these don't exist yet, and the current `PATCH /api/admin/members/[id]` route has **no chapter-scope check on profile edits**, which becomes a hole the moment CHAPTER_ORGANIZER gains `members.edit`.
- **No `ActivityLog` model exists** in `prisma/schema.prisma` (confirmed by Atlas in `skipped.md`). Audit trail of role changes is therefore **recommended-but-not-required** for this task — log to `console.log` with a clear prefix and add an `ActivityLog` table as a separate follow-up task.
- CSRF / session posture is unchanged (NextAuth `SameSite=Lax`, JSON `fetch()` mutations) — **no new CSRF risk introduced**.

The downgrade is safe to ship **only if** Forge lands the scope-filter hardening in Section 4 in the same PR as the `CAN_MAP` edit. The two changes are inseparable.

---

## 1. Auth check per route — every endpoint that gains CHAPTER_ORGANIZER access

Legend:
- ✅ = already safe (scope filter in place)
- ❌ = **MUST FIX** before downgrade lands
- ⚠️ = needs verification or minor change
- "Gate" = the `can(me.role, "...")` string used today
- "Scope filter" = what the route must additionally apply after the downgrade

### 1.1 Member management routes (`/api/admin/members/**`)

| Route | Gate today | Scope filter today | Required after downgrade | Status |
|---|---|---|---|---|
| `GET /api/admin/members` (`members/route.ts`) | `members.view` | **NONE** — returns all users globally | `where: { ...scopeUserWhere(await getUserScope(me.id)) }` | ❌ **CRITICAL** |
| `GET /api/admin/members/search` | `members.view` | (likely none — verify) | `scopeUserWhere(scope)` ANDed with search filter | ❌ verify |
| `GET /api/admin/members/companies` | `members.view` | (likely none — verify) | Scope by chapter before aggregating companies | ❌ verify |
| `GET /api/admin/members/activity-report` | `members.view` | (likely none — verify) | Scope by chapter before computing report | ❌ verify |
| `POST /api/admin/members/bulk-import` | `members.view` | **NONE** — creates users with no chapterId | **Force-set `countryId` + `chapterId` from caller's scope** (CHAPTER_ORGANIZER can't pick a different chapter) | ❌ **CRITICAL** |
| `POST /api/admin/members/bulk-tags` | `members.view` | **NONE** — accepts any `userIds[]` | Verify every `userId` matches `scopeUserWhere(scope)` before mutating tags | ❌ **CRITICAL** |
| `POST /api/admin/members/merge` | `members.view` | **NONE** — accepts any `primaryId` + `secondaryIds` | Verify ALL ids match `scopeUserWhere(scope)` AND none of the secondaries is an ADMIN/SUPER_ADMIN/CHAPTER_ORGANIZER outside the caller's chapter (don't let CO merge admins from another chapter) | ❌ **CRITICAL** |
| `POST /api/admin/members/bulk-reset-password` | `members.edit` | **NONE** — accepts any `userIds[]`, only blocks SUPER_ADMIN targets | Verify every `userId` matches `scopeUserWhere(scope)`. Skip targets whose role ≥ caller's role (don't let a CO reset another CO's password). | ❌ **CRITICAL** |
| `PATCH /api/admin/members/[id]` (profile edit) | `members.edit` | **NONE** — accepts any `id` | (a) `canEditUser(me, target)` check; (b) if caller is CHAPTER_ORGANIZER, target must be MEMBER in caller's chapter; (c) role/countryId/chapterId changes must go through `canChangeRole` + `canEditUserScope` (see Section 2) | ❌ **CRITICAL** |
| `DELETE /api/admin/members/[id]` | SUPER_ADMIN only | n/a (already locked) | Unchanged — only SUPER_ADMIN can delete. (Brief keeps `members.delete` at SUPER_ADMIN.) | ✅ |
| `POST /api/admin/members/[id]/reset-password` | `members.edit` | **NONE** — accepts any `id`, only blocks SUPER_ADMIN target | Verify target matches `scopeUserWhere(scope)`. Add the role-rank check (don't let CO reset an ADMIN's password). | ❌ **CRITICAL** |
| `POST /api/admin/members/[id]/emails` (add secondary) | `members.view` | **NONE** | Verify target matches `scopeUserWhere(scope)` | ❌ |
| `DELETE /api/admin/members/[id]/emails/[emailId]` | `members.view` | **NONE** (does check email belongs to user) | Verify target matches `scopeUserWhere(scope)` | ❌ |
| `PUT /api/admin/members/[id]/tags` | `members.view` | **NONE** | Verify target matches `scopeUserWhere(scope)` | ❌ |
| `POST /api/admin/members/[id]/convert-to-speaker` | `members.view` | **NONE** — accepts any user `id` + any `eventId` | Verify BOTH (a) target user is in caller's scope AND (b) target event is in caller's scope (`scopeEventWhere`) | ❌ **CRITICAL** |
| `POST /api/admin/members/[id]/link-speaker` | (verify) | (verify) | Same as convert-to-speaker | ❌ verify |

### 1.2 Event routes (`/api/admin/events/**`)

| Route | Gate today | Scope filter today | Required after downgrade | Status |
|---|---|---|---|---|
| `POST /api/admin/events` (create) | `members.view` ❗ | ✅ has V7 `getUserScope` + `chapterId` scope check (lines 56–110 of `events/route.ts`) | Gate should become `events.create` (it currently uses `members.view` as a loose proxy — works today because both were ADMIN, but diverges after downgrade). The scope check itself is correct. | ⚠️ change gate string |
| `GET /api/admin/events/[id]` | `events.edit` (via `authorizeForEventView`) | **NONE** — returns any event by id | Add: if `scope.kind === "chapter"`, event.chapterId must equal scope.chapterId; if `scope.kind === "country"`, event.chapterRef.countryId must equal scope.countryId | ❌ **CRITICAL** |
| `PATCH /api/admin/events/[id]` | `events.edit` (via `authorizeForEventEdit`) | **NONE** — accepts any event id | Same as GET — verify event.chapterId is in caller's scope before allowing write. Without this, a Tel-Aviv CO can change a Berlin event's date. | ❌ **CRITICAL** |
| `DELETE /api/admin/events/[id]` | SUPER_ADMIN only | n/a | Unchanged. | ✅ |
| `PATCH /api/admin/events/[id]/main-image` | `members.view` ❗ (loose gate) | **NONE** — accepts any event id | (a) Change gate to `images.manageAny` or `events.edit`; (b) add event scope check | ❌ **CRITICAL** |
| `GET /api/admin/events/[id]/cohosts` | `events.edit` | **NONE** | Verify event in scope before returning co-host list | ❌ |
| `POST /api/admin/events/[id]/cohosts` | `events.edit` | **NONE** — accepts any event id + any `userId` | Verify event in caller's scope AND target user is in caller's scope (don't let a Tel-Aviv CO add a Berlin member as co-host of a Tel-Aviv event — they could be giving cross-chapter access). Also: this route auto-upgrades MEMBER → CO_HOST (line 121). That's a role change — it must go through `canChangeRole` (CHAPTER_ORGANIZER should NOT be allowed to do this). | ❌ **CRITICAL** |
| `DELETE /api/admin/events/[id]/cohosts/[userId]` | `events.edit` | (verify) | Same scope check | ❌ verify |
| `GET /api/admin/events/[id]/rsvps` | `members.view` | (verify) | Scope RSVPs by event chapter | ❌ verify |
| `POST /api/admin/events/[id]/rsvps` | `members.view` | (verify) | Verify event in caller's scope | ❌ verify |
| `PATCH /api/admin/events/[id]/rsvps/[rsvpId]/approve` | `members.view` | (verify) | Verify event in caller's scope | ❌ verify |
| `PATCH /api/admin/events/[id]/mockup-defaults` | `members.view` | (verify) | Verify event in caller's scope | ❌ verify |
| `POST /api/admin/events/extract` | `members.view` | (verify) | Verify event in caller's scope | ❌ verify |

### 1.3 Registrant routes (`/api/admin/registrants/**`)

| Route | Gate today | Scope filter today | Required after downgrade | Status |
|---|---|---|---|---|
| `GET /api/admin/registrants?eventId=…` | `members.view` | **NONE** — returns all RSVPs globally if no `eventId` query | (a) If `eventId` provided, verify event in caller's scope; (b) if no `eventId`, restrict to events in caller's scope via `scopeEventWhere(scope)` | ❌ **CRITICAL** |
| `POST /api/admin/registrants` | `members.view` | **NONE** — accepts any `eventId` | Verify event in caller's scope | ❌ **CRITICAL** |
| `PATCH /api/admin/registrants/[id]` | `members.view` | **NONE** | Verify RSVP's event is in caller's scope | ❌ **CRITICAL** |
| `POST /api/admin/registrants/bulk-import` | `members.view` | (verify) | Verify target event in scope | ❌ verify |
| `POST /api/admin/registrants/bulk-link` | `members.view` | (verify) | Verify target event in scope + every userId in scope | ❌ verify |
| `GET /api/admin/registrants/find-members` | `members.view` | (verify) | Scope by chapter | ❌ verify |

### 1.4 Email routes

| Route | Gate today | Scope filter today | Required after downgrade | Status |
|---|---|---|---|---|
| `/admin/email` (page) | `members.view` ❗ | ✅ `emailModelWhere` derived from scope (lines 47–61 of `email/page.tsx`) | Change gate to `email.view` (cosmetic — rank is same). Scope filter is correct. | ⚠️ change gate string |
| `POST /api/admin/email/force-send-stage` | `members.view` ❗ (loose) | **NONE** — accepts any `eventId`, sends across all events at that stage | (a) Change gate to `email.send`; (b) if `eventId` provided, verify event in caller's scope; (c) if no `eventId`, restrict rows to events in caller's scope via `scopeEventWhere(scope)`. **Without this, a Tel-Aviv CO can force-email recipients of any Berlin event.** | ❌ **CRITICAL** |
| `GET /api/email-orchestrator/queue` | `members.view` ❗ (loose) | **NONE** — returns ALL `EmailQueue` rows globally | (a) Change gate to `email.view`; (b) scope `where` by `scopeEventWhere(scope)` (EmailQueue has `eventId` + `event` relation); (c) the `events` list at the bottom must also be scoped | ❌ **CRITICAL** (PII leak — recipient emails + names) |
| `POST /api/email-orchestrator/seed` | `members.view` ❗ | n/a — modifies GLOBAL seed data (test audience + stage templates) | **Restrict to ADMIN+** (not CHAPTER_ORGANIZER). Seeding affects every chapter's orchestrator state. Change gate to `email.templates` (ADMIN) OR keep at `members.view` but explicitly check `hasAtLeastRole(me.role, ROLES.ADMIN)`. | ❌ **CRITICAL** |
| `POST /api/email-orchestrator/simulate` | `members.view` ❗ | (verify) | Should respect event scope. Likely ADMIN+-only since simulation affects global state. | ❌ verify |
| `POST /api/email-orchestrator/run` | `members.view` ❗ | (verify) | **Restrict to ADMIN+** — running the worker globally is not chapter-scoped. (Cron-secret bypass remains.) | ❌ **CRITICAL** |
| Email campaign create/send endpoints (likely under `/api/admin/email/campaigns/**`) | (verify) | (verify) | Campaign must inherit caller's `chapterId` (or be blocked if caller is CHAPTER_ORGANIZER trying to send a global campaign) | ❌ verify |
| Email template edit endpoints | `email.templates` | (verify) | Verify template.chapterId is in caller's scope OR (if global template with chapterId=null) restrict write to ADMIN+ | ❌ verify |

### 1.5 Quiz routes (`/api/admin/quiz/**`)

| Route | Gate today | Scope filter today | Required after downgrade | Status |
|---|---|---|---|---|
| `GET /api/admin/quiz` | `quiz.host` | **NONE** — returns all quiz sessions globally | Filter sessions by host's chapter OR by event.chapterId in caller's scope. **A Tel-Aviv CO currently sees every quiz session in Berlin — this is a latent bug that becomes more visible after the brief explicitly adds CHAPTER_ORGANIZER to `quiz.host`.** | ❌ **CRITICAL** |
| `POST /api/admin/quiz` | `quiz.host` | **NONE** — accepts any `eventId` | Verify `eventId`'s chapter is in caller's scope (or null event = OK) | ❌ **CRITICAL** |
| `GET /api/admin/quiz/[id]` | `quiz.host` | **NONE** | Verify quiz's event (if any) is in caller's scope OR quiz.hostId === me.id | ❌ **CRITICAL** |
| `PATCH /api/admin/quiz/[id]` | `quiz.host` | **NONE** — accepts any `eventId` for re-linking | Same as above + verify event in scope when re-linking | ❌ **CRITICAL** |
| `DELETE /api/admin/quiz/[id]` | `quiz.host` | **NONE** | Verify quiz in caller's scope OR hostId === me.id | ❌ **CRITICAL** |
| `POST /api/admin/quiz/[id]/questions` and sub-routes | `quiz.host` | (verify) | Verify parent quiz in scope | ❌ verify |
| `POST /api/admin/quiz/[id]/restart` / `duplicate` / `clear-responses` | `quiz.host` | (verify) | Verify parent quiz in scope | ❌ verify |
| `GET /api/admin/quiz/events` | `quiz.host` | (verify) | Scope events by `scopeEventWhere(scope)` | ❌ verify |

### 1.6 Image / mockup / agenda / speaker / check-in routes

| Route | Gate today | Scope filter today | Required after downgrade | Status |
|---|---|---|---|---|
| `/admin/images` (page) | `members.view` ❗ | n/a (page just renders gallery; writes go through API) | Page is OK. But: change gate to `images.manageAny` for clarity. The write buttons must check `can(me.role, "images.manageAny")` AND verify target event in scope. | ⚠️ gate string |
| `POST /api/admin/events/[id]/main-image` (covered above) | `members.view` ❗ | NONE | See 1.2 | ❌ |
| Image upload routes (verify in `/api/admin/events/[id]/images/**`) | (verify) | (verify) | Verify event in scope | ❌ verify |
| Mockup routes (`/api/admin/events/[id]/mockups/**`) | (verify) | (verify) | Verify event in scope | ❌ verify |
| `POST /api/admin/check-in/lookup` | `events.edit` | ✅ has CO_HOST scope check via `isEventCoHost` for non-admins. But after downgrade, `can(me.role, "events.edit")` returns true for CHAPTER_ORGANIZER → `isGlobalAdmin = true` → bypasses any chapter check. **Need to add:** if caller is CHAPTER_ORGANIZER, verify the RSVP's event is in their chapter scope (similar pattern to `getUserScope`). | ❌ **CRITICAL** |
| `POST /api/admin/check-in/confirm` | `events.edit` | (verify — likely same issue as lookup) | Same fix | ❌ **CRITICAL** |
| `POST /api/admin/rsvps/[id]/generate-code` | `members.view` | (verify) | Verify RSVP's event in scope | ❌ verify |
| Agenda edit routes (`/api/admin/events/[id]/agenda/**`) | `agenda.edit` + `agenda.editCoHosted` via `requireEventAgendaEdit` | ✅ uses `requireEventAgendaEdit` which checks `isEventCoHost` for CO_HOST. But it does NOT check chapter scope for CHAPTER_ORGANIZER. **After downgrade**, a CHAPTER_ORGANIZER gets `agenda.edit` (rank-passes the helper's first branch) → can edit ANY event's agenda globally. **Fix:** add chapter-scope check inside `requireEventAgendaEdit` for CHAPTER_ORGANIZER. | ❌ **CRITICAL** |
| Speaker edit routes (`/api/admin/events/[id]/speakers/**`) | `speakers.edit` + `speakers.editCoHosted` via `requireEventSpeakersEdit` | Same gap as agenda — `requireEventSpeakersEdit` returns `user` immediately if `can(role, "speakers.edit")` is true. After downgrade, CHAPTER_ORGANIZER passes this check and gets global speaker edit. | ❌ **CRITICAL** |

### 1.7 Admin pages (server components — for visibility, not data mutation)

| Page | Gate today | Scope filter today | Required after downgrade | Status |
|---|---|---|---|---|
| `/admin` (page.tsx) | `members.view` | ✅ `scopeUserWhere` + `scopeEventWhere` + chapter-scoped speakers list | Change gate to `members.view` (already correct after downgrade). No code change needed. | ✅ |
| `/admin/events` (page.tsx) | (verify) | (verify) | Should use `scopeEventWhere` | ⚠️ verify |
| `/admin/events/new` (page.tsx) | `members.view` ❗ | ✅ scopes chapter list to caller's country/chapter | Change gate to `events.create` (currently `members.view` — works today because both were ADMIN, diverges after downgrade). Page logic is correct. | ⚠️ gate string |
| `/admin/events/[id]` (page.tsx) | (verify) | (verify) | Should verify event in scope before rendering edit form | ⚠️ verify |
| `/admin/email` (page.tsx) | `members.view` ❗ | ✅ `emailModelWhere` from scope | Change gate to `email.view` | ⚠️ gate string |
| `/admin/images` (page.tsx) | `members.view` ❗ | n/a (page only renders gallery) | Change gate to `images.manageAny` | ⚠️ gate string |
| `/admin/quiz` (page.tsx) | (verify) | (verify — likely calls `/api/admin/quiz` which has no scope) | Page is OK once API is fixed | ⚠️ verify |
| `/admin/quiz/[id]` (page.tsx) | (verify) | (verify) | Same | ⚠️ verify |
| `/admin/mockups/**` (4 pages) | `members.view` | (verify) | Should verify event in scope | ⚠️ verify |
| `/admin/registrants` (page.tsx) | `members.view` | (verify) | Should scope RSVPs by chapter | ⚠️ verify |
| `/admin/speakers` (page.tsx) | (verify) | (verify — uses `scopeChapterWhere` per grep) | Likely OK; verify | ⚠️ verify |
| `/admin/dashboard` (page.tsx) | (verify) | (verify) | Should scope stats by chapter | ⚠️ verify |
| `/admin/knowledge-base` (page.tsx) | (verify) | (verify) | Likely ADMIN+-only — should NOT downgrade to CHAPTER_ORGANIZER unless explicitly desired | ⚠️ verify |
| `/admin/analytics` (page.tsx) | (verify) | ✅ uses scope helpers per grep | Likely OK | ⚠️ verify |
| `/admin/reports` (page.tsx) | (verify) | ✅ uses scope helpers per grep | Likely OK | ⚠️ verify |
| `/admin/event` (page.tsx) | (verify) | (verify) | Verify scope | ⚠️ verify |

---

## 2. Role-change guard spec

Forge MUST add the following helpers to `src/lib/permissions.ts`. They are async (DB lookups for caller/target scope comparison). All role mutations in the API must route through them — no inline role checks.

### 2.1 `canEditUser(caller, target)`

```ts
/**
 * Returns true if `caller` can edit `target`'s profile fields (name,
 * bio, company, photo, mobile, tags, etc.) — NOT role, NOT scope.
 *
 * Rules:
 *   - Self-edit: always allowed (subject to canChangeRole for the role field).
 *   - SUPER_ADMIN: can edit anyone (except they cannot edit their own
 *     SUPER_ADMIN status — handled by canChangeRole).
 *   - ADMIN: can edit MEMBER + CHAPTER_ORGANIZER whose countryId matches
 *     the admin's country. CANNOT edit ADMIN/SUPER_ADMIN.
 *   - CHAPTER_ORGANIZER: can edit MEMBER whose chapterId matches the
 *     organizer's chapter. CANNOT edit CHAPTER_ORGANIZER/ADMIN/SUPER_ADMIN.
 *   - Everyone else (MEMBER/SPEAKER/CO_HOST legacy): false.
 */
export async function canEditUser(
  caller: { id: string; email: string; role: string },
  target: { id: string; email: string; role: string; countryId: string | null; chapterId: string | null },
): Promise<boolean> {
  // Self-edit allowed (the role-change path is gated separately).
  if (caller.id === target.id) return true;

  // Super Admin can edit anyone (the SUPER_ADMIN_EMAILS check is the
  // authoritative source of super-admin status).
  if (isSuperAdmin({ email: caller.email, role: caller.role })) return true;

  // Super Admin targets are immutable from below.
  if (isSuperAdminEmail(target.email)) return false;

  const callerRole = normalizeRole(caller.role);
  const targetRole = normalizeRole(target.role);

  if (callerRole === ROLES.ADMIN) {
    // ADMIN cannot edit ADMIN or SUPER_ADMIN.
    if (targetRole === ROLES.ADMIN || targetRole === ROLES.SUPER_ADMIN) return false;
    // ADMIN can edit MEMBER + CHAPTER_ORGANIZER in their country.
    const callerScope = await getUserScope(caller.id);
    if (callerScope.kind !== "country") return false; // admin without country = misconfigured
    return target.countryId === callerScope.countryId;
  }

  if (callerRole === ROLES.CHAPTER_ORGANIZER || callerRole === ROLES.CO_HOST) {
    // CHAPTER_ORGANIZER can ONLY edit MEMBERs in their chapter.
    if (targetRole !== ROLES.MEMBER) return false;
    const callerScope = await getUserScope(caller.id);
    if (callerScope.kind !== "chapter") return false;
    return target.chapterId === callerScope.chapterId;
  }

  return false;
}
```

### 2.2 `canChangeRole(caller, target, newRole)`

```ts
/**
 * Returns true if `caller` can change `target`'s role to `newRole`.
 *
 * Rules:
 *   - SUPER_ADMIN: can change any role EXCEPT
 *       (a) cannot grant SUPER_ADMIN (only the hardcoded email list can),
 *       (b) cannot strip SUPER_ADMIN status from a SUPER_ADMIN_EMAIL target.
 *   - ADMIN: can promote/demote between MEMBER <-> CHAPTER_ORGANIZER,
 *     but ONLY for targets in their country, and ONLY when the target
 *     is currently MEMBER or CHAPTER_ORGANIZER (cannot touch ADMIN or
 *     SUPER_ADMIN, cannot grant ADMIN or SUPER_ADMIN).
 *   - CHAPTER_ORGANIZER: CANNOT change any role. Always returns false.
 *   - Everyone else: false.
 *
 * NOTE: this function does NOT validate that `newRole` is a known Role
 * string — the caller must do that separately (e.g. via ASSIGNABLE_ROLES).
 */
export async function canChangeRole(
  caller: { id: string; email: string; role: string },
  target: { id: string; email: string; role: string; countryId: string | null; chapterId: string | null },
  newRole: Role,
): Promise<boolean> {
  const newRoleNorm = normalizeRole(newRole);

  // SUPER_ADMIN rule.
  if (isSuperAdmin({ email: caller.email, role: caller.role })) {
    // Cannot grant SUPER_ADMIN via this API — it's email-allowlist-only.
    if (newRoleNorm === ROLES.SUPER_ADMIN) return false;
    // Cannot strip SUPER_ADMIN status from a hardcoded email target.
    if (isSuperAdminEmail(target.email) && newRoleNorm !== ROLES.SUPER_ADMIN) return false;
    return true;
  }

  const callerRole = normalizeRole(caller.role);

  // ADMIN rule.
  if (callerRole === ROLES.ADMIN) {
    // ADMIN cannot touch SUPER_ADMIN or ADMIN targets.
    if (isSuperAdminEmail(target.email)) return false;
    const targetRoleNorm = normalizeRole(target.role);
    if (targetRoleNorm === ROLES.SUPER_ADMIN || targetRoleNorm === ROLES.ADMIN) return false;
    // ADMIN cannot grant ADMIN or SUPER_ADMIN.
    if (newRoleNorm === ROLES.SUPER_ADMIN || newRoleNorm === ROLES.ADMIN) return false;
    // ADMIN can only move between MEMBER <-> CHAPTER_ORGANIZER.
    if (newRoleNorm !== ROLES.MEMBER && newRoleNorm !== ROLES.CHAPTER_ORGANIZER) return false;
    // Target must be in the admin's country.
    const callerScope = await getUserScope(caller.id);
    if (callerScope.kind !== "country") return false;
    if (target.countryId !== callerScope.countryId) return false;
    return true;
  }

  // CHAPTER_ORGANIZER + everyone else: cannot change roles.
  return false;
}
```

### 2.3 `canDeleteUser(caller, target)`

```ts
/**
 * Returns true if `caller` can permanently delete `target`.
 *
 * Rules:
 *   - ONLY SUPER_ADMIN can delete. (Brief keeps members.delete at SUPER_ADMIN.)
 *   - SUPER_ADMIN cannot delete themselves (footgun).
 *   - SUPER_ADMIN cannot delete another SUPER_ADMIN (their role is
 *     hardcoded by email — deleting the row would just recreate it on
 *     next sign-in, so we block it for clarity).
 */
export function canDeleteUser(
  caller: { id: string; email: string; role: string },
  target: { id: string; email: string },
): boolean {
  if (!isSuperAdmin({ email: caller.email, role: caller.role })) return false;
  if (caller.id === target.id) return false; // no self-delete
  if (isSuperAdminEmail(target.email)) return false; // super admin is immutable
  return true;
}
```

### 2.4 `canEditUserScope(caller, target)` — bonus helper for `countryId`/`chapterId` changes

```ts
/**
 * Returns true if `caller` can change `target`'s countryId / chapterId.
 *
 * Rules:
 *   - SUPER_ADMIN: yes (subject to the SUPER_ADMIN_EMAIL immutability rule).
 *   - ADMIN: NO — only SUPER_ADMIN can allocate scope. (Admins promote
 *     within their existing country; the scope itself is set by Super Admin.)
 *   - Everyone else: NO.
 *
 * This is a separate check from canChangeRole because scope allocation
 * is more sensitive than role itself (a misplaced ADMIN scope could
 * expose an entire country's data).
 */
export function canEditUserScope(
  caller: { email: string; role: string },
  target: { email: string },
): boolean {
  if (!isSuperAdmin({ email: caller.email, role: caller.role })) return false;
  if (isSuperAdminEmail(target.email)) return false;
  return true;
}
```

### 2.5 Required call-site rewiring in `PATCH /api/admin/members/[id]`

The current route allows ADMIN to edit any non-SUPER-ADMIN profile with no chapter-scope check. After the downgrade, the route MUST:

1. Replace the loose `can(me.role, "members.edit")` check with `await canEditUser(me, existing)`.
2. Move the role-change block behind `await canChangeRole(me, existing, newRole)`.
3. Move the `countryId`/`chapterId` block behind `canEditUserScope(me, existing)`.
4. Forbid `body.role` entirely when the caller is CHAPTER_ORGANIZER (defense in depth — `canChangeRole` already returns false, but the route should also reject the field outright so a misconfigured client can't accidentally include it).
5. When caller is CHAPTER_ORGANIZER, **strip the `role` / `countryId` / `chapterId` / `email` fields from `body`** before processing (whitelist approach) — only allow the profile-edit fields (name, bio, company, photo, etc.).

---

## 3. Privilege escalation test cases

Sentinel MUST run these against the preview deploy before sign-off (Gate 7). Each is a manual `curl`/browser test with two test accounts: a Tel-Aviv CHAPTER_ORGANIZER (`co@tlv.test`) and a Berlin MEMBER (`berlin-member@berlin.test`) + a Berlin CHAPTER_ORGANIZER (`co@berlin.test`).

### 3.1 Role-change escalation

| # | Scenario | Expected | Severity if failed |
|---|---|---|---|
| R1 | CHAPTER_ORGANIZER sends `PATCH /api/admin/members/[selfId]` with `body.role: "ADMIN"` | 403 | **CRITICAL** — direct self-promotion to ADMIN |
| R2 | CHAPTER_ORGANIZER sends `PATCH /api/admin/members/[selfId]` with `body.role: "SUPER_ADMIN"` | 403 | **CRITICAL** |
| R3 | CHAPTER_ORGANIZER sends `PATCH /api/admin/members/[selfId]` with `body.countryId: "<another country>"` | 403 | **CRITICAL** — scope leak |
| R4 | CHAPTER_ORGANIZER sends `PATCH /api/admin/members/[adminId]` with `body.name: "hacked"` | 403 (canEditUser returns false for ADMIN target) | **CRITICAL** |
| R5 | CHAPTER_ORGANIZER sends `PATCH /api/admin/members/[otherChapterCOId]` with `body.name: "hacked"` | 403 (canEditUser returns false for CHAPTER_ORGANIZER target outside chapter) | **CRITICAL** |
| R6 | CHAPTER_ORGANIZER sends `PATCH /api/admin/members/[memberInOtherChapterId]` with `body.name: "hacked"` | 403 (canEditUser returns false — chapter mismatch) | **CRITICAL** |
| R7 | CHAPTER_ORGANIZER sends `PATCH /api/admin/members/[memberInOwnChapterId]` with `body.name: "ok"` | 200 | happy path |
| R8 | CHAPTER_ORGANIZER sends `POST /api/admin/members` (create user) with `body.role: "ADMIN"` | 403 (route must reject role in body for non-SUPER_ADMIN callers) | **CRITICAL** |
| R9 | ADMIN sends `PATCH /api/admin/members/[memberIdInOwnCountry]` with `body.role: "CHAPTER_ORGANIZER"` | 200 | happy path (admin promote) |
| R10 | ADMIN sends `PATCH /api/admin/members/[memberIdInOtherCountry]` with `body.role: "CHAPTER_ORGANIZER"` | 403 | **CRITICAL** — cross-country promotion |
| R11 | ADMIN sends `PATCH /api/admin/members/[chapterOrganizerId]` with `body.role: "MEMBER"` | 200 | happy path (admin demote) |
| R12 | ADMIN sends `PATCH /api/admin/members/[otherAdminId]` with `body.role: "MEMBER"` | 403 | **CRITICAL** — admin demoting another admin |
| R13 | ADMIN sends `PATCH /api/admin/members/[memberId]` with `body.role: "ADMIN"` | 403 | **CRITICAL** — admin promoting to admin |
| R14 | `POST /api/admin/events/[id]/cohosts` with `body.userId: <a MEMBER>` called by CHAPTER_ORGANIZER | 403 (route auto-upgrades target to CO_HOST = a role change — must be blocked for CO callers) | **CRITICAL** |
| R15 | SUPER_ADMIN sends `PATCH /api/admin/members/[superAdminId]` with `body.role: "ADMIN"` | 403 (SUPER_ADMIN_EMAIL target is immutable) | **CRITICAL** |

### 3.2 Cross-chapter data read

| # | Scenario | Expected | Severity if failed |
|---|---|---|---|
| D1 | CHAPTER_ORGANIZER (TLV) sends `GET /api/admin/members` | Response contains ONLY members in TLV chapter (+ country-level members with `chapterId: null` in Israel) | **CRITICAL** |
| D2 | CHAPTER_ORGANIZER (TLV) sends `GET /api/admin/registrants` (no eventId) | Response contains ONLY RSVPs for events in TLV chapter | **CRITICAL** |
| D3 | CHAPTER_ORGANIZER (TLV) sends `GET /api/admin/registrants?eventId=<berlin-event-id>` | 403 | **CRITICAL** |
| D4 | CHAPTER_ORGANIZER (TLV) sends `GET /api/admin/quiz` | Response contains ONLY quizzes hosted by them OR linked to TLV events | **CRITICAL** |
| D5 | CHAPTER_ORGANIZER (TLV) sends `GET /api/admin/quiz/[berlin-quiz-id]` | 403 | **CRITICAL** |
| D6 | CHAPTER_ORGANIZER (TLV) sends `GET /api/email-orchestrator/queue` | Response contains ONLY queue items for events in TLV chapter | **CRITICAL** (PII leak) |
| D7 | CHAPTER_ORGANIZER (TLV) opens `/admin/email` | Sees ONLY campaigns/templates/flows/audiences for TLV chapter (+ global templates with chapterId=null, read-only) | verify |
| D8 | CHAPTER_ORGANIZER (TLV) opens `/admin` | Sees ONLY TLV members + TLV events | ✅ already works (page uses `scopeUserWhere`) |
| D9 | CHAPTER_ORGANIZER (TLV) sends `GET /api/admin/events/[berlin-event-id]` | 403 | **CRITICAL** |

### 3.3 Cross-chapter data write

| # | Scenario | Expected | Severity if failed |
|---|---|---|---|
| W1 | CHAPTER_ORGANIZER (TLV) sends `PATCH /api/admin/events/[berlin-event-id]` with `body.title: "hacked"` | 403 | **CRITICAL** |
| W2 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/registrants` with `body.eventId: <berlin-event-id>` | 403 | **CRITICAL** |
| W3 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/members/merge` with `primaryId: <tlv-member>` + `secondaryIds: [<berlin-member>]` | 403 | **CRITICAL** |
| W4 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/members/bulk-reset-password` with `body.userIds: [<berlin-member-id>]` | 403 (or all targets skipped with reason "out of scope") | **CRITICAL** |
| W5 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/members/[berlin-member-id]/reset-password` | 403 | **CRITICAL** |
| W6 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/email/force-send-stage` with `body.eventId: <berlin-event-id>` | 403 | **CRITICAL** |
| W7 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/email/force-send-stage` with no eventId | Returns ONLY rows for TLV events (not all global rows) | **CRITICAL** |
| W8 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/quiz` with `body.eventId: <berlin-event-id>` | 403 | **CRITICAL** |
| W9 | CHAPTER_ORGANIZER (TLV) sends `PATCH /api/admin/quiz/[tlv-quiz-id]` with `body.eventId: <berlin-event-id>` | 403 | **CRITICAL** |
| W10 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/members/bulk-tags` with `body.userIds: [<berlin-member-id>]` | 403 (or all targets skipped) | **CRITICAL** |
| W11 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/events/[tlv-event-id]/cohosts` with `body.userId: <berlin-member-id>` | 403 | **CRITICAL** — cross-chapter cohost assignment |
| W12 | CHAPTER_ORGANIZER (TLV) sends `POST /api/email-orchestrator/seed` | 403 (must be ADMIN+) | **CRITICAL** |
| W13 | CHAPTER_ORGANIZER (TLV) sends `POST /api/email-orchestrator/run` | 403 (must be ADMIN+) | **CRITICAL** |
| W14 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/check-in/lookup?code=<berlin-rsvp-code>` | 403 | **CRITICAL** |
| W15 | CHAPTER_ORGANIZER (TLV) sends `POST /api/admin/check-in/confirm` for a Berlin RSVP | 403 | **CRITICAL** |

### 3.4 Self-protection / footgun

| # | Scenario | Expected | Severity if failed |
|---|---|---|---|
| F1 | CHAPTER_ORGANIZER sends `DELETE /api/admin/members/[selfId]` | 403 (only SUPER_ADMIN) | ✅ already works |
| F2 | CHAPTER_ORGANIZER sends `POST /api/admin/members/[selfId]/reset-password` | 400 (existing rule: can't reset own password here) | ✅ already works |
| F3 | CHAPTER_ORGANIZER sends `POST /api/admin/members/merge` with `secondaryIds: [<selfId>]` | 400 (existing rule) | ✅ already works |
| F4 | SUPER_ADMIN sends `DELETE /api/admin/members/[selfId]` | 400 (existing rule) | ✅ already works |
| F5 | SUPER_ADMIN sends `DELETE /api/admin/members/[otherSuperAdminId]` | 403 | ✅ already works |

### 3.5 Email orchestrator: global-state routes

| # | Scenario | Expected | Severity if failed |
|---|---|---|---|
| E1 | CHAPTER_ORGANIZER sends `POST /api/email-orchestrator/seed` with `body.action: "clear"` | 403 — clearing seed data is global, affects all chapters | **CRITICAL** |
| E2 | CHAPTER_ORGANIZER sends `POST /api/email-orchestrator/run` | 403 — running the worker is global | **CRITICAL** |
| E3 | CHAPTER_ORGANIZER sends `POST /api/email-orchestrator/simulate` | 403 (or scoped — verify intent) | verify |
| E4 | Bearer `CRON_SECRET` request to any of the above | 200 — cron bypass still works | ✅ |

---

## 4. Required security changes (Forge MUST implement)

These are non-negotiable for the downgrade to ship. Forge's `impl.md` (Gate 5 sign-off) MUST cite each item by ID.

### CRITICAL — must land in the same PR as the `CAN_MAP` edit

| ID | Change | Files |
|---|---|---|
| **C1** | Add `canEditUser`, `canChangeRole`, `canDeleteUser`, `canEditUserScope` helpers to `src/lib/permissions.ts` per Section 2 spec. | `src/lib/permissions.ts` |
| **C2** | Rewrite `PATCH /api/admin/members/[id]` to use the new helpers. Strip `role`/`countryId`/`chapterId`/`email` from the body when caller is CHAPTER_ORGANIZER (whitelist profile fields only). | `src/app/api/admin/members/[id]/route.ts` |
| **C3** | Add scope filter to `GET /api/admin/members` — `where: { ...scopeUserWhere(await getUserScope(me.id)) }`. | `src/app/api/admin/members/route.ts` |
| **C4** | Add scope filter to `POST /api/admin/members/merge` — verify ALL user ids match `scopeUserWhere(scope)`; block merge if any target is ADMIN/SUPER_ADMIN/CHAPTER_ORGANIZER outside caller's chapter. | `src/app/api/admin/members/merge/route.ts` |
| **C5** | Add scope filter to `POST /api/admin/members/bulk-tags` — verify every `userId` matches `scopeUserWhere(scope)`. | `src/app/api/admin/members/bulk-tags/route.ts` |
| **C6** | Add scope filter to `POST /api/admin/members/bulk-reset-password` — verify every `userId` matches `scopeUserWhere(scope)`; skip targets whose role rank ≥ caller's role rank. | `src/app/api/admin/members/bulk-reset-password/route.ts` |
| **C7** | Add scope filter to `POST /api/admin/members/[id]/reset-password` — verify target matches `scopeUserWhere(scope)`; block if target role rank ≥ caller role rank. | `src/app/api/admin/members/[id]/reset-password/route.ts` |
| **C8** | Add scope filter to `POST /api/admin/members/bulk-import` — force-set `countryId` + `chapterId` from caller's scope; CHAPTER_ORGANIZER cannot pick a different chapter. | `src/app/api/admin/members/bulk-import/route.ts` |
| **C9** | Add scope filter to `POST /api/admin/members/[id]/convert-to-speaker` — verify BOTH target user AND target event are in caller's scope. | `src/app/api/admin/members/[id]/convert-to-speaker/route.ts` |
| **C10** | Add scope filter to `PUT /api/admin/members/[id]/tags` — verify target matches `scopeUserWhere(scope)`. | `src/app/api/admin/members/[id]/tags/route.ts` |
| **C11** | Add scope filter to `POST /api/admin/members/[id]/emails` and `DELETE /api/admin/members/[id]/emails/[emailId]` — verify target matches `scopeUserWhere(scope)`. | both routes |
| **C12** | Add scope filter to `GET` + `PATCH` on `/api/admin/events/[id]` — verify `event.chapterId` is in caller's scope. Refactor `authorizeForEventView` + `authorizeForEventEdit` to take the scope into account. | `src/app/api/admin/events/[id]/route.ts` |
| **C13** | Add scope filter to `POST /api/admin/events/[id]/cohosts` — verify event in caller's scope AND target user in caller's scope. Block the auto-upgrade MEMBER→CO_HOST when caller is CHAPTER_ORGANIZER (it's a role change — must go through `canChangeRole`). | `src/app/api/admin/events/[id]/cohosts/route.ts` |
| **C14** | Add scope filter to `PATCH /api/admin/events/[id]/main-image` — change gate to `images.manageAny` or `events.edit`; verify event in scope. | `src/app/api/admin/events/[id]/main-image/route.ts` |
| **C15** | Add scope filter to `GET /api/admin/registrants` — when no `eventId`, restrict by `scopeEventWhere(scope)`; when `eventId` provided, verify event in scope. | `src/app/api/admin/registrants/route.ts` |
| **C16** | Add scope filter to `POST /api/admin/registrants` and `PATCH /api/admin/registrants/[id]` — verify RSVP's event in caller's scope. | both routes |
| **C17** | Add scope filter to all quiz routes — list endpoint scopes by host chapter OR event chapter; write endpoints verify parent quiz / target event in scope. | all `src/app/api/admin/quiz/**/*.ts` |
| **C18** | Add scope filter to `GET /api/email-orchestrator/queue` — `where` must AND `scopeEventWhere(scope)`; `events` list at bottom must also be scoped. | `src/app/api/email-orchestrator/queue/route.ts` |
| **C19** | Add scope filter to `POST /api/admin/email/force-send-stage` — change gate to `email.send`; verify `eventId` (if provided) is in caller's scope; if no eventId, restrict rows to events in caller's scope. | `src/app/api/admin/email/force-send-stage/route.ts` |
| **C20** | Restrict `POST /api/email-orchestrator/seed`, `/run`, `/simulate` to ADMIN+ (not CHAPTER_ORGANIZER). Either change gate to `email.templates` (ADMIN) or add explicit `hasAtLeastRole(me.role, ROLES.ADMIN)` check. Keep CRON_SECRET bypass. | 3 routes |
| **C21** | Add scope filter to `GET /api/admin/check-in/lookup` and `POST /api/admin/check-in/confirm` — when caller is CHAPTER_ORGANIZER, verify RSVP's event is in caller's chapter scope (not just `isGlobalAdmin` short-circuit). | both routes |
| **C22** | Update `requireEventAgendaEdit` and `requireEventSpeakersEdit` in `src/lib/auth-guards.ts` — after the rank-pass, additionally verify the event is in caller's scope (chapter for CHAPTER_ORGANIZER, country for ADMIN). | `src/lib/auth-guards.ts` |
| **C23** | Verify scope on remaining routes flagged "verify" in Section 1 (`members/search`, `members/companies`, `members/activity-report`, `registrants/bulk-import`, `registrants/bulk-link`, `registrants/find-members`, `rsvps/[id]/generate-code`, image upload routes, mockup routes, agenda/speaker CRUD routes, `events/[id]/rsvps`, `events/[id]/mockup-defaults`, `events/extract`, `events/[id]/cohosts/[userId]` DELETE, quiz sub-routes). Add `scopeEventWhere` / `scopeUserWhere` as appropriate. | many — Forge MUST do a `rg "can\(me\.role"` pass and audit each result. |
| **C24** | Change loose `can(me.role, "members.view")` gate strings to the correct specific permission on routes that are about a specific domain: `events.create` for `POST /api/admin/events` + `/admin/events/new`; `email.view` for `/admin/email` + `GET /api/email-orchestrator/queue`; `email.send` for `force-send-stage`; `images.manageAny` for image routes; `quiz.host` for quiz routes. **Why:** after downgrade, `members.view` (CHAPTER_ORGANIZER) and `events.create` (CHAPTER_ORGANIZER) happen to coincide, but they diverge if either is later tightened. Loose gates cause silent over-permissioning. | ~10 files |

### RECOMMENDED — land in this PR if low-cost, otherwise follow-up task

| ID | Change | Rationale |
|---|---|---|
| **R1** | Add a `console.log("[role-change]", { caller: me.email, target: existing.email, oldRole, newRole, at: new Date().toISOString() })` in the role-change path of `PATCH /api/admin/members/[id]` and in the auto-upgrade path of `POST /api/admin/events/[id]/cohosts`. | Audit trail. Without an `ActivityLog` table (Atlas confirmed none exists — see `skipped.md`), Vercel function logs are the only record. A grep-able prefix makes them retrievable. |
| **R2** | Add a `console.log("[permission-downgrade]", ...)` for sensitive operations: `members.merge`, `members.bulk-reset-password`, `email.send` (force-send-stage), `quiz.delete`. | Same — Vercel logs are the audit trail. |
| **R3** | Hide admin-only UI affordances for CHAPTER_ORGANIZER: the "Promote to Chapter Organizer" button, the role dropdown in EditMemberDialog, the "Delete member" button, the bulk-import button (only ADMIN+ can pick the chapter). Lumen's job in Gate 6. | Defense in depth on top of server enforcement. |
| **R4** | Add an `ActivityLog` model in a separate follow-up task (not this one — brief explicitly excludes schema changes). Suggested shape: `{ id, actorUserId, action, targetType, targetId, beforeJson, afterJson, createdAt }`. | Persistent audit trail for security incidents. |
| **R5** | Add a Playwright/Vitest test that runs the privilege-escalation test cases in Section 3 automatically on every PR. | Catches regressions when future tasks touch the same routes. |

### OUT OF scope for this task (do NOT do)

- Bulk DB migration of existing users (brief: OUT).
- New `ActivityLog` Prisma model (Atlas: skipped).
- Changes to SUPER_ADMIN or ADMIN behavior.
- Public-facing pages.
- New UI components.

---

## 5. Sign-off

### Verdict: ⚠️ REQUIRED CHANGES

The `CAN_MAP` edit alone is **NOT** safe to ship. The downgrade unlocks ~28 routes that currently rely on the implicit "ADMIN rank = global access" assumption, and that assumption breaks the moment CHAPTER_ORGANIZER joins the rank tier. Forge MUST land the scope-filter hardening (items C1–C24 in Section 4) in the same PR as the `CAN_MAP` edit. They are inseparable — shipping one without the other creates an immediate cross-chapter data leak.

### Conditional approval

Aegis **APPROVES** Forge to proceed to Gate 5 (BACKEND) with the following conditions:

1. Forge's `impl.md` MUST cite every required-change item (C1–C24) by ID and confirm it's been addressed. Items marked "verify" must be either fixed or explicitly marked "audited, no change needed" with a one-line reason.
2. Forge MUST do a fresh `rg "can\(me\.role"` pass on the day of implementation — the codebase is large and the audit in Section 1 may have missed a route added between this review and the implementation.
3. Sentinel's Gate 7 (QA) MUST run the test cases in Section 3 against a preview deploy with two real CHAPTER_ORGANIZER accounts in different chapters. Sign-off requires all CRITICAL test cases to pass.
4. The role-change helpers (`canEditUser`, `canChangeRole`, `canDeleteUser`, `canEditUserScope`) MUST be unit-tested with the 15 role-change scenarios in Section 3.1 — these are the easiest to break and the most damaging if broken.
5. If Forge discovers a route listed as "verify" in Section 1 that has a non-trivial scope-leak, Forge MUST escalate back to Aegis before shipping — do not silently expand the change surface.

### Items not blocking

- CSRF / session posture: unchanged. SameSite=Lax + JSON fetch is the existing pattern; no new CSRF risk.
- NextAuth JWT refresh: existing `getCurrentUser` already auto-syncs SUPER_ADMIN role from the email allowlist. No change needed for the new helpers.
- Email deliverability (SMTP): out of scope.
- Performance: the additional `getUserScope` call per request adds one DB round-trip. Acceptable — the helper is already cached at the route layer via `getCurrentUser()`'s return value where used.

### Hand-off

Aegis → Forge (Gate 5, BACKEND) + Lumen (Gate 6, FRONTEND, for the UI affordances in R3). Sentinel (Gate 7) owns the Section 3 test execution.

— Aegis, 2026-07-21
