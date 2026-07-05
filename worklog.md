---
Task ID: email-flow-restructure
Agent: main
Task: Restructure the email flow + orchestrator per user's 5 requirements (without deploying):
  1. Add a "test" audience with 3 emails (eze@massapro.com, ezeszna@gmail.com, eze@hi4.ai)
  2. Delete all demo data from the orchestrator; show only real + test data
  3. Add email template + A/B subject testing to the flow, with per-content/subject reporting
  4. Restructure flow: A) audience → B) trigger → C) email, repeatable up to 8 steps
  5. Fill campaign report with breakdown by template + subject variant, all metrics

Work Log:
- Reviewed full email orchestration architecture: flow-builder-canvas, orchestrator-panel,
  Prisma schema (EmailFlow, EmailFlowStep, EmailQueue, EmailStageTemplate, EmailCampaign),
  flow-worker, flow-trigger, seed.ts, API routes.
- Asked 5 clarifying questions; user chose: per-step entry-event triggers, reusable audience
  entity, 50/50 random A/B split, flow runs report, wipe + rebuild migration.
- Phase 1 — Prisma schema changes:
  * Added EmailAudience model (id, name, slug, emailsJson, isTest, timestamps)
  * Restructured EmailFlowStep: added audienceId, triggerKind, triggerEventId,
    subjectVariantA, subjectVariantB; removed subjectOverride, branchRulesJson, filterJson
  * Removed flow-level triggerKind, triggerEventId, branchEvaluationDelayHours from EmailFlow
  * Removed EmailFlowRun model entirely (steps are independent now)
  * Added subjectVariant + audienceId to EmailQueue for A/B reporting
  * Removed flowRunId from EmailQueue; added flowStep relation to EmailQueue
  * Cleaned up back-relations on User, EventRsvp, Event
  * Bumped max steps from 5 to 8
- Phase 2 — Created migration SQL at prisma/migrations/20260705000000_email_flow_restructure/migration.sql
- Phase 3 — Rewrote seed.ts:
  * Removed demo users/event/RSVPs seeding (was 6 mock users + 1 demo event + 6 RSVPs)
  * Now only seeds 5 stage templates + the built-in Test audience (3 emails)
  * clearSeed() now wipes flow data but preserves real users/events/RSVPs + Test audience
- Phase 4 — Updated email-flows API routes (POST/PATCH/GET/[id]) for new step shape
- Phase 5 — Created EmailAudience CRUD API (GET/POST /api/email-audiences, PATCH/DELETE /[id])
- Phase 6 — Rewrote flow-builder-canvas.tsx:
  * New step card showing A (audience), B (trigger), C (email + A/B subjects), D (delay)
  * Step editor sheet with 4 sections matching the A/B/C/D structure
  * "Auto-create variant B" button for A/B subject testing
  * Up to 8 steps (was 5)
- Phase 7 — Rewrote flow-trigger.ts:
  * Per-step entry-event triggers with audience matching
  * 50/50 random A/B subject assignment at queue creation time
  * New manuallyTriggerStepForAudience() for "send to test audience" action
  * Wired RSVP_GOING trigger into /api/events/[slug]/rsvp POST route
- Phase 8 — Rewrote flow-worker.ts:
  * Simplified to send due PENDING EmailQueue rows (no linear run state machine)
  * No branching, no EmailFlowRun — each queue row is an independent send
  * Picks subject based on row.subjectVariant (A or B)
- Phase 9 — Created flow report:
  * New /api/email-flows/[id]/report endpoint with per-step → variant A/B breakdown
  * New FlowReportDialog component with summary cards + per-step table + recent sends
  * Shows sent, opened, clicked, failed, pending, open rate, click rate per variant
- Phase 10 — Updated orchestrator-panel.tsx:
  * "Seed demo data" → "Seed templates + Test audience"
  * "Clear demo data" → "Clear flow data"
  * Added Variant column to queue table (shows A/B pill)
  * Added subject variant + audience to detail dialog
  * Updated worker toast to show combined legacy + flow stats
  * Updated empty-state message to point to Flow Builder
- Phase 11 — Updated flows/page.tsx:
  * Auto-seeds test audience + templates on page load (idempotent)
  * Loads audiences from DB + passes to client
  * Fixed AppHeader prop + date serialization for events
- Phase 12 — TypeScript verification:
  * npx prisma generate succeeds
  * npx tsc --noEmit: 0 new errors from my changes
  * 3 pre-existing errors remain (simulate/route.ts, meta-capi.ts, worker.ts) — confirmed
    via git stash that they existed before
  * My changes fixed 4 pre-existing errors in old flow-worker.ts

Stage Summary:
- All 5 requirements implemented without deploying (code + migration only)
- Test audience (eze@massapro.com, ezeszna@gmail.com, eze@hi4.ai) auto-seeded
- Demo data removed; clearSeed preserves real data + Test audience
- Flow restructured: A) audience → B) trigger → C) email (template + A/B subjects) → D) delay,
  up to 8 independent steps
- 50/50 random A/B subject split, stored on EmailQueue.subjectVariant
- Flow report dialog with per-step → template → subject variant A/B breakdown (sent, opened,
  clicked, failed, pending, open rate, click rate)
