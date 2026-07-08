# Release Log — Append-Only

> *Every Vercel production deploy, ever. Owned by Beacon. Never edit old entries — append corrections as new entries with a "CORRECTION" prefix.*

---

## Format

Each entry:

```markdown
## <YYYY-MM-DD HH:MM UTC> — <commit SHA>

| Field | Value |
|---|---|
| Task | <slug> or "ad-hoc" |
| Environment | production / preview |
| Vercel project | aisalon-massapro |
| Commit | <SHA> |
| New URL | https://aisalon.massapro.com (or preview URL) |
| Previous URL (rollback target) | <previous production deployment URL> |
| Build status | PASSED / FAILED |
| Sentinel prod verify | PASSED / FAILED / pending |
| Rolled back? | no / yes (reason) |
| Summary | <one line> |
```

---

## Entries

### 2026-06-22 — Admin tab bar persistence

| Field | Value |
|---|---|
| Task | tabs-persistent |
| Environment | production |
| Vercel project | aisalon-massapro |
| Commit | `08f3e4e` |
| New URL | https://aisalon.massapro.com |
| Previous URL (rollback target) | (not captured —- prior deploy) |
| Build status | PASSED |
| Sentinel prod verify | PASSED (all 6 admin routes return 200) |
| Rolled back? | no |
| Summary | Added shared AdminTabs component mounted on every /admin/* page; member count badge live (168). |

### 2026-07-06 12:08 UTC — V5 SERIES FINAL (v5.15)

| Field | Value |
|---|---|
| Task | v5-final-backup |
| Environment | production |
| Vercel project | aisalon-massapro |
| Commit | `40d8a0c` |
| Git tag | `v5.15` (pushed to GitHub) |
| New URL | https://aisalon.massapro.com |
| Previous URL (rollback target) | (v5.14 deploy at commit `eadfe2d`) |
| Build status | PASSED |
| Sentinel prod verify | PASSED (homepage 307, /events 200, /login 200, /privacy 200, /events/ai-salon-human 307 auth-redirect, /admin/check-in 307 auth-redirect) |
| Rolled back? | no |
| Summary | V5 series final. Closes V5; V6 begins at the next commit. Backup tarball at `download/backups/aisalon-massapro-v5-final-20260706-1208UTC-40d8a0c.tar.gz` (8.7 MB, sha256 `b163cfdd…`). Off-site copy at `/home/sync/`. |

#### V5 series cumulative changes since v5.14 (68 commits)

- Email orchestrator full restructure (audience, triggers, A/B subjects,
  per-step entry-event triggers, reusable audience entity, 50/50 split,
  per-content/subject reporting, max 8 steps per flow)
- WhatsApp header pill + unlinked filter
- Check-in two-step confirm flow + 2h-before-event open window
- Register widget in event header + referral ID in edit member dialog
- Wider Edit agenda item dialog (max-w-5xl, no horizontal scroll)
- Photo ↔ session tagging (new m:n EventImage ↔ EventAgendaItem
  relation "AgendaItemTaggedImages", live in Neon DB)
- Each agenda item main image fallback (admin-set mainImage when no
  speaker/panelist photos exist)
- Panelist slideshow merging moderator + all panelists' photos (deduped)
- Compact door-opening + break boxes (~50% height, no image) — extended
  isBreak compact treatment to NETWORKING type; skipped mainImage fallback
  for BREAK/FAST_PITCH/NETWORKING items without a speaker

#### V6 starts here

The next commit after `40d8a0c` is the first V6 commit. V6 has no
predefined scope yet — it will be shaped by user requests going forward.

### 2026-07-08 14:45 UTC — V6 SNAPSHOT (mid-series, no tag)

| Field | Value |
|---|---|
| Task | v6-snapshot-backup |
| Environment | production |
| Vercel project | aisalon-massapro |
| Commit | `a98ae0d` |
| Git tag | (none — V6 series still in progress; latest tag remains `v5.15`) |
| New URL | https://aisalon.massapro.com |
| Previous URL (rollback target) | (v5-final deploy at commit `40d8a0c`) |
| Build status | PASSED (last build green; `a98ae0d` was a hotfix for a Vercel build break) |
| Sentinel prod verify | not run for snapshot |
| Rolled back? | no |
| Summary | Mid-V6 snapshot backup. 38 commits into V6. Backup tarball at `download/backups/aisalon-massapro-v6-snapshot-20260708-1445UTC-a98ae0d.tar.gz` (10 MB, sha256 `637ff516…`). Off-site copy at `/home/sync/`. In-repo manifest at `download/backups/MANIFEST.md`. Backup script at `scripts/make-v6-snapshot-backup.sh`. |

#### V6 cumulative changes since V5-final (38 commits)

- **Quiz engine (V6 flagship)**: admin Control Room + member mobile UI; Show-next-question, reveal leaderboard; Restart, Clear responses, Duplicate; unified Start button + Radix Select empty-value crash fix; full results view (leaderboard + per-question answer matrix) when host clicks Finish.
- **Community**: member directory + Contact button → 1-on-1 DM dialog.
- **Chat**: event group chat rooms + real-time DMs + DB backup scripts; WebSocket sidecar with latency elimination (kill poll storm, parallelize queries); stale-JWT self-heal for "User not found" on Contact button.
- **Email orchestrator**: no-code variant + WYSIWYG editor + brand logo + alt-subject re-send; behaviour-based audience targeting (open/click on a specific email); `{{myCodeUrl}}` / `{{event.myCodeUrl}}` token added to all email templates.
- **Check-in**: dedicated `/e/[slug]/my-code` page for mobile door entry.
- **Navigation**: hash-based deep links for all event + admin tabs (e.g. `#tab=agenda`).
- **Backup infra**: Google Drive sync via service account + setup helper.
- **CI/CD**: GitHub Actions cron to replace the removed 15-min Vercel cron (Hobby plan blocks >1 cron/day).
- **Build fixes**: removed prisma migrate deploy from build (needs `_prisma_migrations` table); fixed mismatched quote in `applyMergeTags` that broke Vercel build.
- **Docs**: published v1.2 register-to-checkin PDF (7-stage + community + stale-JWT self-heal); exposed email-system PDF + source HTML as downloadable public assets.

