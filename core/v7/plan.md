# V7 — Global → Country → Chapter Architecture Plan

**Status:** DRAFT — not yet implemented. Tracked in `V7-START.md`.
**Owner:** eze@massapro.com (Super Admin)
**Started:** 2026-07-18

This document defines the full V7 architecture: data model, role
hierarchy, permission scoping, branding system, email orchestration
changes, and migration plan. **Nothing here is deployed yet** — every
section ends with a "Migration steps" checklist that must run before
the change is live.

---

## 1. The Hierarchy

```
Global  (super admin scope)
│
└── Country  (admin scope)
    │
    └── Chapter  (chapter organizer scope)
        │
        └── Members, Speakers, Registrants, Events, Email flows, Reports
```

| Level | Has its own | Example |
|---|---|---|
| **Global** | Settings (favicon, login hero, GA4, Meta Pixel, email kill switches) | `aisalon.massapro.com` |
| **Country** | Country-level branding fallback, country admin email | Israel, USA, UK |
| **Chapter** | Logo, hero, email domain, WhatsApp/LinkedIn, email templates (override) | Tel Aviv, Jerusalem, NYC, London |

### Scope resolution rules

| User role | `countryId` | `chapterId` | Sees |
|---|---|---|---|
| Super Admin | null | null | Everything (global) |
| Admin | `<set>` | null | Their country + ALL chapters under it |
| Chapter Organizer | `<set>` | `<set>` | One chapter only |
| Member | null or `<set>` | null or `<set>` | Their own profile only (as today) |

A user with `role=ADMIN` MUST have `countryId` set (enforced at sign-in
+ by the role-change API). A user with `role=CHAPTER_ORGANIZER` MUST
have both `countryId` and `chapterId` set.

---

## 2. Role Model

### V7 role values (stored on `User.role` as String)

| Constant | Value | Rank | Notes |
|---|---|---|---|
| `SUPER_ADMIN` | `"SUPER_ADMIN"` | 4 | Global. Still bootstrapped from `SUPER_ADMIN_EMAILS` allowlist. |
| `ADMIN` | `"ADMIN"` | 3 | Country-scoped. `countryId` required. |
| `CHAPTER_ORGANIZER` | `"CHAPTER_ORGANIZER"` | 2 | Chapter-scoped. `countryId` + `chapterId` required. |
| `MEMBER` | `"MEMBER"` | 1 | Default. No scope required. |

**Dropped from V6:** `CO_HOST` (merged into `CHAPTER_ORGANIZER`) and `SPEAKER` (now per-event via `Speaker.userId`, not a User role).

### Backwards-compatibility shims

During V7 rollout (and to avoid breaking legacy code paths):

- Any `User` with `role="CO_HOST"` will be migrated to `role="CHAPTER_ORGANIZER"` with `chapterId` = the chapter of the first event they co-hosted (best-effort; default to TLV if unknown).
- Any `User` with `role="SPEAKER"` will be migrated to `role="MEMBER"`. Their `Speaker.userId` rows already link them to specific events — those links are preserved.

### First-sign-in role resolution (`resolveInitialRole`)

| Condition | Role assigned |
|---|---|
| Email in `SUPER_ADMIN_EMAILS` allowlist | `SUPER_ADMIN` (no scope) |
| Email matches `ADMIN_EMAIL` env var | `ADMIN` (with `countryId` = Israel — bootstrapped once) |
| Otherwise | `MEMBER` (no scope) |

### Role-change API (`/api/admin/members/[id]/role`)

A Super Admin or Admin can change a user's role. Validation:

- Promoting to `ADMIN` requires `countryId` to be set (Super Admin picks the country; an Admin can only promote within their own country).
- Promoting to `CHAPTER_ORGANIZER` requires `chapterId` set, and the chapter must belong to a country the acting admin has access to.
- Only Super Admin can promote to `SUPER_ADMIN`.
- An Admin cannot demote another Admin in the same country (only Super Admin can).

---

## 3. Database Schema Additions

### New models

