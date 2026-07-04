# Schema History — Append-Only Log

> *Every schema change against production Neon, ever. Owned by Atlas. Never edit old entries — append corrections as new entries with a "CORRECTION" prefix.*

---

## Format

Each entry:

```markdown
## <YYYY-MM-DD HH:MM UTC> — <task slug>

| Field | Value |
|---|---|
| Task | <slug> |
| Migration type | additive / breaking |
| Command | `npx prisma db push` or `npx prisma migrate deploy` |
| Pre-migration backup | <tarball filename> (SHA-256: <hash>) |
| Verification | PASSED / FAILED |
| Rolled back? | no / yes (reason) |
| Schema diff | <one-line summary> |

### Before
<relevant snippet of prisma/schema.prisma>

### After
<relevant snippet of prisma/schema.prisma>

### Rollback SQL
<SQL to undo the migration>
```

---

## Entries

### 2026-06-22 — Pre-core baseline

| Field | Value |
|---|---|
| Task | (historical, pre-core-system) |
| Migration type | additive |
| Command | `npx prisma db push` (multiple times across prior sessions) |
| Pre-migration backup | `aisalon-v2.0-20260622-092118.tar.gz` (SHA-256: `befa81ae...8d0cbc`) |
| Verification | PASSED |
| Rolled back? | no |
| Schema diff | Baseline — User, Event, EventSession, EventPhoto, EventRegistration, MemberTag, EmailCampaign, EmailRecipient, EmailEvent, EventRsvp, EmailTemplate, Speaker, SpeakerImage, SpeakerPresentation, SpeakerMessage, UserSecondaryEmail, EventCoHost models. Event.mainImageId relation added. |

**Note**: This is a synthetic entry recording the state of the schema as of the moment the `core/` system was created. Going forward, every migration gets its own entry written by Atlas at Gate 9a.
