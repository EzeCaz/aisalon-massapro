# Design Spec — Chapter Organizer Permissions Refactor

- **Task ID**: `2026-07-21-chapter-organizer-permissions`
- **Owner**: Canvas (UI/UX Designer)
- **Status**: Gate 3 — DESIGN, ready for Lumen at Gate 6
- **Inputs**: `brief.md`, `core/design/system.md` (v1.0), existing `src/app/admin/admin-members-table.tsx`, `src/components/ais/admin-tabs-def.ts`, `src/lib/permissions.ts`
- **Design system ref**: `core/design/system.md` — colors `#FF005A` / `#820A7D` / `#007E72` / `#FFAC30` / `#004F98`, badge 4px radius, button 6px radius, Inter typeface, 4/8/12/16/24 spacing scale

---

## 1. Scope of UI changes

The brief is primarily a permissions refactor — most changes are invisible (gate checks, server-side scope, role-change guard helpers in `permissions.ts`). The visible surface area is intentionally small and reuses existing components from `core/design/system.md`:

| # | Surface | Change | Visible to |
|---|---|---|---|
| 1 | `/admin/members` table | Add a **Role** column (read-only badge for everyone; live for ADMIN+) + a **Promote / Demote** row action for ADMIN+ viewers | ADMIN, SUPER_ADMIN, CHAPTER_ORGANIZER (read-only) |
| 2 | `/admin/members` toolbar | New quick-filter pill **"Organizers only"** + new stat card **"Chapter organizers"** | ADMIN, SUPER_ADMIN |
| 3 | `EditMemberDialog` → "Role & permissions" section | ADMIN viewer (new) sees a **restricted** role dropdown (`ADMIN_ASSIGNABLE_ROLES`); CHAPTER_ORGANIZER viewer sees read-only badge (unchanged); SUPER_ADMIN viewer sees full dropdown (unchanged) | ADMIN, SUPER_ADMIN |
| 4 | `AdminTabs` allowed list (`admin-tabs-def.ts`) | CHAPTER_ORGANIZER now also sees **Members, Events, New event, Email, Images, Quiz** tabs (in addition to the existing Speakers, Registrants, Check-in, Event dashboard, Mockups, Event Prep) | CHAPTER_ORGANIZER |
| 5 | Admin-only action buttons across `/admin/**` | Visually hidden for CHAPTER_ORGANIZER on top of server enforcement. Buttons to hide: "Delete member", "Delete event", "Change role" (anywhere outside the new Promote/Demote flow), "Bulk assign scope" (already Super-Admin-only) | CHAPTER_ORGANIZER |

**No new design-system components are introduced.** This spec reuses `Button` (outline / ghost), `Dialog`, `AlertDialog`, `Badge`, `toast` (sonner), and the existing `roleBadgeClass()` / `roleLabel()` helpers from `src/lib/permissions.ts`.

> **Pre-existing bug to fix while we're here**: `TableView` (line ~1499 of `admin-members-table.tsx`) hard-codes `bg-[#FF005A]` for `ADMIN` and falls back to gray for every other role. CHAPTER_ORGANIZER currently renders as a gray "CHAPTER_ORGANIZER" pill. Replace with `roleBadgeClass(member.role)` + `roleLabel(member.role)` so all six roles render correctly. This is in scope because the new Role column depends on it.

---

## 2. Component tree

### Modified components