```prisma
model Country {
  id          String    @id @default(cuid())
  name        String    @unique           // "Israel"
  code        String    @unique           // "IL" (ISO 3166-1 alpha-2)
  slug        String    @unique           // "israel"
  flagEmoji   String?                     // "🇮🇱"
  defaultEmailDomain String?              // "aisalon.co.il"
  defaultFromName    String?              // "AI Salon Israel"
  defaultReplyTo     String?              // "noreply@aisalon.co.il"
  isActive    Boolean   @default(true)
  chapters    Chapter[]
  users       User[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Chapter {
  id          String    @id @default(cuid())
  name        String                     // "Tel Aviv"
  slug        String    @unique           // "tel-aviv"
  countryId   String
  country     Country   @relation(fields: [countryId], references: [id], onDelete: Restrict)
  city        String?                     // "Tel Aviv-Yafo"
  timezone    String   @default("Asia/Jerusalem")
  whatsappGroupUrl    String?            // per-chapter override
  linkedinUrl         String?            // per-chapter override
  isActive    Boolean   @default(true)
  users       User[]
  events      Event[]
  settings    ChapterSetting[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([countryId, slug])
  @@index([countryId])
}

model ChapterSetting {
  // Mirrors the V6 SiteSetting key/value pattern, but scoped to a chapter.
  // A null chapterId means "country-level fallback" (rare; usually we go
  // global → chapter). Lookups follow: ChapterSetting → SiteSetting (global).
  id          String    @id @default(cuid())
  chapterId   String
  chapter     Chapter   @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  key         String                     // "logoUrl" | "loginHero" | "emailDomain" | ...
  value       String
  updatedBy   String?
  updatedAt   DateTime  @updatedAt

  @@unique([chapterId, key])
  @@index([chapterId])
}
```

### Modified `User` model

```prisma
model User {
  // ...all existing fields preserved...

  // ---- V7 scoping fields (nullable for backwards compat) ----
  countryId   String?
  country     Country?  @relation(fields: [countryId], references: [id], onDelete: SetNull)
  chapterId   String?
  chapter     Chapter?  @relation(fields: [chapterId], references: [id], onDelete: SetNull)

  // role now allows "CHAPTER_ORGANIZER" (V6 "CO_HOST" migrated to it)
  role        String   @default("MEMBER")
  // "SUPER_ADMIN" | "ADMIN" | "CHAPTER_ORGANIZER" | "MEMBER"

  @@index([countryId])
  @@index([chapterId])
  @@index([role, countryId])
  @@index([role, chapterId])
}
```

### Modified `Event` model

The existing `Event.chapter String @default("Tel Aviv")` field becomes a **denormalized cache** of `Chapter.name`. We add a real FK:

```prisma
model Event {
  // ...all existing fields preserved...

  // ---- V7: real chapter FK ----
  chapterId   String?
  chapterRef  Chapter?  @relation(fields: [chapterId], references: [id], onDelete: SetNull)

  // Existing free-form String fields stay for backwards compat:
  //   chapter   String   @default("Tel Aviv")  ← kept as denormalized label
  //   city      String?
  //   country   String?  ← kept as denormalized ISO code ("IL")
  // These are populated from chapterRef on write (trigger in code).

  @@index([chapterId])
}
```

### Migration of `EmailStageTemplate` (per-chapter brand override)

The V6 `EmailStageTemplate.logoUrl` field stays as the global default.
A new join table lets chapters override individual templates:

```prisma
model ChapterEmailTemplateOverride {
  id              String   @id @default(cuid())
  chapterId       String
  chapter         Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  stageTemplateId String
  stageTemplate   EmailStageTemplate @relation(fields: [stageTemplateId], references: [id], onDelete: Cascade)
  logoUrl         String?  // override
  subject         String?  // override
  htmlBody        String?  // override
  isActive        Boolean  @default(true)
  updatedAt       DateTime @updatedAt

  @@unique([chapterId, stageTemplateId])
  @@index([chapterId])
}
```

Resolver: `getEmailTemplateForChapter(chapterId, stageTemplateId)`
1. Look up `ChapterEmailTemplateOverride` — if present and `isActive`, use it.
2. Otherwise fall back to the global `EmailStageTemplate`.

---

## 4. Permission Scoping Helpers

Mirrors the existing V6 `getCoHostedEventIds(userId, role)` pattern
(returns `null` = no filter / `[]` = no access / `[ids]` = scoped).

### New helpers in `src/lib/permissions.ts`

