/**
 * Seed for the email orchestrator.
 *
 * Creates (idempotently):
 *   - 5 EmailStageTemplate rows (one per stage) with default subjects + HTML
 *   - 1 built-in "Test" EmailAudience with the admin test emails
 *
 * The old demo seed (6 mock users + 1 demo event + 6 RSVPs) has been
 * REMOVED. The orchestrator now shows only real data + test data.
 *
 * Run via `POST /api/email-orchestrator/seed`. Safe to call multiple times —
 * existing rows are reused, not duplicated.
 *
 * clearSeed() deletes ALL orchestrator demo/test artifacts: EmailQueue rows
 * tied to flow steps, TrackingLog rows, EmailFlowStep, EmailFlow, and
 * EmailStageTemplate rows. It preserves real users, events, and RSVPs.
 */

import { db } from "@/lib/db";
import { DEFAULT_TEMPLATES } from "./templates";
import { STAGES } from "./stages";

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Test audience
// ─────────────────────────────────────────────────────────────────────────────

/** The admin's test emails — used by the built-in "Test" audience. */
export const TEST_AUDIENCE_EMAILS = [
  "eze@massapro.com",
  "ezeszna@gmail.com",
  "eze@hi4.ai",
] as const;

/** The slug of the built-in test audience (stable for lookups). */
export const TEST_AUDIENCE_SLUG = "test";

/** The stable ID of the built-in test audience (for foreign-key seeding). */
export const TEST_AUDIENCE_ID = "test-audience-built-in";

export type SeedResult = {
  templates: { created: number; existing: number };
  audience: { created: boolean; id: string; emailCount: number };
};

/**
 * Idempotent seed.
 *
 * Creates the 5 stage templates (if missing) and the built-in Test audience
 * (if missing). Does NOT create demo users, events, or RSVPs anymore — the
 * orchestrator shows only real data + the test audience.
 */
export async function runSeed(): Promise<SeedResult> {
  const result: SeedResult = {
    templates: { created: 0, existing: 0 },
    audience: { created: false, id: TEST_AUDIENCE_ID, emailCount: TEST_AUDIENCE_EMAILS.length },
  };

  // ── Templates ──────────────────────────────────────────────────────────
  for (const stageCfg of STAGES) {
    const existing = await db.emailStageTemplate.findUnique({
      where: { stage: stageCfg.stage },
    });
    if (existing) {
      result.templates.existing++;
      continue;
    }
    const def = DEFAULT_TEMPLATES[stageCfg.stage];
    await db.emailStageTemplate.create({
      data: {
        stage: stageCfg.stage,
        name: def.name,
        subject: def.subject,
        htmlBody: def.html,
        stopIfNotOpenedHours: stageCfg.stopIfNotOpenedHours,
        isActive: true,
      },
    });
    result.templates.created++;
  }

  // ── Built-in Test audience ──────────────────────────────────────────────
  const existingAudience = await db.emailAudience.findUnique({
    where: { id: TEST_AUDIENCE_ID },
  });
  if (!existingAudience) {
    await db.emailAudience.create({
      data: {
        id: TEST_AUDIENCE_ID,
        name: "Test",
        slug: TEST_AUDIENCE_SLUG,
        description:
          "Built-in test audience for flow preview. Sending is paused by default — no real email goes out until you resume.",
        emailsJson: JSON.stringify([...TEST_AUDIENCE_EMAILS]),
        isTest: true,
      },
    });
    result.audience.created = true;
  } else {
    // Keep the email list in sync with the code in case it changed.
    await db.emailAudience.update({
      where: { id: TEST_AUDIENCE_ID },
      data: { emailsJson: JSON.stringify([...TEST_AUDIENCE_EMAILS]) },
    });
  }

  return result;
}

/**
 * Tear down ALL orchestrator demo/test data.
 *
 * Deletes (in dependency order):
 *   - TrackingLog rows tied to flow queue items
 *   - EmailQueue rows tied to flow steps
 *   - EmailFlowStep rows
 *   - EmailFlow rows
 *   - EmailStageTemplate rows
 *
 * PRESERVES:
 *   - Real Users, Events, EventRsvp rows
 *   - EmailCampaign + EmailRecipient + EmailEvent (campaign system)
 *   - The built-in Test EmailAudience (so you can re-seed + test immediately)
 *
 * Identifies flow-related rows by flowStepId IS NOT NULL (EmailQueue) or by
 * being in the EmailFlow / EmailFlowStep / EmailStageTemplate tables.
 */
export async function clearSeed(): Promise<{
  deleted: {
    queue: number;
    logs: number;
    flowSteps: number;
    flows: number;
    templates: number;
  };
}> {
  // Delete in dependency order (children first).

  // 1. TrackingLog rows whose queue item is a flow queue item.
  const flowQueueIds = await db.emailQueue.findMany({
    where: { flowStepId: { not: null } },
    select: { id: true },
  });
  const flowQueueIdList = flowQueueIds.map((q) => q.id);

  let logs = 0;
  let queue = 0;
  if (flowQueueIdList.length) {
    logs = await db.trackingLog
      .deleteMany({ where: { queueId: { in: flowQueueIdList } } })
      .then((r) => r.count);
    queue = await db.emailQueue
      .deleteMany({ where: { id: { in: flowQueueIdList } } })
      .then((r) => r.count);
  }

  // 2. EmailFlowStep (children of EmailFlow — cascade deletes them, but be explicit).
  const flowSteps = await db.emailFlowStep
    .deleteMany({})
    .then((r) => r.count);

  // 3. EmailFlow
  const flows = await db.emailFlow.deleteMany({}).then((r) => r.count);

  // 4. EmailStageTemplate (the 5 stage templates — re-seed to restore).
  const templates = await db.emailStageTemplate
    .deleteMany({})
    .then((r) => r.count);

  return {
    deleted: { queue, logs, flowSteps, flows, templates },
  };
}
