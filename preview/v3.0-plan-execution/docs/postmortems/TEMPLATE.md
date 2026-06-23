# Postmortem: {Incident Title}

> Copy this file to `docs/postmortems/YYYY-MM-DD-incident.md` at the repo root.
> File within 48 hours of any P0 or P1 incident (per plan §4.3).
> This is a BLAMELESS postmortem — focus on systems and processes, not individuals.

## Summary

{One paragraph — what happened, when, who was affected, how long it lasted, what was the impact.}

- **Date of incident:** YYYY-MM-DD
- **Time detected:** HH:MM UTC
- **Time resolved:** HH:MM UTC
- **Duration:** X hours Y minutes
- **Severity:** P0 (production down) | P1 (broken feature) | P2 (cosmetic)
- **Detected by:** {monitoring alert / user report / smoke test / team member}
- **Responders:** {names/roles of who responded}
- **Incident commander:** {who led the response}

## Timeline

All times in UTC. Use 24-hour format.

| Time | Event |
|------|-------|
| HH:MM | {First signal — alert, user report, etc.} |
| HH:MM | {Acknowledged by responder} |
| HH:MM | {Investigation began — what was checked} |
| HH:MM | {Root cause identified} |
| HH:MM | {Mitigation applied — rollback, hotfix, etc.} |
| HH:MM | {Service restored — verified by smoke test} |
| HH:MM | {Postmortem started} |

## Impact

- **Users affected:** {number or percentage of user base}
- **Requests failed:** {approximate count, from Vercel logs}
- **Data loss:** {yes/no, extent if yes}
- **Reputation impact:** {any external mentions, social media, support tickets}
- **Business impact:** {revenue, signups, or other metric affected}

## Root Cause

{2-4 paragraphs explaining the technical root cause. Cite specific code, configs, or external factors. Distinguish between the proximate cause (what triggered the incident) and the underlying cause (what allowed the trigger to cause an incident).}

## Contributing Factors

- {Factor 1 — e.g., "no test for the failing code path"}
- {Factor 2 — e.g., "alert threshold was too high to catch the issue early"}
- {Factor 3 — e.g., "the deploy was a hotfix that skipped the pre-deploy checklist"}

## What went well

- {Thing 1 — e.g., "rollback completed in under 30 seconds"}
- {Thing 2 — e.g., "the smoke test caught the issue before users reported it"}
- {Thing 3}

## What went poorly

- {Thing 1 — e.g., "the alert fired 10 minutes after users were affected"}
- {Thing 2 — e.g., "the responder was paged at 3am and was the only one available"}
- {Thing 3}

## Action Items

Each action item has an owner and a due date. Owners are individuals (or roles if a single individual can't be named), due dates are realistic.

| # | Action | Owner | Due | Status |
|---|--------|-------|-----|--------|
| 1 | {e.g., "Add regression test for the failing code path"} | {Backend Dev} | YYYY-MM-DD | Not started |
| 2 | {e.g., "Lower alert threshold for 5xx errors"} | {DevOps} | YYYY-MM-DD | Not started |
| 3 | {e.g., "Update pre-deploy checklist to include X check"} | {QA} | YYYY-MM-DD | Not started |

## Lessons Learned

{1-2 paragraphs — what should the team take away from this incident? What patterns or anti-patterns did it reveal? How can we design our systems to make this class of incident impossible or less likely?}

## References

- {Vercel deployment URL that caused the issue}
- {PR that introduced the bug}
- {Related ADRs, runbooks, or external articles}
- {Slack thread / worklog entries from the incident}