```ts
// Returns the user's effective scope:
//   { kind: "global" }
//   { kind: "country", countryId }
//   { kind: "chapter", countryId, chapterId }
//   { kind: "none" }   // MEMBER with no admin duties
export async function getUserScope(userId: string): Promise<UserScope>

// Returns a Prisma `where` fragment that scopes a query to the user's
// chapter/country. Pass to db.user.findMany({ where: { ...await scopeWhere(me) } }).
export async function scopeWhere(user: { id: string; role: string }): Promise<{
  countryId?: string
  chapterId?: string
} | { OR: [{ countryId: null }, { countryId: undefined }] }>

// Chapter access check (returns true if user can act on this chapter)
export async function canActOnChapter(user: { id: string; role: string }, chapterId: string): Promise<boolean>

// Country access check
export async function canActOnCountry(user: { id: string; role: string }, countryId: string): Promise<boolean>

// Returns event IDs the user can see (mirrors getCoHostedEventIds pattern)
//   null  → no filter (super admin)
//   []    → no events (member with no scope)
//   [ids] → scoped list
export async function getScopedEventIds(user: { id: string; role: string }): Promise<string[] | null>

// Returns chapter IDs the user can manage
export async function getManagedChapterIds(user: { id: string; role: string }): Promise<string[] | null>
```

### Updated `CAN_MAP` (permission catalog)

Most V6 permissions carry over; only role names change:

| Permission | V7 minimum role | Notes |
|---|---|---|
| `members.view` | `ADMIN` (country-scoped) | Sees only members in their country |
| `members.edit` | `ADMIN` | Country-scoped |
| `members.export` | `ADMIN` | Country-scoped |
| `members.bulkImport` | `ADMIN` | Imported members assigned to admin's chapter |
| `members.delete` | `SUPER_ADMIN` | Global only |
| `members.changeRole` | `SUPER_ADMIN` | Promotions/demotions across countries |
| `events.create` | `ADMIN` | Created in admin's country + chosen chapter |
| `events.edit` | `ADMIN` or `CHAPTER_ORGANIZER` | Chapter-scoped for organizers |
| `events.delete` | `SUPER_ADMIN` | |
| `email.view` | `ADMIN` | Country-scoped flows |
| `email.send` | `ADMIN` | Country-scoped |
| `email.templates` | `SUPER_ADMIN` or `ADMIN` (chapter overrides only) | |
| `chat.moderate` | `ADMIN` or `CHAPTER_ORGANIZER` | Scope = their chapters |
| `chat.createRoom` | `ADMIN` or `CHAPTER_ORGANIZER` | |
| `quiz.host` | `CHAPTER_ORGANIZER` | Was `CO_HOST` in V6 |
| `reports.view` | `ADMIN` | New V7 permission; country-scoped |

---

## 5. Branding System (per-chapter)

### Resolver chain

```ts
async function getBrandingForContext(chapterId: string | null): Promise<Branding> {
  // 1. If chapterId is set, read ChapterSetting rows for that chapter.
  // 2. For any key not set at chapter level, fall back to global SiteSetting.
  // 3. For any key not set globally either, use the hardcoded DEFAULTS.
  return {
    favicon, loginHero, loginBanner,
    whatsappGroupUrl, whatsappGroupText, linkedinUrl,
    logoUrl, emailDomain, emailFromName, emailReplyTo,
    ga4MeasurementId, metaPixelId,
  };
}
```

### Per-chapter keys (new in V7)

| Key | Default (from global SiteSetting) | Per-chapter override |
|---|---|---|
| `logoUrl` | (none — uses brand-assets gallery) | Chapter logo URL |
| `emailDomain` | `aisalon.massapro.com` | e.g. `aisalon.co.il` |
| `emailFromName` | `AI Salon` | e.g. `AI Salon Tel Aviv` |
| `emailReplyTo` | `noreply@aisalon.massapro.com` | e.g. `tlv@aisalon.co.il` |
| `loginHero` | `/images/falafel-meerkat.jpg` | Chapter hero image |
| `whatsappGroupUrl` | (global default) | Chapter WhatsApp |
| `linkedinUrl` | (global default) | Chapter LinkedIn |

### How it flows through the app

1. **Public pages** (`/login`, `/events/[slug]`, etc.) — resolve chapter from the URL or the event being viewed. Use the chapter's branding.
2. **Admin pages** — Super Admin can switch the "active chapter" via a dropdown in the header. The branding shown reflects the selected chapter.
3. **Email orchestrator** — when sending a flow, the email's `fromName`, `fromEmail`, `replyTo`, and `logoUrl` are resolved from the chapter of the event that triggered the flow.

