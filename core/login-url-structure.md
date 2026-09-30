# Login URL Structure — Coma Platform

> **Single source of truth for every login URL on the Coma platform.**
>
> Read this when you:
> - Are confused about which URL to share with a brand admin, chapter organizer, or member
> - Need to debug why a user lands on the wrong page after sign-in
> - Are adding a new brand and want to know which URLs to publish
> - Want to understand the brand-aware redirect logic

**Last updated**: 2026-09-30
**Owner**: Super Z (main agent)
**Scope**: All brands provisioned via `/admin/brands` — Coma, AI Salon, Cazhype, and any future brand.

---

## 1. The 3 login URLs every brand has

Every brand on Coma has **three** user-facing entry points. They all use the same `/login` page; the difference is what `?brand=` parameter the URL carries + the redirect that happens after sign-in.

### URL 1 — Brand admin login

```
https://platform.joincoma.com/login?brand=<slug>
```

**Example for cazhype (slug = `ch`)**:
```
https://platform.joincoma.com/login?brand=ch
```

**Who uses it**: The brand admin (`BRAND_ADMIN` role) — the person who manages the entire brand: branding, mockups, chapters, members, sub-admins.

**What happens after sign-in**:
- The user is redirected to `/admin` (the admin dashboard)
- They see admin tabs: Members, Speakers, Registrants, Events, New event, Chapters, Door Check-in, Dashboard, Referral Analytics, Event dashboard, Reports, Email, Images, Knowledge Base, Mockups, Quiz, Event Prep
- They do NOT see the **Brands** tab (Super Admin only)
- All data is filtered to their brand only (via `UserScope.kind = "brand"` in `getUserScope`)
- They can edit their brand's branding at `/onboarding/<slug>` (full edit access; only the **Activate** button is hidden — that's Super Admin only)

**Role on User row**: `role = "BRAND_ADMIN"`, `brandSlug = "<slug>"`, `brandId = <brand.id>`

**How to grant this role**:
- **Path 1 (apply → approve)**: Lead signs up via `/apply?brand=<slug>`, fills the brand info form, Super Admin reviews at `/admin/brands`, clicks **Provision brand** → the brand is created + the lead is auto-promoted to BRAND_ADMIN.
- **Path 2 (direct invite)**: Lead signs up at `/login?brand=<slug>` (creates a User row). Super Admin goes to `/admin/brands`, finds the **"Invite a brand admin"** section, types the lead's email + picks the brand, clicks **Promote to BRAND_ADMIN** → the user is immediately promoted + a notification email is sent.

---

### URL 2 — Chapter / city login

```
https://platform.joincoma.com/login?brand=<slug>&chapterSlug=<chapter-slug>
```

**Example for cazhype's Tel Aviv chapter** (once the brand admin creates it):
```
https://platform.joincoma.com/login?brand=ch&chapterSlug=tel-aviv
```

**Who uses it**: Chapter organizers, co-hosts, and chapter members — anyone scoped to a specific chapter/city within the brand.

**What happens after sign-in**:
- The user is redirected to `/events` (the public events list, filtered to their brand)
- If they're a CHAPTER_ORGANIZER or CO_HOST for that chapter, they can access `/admin/chapters/[id]` to manage their chapter's settings, brand images, and events
- The `?chapterSlug=` param tags the user with the right `chapterId` at signup time (so they automatically join the chapter)
- Brand context is still `ch` — they see cazhype branding throughout

**Role on User row**:
- `role = "CHAPTER_ORGANIZER"` (or `"CO_HOST"` for legacy) + `brandSlug = "<slug>"` + `chapterId = <chapter.id>`
- The brand admin can promote a regular member to CHAPTER_ORGANIZER via `/admin/members` (when round-2 role-edit UI ships — currently Super Admin only via SQL)

