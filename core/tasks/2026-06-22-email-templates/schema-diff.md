# Schema Diff — Email Templates task (includes schema drift repair)

| Field | Value |
|---|---|
| Task | `2026-06-22-email-templates` |
| Agent | Atlas |
| Date | 2026-06-22 |
| Migration type | **No-op DB migration** (schema repair only — no DB changes needed) |
| Pre-migration backup | Pending — Atlas will create one before any `prisma db push` |

---

## ⚠️ Critical Finding: Schema Drift

The `prisma/schema.prisma` file in the repo is **out of sync with the production Neon DB**. The following models exist in the DB but are MISSING from `schema.prisma`:

1. `EmailTemplate`
2. `EmailCampaign`
3. `EmailRecipient`
4. `EmailEvent`
5. `EventRsvp`
6. `EventCoHost`

Additionally, the `Event` table has a `mainImageId` column in the DB that is not declared in the schema, and the `User` model is missing back-relation fields for all the email/rsvp/cohost tables.

This drift was likely caused by a workspace reset that reverted `schema.prisma` without reverting the production DB. The application code in `src/app/admin/email/` and `src/app/admin/page.tsx` references these models (e.g. `db.emailCampaign.findMany()`, `event.mainImage`), so the code only works because Prisma's `db push` previously synced the DB from a schema that has since been lost.

---

## Repair Plan

Atlas will reconstruct the missing models by reverse-engineering from the production DB (column names, types, nullability, FKs, indexes, unique constraints all matched verbatim).

### Models to add to `schema.prisma`

```prisma
model EmailTemplate {
  id           String   @id @default(cuid())
  name         String
  slug         String?
  category     String   @default("general")
  subject      String
  bodyHtml     String
  bodyText     String?
  signatureHtml String?
  thumbnailUrl String?
  createdBy    String
  creator      User     @relation("EmailTemplateCreator", fields: [createdBy], references: [id], onDelete: Cascade)
  campaigns    EmailCampaign[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([createdBy])
  @@index([category])
}

model EmailCampaign {
  id                   String   @id @default(cuid())
  name                 String
  templateId           String?
  template             EmailTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  subjectSnapshot      String
  bodyHtmlSnapshot     String
  bodyTextSnapshot     String?
  signatureHtmlSnapshot String?
  listSource           String
  listConfigJson       String
  recipientCount       Int      @default(0)
  status               String   @default("DRAFT")
  scheduledAt          DateTime?
  startedAt            DateTime?
  completedAt          DateTime?
  fromName             String?
  fromEmail            String?
  replyTo              String?
  createdBy            String
  creator              User     @relation("EmailCampaignCreator", fields: [createdBy], references: [id], onDelete: Cascade)
  recipients           EmailRecipient[]
  events               EmailEvent[]
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@index([status])
  @@index([scheduledAt])
  @@index([createdBy])
  @@index([templateId])
}

model EmailRecipient {
  id             String   @id @default(cuid())
  campaignId     String
  campaign       EmailCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  userId         String?
  user           User?    @relation("EmailRecipientUser", fields: [userId], references: [id], onDelete: SetNull)
  email          String
  name           String?
  trackToken     String   @unique
  messageId      String?
  status         String   @default("QUEUED")
  errorReason    String?
  sentAt         DateTime?
  firstOpenedAt  DateTime?
  lastOpenedAt   DateTime?
  openCount      Int      @default(0)
  firstClickedAt DateTime?
  lastClickedAt  DateTime?
  clickCount     Int      @default(0)
  repliedAt      DateTime?
  replySnippet   String?
  events         EmailEvent[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([campaignId, email])
  @@index([campaignId])
  @@index([userId])
  @@index([email])
  @@index([trackToken])
  @@index([messageId])
  @@index([status])
}

model EmailEvent {
  id          String   @id @default(cuid())
  campaignId  String
  campaign    EmailCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  recipientId String?
  recipient   EmailRecipient? @relation(fields: [recipientId], references: [id], onDelete: SetNull)
  email       String
  type        String
  details     String?
  userAgent   String?
  ipAddress   String?
  createdAt   DateTime @default(now())

  @@index([campaignId, type, createdAt])
  @@index([recipientId, type])
  @@index([email])
}

model EventRsvp {
  id        String   @id @default(cuid())
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId    String?
  user      User?    @relation("EventRsvpUser", fields: [userId], references: [id], onDelete: SetNull)
  email     String
  name      String?
  status    String   @default("GOING")
  source    String   @default("MANUAL")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([eventId, email])
  @@index([eventId])
  @@index([userId])
  @@index([email])
}

model EventCoHost {
  id        String   @id @default(cuid())
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation("EventCoHostUser", fields: [userId], references: [id], onDelete: Cascade)
  addedBy   String?
  adder     User?    @relation("EventCoHostAdder", fields: [addedBy], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())

  @@unique([eventId, userId])
  @@index([eventId])
  @@index([userId])
}
```

### Fields to add to existing models

**User** — add back-relations:
```prisma
  emailCampaigns   EmailCampaign[] @relation("EmailCampaignCreator")
  emailTemplates   EmailTemplate[] @relation("EmailTemplateCreator")
  emailRecipients  EmailRecipient[] @relation("EmailRecipientUser")
  eventRsvps       EventRsvp[]     @relation("EventRsvpUser")
  eventCoHosts     EventCoHost[]   @relation("EventCoHostUser")
  coHostAddedBy    EventCoHost[]   @relation("EventCoHostAdder")
```

**Event** — add mainImageId + mainImage relation + back-relations:
```prisma
  mainImageId  String?
  mainImage    EventImage? @relation("EventMainImage", fields: [mainImageId], references: [id], onDelete: SetNull)
  rsvps        EventRsvp[]
  coHosts      EventCoHost[]
```

**EventImage** — add back-relation for mainImage:
```prisma
  eventsAsMain Event[] @relation("EventMainImage")
```

---

## Migration Command

```bash
npx prisma db push
```

**Type**: Additive only. No columns or tables are being created in the DB (they already exist). `prisma db push` will:
- Detect that the schema now matches the DB
- Potentially add missing FK constraints (e.g. Event.mainImageId → EventImage.id) — this is safe
- NOT drop any data

**Rollback**: Not needed — this is a schema-repair-only operation. If anything goes wrong, restore from the pre-migration backup tarball.

---

## Verification

After `prisma db push`:
1. `npx prisma db pull` — diff against expected schema (should show no changes)
2. `npx prisma validate` — schema valid
3. `npx prisma generate` — client regenerated with all models
4. `npx tsc --noEmit` — code compiles against the new client

---

## Signoff

Atlas will create the pre-migration backup tarball, run `prisma db push`, verify, and sign off.
