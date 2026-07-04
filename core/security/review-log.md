# Security Review Log — Append-Only

> *Every security review, ever. Owned by Aegis. Never edit old entries.*

---

## Format

Each entry:

```markdown
## <YYYY-MM-DD> — <task slug>

| Field | Value |
|---|---|
| Task | <slug> |
| Reviewer | Aegis |
| New routes | <list of new API routes + their auth requirements> |
| PII exposure | <what user data is exposed, to whom> |
| CSRF | <mutations use POST/PUT/DELETE? Yes/No> |
| OAuth changes | <none / list> |
| New env vars | <none / list + secret status> |
| Rate-limiting | <recommendations> |
| Signoff | PASSED / FAILED (reason) |
```

---

## Entries

### 2026-06-22 — Admin tab bar persistence (retroactive)

| Field | Value |
|---|---|
| Task | tabs-persistent |
| Reviewer | Aegis (retroactive) |
| New routes | none (pure UI change — added `<AdminTabs>` component to existing pages) |
| PII exposure | Member count badge shows total `User.count()` to admin only. No individual PII exposed. Safe. |
| CSRF | n/a (no new mutations) |
| OAuth changes | none |
| New env vars | none |
| Rate-limiting | none needed |
| Signoff | PASSED (retroactive — change was UI-only, no new auth surface) |

**Note**: This task shipped before the `core/` system existed. Aegis reviewed it retroactively to populate this log. Going forward, every task gets Aegis's review at Gate 4 *before* implementation.