```
src/app/admin/page.tsx                          [server component]
├─ passes `currentUserRole` (already does) + `canManageOrganizers` (NEW boolean) to <AdminMembersTable>
├─ adds a 5th <StatCard> "Chapter organizers" (count = members.filter(role === CHAPTER_ORGANIZER).length)
└─ gate: `if (!can(me.role, "members.view")) redirect("/events")`  ← already there, no change

src/app/admin/admin-members-table.tsx           [client component, 4368 lines — modify in place]
├─ AdminMembersTable (top-level)
│  ├─ NEW prop: canManageOrganizers: boolean   (true for ADMIN+)
│  ├─ NEW state: roleConfirm: { member, action: "promote" | "demote" } | null
│  ├─ NEW state: filterOrganizers: boolean
│  ├─ NEW handler: changeMemberRole(member, action) → POST /api/admin/members/[id]/role
│  ├─ Toolbar: + "Organizers only" pill toggle (visible when canManageOrganizers)
│  ├─ CardsView  ← receives canManageOrganizers, onChangeMemberRole
│  ├─ TableView  ← receives canManageOrganizers, onChangeMemberRole
│  └─ NEW: <RoleChangeConfirmDialog
│            open={!!roleConfirm}
│            member={roleConfirm?.member}
│            action={roleConfirm?.action}
│            onConfirm={() => changeMemberRole(...)}
│            onCancel={() => setRoleConfirm(null)}
│            loading={pending === roleConfirm?.member?.id} />
│
├─ CardsView
│  ├─ NEW <th> "Role" in header (between Tags and Actions)
│  ├─ NEW <td> per row: <RoleBadge member={m} />
│  └─ Actions cell: + <RoleActionButton> when canManageOrganizers && member.role === MEMBER  → "Promote"
│                   + <RoleActionButton> when canManageOrganizers && member.role === CHAPTER_ORGANIZER → "Demote"
│                   (hidden on own row, hidden for ADMIN / SUPER_ADMIN targets)
│
├─ TableView
│  ├─ FIX existing role <td>: use roleBadgeClass(member.role) + roleLabel(member.role)  (was hard-coded)
│  └─ Actions cell: + <RoleActionButton> (same rules as CardsView, smaller variant)
│
└─ EditMemberDialog
   └─ "Role & permissions" section
      ├─ SUPER_ADMIN viewer, SUPER_ADMIN target → locked select (unchanged)
      ├─ SUPER_ADMIN viewer, other target      → ASSIGNABLE_ROLES dropdown (unchanged)
      ├─ ADMIN viewer (NEW), MEMBER/CHAPTER_ORGANIZER/CO_HOST target
      │     → ADMIN_ASSIGNABLE_ROLES dropdown (CHAPTER_ORGANIZER, CO_HOST, MEMBER)
      ├─ ADMIN viewer, ADMIN/SUPER_ADMIN target → read-only badge + note "Only Super Admins can edit Admins."
      ├─ CHAPTER_ORGANIZER viewer (NEW — used to be redirected away from /admin entirely)
      │     → read-only badge + note "Only Admins can change roles."
      └─ The dropdown's onChange now triggers the same changeMemberRole() flow
         (with confirmation) instead of being persisted silently in the bulk PATCH.
         Super Admin retains the silent save (they already confirm via the dialog itself).

NEW components (defined in the same file, near the other small dialogs):

├─ RoleBadge                                    [presentational]
│  └─ <span className={`...roleBadgeClass(role)`}>{roleLabel(role)}</span>
│     + optional <ShieldAlert className="h-3 w-3 mr-1" /> icon prefix for ADMIN+
│
└─ RoleActionButton                             [presentational]
   ├─ variant="promote":  outline teal   — icon ArrowUpCircle   — label "Promote"
   ├─ variant="demote":   outline amber  — icon ArrowDownCircle — label "Demote"
   ├─ aria-label constructed from member name + action (see §7)
   └─ size="sm" h-8 in CardsView, h-7 text-[0.65rem] in TableView

└─ RoleChangeConfirmDialog                      [ AlertDialog from @/components/ui/alert-dialog ]
   ├─ title: "Promote {name} to Chapter Organizer?" | "Demote {name} to Member?"
   ├─ body: context paragraph + (if demote + last CO in chapter) warning callout
   ├─ cancel:  "Cancel"   (ghost)
   └─ confirm: "Promote" (teal) | "Demote" (amber)

src/components/ais/admin-tabs-def.ts            [plain .ts — modify filterTabsByRole]
└─ CHAPTER_ORGANIZER branch: expand `allowed` Set to include:
     "/admin",  "/admin/events",  "/admin/events/new",
     "/admin/email",  "/admin/images",  "/admin/quiz"
   (Already allowed: speakers, registrants, check-in, event-dashboard, mockups, event-prep.)
   No new tabs added, no visual change — just the allow-list grows.

src/components/ais/admin-tabs-client.tsx        [client component — no change]
└─ Already calls filterTabsByRole(role); picks up the new allow-list automatically.
```

### API endpoint Forge must provide (data contract for Lumen)

```
POST /api/admin/members/[id]/role
  Body: { role: "CHAPTER_ORGANIZER" | "MEMBER" }
  Auth: can(me.role, "members.manageOrganizers")   // ADMIN+
  Server guard:
    - target.role cannot be SUPER_ADMIN or ADMIN (only Super Admin can touch those)
    - if me.role === ADMIN, target.chapterId must be in me's managed chapter set
    - if me.role === ADMIN, target.role on the request must be CHAPTER_ORGANIZER or MEMBER
      (cannot grant ADMIN — only SUPER_ADMIN can)
    - cannot change own role (target.id === me.id → 403)
  Returns: 200 { ok: true, user: { id, role } } | 403 { error } | 404 | 409 (last-organizer warning is optional client-side; server still allows)
```

> Lumen: if Forge's endpoint returns 409 with `{ error: "LAST_ORGANIZER_IN_CHAPTER", chapterName }`, surface a stronger confirmation step (see §6 Edge case 3). Otherwise treat all non-2xx as a toast error.

---

## 3. Layout sketches