**How to grant this role**:
- The brand admin creates a chapter at `/admin/chapters` (via the "New chapter" button — round-2 work)
- The brand admin invites a chapter lead via email — that lead signs up via the chapter URL above, gets the chapterId tagged on their User row
- The brand admin (or Super Admin) promotes them to CHAPTER_ORGANIZER via `/admin/members` (round 2) or via SQL

---

### URL 3 — Member login

```
https://platform.joincoma.com/login?brand=<slug>
```

**Example for cazhype members**:
```
https://platform.joincoma.com/login?brand=ch
```

**Who uses it**: Regular community members — people who attend events, RSVP, browse other members, upload photos.

**What happens after sign-in**:
- The user is redirected to `/events` (the public events list, filtered to their brand)
- They see only their brand's events (the events page filters by `chapterRef.brand.slug === myBrandSlug`)
- They can RSVP to events, message speakers, upload photos
- They cannot access `/admin/*` pages
- The `?brand=` param tags them with `brandSlug = "ch"` at signup time so all future visits show cazhype branding

**Role on User row**: `role = "MEMBER"`, `brandSlug = "<slug>"`, no `chapterId` (or set to the brand's default chapter if they pick one)

**How to grant this role**:
- Anyone can sign up via `/login?brand=<slug>` → click the **Sign up** tab → enter email + name → password is emailed → sign in
- The `brandSlug` is set automatically from the `?brand=` URL parameter (the signup route persists it as long as `isBrandSlug(slug)` returns true — which after the Phase 4 fix accepts any URL-safe slug)

---

## 2. Other important URLs

### Apply to bring a brand (community lead)

```
https://platform.joincoma.com/apply?brand=<slug>
```

Used by community leads who want to apply to bring a new brand to Coma. They fill a self-serve form with brand info (name, slug, palette, mascot, etc.). Super Admin reviews at `/admin/brands` and clicks **Provision brand** to create the Brand row + auto-promote them to BRAND_ADMIN.

### Direct chapter landing (public)

```
https://platform.joincoma.com/c/<chapter-slug>?brand=<slug>
```

The public chapter page — anyone (anonymous + signed-in) can visit it. Shows the chapter's hero, member count, upcoming events. Anonymous visitors see a "Join" CTA that routes to `/login?brand=<slug>&chapterSlug=<chapter-slug>` to sign up + join.

### Brand onboarding hub (admin only)

```
https://platform.joincoma.com/onboarding/<slug>
```

The Super Admin + BRAND_ADMIN upload hub for brand assets (logo, hero, mascot, palette, login copy). BRAND_ADMIN gets full edit access EXCEPT the **Activate** button (which flips status DRAFT→ACTIVE) — that's Super Admin only. Visible to:
- Super Admin (eze@massapro.com)
- The matching BRAND_ADMIN (whose `User.brandSlug === slug`)

### Admin brands page (Super Admin only)

```
https://platform.joincoma.com/admin/brands
```

Super Admin's brand management page:
- Lists all brands with **Onboard** + **Activate** (DRAFT only) + **Login** (ACTIVE only) buttons
- **"Invite a brand lead"** form (sends an invite email with a `/brand-onboarding/<token>` URL)
- **"Invite a brand admin"** form (Path 2 — direct promotion of existing users)
- "Ready to provision" queue (submissions awaiting review) with **Provision brand** button

---

## 3. The 4-layer brand resolution chain

When a visitor hits any Coma URL, the brand shown on the page is resolved by checking four sources in order, taking the first non-empty result:

| Layer | Source | Example |
|---|---|---|
| 1 | URL `?brand=<slug>` parameter (explicit override) | `?brand=ch` → `ch` |
| 2 | Request `Host` header → `BRAND_HOST_MAP` | `aisalon.massapro.com` → `aisalon` |
| 3 | User session `user.brandSlug` (signed-in user's brand) | `User.brandSlug = "ch"` → `ch` |
| 4 | `BRAND_DEFAULT_SLUG` env var, falls back to `"coma"` | (env) → `coma` |

**For the ch brand specifically**:
- Layer 1 fires when the URL has `?brand=ch` (e.g. the invite links above)
- Layer 2 never fires for ch (only `aisalon.massapro.com` + `platform.joincoma.com` have host entries — ch lives on platform.joincoma.com which resolves to "coma" by host)
- Layer 3 fires when a signed-in user has `brandSlug = "ch"` on their User row (BRAND_ADMIN, chapter organizer, or member of cazhype)
- Layer 4 is the fallback (shows Coma if nothing else matches)

After my Phase 4 fix (2026-09-30), Layer 1 + Layer 3 correctly persist the brand slug for non-aisalon/non-coma brands like `ch`. The login page + admin shell now query the Brand DB row (via `resolveBrandAssets(slug)`) to overlay the brand's uploaded assets, palette, and login copy on top of the static config.

---

## 4. Role-based redirect after sign-in

The `/api/auth/post-login-redirect` endpoint decides where a user goes after a successful sign-in. The redirect logic (in priority order):

| Role | Default destination | Honors `?next=` deep link? |
|---|---|---|
| `SUPER_ADMIN` | `/admin/brands` | Yes (any `/admin/*` path) |
| `BRAND_ADMIN` | `/admin` | Yes (any `/admin/*` or `/onboarding/*` path) |
| `ADMIN` (country-scoped) | `/events` (if onboarded) | Yes |
| `CHAPTER_ORGANIZER` | `/events` (if onboarded) | Yes |
| `CO_HOST` (legacy) | `/events` (if onboarded) | Yes |
| `MEMBER` (new user) | `/onboarding` (forced intake form) | No |
| `MEMBER` (returning) | `/events` (or `?next=` deep link) | Yes |
| `SPEAKER` (legacy) | `/events` | Yes |

**Key points**:
- SUPER_ADMIN + BRAND_ADMIN **bypass** the `/onboarding` intake form (they're admins, not regular members)
- A new MEMBER who hasn't filled the intake form is forced to `/onboarding` regardless of `?next=` (onboarding is mandatory before they can browse the site)
- A returning MEMBER honors `?next=` (e.g. they clicked "RSVP to event X" → they go back to that event after login)

---

## 5. Common confusion: "I logged in as the brand admin but I see Coma branding"

This is the #1 confusion reported by brand admins. There are three reasons it happens:

### Reason A — The admin shell uses the static brand resolver (now fixed)

Before the Phase 4 fix (2026-09-30), the admin shell called `resolveBrandMetadata()` which only knew about the two hardcoded brands (`"aisalon"` + `"coma"`). For `User.brandSlug = "ch"`, it fell back to Coma's BrandConfig — so the admin shell rendered Coma's wordmark, palette, and footer.

**After the fix**: `resolveBrandMetadata()` queries `resolveBrandAssets(slug)` for non-aisalon/non-coma slugs. When a Brand row exists in the DB with the requested slug, the admin shell overlays the brand's:
- displayName (e.g. "Cazhype" instead of "Coma")
- palette (primaryColor, accentColor, secondaryColor, gradient)
- hero banner, favicon, logo URLs
- login copy templates (eyebrow, headline, subtitle, footer)

### Reason B — The user's `brandSlug` is null on the User row

Before Phase 4, `isBrandSlug("ch")` returned `false` (the type was hardcoded to `"aisalon" | "coma"`). The signup route silently dropped `brandSlug=null` for new brands. So the User row was created without a brand tag — and every brand-scoped query treated them as a generic user.

**After the fix**: `isBrandSlug(s)` accepts any URL-safe slug matching `[a-z0-9][a-z0-9-]{0,31}`. The signup route persists the `?brand=` param correctly.

**Fixup for existing users** (run this SQL on your production Postgres to backfill `brandSlug` for users who signed up before the fix):

```sql
-- For the cazhype brand admin
UPDATE "User"
SET "brandSlug" = 'ch',
    "brandId" = (SELECT id FROM "Brand" WHERE slug = 'ch'),
    "updatedAt" = NOW()
WHERE email = 'eze@cazhype.com';

-- For every user who signed up via /login?brand=ch or /apply?brand=ch
-- but didn't get their brandSlug persisted (pre-Phase-4 signups).
-- This is a no-op for users who already have brandSlug set.
UPDATE "User" u
SET "brandSlug" = 'ch',
    "brandId" = (SELECT id FROM "Brand" WHERE slug = 'ch'),
    "updatedAt" = NOW()
WHERE u."brandSlug" IS NULL
  AND u.email IN (
    -- Add any known cazhype member emails here, or backfill by
    -- matching a signup domain like '%@cazhype.com'
    SELECT email FROM "User" WHERE email LIKE '%@cazhype.com'
  );
```

### Reason C — The user is signed in but the `brandSlug` on their row doesn't match the URL

If the user signed in via `?brand=coma` (default) but their User row has `brandSlug = "ch"`, the URL param wins (Layer 1) for the brand RESOLUTION on the page (so they see Coma branding on that page view), but their session-cached `brandSlug` (used by `getUserScope` for admin queries) is still `"ch"` — so they see ch's admin data even though the chrome looks like Coma.

**Fix**: Always sign in via the brand's URL: `https://platform.joincoma.com/login?brand=ch`. The `?brand=` param should match the user's `User.brandSlug`.

---

## 6. Where to find the brand's invite link

The brand admin's invite link is shown on `/onboarding/<slug>` (the onboarding hub). Visit:

```
https://platform.joincoma.com/onboarding/ch
```

Scroll to the **"Invite link for Cazhype"** section. You'll see two URLs with **Copy** buttons:
- **Member invite link** (sign in / sign up): `https://platform.joincoma.com/login?brand=ch` — share this with people you want to invite to join the cazhype community. New users who sign up via this link get tagged with `brandSlug = "ch"` automatically.
- **Apply-to-bring-your-brand link**: `https://platform.joincoma.com/apply?brand=ch` — for community leads who want to apply to bring a brand to Coma.

For inviting a SPECIFIC person as a brand admin (not just a member), use the **"Invite a brand admin"** section on `/admin/brands` instead — that promotes an existing user to `BRAND_ADMIN` for this brand.

---

## 7. Quick reference: All URLs for the cazhype brand

| Audience | URL | Purpose |
|---|---|---|
| Brand admin (sign in) | `https://platform.joincoma.com/login?brand=ch` | BRAND_ADMIN signs in → lands on `/admin` |
| Brand admin (onboarding hub) | `https://platform.joincoma.com/onboarding/ch` | Manage branding: upload logo/hero/mascot, edit palette, edit login copy |
| Brand admin (invite link) | shown on `/onboarding/ch` | Copy + share with members |
| Chapter organizer (sign in) | `https://platform.joincoma.com/login?brand=ch&chapterSlug=<chapter-slug>` | CHAPTER_ORGANIZER signs in → lands on `/events` (or `/admin/chapters/[id]` if they navigate there) |
| Member (sign in) | `https://platform.joincoma.com/login?brand=ch` | MEMBER signs in → lands on `/events` (filtered to cazhype) |
| Member (sign up) | `https://platform.joincoma.com/login?brand=ch` (then click "Sign up" tab) | New member fills email + name → password emailed → brand tagged |
| Public chapter page | `https://platform.joincoma.com/c/<chapter-slug>?brand=ch` | Anyone can visit — shows chapter hero + upcoming events + Join CTA |
| Apply (lead) | `https://platform.joincoma.com/apply?brand=ch` | Community lead applies to bring a new brand — Super Admin reviews at `/admin/brands` |

---

## 8. Round-2 work that affects this doc

These items are deferred to round 2 (not yet built) and will update this doc when shipped:

1. **"New chapter" button on `/admin/chapters` for BRAND_ADMIN** — currently chapters are created by Super Admin only via SQL or `/admin/chapters/new`. Round 2 adds a brand-scoped "New chapter" button that creates a Chapter row with `brandId = me.brandId` automatically. (Issue: brand admin can't currently create chapters via UI.)

2. **Role-edit dialog on `/admin/members` for BRAND_ADMIN** — currently role changes are Super Admin only. Round 2 lets BRAND_ADMIN promote users within their brand to CHAPTER_ORGANIZER, CO_HOST, SPEAKER, MEMBER (never to BRAND_ADMIN or SUPER_ADMIN). (Issue: brand admin can't invite co-hosts/admins/speakers via UI yet.)

3. **`/admin` dashboard surface for BRAND_ADMIN** — currently the admin dashboard renders the same for BRAND_ADMIN as for ADMIN (country-scoped). Round 2 will add a brand-scoped admin landing that shows brand-specific stats (chapters count, members count, events count, upcoming emails) + quick action buttons (Invite member, Create chapter, Edit branding). (Issue: brand admin lands on a generic admin page with no brand-specific framing.)

4. **Email notification when a brand admin promotes a member** — currently the promotion is silent (no email sent to the promoted user). Round 2 will fire a notification email.

5. **Per-chapter invite link display** — currently the brand admin only sees the brand-level invite link on `/onboarding/<slug>`. Round 2 will add per-chapter invite URLs to `/admin/chapters/[id]` so the admin can share chapter-specific signup links.

---

## 9. Maintenance

When you add a new brand via `/admin/brands`:
1. The brand gets a slug (e.g. `danone`).
2. The login URL is automatically `https://platform.joincoma.com/login?brand=danone`.
3. No DNS work needed — all brands live on `platform.joincoma.com` (the central host). AIS is the only exception (grandfathered at `aisalon.massapro.com`).
4. The brand admin signs in via that URL → lands on `/admin` with their brand-scoped access.
5. The brand admin shares the invite link (shown on `/onboarding/<slug>`) with members.

When you deprecate a brand:
1. Set `Brand.status = "DRAFT"` (Super Admin via `/admin/brands` or SQL).
2. The brand's pages still render but the "Activate" button shows again.
3. Existing users keep their `brandSlug` — they continue to see the brand's data until their `brandSlug` is cleared.

---

## 10. References

- **Source code**:
  - `src/lib/brand/brand-config.ts` — static brand registry (aisalon + coma) + `isBrandSlug()` type guard
  - `src/lib/brand/brand-assets-resolver.ts` — DB-aware asset resolver (used by login + onboarding hub + mockups)
  - `src/lib/brand/brand-metadata.ts` — brand-aware metadata resolution (used by root layout + leaf pages)
  - `src/lib/brand/resolve-brand.ts` — 4-layer brand resolution chain
  - `src/app/login/page.tsx` — brand-aware login page (DB-aware override added 2026-09-30)
  - `src/app/api/auth/post-login-redirect/route.ts` — role-based redirect after sign-in
  - `src/app/api/auth/signup/route.ts` — signup route that persists `brandSlug` from the `?brand=` URL param
  - `src/lib/permissions.ts` — `getUserScope()` returns `{ kind: "brand", brandSlug }` for BRAND_ADMIN users
  - `src/app/onboarding/[brandSlug]/page.tsx` — onboarding hub (BRAND_ADMIN + Super Admin only)
  - `src/app/admin/brands/brands-admin-client.tsx` — Super Admin brand management UI

- **Related core docs**:
  - [`core/protocols/preview-url-sharing.md`](./protocols/preview-url-sharing.md) — preview URL format
  - [`core/workflow.md`](./workflow.md) — task workflow (every code change goes through this)

- **Migrations**:
  - `20260918000000_add_brand_model_and_brand_ids` — Brand table + brandId on Chapter/User
  - `20260921000000_brand_mascot_book_apply_self_serve` — mascot/book fields + self-serve /apply
  - `20260930000000_add_chapter_is_publicly_listed` — Chapter.isPubliclyListed column (public/private toggle)