- Migration SQL ready at prisma/migrations/20260705000000_email_flow_restructure/migration.sql
- TO DEPLOY: run `npx prisma migrate deploy` (or `prisma db push` for dev), then the app
  auto-seeds the Test audience on first /admin/email/flows page load

---
Task ID: audiences-templates-tab
Agent: main
Task: Add 4 features to the email automation page:
  1. Audiences tab with filter builder (members + registrations + users, AND/OR)
  2. Step editor integration: select audiences + create new one inline
  3. Templates tab: edit Stage 1-5 + duplicate/copy; selectable in flow step editor
  4. Per-template metrics: sent/opened/clicked/failed across all campaigns

Work Log:
- Phase A — Prisma schema changes:
  * EmailAudience: added kind ("STATIC"|"DYNAMIC"), filtersJson (filter spec)
  * EmailStageTemplate: stage now nullable (Int? unique), name now unique, added isDefault
  * Backfilled isDefault=true on the 5 seeded stage templates
- Phase B — Audience filter evaluator + APIs:
  * New src/lib/email-orchestrator/audience-filter.ts: types, field catalog (USER_FIELDS, RSVP_FIELDS), parseSpec, resolveAudienceEmails, resolveAudienceEmailsById
  * Updated /api/email-audiences (GET/POST) + /[id] (PATCH/DELETE) to support kind=filters
  * New /api/email-audiences/preview (POST) — evaluate filter spec, no persistence
  * New /api/email-audiences/[id]/emails (GET) — resolve audience to current email list
  * Updated flow-trigger.ts to use resolveAudienceEmailsById for both STATIC and DYNAMIC audiences (with per-trigger cache to avoid re-resolving per RSVP in batch)
- Phase C — Audiences tab UI:
  * New src/app/admin/email/flows/audiences-client.tsx (870 lines)
  * List view: shows name, kind pill (STATIC/DYNAMIC), email count, flow step count
  * Editor: name, description, kind toggle, STATIC editor (textarea), DYNAMIC filter builder
  * Filter builder: source dropdown (users/rsvps/both), combinator (AND/OR), groups, rules
  * Each rule: field dropdown (15+ fields), operator dropdown (12 ops), value (text/enum/date/boolean)
  * Live preview button → opens dialog showing resolved email list + count
  * Duplicate + Delete actions
- Phase D — Flow step editor integration:
  * Updated StepEditorSheet in flow-builder-canvas.tsx: audience dropdown shows kind + count
  * "New" button dispatches window event → FlowsPageClient switches to Audiences tab
  * Updated flows/page.tsx to load kind field on audiences + isDefault/isActive on templates
  * Updated FlowAudience + FlowTemplate types to include kind + isDefault
- Phase E — Templates tab (edit + duplicate):
  * New /api/email-templates (GET list + POST create)
  * New /api/email-templates/[id] (PATCH update + DELETE — defaults can't be deleted, only deactivated)
  * New /api/email-templates/[id]/duplicate (POST — creates copy with stage=null, name="X (copy)")
  * New src/app/admin/email/flows/templates-client.tsx (750 lines)
  * Templates table: stage pill (Stage N / Custom), name, subject, flow step count, status, updated, actions
  * Edit/Create dialog: name, subject, stopIfNotOpenedHours, HTML body with live preview (iframe srcDoc)
  * Duplicate button on each template
  * Toggle active/inactive without deleting
- Phase F — Template metrics:
  * New /api/email-templates/[id]/metrics (GET): overall metrics + byVariant A/B + byFlow + recentSends (25)
  * Metrics dialog in templates-client.tsx: 5 summary cards, A/B variant table, per-flow table, recent sends table
- Phase G — Build + DB:
  * prisma db push applied (EmailAudience.kind/filtersJson added; EmailStageTemplate.stage nullable; isDefault added)
  * Backfilled isDefault=true on 5 seeded templates
  * Restarted dev server
  * TypeScript: 0 new errors from changes (3 pre-existing errors in unrelated files: simulate/route.ts, meta-capi.ts, worker.ts)

Stage Summary:
- 4 new APIs: /api/email-templates (list/create), /api/email-templates/[id] (update/delete), /api/email-templates/[id]/duplicate, /api/email-templates/[id]/metrics, /api/email-audiences/preview, /api/email-audiences/[id]/emails
- 3 new UI files: audiences-client.tsx, templates-client.tsx, flows-page-client.tsx (top-level tab container)
- All 4 requirements implemented without manual DB migration (used prisma db push)
- The /admin/email/flows page now has 3 tabs: Flows, Audiences, Templates
- Audiences support STATIC (email list) + DYNAMIC (filter spec evaluated live)
- Templates: edit any of the 5 stage defaults OR create custom templates (stage=null); duplicate any template
- Per-template metrics: overall + by A/B variant + by flow + recent 25 sends
- TO TEST: open /admin/email/flows → Audiences tab → click "New audience" → switch kind to DYNAMIC → build filter → Preview → Save. Then Templates tab → edit/duplicate/metrics.
