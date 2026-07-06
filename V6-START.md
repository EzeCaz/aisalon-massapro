# V6 Series — Start

**Started:** 2026-07-06 12:10 UTC
**Previous series final:** v5.15 (commit `40d8a0c`, tag pushed to GitHub)
**V6 baseline commit:** `cfd9c38` (this commit)
**Live URL:** https://aisalon.massapro.com
**Vercel project:** aisalon-massapro (auto-deploys from `main`)

## What V6 inherits from V5-final

- **Auth**: Google OAuth + dev email fallback. Single admin: `eze@massapro.com`.
- **Events**: `/events` listing + `/events/[slug]` admin event page + `/e/[slug]` public event page. Tabs: Overview, Speakers & Agenda, Photos, Slideshow, Event prep, Testimonials, Presentations, Manage event (admin).
- **Agenda**: BREAK / FAST_PITCH / NETWORKING items without a speaker render as compact single-column strips (~50% height, no image). PANEL items merge moderator + panelist photos into a single slideshow. Each agenda item can have an admin-set mainImage fallback (skipped for non-content items).
- **Photos**: drag-drop upload + auto-normalize via sharp. Per-photo tagging to speaker(s) AND session(s) (agenda items). Bulk link to either. Reorder via drag-and-drop.
- **Email orchestrator**: 8-step flows with audience → trigger → email pattern. A/B subject testing with 50/50 random split. Per-step entry-event triggers (RSVP_GOING, DOOR_CHECKED_IN, MARKED_ATTENDED, MARKED_NO_SHOW, MANUAL). Reusable EmailAudience entity (with `isTest` flag for test audiences).
- **Check-in**: door-staff kiosk at `/admin/check-in`. Two-step confirm flow. Opens 2h before event start. Hidden for unregistered users.
- **Slideshow**: 1.5s auto-advance, keyboard nav (←/→/space), drag-drop reorder, AIS GRADIENT progress bar.
- **Admin panel**: members table with search + tag assignment, events list, stats dashboard, door check-in, mockups gallery.
- **Brand**: AIS BLACK / AIS RED (#FF005A) / AIS CYAN (#00E6FF) palette, AIS GRADIENT, Plus Jakarta Sans, low-poly Meerkat motif. All times in Asia/Jerusalem.

## V6 scope

TBD — shaped by user requests going forward.

## Known issues inherited from V5-final

- 110 pre-existing TypeScript errors in unrelated files (mockups/agenda-profile, registrations, members). None block the build (`npm run build` passes). Should be cleaned up incrementally during V6.
- Email orchestrator is wired but currently PAUSED at the cron level (daily `/api/cron/email/send-scheduled` runs, but per-recipient sending can be toggled off via `EmailFlow.isActive`).
- DB schema includes the new `EventImage ↔ EventAgendaItem` m:n relation ("AgendaItemTaggedImages"); the join table `_AgendaItemTaggedImages` is live in Neon.

## Backups

- V5-final tarball: `download/backups/aisalon-massapro-v5-final-20260706-1208UTC-40d8a0c.tar.gz` (also at `/home/sync/`)
- V5-final git tag: `v5.15` on GitHub
- V5-final release log entry: `core/releases/release-log.md`
- V5-final backup manifest: `download/backups/MANIFEST.md` (also `/home/sync/BACKUPS-MANIFEST.md`)