---

## 6. Scoped Reports / Members / Users

### Member list query (`src/app/admin/page.tsx`)

V6:
```ts
const members = await db.user.findMany({
  where: { archivedAt: null },
  orderBy: [{ importSource: "desc" }, { createdAt: "desc" }],
  include: { ... },
});
```

V7:
```ts
const scope = await getUserScope(me.id);
const members = await db.user.findMany({
  where: {
    archivedAt: null,
    ...scopeWhereFromScope(scope),
  },
  orderBy: [{ importSource: "desc" }, { createdAt: "desc" }],
  include: { ..., chapter: true, country: true },
});
```

### Filter chips in MemberDashboard

V6 has client-side tag/source filters. V7 adds:

- **Country dropdown** (Super Admin only; Admin sees their own country locked)
- **Chapter dropdown** (Super Admin + Admin; Chapter Organizer sees their own chapter locked)

### New `/admin/reports/` page (fresh in V7)

Aggregated cross-chapter view for Super Admins and Admins:

- Members by chapter (bar chart)
- Events by chapter (last 90 days)
- Email send volume by chapter
- Top referrers by chapter
- Cross-chapter comparison table

---

## 7. Migration Plan

### Step 1: Draft schema changes (NOT applied)

- [x] Document `Country`, `Chapter`, `ChapterSetting`, `ChapterEmailTemplateOverride` models in this plan
- [ ] Write Prisma migration as `prisma/migrations/V7-add-hierarchy/migration.sql` (draft only — DO NOT run)
- [ ] Review with eze before applying

### Step 2: Seed data (Israel + Tel Aviv)

- [ ] Write `scripts/v7-seed-israel-tel-aviv.ts` that:
  - Creates `Country(name="Israel", code="IL", slug="israel", flagEmoji="🇮🇱", defaultEmailDomain="aisalon.co.il")`
  - Creates `Chapter(name="Tel Aviv", slug="tel-aviv", countryId=IL, timezone="Asia/Jerusalem")`
  - Sets `User.countryId=IL, chapterId=TLV` for ALL existing users (one-shot backfill)
  - Sets `Event.chapterId=TLV` for ALL existing events
  - Sets `User.countryId=IL` on the `ADMIN_EMAIL` user (`eze@massapro.com` — but stays Super Admin so scope is global anyway)
- [ ] Run against staging DB first; verify counts match
- [ ] Run against production DB during a maintenance window

### Step 3: Role migration

- [ ] For every `User` with `role="CO_HOST"` → set `role="CHAPTER_ORGANIZER"` and `chapterId` = chapter of first event they co-hosted (default TLV if none)
- [ ] For every `User` with `role="SPEAKER"` → set `role="MEMBER"` (their `Speaker.userId` links are preserved)
- [ ] Validate: no users with `role="CO_HOST"` or `role="SPEAKER"` remain

### Step 4: Code updates (per file, deploy together)

- [ ] `src/lib/permissions.ts` — new `ROLES` map, `getUserScope`, `scopeWhere`, `canActOnChapter`, `canActOnCountry`, `getScopedEventIds`, `getManagedChapterIds`
- [ ] `src/lib/auth-guards.ts` — `getCurrentUser` returns scope; `requirePermission` accepts scope argument
- [ ] `src/lib/auth.ts` — `resolveInitialRole` updated for V7 (Super Admin / Admin / Member only on first sign-in)
- [ ] `src/lib/site-settings.ts` — add `getBrandingForContext(chapterId)` resolver
- [ ] `src/lib/email-orchestrator/sender.ts` — resolve `fromEmail` / `replyTo` from chapter branding
- [ ] `src/lib/email-orchestrator/templates.ts` — `buildContext` accepts chapter branding
- [ ] `src/app/admin/page.tsx` — scope member query
- [ ] `src/app/api/admin/members/route.ts` — scope member query
- [ ] `src/app/admin/dashboard/member-dashboard.tsx` — add country/chapter filter chips
- [ ] `src/app/admin/analytics/page.tsx` — scope referral analytics
- [ ] `src/app/admin/email/flows/*` — scope flow list to admin's country
- [ ] `src/app/admin/reports/page.tsx` — NEW cross-chapter reports page
- [ ] `src/app/admin/chapters/page.tsx` — NEW chapter management page (Super Admin + Admin)
- [ ] `src/app/admin/chapters/[id]/page.tsx` — NEW chapter settings editor (branding, email domain)
- [ ] Header component — add chapter switcher dropdown for Super Admin + Admin

