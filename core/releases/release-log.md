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
