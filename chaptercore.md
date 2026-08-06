# chaptercore.md — Default New Chapter Blueprint

> **This file is the single source of truth for the "default new chapter"
> config.** When a new chapter is created (via `/admin/chapters/new` →
> `/api/admin/email/seed-chapter`), the system reads this file and applies
> the defaults documented below to the new chapter.
>
> **To update the default new chapter image / config → edit this file.**
> No code changes, no redeploy needed for value-only edits (image paths,
> URLs, timezone). The seed-chapter API parses the `<!-- CHAPTERCORE_JSON -->`
> block below at runtime.

---

## What is this?

`chaptercore.md` captures the **Montreal chapter's brand configuration** as
the canonical blueprint that every new chapter starts from. It was
introduced on 2026-08-07 (TSK-0077) after the Montreal chapter was set up
manually — the user designated Montreal's config as the "first blue print"
for all future chapters.

### What gets copied to a new chapter

When `POST /api/admin/email/seed-chapter` runs, it now ALSO applies the
"chapter core" defaults from this file to the target chapter:

| Layer | What | How |
|---|---|---|
| **Brand images** (4) | favicon, loginHero, loginBanner, emailLogo | `ChapterSetting` rows created pointing at the files in `/public/defaults/chapter-core/` |
| **Chapter hero image** | `Chapter.heroImageUrl` (the landing-page hero on `/c/[slug]`) | `Chapter.heroImageUrl` column set to the `chapterHero` path |
| **Chapter social links** | WhatsApp group URL, LinkedIn URL | `Chapter.whatsappGroupUrl` + `Chapter.linkedinUrl` columns (only set if currently null — never overwrites an existing value) |
| **Chapter timezone** | e.g. `America/Toronto` | `Chapter.timezone` column (only set if currently the default `Asia/Jerusalem`) |
| **Email infrastructure** | audiences, flows, draft campaigns | Already cloned by the existing seed-chapter logic (unchanged) |
| **Email templates** (5 stages) | Awareness, Reminder, Final Prep, Day-Of, Recap | NOT cloned — they are global (`chapterId=null`) and shared by all chapters |

### What does NOT get copied

- **Email templates** — the 5 stage templates (`EmailTemplate2` rows) are
  global and visible to every chapter. No duplication needed.
- **Email send history** (`EmailQueue`) — per-recipient, not portable.
- **Country / chapter name / slug / city** — these are chapter-specific
  and must be set when the chapter is created via `/admin/chapters/new`.
- **GA4 / Meta Pixel IDs** — chapter-specific, set via `/admin/images`.

---

## The 5 default brand images

All files live in `/public/defaults/chapter-core/`. They are committed to
the repo so they survive redeploys and are always available locally
(no external blob dependency for the default baseline).

| Key | File | Used for |
|---|---|---|
| `favicon` | `/defaults/chapter-core/favicon.webp` | Browser tab icon (layout.tsx metadata.icons) |
| `loginHero` | `/defaults/chapter-core/login-hero.png` | The square mascot panel on the login page (`/login?chapterSlug=…`) |
| `loginBanner` | `/defaults/chapter-core/login-banner.png` | The wide hero background / OG image on the login page |
| `emailLogo` | `/defaults/chapter-core/email-logo.png` | The brand logo at the top-right of every outgoing email |
| `chapterHero` | `/defaults/chapter-core/chapter-hero.jpeg` | `Chapter.heroImageUrl` — the hero image on the chapter landing page (`/c/[slug]`) |

### Image provenance

These images were captured from the Montreal chapter's config on
2026-08-07. They are the canonical AI Salon brand assets previously hosted
on Vercel Blob (`uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/`):

