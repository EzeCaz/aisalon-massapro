/**
 * Seed for the email orchestrator.
 *
 * Creates (idempotently):
 *   - 5 EmailTemplate2 rows (one per stage) with default subjects + HTML
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
 * EmailTemplate2 rows. It preserves real users, events, and RSVPs.
 *
 * TSK-0074: previously wrote to the legacy EmailStageTemplate table; now
 * writes to the unified EmailTemplate2 table (field renamed htmlBody →
 * bodyHtml). The legacy table is preserved for read-only access.
 */

import { db } from "@/lib/db";
import {
  DEFAULT_TEMPLATES,
  DEFAULT_NO_CODE_TEMPLATES,
  DEFAULT_ALT_SUBJECTS,
} from "./templates";
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
    const existing = await db.emailTemplate2.findUnique({
      where: { stage: stageCfg.stage },
    });
    if (existing) {
      // Backfill the new feature fields on existing rows (idempotent — only
      // sets them if currently null). This lets us roll out the no-code,
      // alt-subject, and logo features without dropping + re-creating the
      // seeded templates.
      const noCode = DEFAULT_NO_CODE_TEMPLATES[stageCfg.stage];
      const alt = DEFAULT_ALT_SUBJECTS[stageCfg.stage];
      const patch: Record<string, unknown> = {};
      if (!existing.noCodeSubject && noCode) patch.noCodeSubject = noCode.subject;
      if (!existing.noCodeHtmlBody && noCode)
        patch.noCodeHtmlBody = noCode.html("{{eventTitle}}", "{{eventDate}}", "{{eventVenue}}");
      if (!existing.altSubject && alt) patch.altSubject = alt.altSubject;
      if (!existing.altNotOpenedHours && alt) patch.altNotOpenedHours = alt.altNotOpenedHours;

      // ── Migration 2026-08-05 (v3): ensure all seeded default templates
      //  use the {{chapter_name}} merge token (not hardcoded "Tel Aviv")
      //  AND that the email brand logo is ALWAYS controlled by the global
      //  SiteSetting[emailLogo] pick (not per-template overrides).
      //
      //  PER USER SPEC 2026-08-05: "when I select the logo for the email
      //  all emails will be automatically with the logo I've chosen."
      //  This means the per-template `logoUrl` override must NEVER win
      //  over the global pick. We achieve this by ALWAYS clearing the
      //  per-template `logoUrl` to null in the seed — so resolveLogoUrl()
      //  falls through to resolveEmailLogoDefault() which reads
      //  SiteSetting[emailLogo] (the Super Admin's global pick).
      //
      //  The canonical email logo URL is now the user's chosen image:
      //    https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785868301722-nl1qnl.png
      //  This matches DEFAULTS[K_EMAIL_LOGO] in site-settings.ts and
      //  DEFAULT_BRAND_LOGO_URL in templates.ts.
      //
      //  We also handle the campaign footer line "AI Salon Tel Aviv · Empowering AI Connections"
      //  by replacing the entire htmlBody — the canonical template already
      //  has "AI Salon {{chapter_name}} · Empowering AI Connections".
      //  The subject line never contained "Tel Aviv", so we leave it alone.
      const def = DEFAULT_TEMPLATES[stageCfg.stage];
      const hasOldChapterText = (s: string | null): boolean =>
        !!s && (s.includes("The AI Salon Tel Aviv team") ||
                s.includes("AI Salon Tel Aviv · Empowering AI Connections") ||
                s.includes("AI Salon Tel Aviv ·"));
      if (existing.bodyHtml && hasOldChapterText(existing.bodyHtml) && def?.html) {
        patch.bodyHtml = def.html;
      }
      if (existing.noCodeHtmlBody && hasOldChapterText(existing.noCodeHtmlBody) && noCode) {
        patch.noCodeHtmlBody = noCode.html("{{eventTitle}}", "{{eventDate}}", "{{eventVenue}}");
      }
      // ALWAYS clear the per-template logoUrl so the global
      // SiteSetting[emailLogo] pick is used. Previously this only cleared
      // logoUrl when it differed from the canonical URL — which meant
      // templates seeded with the OLD canonical URL kept showing the old
      // logo even after the user picked a new one. Now we clear it
      // unconditionally so the global pick ALWAYS wins.
      if (existing.logoUrl) {
        patch.logoUrl = null;
      }

      if (Object.keys(patch).length > 0) {
        await db.emailTemplate2.update({
          where: { id: existing.id },
          data: patch,
        });
      }
      result.templates.existing++;
      continue;
    }
    const def = DEFAULT_TEMPLATES[stageCfg.stage];
    const noCode = DEFAULT_NO_CODE_TEMPLATES[stageCfg.stage];
    const alt = DEFAULT_ALT_SUBJECTS[stageCfg.stage];
    await db.emailTemplate2.create({
      data: {
        stage: stageCfg.stage,
        name: def.name,
        subject: def.subject,
        bodyHtml: def.html,
        stopIfNotOpenedHours: stageCfg.stopIfNotOpenedHours,
        // Feature 1: no-check-in-code variant body (only stages 3 & 4)
        noCodeSubject: noCode?.subject ?? null,
        noCodeHtmlBody: noCode
          ? noCode.html("{{eventTitle}}", "{{eventDate}}", "{{eventVenue}}")
          : null,
        // Feature 3: alt-subject re-send (all 5 stages)
        altSubject: alt?.altSubject ?? null,
        altNotOpenedHours: alt?.altNotOpenedHours ?? null,
        isActive: true,
        isDefault: true,
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

  // 4. EmailTemplate2 (the 5 stage templates — re-seed to restore).
  // TSK-0074: was db.emailStageTemplate (now EmailTemplate2 after unification).
  const templates = await db.emailTemplate2
    .deleteMany({})
    .then((r) => r.count);

  return {
    deleted: { queue, logs, flowSteps, flows, templates },
  };
}
