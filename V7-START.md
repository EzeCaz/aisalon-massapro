# V7 Series — Start

**Started:** 2026-07-18 20:10 UTC
**Previous series state:** V6 in progress (latest commit `aa869b6`, 111 commits since `v5.15`); no V6-final tag yet — V7 begins on top of V6-snapshot work
**V7 baseline commit:** `aa869b6` (this commit)
**Live URL:** https://aisalon.massapro.com
**Vercel project:** aisalon-massapro (auto-deploys from `main` — **V7 changes are NOT deployed yet**)
**package.json version:** `7.0.0` (bumped from `0.2.0`)

## V7 scope — Global → Country → Chapter hierarchy

V7 introduces the multi-tenant geographic hierarchy that turns the
platform from a single-chapter deployment (Tel Aviv) into a federation
of country-level organizations, each containing city-level chapters.

### The hierarchy

```
Global (super admin)
└── Country  (e.g. Israel)
    └── Chapter  (e.g. Tel Aviv)
```

### Three user roles (replacing the 5-role V6 system)

| V7 role | V6 roles collapsed in | Scope |
|---|---|---|
| **Super Admin** | `SUPER_ADMIN` | Global — every country, every chapter, every record |
| **Admin** | `ADMIN` | One country + all chapters under it |
| **Chapter Organizer** | `CO_HOST` | One chapter only — can manage everything under it |

> **Note on `SPEAKER`:** V6 had a `SPEAKER` role (rank 0). In V7, "speaker" is **no longer a User role** — it is a per-event relationship (`Speaker.userId`). A user is a "speaker at an event" by virtue of having a `Speaker` row linked to their `User`, not by their `User.role`. Their `User.role` becomes `MEMBER` (or `CHAPTER_ORGANIZER` / `ADMIN` if they also have chapter/country duties). This simplifies the role model and removes the cross-cutting `SPEAKER` permission.

### New database models (drafted, NOT migrated yet)

- `Country` — top-level geographic org (e.g. Israel, USA, UK)
- `Chapter` — city-level chapter, belongs to a Country (e.g. Tel Aviv, Jerusalem, NYC)
- `ChapterSetting` — per-chapter branding overrides (logo, hero, email domain, email templates)
- `User.countryId` (nullable) + `User.chapterId` (nullable) — scoping fields
- `Event.chapterId` — promotes the existing free-form `Event.chapter` String to a real FK
- `Member`/`Speaker`/`Registrant` scoping via `chapterId` + `countryId` (derived from event or user)

### Migration seed

- Create `Country(name="Israel", code="IL")`
- Create `Chapter(name="Tel Aviv", slug="tel-aviv", countryId=...)` (default chapter)
- Attach **all** existing members, speakers, registrants, events to Israel + Tel Aviv
- Existing `SUPER_ADMIN` (`eze@massapro.com`) stays Super Admin (global)
- Existing `ADMIN_EMAIL` user becomes Admin of Israel (country-scoped)

### Per-chapter branding (new)

- Main logo / hero image per chapter
- Email domain per chapter (e.g. `@aisalon.co.il` for IL, `@aisalon.org` for US)
- Email templates can be overridden at the chapter level (fall back to country → global)
- WhatsApp/LinkedIn links per chapter

### Scoped reports / members / users

- Super Admin sees all countries + chapters (with country/chapter filter chips)
- Admin sees only their country's data
- Chapter Organizer sees only their chapter's data
- Hot path to scope: `src/app/admin/page.tsx` member query + `/api/admin/members` route

## What V7 inherits from V6

- **Auth**: Google OAuth + dev email fallback. `SUPER_ADMIN_EMAILS` allowlist in `permissions.ts`.
- **Events**: full event lifecycle with photos, agenda, mockups, check-in, slideshow, prep questions.
- **Email orchestrator**: 8-step flows + audience + A/B subjects + per-step triggers. Brand logo per template (will become per-chapter in V7).
- **Quiz engine**: admin Control Room + member mobile UI.
- **Community chat**: event rooms + DMs + WebSocket sidecar.
- **Brand**: AIS BLACK / RED (#FF005A) / CYAN (#00E6FF) palette (now per-chapter customizable).

## V7 deployment status

**NOT DEPLOYED.** V7 changes are drafted but not yet migrated or deployed:

- [ ] Prisma migration written (drafted in `core/v7/plan.md`)
- [ ] Migration applied to staging DB
- [ ] Seed script run (Israel + Tel Aviv created, existing records attached)
- [ ] `permissions.ts` updated with new 3-role model + scope helpers
- [ ] `auth.ts` updated to resolve role + scope on sign-in
- [ ] Admin pages updated with country/chapter scoping
- [ ] Branding system updated for per-chapter assets
- [ ] Email orchestrator updated for chapter-scoped sending
- [ ] Vercel production deploy

**Until V7 is fully landed, production continues to run V6 at commit `aa869b6`.**

## Backups

- V6 snapshot tarball: `download/aisalon-massapro-v6-snapshot-20260718-1950UTC-97e658d.tar.gz` (65.8 MB, 2,401 files, sha256 `d2a1db24…`)
- V6 snapshot manifest: `download/aisalon-massapro-v6-snapshot-20260718-1950UTC-97e658d-MANIFEST.txt`
- Release log: `core/releases/release-log.md`
- Backup manifest: `download/backups/MANIFEST.md`

## V7 design documents

- **`core/v7/plan.md`** — full architectural plan (roles, permissions, schema, migration, scoping helpers, branding, reports)
- **`prisma/migrations/V7-draft.sql`** — draft SQL migration (NOT applied; reviewed before running)
- **`scripts/v7-seed-israel-tel-aviv.ts`** — seed script that creates Israel + Tel Aviv and attaches all existing records

