# Core Protocols Index

This directory contains standing protocols that apply to every task in this project. Protocols are rules that survive across sessions — they describe how the agent must behave, not what the agent must build.

## Active protocols

| Protocol | Trigger | Summary |
|---|---|---|
| [`preview-url-sharing.md`](./preview-url-sharing.md) | Any new version prepared for deployment | Every version summary MUST end with a `Preview URL` section listing all reachable URLs (production, Vercel, local dev, Space-Z preview). Never silently omit. |

## How to add a new protocol

1. Create `<protocol-name>.md` in this directory using the same front-matter table (Protocol ID, Created, Owner, Trigger, Status).
2. Add a row to the table above.
3. Reference the protocol from any task that triggers it (e.g. "per `core/protocols/preview-url-sharing.md`…").

## How to retire a protocol

1. Set `Status: RETIRED` in the protocol's front-matter.
2. Move the row in the table above to a "Retired protocols" section.
3. Leave the file in place for historical reference.

## Relationship to `core/tasks/`

`core/tasks/` holds one-off task briefs (a specific feature request, a specific bug fix). `core/protocols/` holds standing rules that apply to every task. A task brief may reference a protocol ("per `core/protocols/preview-url-sharing.md`…"), but a protocol never references a specific task.