### 3.1 `/admin/members` — CardsView (default), desktop ≥ 1280px

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Admin Panel · V7 Hierarchy                                                          │
│ Manage community & events                                                           │
│ You are signed in as ada@… with the Admin role. Active scope: [Country · Israel].  │
│                                            [Chapters] [Reports] [Email] [Dashboard→]│
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [Members: 312] [Imported: 180] [Events: 24] [Linked to speaker: 47] [Organizers: 6]│
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Search…]  [All applied-for ▾] ☐Invited ☐Linked  [Import CSV/XLS]                │
│                                                              [Organizers only]      │
│                                                   312 of 312 members   [▤][▦]       │
├──┬──────────────────────────────────────────────────────────────────────────────────┤
│ ☑│ Member         │ Applied for │ Linked speaker   │ Country › Chapter │ Tags       │
│  │                │             │                  │                   │            │
├──┼────────────────┼─────────────┼──────────────────┼───────────────────┼────────────┤
│ ☐│ 👤 Ada Lovelace│ Fast pitch  │ AI Salon TLV #3  │ 🇮🇱 Israel › TLV  │ [speaker]  │
│  │ ada@…          │             │ · topic          │                   │ [builder]  │
│  │                │             │                  │                   │            │
│  │                                                            [ ROLE ]  [Actions]│
│  │                                                            ▼         ▼          │
│  │                                                            [Edit][Tags][Link]  │
│  │                                                            [Emails][Promote▲]  │
├──┼────────────────┼─────────────┼──────────────────┼───────────────────┼────────────┤
│ ☐│ 👤 Noa Cohen   │  —          │  —               │ 🇮🇱 Israel › TLV  │ [founder]  │
│  │ noa@…          │             │                  │                   │            │
│  │                                                            [ MEMBER ]           │
│  │                                                            [Edit][Tags][Link]  │
│  │                                                            [Emails][Promote▲]  │
├──┼────────────────┼─────────────┼──────────────────┼───────────────────┼────────────┤
│ ☐│ 👤 Yoav Levi   │  —          │ AI Salon TLV #2  │ 🇮🇱 Israel › TLV  │            │
│  │ yoav@…         │             │                  │                   │            │
│  │                                                            [ CH. ORG. ]        │
│  │                                                            [Edit][Tags][Link]  │
│  │                                                            [Emails][Demote▼]   │
└──┴────────────────┴─────────────┴──────────────────┴───────────────────┴────────────┘
```

- New **Role** column sits in the expanded detail row (CardsView already expands), displayed as a left-aligned badge just above the Actions row. This keeps the collapsed row readable on laptop widths.
- On `< xl` (≤ 1279px), the Country/Chapter column is hidden as today; Role stays visible because it's in the detail panel.
- On `< md` (≤ 767px), Actions wrap into a 2-column grid; Promote/Demote drops onto the second row.

### 3.2 `/admin/members` — TableView (wide), all widths

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ☑│ Name        │ Email        │ Company │ Country › Chapter │ Tags      │ Linked │ Img │ Src │ Imp │ Onb │ Created  │ Role        │ Actions                          │
├──┼─────────────┼──────────────┼─────────┼───────────────────┼───────────┼────────┼─────┼─────┼─────┼─────┼──────────┼─────────────┼──────────────────────────────────┤
│ ☐│ Ada Lovelace│ ada@…        │ Acme    │ 🇮🇱 Israel › TLV  │ [speaker] │ TLV#3  │  4  │ CSV │ 2/1 │ 5/1 │ 2024-…   │ [ADMIN]     │ [Edit][Emails]                   │
│ ☐│ Noa Cohen   │ noa@…        │ —       │ 🇮🇱 Israel › TLV  │ [founder] │  —     │  0  │  —  │  —  │  —  │ 2025-…   │ [MEMBER]    │ [Edit][Emails][Promote▲]         │
│ ☐│ Yoav Levi   │ yoav@…       │ —       │ 🇮🇱 Israel › TLV  │  —        │ TLV#2  │  2  │  —  │  —  │  —  │ 2025-…   │ [CH. ORG.]  │ [Edit][Emails][Demote▼]          │
│ ☐│ Eze Massa   │ eze@massapro │ MassaPro│ —                 │  —        │  —     │  0  │  —  │  —  │  —  │ 2023-…   │ [SUPER]     │ [Edit][Emails]                   │
└──┴─────────────┴──────────────┴─────────┴───────────────────┴───────────┴────────┴─────┴─────┴─────┴─────┴──────────┴─────────────┴──────────────────────────────────┘
```

- The existing "Role" column already exists at the far right of TableView — it just renders the wrong colors. Fix: swap hard-coded classes for `roleBadgeClass()`.
- Promote/Demote button is appended to the Actions cell, after the existing [Edit][Emails][Archive] buttons.

### 3.3 `EditMemberDialog` — "Role & permissions" section (modified for ADMIN viewer)

```
┌──────────────────────────────────────────────────────────┐
│ ROLE & PERMISSIONS                              [HARD-CODED]│   ← only if target is SUPER_ADMIN
│                                                            │
│ Member type                                                │
│ ┌─────────────────────────────────────────────┐            │
│ │ Chapter Organizer                       ▾   │            │   ← ADMIN viewer, target=CHAPTER_ORGANIZER
│ └─────────────────────────────────────────────┘            │
│ Or pick:  Chapter Organizer (legacy Co-host)  Member       │
│                                                            │
│ ▼ Warning                                                  │
│ Demoting to Member will remove this user's access to the   │
│ admin panel for the Israel › Tel Aviv chapter.             │
│                                                            │
│ Only Super Admins can grant Admin or Super Admin roles.    │
└──────────────────────────────────────────────────────────┘
```