### Step 5: UI changes

- [ ] Header chapter switcher (Super Admin + Admin)
- [ ] Chapter branding on login page (resolve from URL `?chapter=tel-aviv` or default to TLV)
- [ ] Chapter branding on event pages (resolve from `event.chapterId`)
- [ ] New `/admin/chapters` page with chapter CRUD (Super Admin only)
- [ ] New `/admin/reports` page with cross-chapter analytics

### Step 6: Deploy

- [ ] Apply Prisma migration to production Neon DB
- [ ] Run `scripts/v7-seed-israel-tel-aviv.ts` against production
- [ ] Deploy to Vercel
- [ ] Verify:
  - [ ] Existing TLV events still load
  - [ ] Existing members appear in admin list (scoped to Israel for Admin)
  - [ ] Super Admin sees all data with chapter filter chips
  - [ ] Email orchestrator still PAUSED (don't accidentally enable)
- [ ] Add V7 entry to `core/releases/release-log.md`

---

## 8. Confirmed Design Decisions (answered 2026-07-18)

1. **Email domain per chapter** → **KEEP `@aisalon.massapro.com` globally for now.**
   The `ChapterSetting.emailDomain` / `emailFromName` / `emailReplyTo` keys
   still exist in the schema (so a future chapter CAN override), but no
   chapter sets them initially — every chapter falls back to the global
   default. No DNS/SPF/DKIM changes needed for V7 launch.
   - Implication: `defaultEmailDomain` / `defaultFromName` / `defaultReplyTo`
     on the `Country` model are **nullable** and stay null for Israel at launch.

2. **Chapter slug in URL** → **YES — `/{chapter-slug}/events/{event-slug}`.**
   Public event URLs become chapter-prefixed:
   - Old V6: `/events/ai-salon-37`
   - New V7: `/tel-aviv/events/ai-salon-37`
   - Chapter listing page: `/tel-aviv/events` (was `/events`)
   - Chapter home page: `/tel-aviv` (new)
   - Admin URLs stay chapter-agnostic: `/admin/events/ai-salon-37` (no prefix — admins manage across chapters)
   - Email template token `{{eventUrl}}` resolves to the chapter-prefixed URL.
   - **Backwards compat**: `/events/{slug}` returns 301 redirect to `/{event.chapter.slug}/events/{slug}`.
   - Default chapter (when no chapter in URL or visitor first lands): Tel Aviv.
   - Implication: routing changes in `src/app/(public)/[chapter]/events/[slug]/page.tsx` (new), `src/app/(public)/[chapter]/events/page.tsx` (new), `src/app/(public)/[chapter]/page.tsx` (new chapter landing).

3. **Cross-chapter events** → **Only if Super Admin explicitly allows.**
   By default, every event belongs to exactly one chapter (`Event.chapterId`).
   A Super Admin can flip `Event.isCrossChapter = true` from the admin event
   editor. When true:
   - The event appears in the listings of ALL chapters in its country.
   - The event's `chapterId` is still the "owning" chapter (for admin scope checks).
   - The event's URL uses the owning chapter's slug.
   - Members RSVPing from another chapter's listing still get their `User.chapterId`
     set to the **owning chapter** (not the listing chapter), because chapter
     self-assignment is disabled (see Q5).
   - This requires a new column: `Event.isCrossChapter Boolean @default(false)`.
   - The flag is only editable by Super Admin (UI control hidden for everyone else).

4. **Admin can promote Member → Chapter Organizer within their country** → **YES.**
   The role-change API (`/api/admin/members/[id]/role`) enforces:
   - Super Admin can promote/demote to any role in any country/chapter.
   - Admin can promote a Member to Chapter Organizer, but ONLY with a `chapterId`
     that belongs to their own country. They cannot promote to Admin or Super Admin.
   - Admin can demote a Chapter Organizer back to Member within their country.
   - Admin cannot touch another Admin or Super Admin.
   - Super Admin can promote an Admin to Admin of a different country (re-scope).

5. **Member self-assignment of chapter** → **NO.**
   Members do NOT pick their chapter on signup or via a profile setting.
   Instead:
   - On first RSVP, `User.chapterId` is auto-set to the event's `chapterId`
     (only if `User.chapterId` is currently null).
   - On first event creation by a new admin, the admin's `countryId` / `chapterId`
     are inherited from the event (only if currently null).
   - Members who never RSVP stay `chapterId = null` (they appear only in the
     Super Admin's "unassigned" filter, not in any chapter-scoped list).
   - A Super Admin or Admin can manually assign a `chapterId` to a member via
     the admin member editor.
   - Implication: `EventRsvp` creation flow needs a hook that backfills
     `User.chapterId` if null. Implemented in
     `src/app/api/events/[slug]/rsvp/route.ts` after successful RSVP insert.

6. **Speaker-message relay routing** → **PENDING — needs clarification** (see below).

---

## 8a. Q6 Explanation — Speaker-message relay routing

**The V6 behavior** (current code):
- A member visits a speaker's profile on an event page and clicks "Message speaker".
- The member writes a message; it's saved to the `SpeakerMessage` table.
- **A copy of the message is also emailed to `ADMIN_EMAIL` (eze@massapro.com)** as a "relay" — so the admin can monitor all member-to-speaker conversations from their inbox.
- Code locations:
  - `src/app/api/speakers/[id]/messages/route.ts:132` — `const adminEmail = process.env.ADMIN_EMAIL || "eze@massapro.com";`
  - `src/app/api/messages/[userId]/route.ts:182` — same pattern for member-to-member DMs.

**Why Q6 matters in V7:**
With the new hierarchy, "the admin" is no longer a single person. An event in the Tel Aviv chapter is now conceptually owned by the Tel Aviv Chapter Organizer and the Israel Country Admin — not necessarily the global Super Admin. The question is: **who should receive these relay emails in V7?**

**Concrete options — pick one:**

| Option | Who receives the relay email | Pros | Cons |
|---|---|---|---|
| **A. Keep status quo** | `ADMIN_EMAIL` env var (still eze@massapro.com globally) | Simplest — zero code changes to relay logic | Super Admin becomes a bottleneck for every chapter; Chapter Organizers can't see member-speaker conversations in their chapter |
| **B. Chapter Organizers of the event's chapter** | All users with `role=CHAPTER_ORGANIZER` where `chapterId = event.chapterId` | Local visibility — Chapter Organizers can monitor their chapter's conversations | If a chapter has no organizer yet, message is silently not relayed (need fallback) |
| **C. Country Admin of the event's country** | All users with `role=ADMIN` where `countryId = event.chapter.countryId` | Country Admin gets full picture of their country | Country Admin may be spammed if many events run concurrently |
| **D. Both Chapter Organizers AND Country Admin** | Union of B + C | Maximum visibility for the local team | More email volume; potential duplicate notifications |
| **E. Stop relaying entirely** | Nobody — messages stay in-app only (admin can read them via the Speaker Messages admin page) | Simplest data flow; matches the in-app DM pattern | Admin loses passive visibility — must actively check the admin panel |

**Recommendation: Option B with fallback to A.**
- Try to relay to all Chapter Organizers of the event's chapter.
- If the chapter has zero organizers, fall back to `ADMIN_EMAIL` (Option A behavior).
- Country Admins can see all messages via the admin panel (filter by chapter), so they don't need an email.
- Super Admin can also see everything via the admin panel.

**My default if you don't pick:** Option A (keep status quo) — zero risk of accidentally emailing the wrong person, and Super Admin keeps full visibility.

---

## 9. Rollback Plan

If V7 breaks production:

1. **Code rollback**: `git revert` the V7 commits and redeploy V6 from the last V6 commit (`aa869b6`).
2. **DB rollback**: The V7 migration is **additive only** (new tables, new nullable columns). No V6 columns or tables are removed. A rollback is safe — V6 code will simply ignore the new fields.
3. **Data rollback**: The Israel + Tel Aviv seed rows and the `countryId` / `chapterId` backfills stay in place (harmless if V6 code runs against them).
4. **Re-enable V6 auth**: V6 `resolveInitialRole` still works; `SUPER_ADMIN_EMAILS` allowlist unchanged.

**The V7 migration is the safest possible kind — purely additive.**