- `favicon.webp` ← `1782393850874-uwkddr.webp`
- `login-hero.png` ← `1785654449284-sqq083.png`
- `login-banner.png` ← `1785668808200-0fdrda.png`
- `email-logo.png` ← `1785868301722-nl1qnl.png`
- `chapter-hero.jpeg` ← `1784630528181-xsnpz1.jpeg` (Montreal's hero)

---

## How to update the default new chapter image

There are two kinds of updates:

### 1. Swap an existing image file (same key, new artwork)

1. Replace the file in `/public/defaults/chapter-core/` (e.g. overwrite
   `login-hero.png` with the new artwork — keep the same filename).
2. Commit + push. The seed-chapter API references the file PATH, so no
   `chaptercore.md` edit is needed.
3. Existing chapters are NOT affected — they keep whatever
   `ChapterSetting` rows they already have. Only NEW chapters seeded
   after the change get the new artwork.

### 2. Point a key at a different path / URL

1. Edit the `<!-- CHAPTERCORE_JSON -->` block below — change the `path`
   or `url` field for the relevant key.
2. Commit + push.
3. The seed-chapter API reads this file at runtime and uses the new value.

### 3. Add a new brand image key

1. Drop the new file in `/public/defaults/chapter-core/`.
2. Add a new entry to the `brandImages` object in the JSON block below.
3. Add a new row to the "5 default brand images" table above.
4. The seed-chapter API will pick it up automatically (it iterates all
   keys in `brandImages`).

---

## Machine-readable config block

The seed-chapter API (`src/app/api/admin/email/seed-chapter/route.ts`)
parses the JSON block below at runtime. **Keep it valid JSON** — the
parser extracts everything between `<!-- CHAPTERCORE_JSON_START -->` and
`<!-- CHAPTERCORE_JSON_END -->`.

<!-- CHAPTERCORE_JSON_START
{
  "version": 1,
  "capturedFromChapter": "montreal",
  "capturedAt": "2026-08-07",
  "description": "Default new chapter blueprint. When a new chapter is seeded via POST /api/admin/email/seed-chapter, these brand images + social links + timezone are applied to the target chapter (idempotent — never overwrites existing non-default values).",
  "brandImages": {
    "favicon": {
      "path": "/defaults/chapter-core/favicon.webp",
      "chapterSettingKey": "favicon"
    },
    "loginHero": {
      "path": "/defaults/chapter-core/login-hero.png",
      "chapterSettingKey": "loginHero"
    },
    "loginBanner": {
      "path": "/defaults/chapter-core/login-banner.png",
      "chapterSettingKey": "loginBanner"
    },
    "emailLogo": {
      "path": "/defaults/chapter-core/email-logo.png",
      "chapterSettingKey": "emailLogo"
    },
    "chapterHero": {
      "path": "/defaults/chapter-core/chapter-hero.jpeg",
      "chapterField": "heroImageUrl"
    }
  },
  "defaults": {
    "timezone": "America/Toronto",
    "whatsappGroupUrl": null,
    "linkedinUrl": null
  },
  "emailTemplates": {
    "note": "The 5 stage templates (Awareness, Reminder, Final Prep, Day-Of, Recap) are global — chapterId=null. They are NOT cloned per chapter. See src/lib/email-orchestrator/stages.ts + templates.ts.",
    "stages": [1, 2, 3, 4, 5]
  }
}
CHAPTERCORE_JSON_END -->

---

## Resolution rule at runtime

When a chapter is rendered (e.g. `/c/montreal`, `/login?chapterSlug=montreal`),
the brand images resolve in this order:

1. **`ChapterSetting[chapterId, key]`** — chapter-specific override
   (this is what the seed-chapter API creates from this blueprint)
2. **`SiteSetting[key]`** — global value set by Super Admin via `/admin/images`
3. **`DEFAULTS[key]`** — hard-coded fallback in `src/lib/site-settings.ts`

See `getEffectiveBrandImages()` in `src/lib/chapter-brand-images.ts`.

The `chapterHero` (`Chapter.heroImageUrl`) is a column on the `Chapter`
row itself — it does NOT go through the `ChapterSetting` resolution chain.

---

## Files involved

| File | Role |
|---|---|
| `chaptercore.md` (this file) | Blueprint doc + machine-readable JSON config |
| `/public/defaults/chapter-core/*` | The 5 default image files |
| `src/app/api/admin/email/seed-chapter/route.ts` | Reads this file, applies defaults when seeding a new chapter |
| `src/lib/chapter-core.ts` | Parser for the JSON block in this file (extracts config, validates shape) |
| `scripts/download-chapter-core-images.sh` | Re-download the brand images from Vercel Blob (run if images need refreshing) |
| `scripts/capture-montreal-config.ts` | One-off script used to capture Montreal's original config |

---

## Changelog

- **2026-08-07 (TSK-0077)** — Created. Captured Montreal's brand config as
  the default new chapter blueprint. Added 5 image files to
  `/public/defaults/chapter-core/`. Updated `seed-chapter` API to apply
  these defaults automatically.