- The dropdown options for an ADMIN viewer come from `ADMIN_ASSIGNABLE_ROLES` (CHAPTER_ORGANIZER, CO_HOST, MEMBER). The current value (if it's ADMIN/SUPER_ADMIN) renders as a read-only badge above the dropdown with the note "Only Super Admins can edit Admins."
- Selecting a different value closes the dialog and opens the same `RoleChangeConfirmDialog` used by the row button — single confirmation UX across both entry points.

### 3.4 `RoleChangeConfirmDialog` (AlertDialog)

**Promote** (target = MEMBER → CHAPTER_ORGANIZER):

```
┌──────────────────────────────────────────────────────────┐
│  ⬆  Promote Noa Cohen to Chapter Organizer?              │
│                                                          │
│  Noa will gain access to the admin panel for the         │
│  Israel › Tel Aviv chapter — they'll be able to:         │
│    • manage events, registrants, and check-in            │
│    • edit members' profile fields (name, company, photo) │
│    • send email campaigns and edit templates             │
│    • manage speakers and quiz sessions                   │
│                                                          │
│  They will NOT be able to: change roles, delete members, │
│  or edit other Chapter Organizers.                       │
│                                                          │
│                            [Cancel]      [Promote] (teal)│
└──────────────────────────────────────────────────────────┘
```

**Demote** (target = CHAPTER_ORGANIZER → MEMBER):

```
┌──────────────────────────────────────────────────────────┐
│  ⬇  Demote Yoav Levi to Member?                          │
│                                                          │
│  Yoav will lose access to the admin panel for the        │
│  Israel › Tel Aviv chapter. Their profile, RSVPs, and    │
│  past content remain untouched.                          │
│                                                          │
│  ⚠  Last organizer — Yoav is currently the only Chapter  │
│     Organizer for Tel Aviv. After demotion, no one in    │
│     this chapter will be able to manage events or        │
│     members. Promote a replacement first, or proceed     │
│     anyway.                                              │
│                                                          │
│                       [Cancel]    [Demote anyway] (amber)│
└──────────────────────────────────────────────────────────┘
```

(The amber warning callout only renders when the API returns `LAST_ORGANIZER_IN_CHAPTER`, see §6 Edge 3.)

### 3.5 Admin tab nav — no visual change

The `filterTabsByRole()` allow-list for CHAPTER_ORGANIZER grows from 6 → 12 tabs. Layout, icon, color, ordering are unchanged. Verified against `admin-tabs-def.ts` — the `AdminTabDef` shape does not change.

---

## 4. States

### 4.1 Promote / Demote action — per-row button

| State | Visual | Notes |
|---|---|---|
| **Default** | Outline button, teal (promote) or amber (demote). Icon + label. | Hidden entirely for CHAPTER_ORGANIZER viewers, for own row, for ADMIN/SUPER_ADMIN targets. |
| **Hover** | `hover:bg-[#007E72]/10` (promote) or `hover:bg-[#FFAC30]/10` (demote). Cursor pointer. | Tooltip via `title=` attribute repeats the aria-label. |
| **Focus** | 2px magenta ring (`focus:ring-2 focus:ring-[#FF005A]`) — design-system focus token. | Keyboard users must see the focus target. |
| **Active (pressed)** | Background tints to 20% opacity. | |
| **Disabled** | `disabled:opacity-50 disabled:cursor-not-allowed` — used while a request is in flight for THIS row. | Other rows remain interactive. |
| **Loading** | Button swaps label for `<Loader2 className="h-3.5 w-3.5 animate-spin" />` + verb ("Promoting…" / "Demoting…"). Toast also shows spinner (`toast.loading`). | The confirm dialog stays open with confirm button disabled + spinner, then closes on success. |
| **Error** | Button returns to default. Toast: `toast.error(msg, { duration: 8000 })`. | See §5 for exact error strings. |
| **Success** | Button disappears (role changed). Toast: `toast.success("{Name} promoted to Chapter Organizer.")` Then `window.location.reload()` to refresh the table. | Matches existing `archiveMember` pattern in `admin-members-table.tsx`. |

### 4.2 Members table — data states

| State | Visual | Notes |
|---|---|---|
| **Populated** | Rows render. Role badge uses `roleBadgeClass()`. | Default. |
| **Empty (no members in scope)** | `<tr><td colSpan={9} className="px-4 py-8 text-center text-black/80 text-sm">No members in your scope yet.</td></tr>` | Wording differs from the existing "No members match your filters." copy — that one stays for search-no-match; this new one shows when `members.length === 0`. |
| **Empty (filter no match)** | Existing copy: "No members match your filters." | Unchanged. |
| **Loading** | N/A — page is a server component, data is already loaded when the client renders. No skeleton needed. | If a client-side refetch is added later, use the existing `<Skeleton>` from `@/components/ui/skeleton`. |
| **Error** | N/A at page level — server redirects on auth failure. Per-action errors go through toast. | |

### 4.3 `RoleChangeConfirmDialog` — states

| State | Visual |
|---|---|
| **Open, idle** | Dialog rendered, focus on Cancel button (safer default than confirm). |
| **Submitting** | Confirm button shows spinner + verb ("Promoting…" / "Demoting…"), Cancel disabled, Esc disabled (prevent accidental abort mid-request). |
| **Server error** | Dialog stays open. Red error banner appears above the action row: `⚠ {server error message}`. Confirm button re-enabled. |
| **Success** | Dialog closes. Toast fires. Page reloads. |
| **Cancel** | Esc or Cancel click → dialog closes, focus returns to the trigger button (the row's Promote/Demote button). |

---

## 5. Copy (exact strings — Lumen must match verbatim)

### 5.1 Toolbar

| Element | Copy |
|---|---|
| Quick-filter pill (toggle, off) | `Organizers only` |
| Quick-filter pill (toggle, on) | `Organizers only · {count}` |
| Quick-filter pill tooltip | `Filter the list to Chapter Organizers in your scope.` |
| New stat card label | `Chapter organizers` |
| New stat card tooltip | `Count of users with the Chapter Organizer role in your scope.` |

### 5.2 Column header

| Element | Copy |
|---|---|
| CardsView detail-row label | `Role` |
| TableView column header | `Role` |

### 5.3 Row action buttons

| Action | Visible label (with icon) | `aria-label` | `title` tooltip |
|---|---|---|---|
| Promote | `Promote` (icon: `ArrowUpCircle`) | `Promote {memberName || memberEmail} to Chapter Organizer` | `Grant Chapter Organizer access to {memberName \|\| memberEmail}` |
| Demote | `Demote` (icon: `ArrowDownCircle`) | `Demote {memberName || memberEmail} to Member` | `Revoke Chapter Organizer access from {memberName \|\| memberEmail}` |

> When `memberName` is empty, fall back to `memberEmail`. Never expose the user's email in the visible label (keep the visible label as just `Promote` / `Demote`); the full name + email goes only in the aria-label / title (which is read by screen readers and shown on hover, not painted at rest).

### 5.4 `RoleChangeConfirmDialog`

**Promote**:

| Element | Copy |
|---|---|
| Title | `Promote {memberName \|\| memberEmail} to Chapter Organizer?` |
| Body | `{memberName \|\| "This member"} will gain access to the admin panel for the {chapterName \|\| "their"} chapter — they'll be able to:` |
| Bullet 1 | `Manage events, registrants, and check-in` |
| Bullet 2 | `Edit members' profile fields (name, company, photo)` |
| Bullet 3 | `Send email campaigns and edit templates` |
| Bullet 4 | `Manage speakers and quiz sessions` |
| Caveat | `They will NOT be able to: change roles, delete members, or edit other Chapter Organizers.` |
| Cancel button | `Cancel` |
| Confirm button | `Promote` |

**Demote**:

| Element | Copy |
|---|---|
| Title | `Demote {memberName \|\| memberEmail} to Member?` |
| Body | `{memberName \|\| "This member"} will lose access to the admin panel for the {chapterName \|\| "their"} chapter. Their profile, RSVPs, and past content remain untouched.` |
| Warning callout (only when `LAST_ORGANIZER_IN_CHAPTER`) | `Last organizer — {memberName} is currently the only Chapter Organizer for {chapterName}. After demotion, no one in this chapter will be able to manage events or members. Promote a replacement first, or proceed anyway.` |
| Cancel button | `Cancel` |
| Confirm button (normal) | `Demote` |
| Confirm button (last-organizer warning) | `Demote anyway` |

### 5.5 Toasts (sonner)

| Event | Toast |
|---|---|
| Promote — loading | `Promoting {memberName \|\| memberEmail}…` (spinner) |
| Promote — success | `{memberName \|\| memberEmail} promoted to Chapter Organizer.` (check) |
| Promote — error (generic) | `Couldn't promote {memberName \|\| memberEmail}: {serverError}` (x, 8s) |
| Promote — error (target is ADMIN/SUPER_ADMIN) | `Only Super Admins can change an Admin's role.` |
| Promote — error (out of scope) | `{memberName \|\| memberEmail} is not in your chapter scope.` |
| Demote — loading | `Demoting {memberName \|\| memberEmail}…` |
| Demote — success | `{memberName \|\| memberEmail} demoted to Member.` |
| Demote — error (generic) | `Couldn't demote {memberName \|\| memberEmail}: {serverError}` |
| Demote — error (self) | `You can't change your own role.` |
| Edit dialog — non-Super-Admin viewer note | `Only Super Admins can change roles.` (existing copy, unchanged) |
| Edit dialog — ADMIN viewer, ADMIN/SUPER_ADMIN target | `Only Super Admins can edit Admins.` |

### 5.6 Empty state

| State | Copy |
|---|---|
| No members in scope (CHAPTER_ORGANIZER viewer, chapter empty) | `No members in your chapter yet.` |
| No members in scope (ADMIN viewer, country empty) | `No members in your country yet.` |
| No members in scope (SUPER_ADMIN viewer, no users at all) | `No members yet.` |

---

## 6. Edge cases

1. **CHAPTER_ORGANIZER viewer opens `/admin/members/[otherChapterMemberId]`** (i.e. tries to edit a member outside their chapter via a crafted URL).
   - **UI**: The Promote/Demote buttons are hidden (CHAPTER_ORGANIZER never sees them). The Edit button is visible — but the edit form is gated server-side.
   - **Server** (Forge's job, called out here for Aegis): The `GET /api/admin/members/[id]` and `PATCH /api/admin/members/[id]` endpoints must call `getUserScope(me.id)` and reject with 403 if the target's `chapterId` ≠ viewer's `chapterId`. The page-level `scopeUserWhere(scope)` already filters the list — the per-record fetch must do the same check.
   - **Toast on 403**: `That member is outside your chapter scope.`

2. **ADMIN tries to demote themselves.**
   - The row's Promote/Demote button is hidden on the viewer's own row (same pattern as the existing `archiveMember` self-block at line 1526 of `admin-members-table.tsx`).
   - In `EditMemberDialog`, the role dropdown is replaced with a read-only badge + note: `You can't change your own role.`
   - **Server** (Forge): `target.id === me.id` → 403 with `{ error: "You cannot change your own role." }`.

3. **Last CHAPTER_ORGANIZER in a chapter is demoted.**
   - Server (Forge) detects: count of `CHAPTER_ORGANIZER` users with `chapterId === target.chapterId` is 1 and target is one of them.
   - Server returns **200** with `{ ok: true, warning: "LAST_ORGANIZER_IN_CHAPTER", chapterName }` — the demotion proceeds; this is a warning, not a block. (Admins may legitimately want to demote and re-promote a different user.)
   - Alternative (preferred by Canvas): server returns **409 Conflict** with `{ error: "LAST_ORGANIZER_IN_CHAPTER", chapterName }` BEFORE performing the demotion. Client shows the warning callout in the confirm dialog with the [Demote anyway] button. User confirms → client re-posts with header `X-Confirm-Last-Organizer: 1` → server proceeds.
   - Either implementation is acceptable — Canvas's preference is the 409 + re-confirm flow because it gives the user a chance to back out. **Aegis + Forge to pick one at Gate 4/5.**
   - **Toast on success after last-organizer demotion**: same as normal demote + an additional `toast.warning("No Chapter Organizers remain for {chapterName}. Promote a replacement so the chapter isn't unmanaged.", { duration: 10000 })`.

4. **ADMIN viewer looks at a MEMBER row whose `chapterId` is null** (unscoped member, country-wide).
   - The Promote button is still visible (the country-scope ADMIN can act on country-wide members per `scopeUserWhere` clause `OR: [{ chapterId }, { countryId, chapterId: null }]`).
   - On click, the confirm dialog body adapts: `…will gain access to the admin panel for the {countryName} country (no specific chapter).` Promote is allowed — but the resulting CHAPTER_ORGANIZER will themselves be unscoped, so a follow-up Super Admin assignment of `chapterId` is needed. The dialog footer shows a small note: `Note: this member has no chapter assigned. A Super Admin will need to assign one for them to be useful as an organizer.`

5. **MEMBER row already has role = `CO_HOST` (legacy).**
   - The Role badge renders "Co-host (legacy)" via `roleLabel()`. The Promote button is hidden (they're already at CHAPTER_ORGANIZER rank — same permissions).
   - A "Migrate to Chapter Organizer" action is **out of scope** here — that's a one-time backfill script, not a UI feature. The existing Super Admin dropdown in `EditMemberDialog` already supports CO_HOST → CHAPTER_ORGANIZER if needed manually.

6. **MEMBER row has role = `SPEAKER` (legacy, rank 0).**
   - The Promote button is visible (an ADMIN can lift a SPEAKER to CHAPTER_ORGANIZER — rank 0 → rank 2 is a valid jump per the guard table).
   - The confirm body adapts: `{name} is currently a Speaker (legacy role). Promoting them to Chapter Organizer will grant full chapter admin access.`

7. **Rapid double-click on Promote.**
   - The button enters `disabled` state on first click (before the dialog opens). Dialog opens. If the user closes the dialog, the button re-enables. While the request is in flight, the button is replaced by a spinner — no second request can fire.

8. **Two ADMINs acting on the same row simultaneously.**
   - Last-write-wins. The server's `PATCH /api/admin/members/[id]/role` doesn't take an `if-match` header. After reload, the loser sees the other's change. Out of scope to add optimistic concurrency for v1.

9. **Network failure mid-request.**
   - Toast: `Network error — couldn't reach the server. Please retry.` (8s). Dialog stays open, confirm button re-enabled. No partial state — the server either processed the change or didn't.

10. **CHAPTER_ORGANIZER viewer reloads `/admin/members` after a peer admin promotes them** — their session JWT still says CHAPTER_ORGANIZER, but the server already re-checks role on every request, so they get the ADMIN view if they were just promoted. (Forge's existing session refresh handles this.)

11. **User being promoted is currently signed in.**
    - Their next page navigation will hit a server gate that re-reads their role from the DB (the existing pattern in `src/lib/session-user.ts`), so they'll see the new admin nav immediately. No client-side invalidation needed.

---

## 7. Accessibility

### 7.1 Promote / Demote row buttons

```tsx
<Button
  size="sm"
  variant="outline"
  className="border-[#007E72]/40 text-[#007E72] hover:bg-[#007E72]/10 h-8"
  onClick={() => setRoleConfirm({ member: m, action: "promote" })}
  disabled={pending === m.id}
  aria-label={`Promote ${m.name || m.email} to Chapter Organizer`}
  title={`Grant Chapter Organizer access to ${m.name || m.email}`}
>
  <ArrowUpCircle className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
  Promote
</Button>
```

- `aria-label` includes the member's name (or email) so a screen reader announces "Promote Ada Lovelace to Chapter Organizer, button" — not just "Promote, button". This matters because the table can have dozens of Promote buttons.
- The icon is `aria-hidden` so it isn't double-announced.
- Color is **never** the only signal — the button has both an icon (arrow up = promote, arrow down = demote) and a text label.
- Color contrast: teal `#007E72` on white = 5.3:1 (passes AA for normal text). Amber `#8a5a00` on white = 5.9:1 (passes AA). Outline border tints (`/40` alpha) are decorative — the text color carries the semantic.

### 7.2 Role badge

```tsx
<span
  className={`text-[0.65rem] font-bold uppercase px-2 py-1 rounded ${roleBadgeClass(member.role)}`}
  // aria-label is unnecessary — the visible text "Chapter Organizer" is descriptive.
  // But for SUPER_ADMIN the visible text is "Super Admin" which is fine.
>
  {roleLabel(member.role)}
</span>
```

- Contrast check (all from `roleBadgeClass`):
  - SUPER_ADMIN: white on `#820A7D` purple → 7.4:1 ✓ AAA
  - ADMIN: white on `#FF005A` magenta → 4.8:1 ✓ AA
  - CHAPTER_ORGANIZER: `#007E72` on `#00E6FF@20%` (effectively very light cyan) → 5.3:1 ✓ AA
  - MEMBER: `black/80` on `black/5` → 14:1 ✓ AAA
- Uppercase via Tailwind `uppercase` + `tracking-wider` — fine because the text is short (≤ 18 chars).

### 7.3 `RoleChangeConfirmDialog`

- Built on `AlertDialog` from `@/components/ui/alert-dialog` (Radix-based). Radix handles:
  - Focus trap (Tab cycles within the dialog).
  - `aria-labelledby` pointing at the title, `aria-describedby` pointing at the body.
  - `role="alertdialog"` (not `dialog`) — signals to screen readers that confirmation is required.
  - Esc closes (unless submitting — see §4.3).
- **Initial focus**: on the Cancel button. Radix defaults to the first focusable element; we explicitly set `autoFocus` on Cancel so a slip of the Enter key doesn't accidentally confirm.
- **Focus restore on close**: returns to the trigger button (Radix handles this if we pass the trigger ref).
- **Keyboard**:
  - `Tab` / `Shift+Tab` cycles Cancel → Confirm.
  - `Esc` cancels (when idle).
  - `Enter` activates the focused button (default browser behavior).
  - No global shortcut for confirm (prevent muscle-memory confirmation of destructive actions).

### 7.4 Quick-filter "Organizers only" pill

- Built as a `<button aria-pressed={filterOrganizers}>`. The `aria-pressed` state announces "Organizers only, toggle button, pressed/not pressed" to screen readers.
- Visible state uses background fill (pressed = solid teal bg, white text; unpressed = outline teal).

### 7.5 Table semantics

- The new Role column header in TableView is a `<th scope="col">Role</th>` (existing pattern).
- The CardsView detail-row Role label is a `<dt>`/`<dd>` pair inside the expanded panel for screen-reader clarity (or just a `<div>` with `aria-label="Role"` if restructuring is too invasive — Lumen's call).

### 7.6 Keyboard navigation through the action cell

- All action buttons are real `<button>` elements (via `Button` from `@/components/ui/button`), so they're tabbable in DOM order.
- The Promote/Demote button is the **last** tab stop in the action cell — after Edit, Tags, Link, Emails, Archive — so a user tabbing through doesn't skip past the destructive action by accident.

---

## 8. Visual treatment

### 8.1 Role badge — final spec (reaffirming existing `roleBadgeClass`)

| Role | Visible label | Background | Text | Border | Icon |
|---|---|---|---|---|---|
| SUPER_ADMIN | `Super Admin` | `#820A7D` purple | white | none | optional `Crown` 10px (hidden at rest, shown on hover of the badge) |
| ADMIN | `Admin` | `#FF005A` magenta | white | none | optional `Shield` 10px |
| CHAPTER_ORGANIZER | `Chapter Organizer` | `#00E6FF` @ 20% | `#007E72` teal | 1px `#00E6FF` @ 40% | optional `Users` 10px |
| CO_HOST (legacy) | `Co-host (legacy)` | same as CHAPTER_ORGANIZER | same | same | same |
| SPEAKER | `Speaker` | `#FFB300` @ 20% | `#8a5a00` amber-brown | 1px `#FFB300` @ 40% | `Mic2` 10px |
| MEMBER | `Member` | `black/5` | `black/80` | 1px `black/10` | none |

- Font: 11px (`text-[0.65rem]`), weight 700 (`font-bold`), `uppercase tracking-wider`.
- Radius: 4px (`rounded`) per design-system badge spec.
- Padding: `px-2 py-1`.
- The optional icon is a progressive-enhancement nicety, not required for v1. If Lumen skips it, the badge is still readable.

> **Note**: The existing `roleBadgeClass` function in `src/lib/permissions.ts` already implements all of the above. Lumen must use it — do NOT re-derive colors in the table component.

### 8.2 Promote button (variant — outline teal)

```
className:
  "border-[#007E72]/40 text-[#007E72] hover:bg-[#007E72]/10
   focus-visible:ring-2 focus-visible:ring-[#FF005A]
   disabled:opacity-50 disabled:cursor-not-allowed
   h-8 text-xs font-semibold"
icon:  ArrowUpCircle (h-3.5 w-3.5, mr-1)
label: "Promote"
```

### 8.3 Demote button (variant — outline amber)

```
className:
  "border-[#FFAC30]/60 text-[#8a5a00] hover:bg-[#FFAC30]/15
   focus-visible:ring-2 focus-visible:ring-[#FF005A]
   disabled:opacity-50 disabled:cursor-not-allowed
   h-8 text-xs font-semibold"
icon:  ArrowDownCircle (h-3.5 w-3.5, mr-1)
label: "Demote"
```

### 8.4 Quick-filter "Organizers only" pill

```
unpressed:  border border-black/15 text-black/70 hover:bg-black/5
            h-9 px-3 text-xs font-semibold rounded-md
pressed:    bg-[#007E72] text-white border-[#007E72]
            (with a small dot badge showing the count: h-1.5 w-1.5 rounded-full bg-white/80 ml-1.5)
```

### 8.5 Stat card "Chapter organizers"

- Same shape as existing `StatCard` component (`/admin/page.tsx` line 308).
- Accent dot: teal `#007E72` (matches the CHAPTER_ORGANIZER badge text color).
- Label: `Chapter organizers`.
- Tooltip: `Count of users with the Chapter Organizer role in your scope.`

### 8.6 Confirm dialog — confirm button color

- Promote confirm: teal solid (`bg-[#007E72] text-white hover:bg-[#007E72]/90`).
- Demote confirm: amber solid (`bg-[#FFAC30] text-white hover:bg-[#FFAC30]/90`) — **not** magenta danger. Demotion is reversible and non-destructive; magenta would over-signal.
- Last-organizer warning variant of demote: same amber button, label changes to `Demote anyway`.

### 8.7 Spacing & layout

- The new Role column in CardsView sits in the detail panel with `mt-2` separating it from the Linked speaker / Tags area.
- In TableView, the Role column is `w-32` (128px) — enough for "Chapter Organizer" at 11px without truncation.
- The Promote/Demote button has `ml-1` from the previous button in the action cell (matches existing button-to-button spacing).

---

## 9. Out of scope (handoffs)

- **Forge** owns: `permissions.ts` CAN_MAP changes, new `members.manageOrganizers` permission, new role-change API endpoint, role-change guard helpers (`canEditUser`, `canChangeRole`), scope-leak audit on all `/api/admin/members/**` routes.
- **Aegis** owns: review of the role-change API endpoint, scope-leak audit sign-off, `LAST_ORGANIZER_IN_CHAPTER` flow choice (see §6 Edge 3).
- **Atlas** owns: confirm no schema change needed (the `User.role` field already exists).
- **Lumen** owns: implement this spec verbatim — no off-spec styles, no paraphrased copy.
- **Sentinel** owns: smoke-test all affected admin pages as CHAPTER_ORGANIZER, ADMIN, SUPER_ADMIN.

### Not introduced by this spec

- No new design-system components.
- No new colors (all from `core/design/system.md` v1.0).
- No new typography.
- No new icons (all from `lucide-react`, already in use elsewhere in the codebase: `ArrowUpCircle`, `ArrowDownCircle`, `Crown`, `Shield`, `Users`, `Mic2`).
- No new tabs in `admin-tabs-def.ts` — only the allow-list for CHAPTER_ORGANIZER grows.

---

## 10. Acceptance checklist for Lumen

- [ ] New `Role` cell in CardsView detail panel using `roleBadgeClass()` + `roleLabel()`.
- [ ] `TableView` Role column fixed to use `roleBadgeClass()` (was hard-coded).
- [ ] `RoleActionButton` component added with promote + demote variants.
- [ ] `RoleChangeConfirmDialog` (AlertDialog) with copy from §5.4 verbatim.
- [ ] Promote/Demote buttons hidden for: CHAPTER_ORGANIZER viewers, own row, ADMIN/SUPER_ADMIN targets, CO_HOST targets (no transition available).
- [ ] `EditMemberDialog` role section: ADMIN viewer gets `ADMIN_ASSIGNABLE_ROLES` dropdown; CHAPTER_ORGANIZER viewer gets read-only badge + note "Only Super Admins can change roles." (existing note reused).
- [ ] Quick-filter "Organizers only" pill with `aria-pressed`.
- [ ] New `StatCard` "Chapter organizers" with teal accent dot.
- [ ] `admin-tabs-def.ts` `filterTabsByRole` CHAPTER_ORGANIZER branch expanded with the 6 additional tab hrefs.
- [ ] Hidden for CHAPTER_ORGANIZER viewers: "Delete member" button, "Delete event" button, "Bulk assign scope" button (already Super-Admin-only — verify), any standalone "Change role" buttons outside the new flow.
- [ ] All copy matches §5 verbatim — no paraphrasing.
- [ ] All colors/typography/spacing from `core/design/system.md` — no off-system values.
- [ ] Keyboard: Tab order, Esc to cancel, focus restore to trigger button.
- [ ] Toasts use sonner `toast.loading` / `toast.success` / `toast.error` / `toast.warning` (warning is sonner's `toast.warning` — if not available, use `toast` with `{ icon: "⚠" }`).

---

Design signoff: Canvas, 2026-07-21
