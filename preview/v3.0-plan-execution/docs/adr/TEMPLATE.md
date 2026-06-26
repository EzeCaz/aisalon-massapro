# ADR Template

> Copy this file to `docs/adr/NNNN-title-with-kebab-case.md` at the repo root.
> Number ADRs sequentially (0001, 0002, ...). Use kebab-case in the filename.

## Title
{Short noun phrase describing the decision — e.g., "Use Neon Postgres for production database"}

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD
- **Decision Owner:** {Role name from the V3.0 plan, e.g., "Technical Architect"}
- **Consulted:** {Comma-separated list of roles consulted}
- **Related ADRs:** {List of ADR numbers this depends on or affects}

## Context

{What is the issue we're facing? What are the forces at play — technical, political, social, project-specific? State the problem clearly and neutrally. This section should be 2-4 paragraphs. Include any relevant measurements (Lighthouse scores, query plans, bundle sizes) — evidence-based decisions per the Architect's methodology.}

## Decision

{What is the change we're making? State it in 1-3 sentences. Be concrete and unambiguous. If the decision is to adopt a tool, name the tool and version. If the decision is to change a pattern, name the old pattern and the new pattern.}

## Consequences

### Positive
- {What becomes easier? Be specific.}

### Negative
- {What becomes harder? What new risks are introduced? Be honest.}

### Neutral
- {What changes about the way we work that is neither good nor bad — just different?}

## Alternatives Considered

### Alternative A: {Short name}
- **Description:** {1-2 sentences}
- **Why not:** {Why was this rejected? Be specific — cite a measurement if possible.}

### Alternative B: {Short name}
- **Description:** {1-2 sentences}
- **Why not:** {Why was this rejected?}

## References

- {Links to relevant docs, PRs, articles, measurements.}
