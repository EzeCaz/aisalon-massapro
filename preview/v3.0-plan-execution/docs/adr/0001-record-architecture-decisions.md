# ADR-0001: Adopt Architecture Decision Records

- **Status:** Accepted
- **Date:** 2026-06-23
- **Decision Owner:** Technical Architect
- **Consulted:** Documentation & Knowledge Manager, all engineering roles
- **Related ADRs:** None

## Context

The AI Salon Tel Aviv platform has reached V3.0 with ~50 routes, ~30 source files, and a 9-role engineering team defined in the V3.0 Team Plan. Several architectural decisions have been made implicitly (Next.js App Router over Pages Router, Prisma over raw SQL, SQLite dev / Postgres prod parity, NextAuth credentials + Google OAuth, Vercel over self-hosted) but never written down.

The V3.0 Team Plan §8 (Technical Architect role) explicitly mandates: "Author an ADR for every architectural decision that affects more than one file or that the team will not be able to easily reverse. ADRs live in `docs/adr/` in the repo."

Without ADRs, new contributors have to reverse-engineer decisions from code, and the team risks re-litigating settled questions. The Documentation & Knowledge Manager's KPI includes "ADR count per quarter — Target: at least 2 per quarter (indicates decisions are being recorded, not lost)."

## Decision

Adopt the ADR pattern as described in Michael Nygard's original article (http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions), with the format defined in `docs/adr/TEMPLATE.md`. Every architectural decision affecting more than one file or that would be difficult to reverse gets an ADR.

ADR files live at `docs/adr/` in the repo, numbered sequentially (`0001-`, `0002-`, ...), using kebab-case for the title portion. Each ADR has the sections: Title, Status, Date, Context, Decision, Consequences (positive/negative/neutral), Alternatives Considered, References.

## Consequences

### Positive
- New contributors can understand why the codebase is structured the way it is without having to ask.
- Settled decisions are not re-litigated in PR comments.
- The Architect's KPI ("architectural drift score: 0") becomes measurable — a PR that violates an ADR is either blocked or requires an ADR update, which is visible.
- The Documentation Manager's KPI ("≥2 ADRs per quarter") becomes trackable.

### Negative
- Some overhead on every non-trivial decision — writing the ADR, getting it reviewed.
- Risk of "ADR theater" — ADRs written but not maintained. Mitigated by the quarterly stale-docs audit owned by the Documentation Manager.

### Neutral
- ADRs are reviewed in PRs just like code — they are versioned with the codebase, not in a separate system.

## Alternatives Considered

### Alternative A: Keep decisions in the worklog
- **Description:** Use the existing `worklog.md` as the single source of truth for decisions.
- **Why not:** The worklog is append-only and chronological — it records what was done, not why. Decisions get buried in operational entries. ADRs are discoverable by topic and have a stable URL.

### Alternative B: Use a wiki (Notion, Confluence)
- **Description:** Maintain architectural decisions in an external wiki.
- **Why not:** The V3.0 plan's Working Methodology for the Documentation Manager states: "Docs live in the repo. Every PR includes doc updates when functionality changes." Wikis drift from code; repo-embedded docs version with the code.

## References

- AISalon-Team-Plan-V3.0 §8 (Technical Architect role)
- AISalon-Team-Plan-V3.0 §14 (Documentation & Knowledge Manager role)
- Michael Nygard's original ADR article: http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions
- ADR GitHub organization: https://adr.github.io/
