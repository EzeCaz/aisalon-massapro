/**
 * Email orchestrator worker — the state machine.
 *
 * Run via `POST /api/email-orchestrator/run` (cron or manual).
 *
 * Algorithm:
 *
 * 1. For each RSVP with status "GOING" and NO EmailQueue rows yet:
 *    → create stage 1 EmailQueue row (scheduledFor = event.startsAt - 240h).
 *    → (Subsequent stages are created lazily after stage N is SENT.)
 *
 * 2. For each PENDING EmailQueue row whose scheduledFor ≤ now:
 *    a. Check stop-awareness: if the RSVP has been checked in
 *       (doorCheckedAt set), SKIP this and all subsequent stages.
 *    b. Look up the previous stage's EmailQueue row. If the previous stage
 *       had stopIfNotOpenedHours set AND was sent > N hours ago AND has not
 *       been OPENED, SKIP this and all subsequent stages.
 *    c. Send the email (Gmail or mock).
 *    d. On success: mark SENT, store htmlBody for replay, create the next
 *       stage's PENDING row (with its scheduledFor based on event.startsAt).
 *    e. On failure: mark FAILED, increment attemptCount.
 *
 * 3. For each SKIPPED/FAILED terminal state: leave alone (manual review).
 *
 * Notes:
 *   - We do NOT bulk-create all 5 stages up front. Only stage 1 exists
 *     until the user opens it (or the stop rule fires). This keeps the
 *     queue small and makes the stop-awareness rule straightforward.
 *   - The worker is idempotent: re-running it on the same data does
 *     nothing (PENDING rows whose scheduledFor is past get processed once,
 *     then transition to SENT/SKIPPED/FAILED).
 *   - All operations are wrapped in transactions where appropriate.
 */

import { db } from "@/lib/db";
import { STAGES, getStage, scheduledFor, nextStage } from "./stages";
import {
  buildContext,
  renderTemplate,
  DEFAULT_TEMPLATES,
  buildLogoBlock,
} from "./templates";
import { sendEmail } from "./sender";

export type WorkerResult = {
  created: number; // stage 1 rows created
  sent: number; // emails sent this run
  skipped: number; // rows skipped (stop-awareness or checked-in)
  failed: number; // rows that failed to send
  processed: number; // total PENDING rows examined
  altResent: number; // alt-subject re-sends sent this run
  errors: string[]; // error messages (capped at 20)
};

const MAX_ERRORS = 20;

export async function runWorker(): Promise<WorkerResult> {
  const result: WorkerResult = {
    created: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    processed: 0,
    altResent: 0,
    errors: [],
  };

  // ── Phase 1: bootstrap stage 1 for new GOING RSVPs ──────────────────────
  await bootstrapStage1ForNewRsvps(result);

  // ── Phase 2: process due PENDING rows ───────────────────────────────────
  await processDuePending(result);

  // ── Phase 3: alt-subject re-sends ───────────────────────────────────────
  // For each SENT row whose template has an altSubject + altNotOpenedHours,
  // if the row has NOT been opened and we're past the alt-resend window,
  // create a new EmailQueue row (isAltResend=true) with the alt subject and
  // the SAME rendered body, then send it.
  await processAltResends(result);

  return result;
}

// ----------------------------------------------------------------------------

async function bootstrapStage1ForNewRsvps(result: WorkerResult): Promise<void> {
  // Find GOING RSVPs that have NO EmailQueue rows at all.
  const rsvps = await db.eventRsvp.findMany({
    where: {
      status: "GOING",
      emailQueueItems: { none: {} },
    },
    include: {
      event: { select: { id: true, title: true, startsAt: true, slug: true } },
    },
    take: 500, // safety cap
  });

  for (const rsvp of rsvps) {
    // Skip if event.startsAt is too far in the past (we don't want to email
    // about events that already happened long ago). Window: event ended <
    // 48h ago = still worth emailing (recap stage will fire). Otherwise skip.
    const eventEndedAgo = Date.now() - rsvp.event.startsAt.getTime();
    if (eventEndedAgo > 72 * 60 * 60 * 1000) continue; // > 72h ago

    try {
      const stage1 = STAGES[0];
      const fireTime = scheduledFor(rsvp.event.startsAt, 1);
      // If stage 1's scheduled time has already passed (e.g. RSVP came in
      // late), schedule for now.
      const effectiveScheduled =
        fireTime && fireTime < new Date() ? new Date() : (fireTime ?? new Date());

      await db.emailQueue.create({
        data: {
          rsvpId: rsvp.id,
          eventId: rsvp.eventId,
          userId: rsvp.userId,
          email: rsvp.email,
          stage: 1,
          status: "PENDING",
          scheduledFor: effectiveScheduled,
        },
      });
      result.created++;
    } catch (err) {
      pushError(result, `bootstrap rsvp ${rsvp.id}: ${String(err)}`);
    }
  }
}

async function processDuePending(result: WorkerResult): Promise<void> {
  const now = new Date();
  // Pull all PENDING rows whose scheduledFor ≤ now. Cap at 200/run for safety.
  const due = await db.emailQueue.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: now },
    },
    include: {
      rsvp: {
        include: {
          event: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              venue: true,
              address: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
    take: 200,
  });

  for (const row of due) {
    result.processed++;
    try {
      // Defensive: stage-based orchestrator rows always have rsvpId set
      // (bootstrapped from real RSVPs). If we ever encounter a null-rsvp
      // row here, skip it — it belongs to the flow-based system.
      if (!row.rsvp) {
        await db.emailQueue.update({
          where: { id: row.id },
          data: { status: "SKIPPED", errorMessage: "stage-based row has no rsvp — belongs to flow system" },
        });
        result.skipped++;
        continue;
      }

      // ── Stop-awareness check 1: RSVP already checked in ──
      if (row.rsvp.doorCheckedAt) {
        await skipRowAndSubsequent(row, "RSVP already checked in");
        result.skipped++;
        continue;
      }

      // ── Stop-awareness check 2: previous stage's stop rule ──
      if (row.stage > 1) {
        const prevStageNum = row.stage - 1;
        const prevRow = await db.emailQueue.findUnique({
          where: {
            rsvpId_stage: { rsvpId: row.rsvpId, stage: prevStageNum },
          },
        });
        const prevCfg = getStage(prevStageNum);
        if (
          prevRow &&
          prevCfg?.stopIfNotOpenedHours != null &&
          prevRow.status === "SENT" &&
          prevRow.sentAt &&
          !prevRow.openedAt &&
          Date.now() - prevRow.sentAt.getTime() >
            prevCfg.stopIfNotOpenedHours * 60 * 60 * 1000
        ) {
          await skipRowAndSubsequent(
            row,
            `Previous stage ${prevStageNum} not opened within ${prevCfg.stopIfNotOpenedHours}h`,
          );
          result.skipped++;
          continue;
        }
      }

      // ── Send the email ──
      const sent = await sendStageEmail(row);
      if (sent.ok) {
        result.sent++;
        // Create the next stage's PENDING row (if any).
        const next = nextStage(row.stage);
        if (next != null) {
          const nextFireTime = scheduledFor(row.rsvp.event.startsAt, next);
          // If next stage's fire time is in the past, schedule for now + 1s
          // (so it gets picked up on the next run, not instantly re-sent
          // in this one).
          const effectiveNext =
            nextFireTime && nextFireTime <= new Date()
              ? new Date(Date.now() + 1000)
              : (nextFireTime ?? new Date(Date.now() + 1000));
          await db.emailQueue.create({
            data: {
              rsvpId: row.rsvpId,
              eventId: row.eventId,
              userId: row.userId,
              email: row.email,
              stage: next,
              status: "PENDING",
              scheduledFor: effectiveNext,
            },
          });
        }
      } else {
        result.failed++;
        await db.emailQueue.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            errorMessage: sent.error,
            attemptCount: { increment: 1 },
          },
        });
      }
    } catch (err) {
      result.failed++;
      pushError(result, `process row ${row.id}: ${String(err)}`);
    }
  }
}

// ----------------------------------------------------------------------------

async function sendStageEmail(
  row: {
    id: string;
    stage: number;
    eventId: string;
    email: string;
    rsvp: {
      name: string | null;
      email: string;
      checkInCode: string | null;
      event: {
        title: string;
        startsAt: Date;
        venue: string | null;
        address: string | null;
        slug: string;
      };
    } | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  // The legacy stage-based orchestrator only ever creates rows for real
  // RSVPs (bootstrapped from GOING RSVPs), so rsvp should always be set.
  // If a null-rsvp row slips through (e.g. a flow row that lost its
  // flowStepId), bail out cleanly instead of crashing the worker.
  if (!row.rsvp) {
    return { ok: false, error: "stage-based row has no rsvp linked" };
  }
  const rsvp = row.rsvp;

  // Load the template (from DB if seeded, else from defaults).
  const tplRow = await db.emailStageTemplate.findUnique({
    where: { stage: row.stage },
  });
  const tpl = tplRow ?? null;

  // ─── Feature 1: pick no-code variant body if RSVP has no checkInCode ───
  // Only applies when the template defines a noCodeHtmlBody. Used by stages
  // 3 (Final Prep) and 4 (Day-Of). The variant tells the user to generate
  // their personal, non-transferrable code on the event page.
  const hasNoCode = !rsvp.checkInCode && !!tpl?.noCodeHtmlBody;
  const subject = hasNoCode
    ? (tpl?.noCodeSubject ?? tpl?.subject ?? DEFAULT_TEMPLATES[row.stage]?.subject ?? `AI Salon — stage ${row.stage}`)
    : (tpl?.subject ?? DEFAULT_TEMPLATES[row.stage]?.subject ?? `AI Salon — stage ${row.stage}`);
  const htmlTemplate = hasNoCode
    ? (tpl?.noCodeHtmlBody ?? tpl?.htmlBody ?? DEFAULT_TEMPLATES[row.stage]?.html ?? "<p>{{eventTitle}}</p>")
    : (tpl?.htmlBody ?? DEFAULT_TEMPLATES[row.stage]?.html ?? "<p>{{eventTitle}}</p>");

  // Load speakers + agenda for the event.
  const [speakers, agenda] = await Promise.all([
    db.speaker.findMany({
      where: { eventId: row.eventId },
      select: { name: true },
    }),
    db.eventAgendaItem.findMany({
      where: { eventId: row.eventId },
      orderBy: { startsAt: "asc" },
      select: { title: true, startsAt: true },
    }),
  ]);

  const baseUrl = process.env.NEXTAUTH_URL || "https://aisalon.massapro.com";
  const ctx = buildContext({
    event: rsvp.event,
    rsvp,
    speakers,
    agenda,
    baseUrl,
    queueId: row.id,
  });

  // ─── Feature 2: inject brand logo (top-right, 24px) at render time ─────
  const logoHtml = buildLogoBlock(tpl?.logoUrl);
  const renderedHtml = renderTemplate(htmlTemplate, ctx, { logoHtml });
  const renderedSubject = subject.replace(/{{eventTitle}}/g, ctx.eventTitle);

  const sendResult = await sendEmail({
    to: row.email,
    subject: renderedSubject,
    html: renderedHtml,
    toName: rsvp.name || undefined,
  });

  if (!sendResult.ok) {
    return sendResult;
  }

  // Mark SENT + store the rendered HTML for replay/preview.
  await db.emailQueue.update({
    where: { id: row.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      subject: renderedSubject,
      htmlBody: renderedHtml,
      attemptCount: { increment: 1 },
      errorMessage: null,
      usedNoCodeVariant: hasNoCode,
    },
  });

  return { ok: true };
}

// ----------------------------------------------------------------------------
// Phase 3: alt-subject re-sends
// ----------------------------------------------------------------------------

/**
 * For each SENT (non-alt) EmailQueue row whose template defines an altSubject
 * + altNotOpenedHours, if the row has NOT been opened and we're past the
 * alt-resend window, enqueue + send a new row with the alt subject.
 *
 * Idempotency: we look for an existing alt row (isAltResend=true, same
 * rsvpId+stage) before creating one. Each primary send gets at most ONE alt
 * resend. The alt row reuses the same rendered htmlBody (snapshot) but
 * re-renders the subject with the alt template.
 */
async function processAltResends(result: WorkerResult): Promise<void> {
  const now = new Date();

  // Find all SENT primary rows (isAltResend=false) that have an altSubject
  // defined on their template, are NOT opened, and whose alt-resend window
  // has elapsed.
  const candidates = await db.emailQueue.findMany({
    where: {
      status: "SENT",
      isAltResend: false,
      openedAt: null,
      sentAt: { not: null },
      // stage-based orchestrator rows only (flowStepId IS NULL)
      flowStepId: null,
    },
    include: {
      rsvp: {
        include: {
          event: { select: { title: true, startsAt: true, venue: true, address: true, slug: true } },
        },
      },
    },
    take: 100,
  });

  for (const row of candidates) {
    try {
      // Defensive: alt-resend logic only applies to stage-based rows that
      // have a real RSVP linked. Audience-sent flow rows (rsvpId null)
      // never enter this code path because the `flowStepId: null` filter
      // excludes them, but guard anyway.
      if (!row.rsvp) continue;

      const tpl = await db.emailStageTemplate.findUnique({
        where: { stage: row.stage },
      });
      if (!tpl?.altSubject || !tpl.altNotOpenedHours) continue;

      // Has the alt-resend window elapsed?
      if (!row.sentAt) continue;
      const altFireAt = new Date(
        row.sentAt.getTime() + tpl.altNotOpenedHours * 60 * 60 * 1000,
      );
      if (altFireAt > now) continue;

      // Idempotency: already re-sent for this rsvpId+stage?
      const existingAlt = await db.emailQueue.findFirst({
        where: {
          rsvpId: row.rsvpId,
          stage: row.stage,
          isAltResend: true,
        },
        select: { id: true },
      });
      if (existingAlt) continue;

      // Build the alt row. Re-render the body with the alt row's queue id so
      // the open pixel + click redirects point to the alt row (independent
      // tracking — opens on the alt send are tracked separately from the
      // original). Same body template, just the subject line changes.
      const baseUrl = process.env.NEXTAUTH_URL || "https://aisalon.massapro.com";

      // Create the alt row first (PENDING), then render + send using its id.
      const altRow = await db.emailQueue.create({
        data: {
          rsvpId: row.rsvpId,
          eventId: row.eventId,
          userId: row.userId,
          email: row.email,
          stage: row.stage,
          status: "PENDING",
          scheduledFor: now,
          isAltResend: true,
          altOfEmailQueueId: row.id,
        },
      });

      const [speakers, agenda] = await Promise.all([
        db.speaker.findMany({
          where: { eventId: row.eventId },
          select: { name: true },
        }),
        db.eventAgendaItem.findMany({
          where: { eventId: row.eventId },
          orderBy: { startsAt: "asc" },
          select: { title: true, startsAt: true },
        }),
      ]);
      const ctx = buildContext({
        event: row.rsvp.event,
        rsvp: row.rsvp,
        speakers,
        agenda,
        baseUrl,
        queueId: altRow.id,
      });
      const logoHtml = buildLogoBlock(tpl.logoUrl);
      const altRenderedHtml = renderTemplate(tpl.htmlBody, ctx, { logoHtml });
      const altRenderedSubject = tpl.altSubject
        .replace(/{{eventTitle}}/g, ctx.eventTitle)
        .replace(/{{firstName}}/g, ctx.firstName)
        .replace(/{{eventDate}}/g, ctx.eventDate)
        .replace(/{{eventVenue}}/g, ctx.eventVenue);

      const sendResult = await sendEmail({
        to: row.email,
        subject: altRenderedSubject,
        html: altRenderedHtml,
        toName: row.rsvp.name || undefined,
      });

      if (sendResult.ok) {
        await db.emailQueue.update({
          where: { id: altRow.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            subject: altRenderedSubject,
            htmlBody: altRenderedHtml,
            subjectVariant: "ALT",
          },
        });
        result.altResent++;
      } else {
        await db.emailQueue.update({
          where: { id: altRow.id },
          data: {
            status: "FAILED",
            errorMessage: sendResult.error,
            attemptCount: { increment: 1 },
          },
        });
        result.failed++;
      }
    } catch (err) {
      pushError(result, `alt-resend row ${row.id}: ${String(err)}`);
    }
  }
}

async function skipRowAndSubsequent(
  row: import("@prisma/client").EmailQueue,
  reason: string,
): Promise<void> {
  await db.emailQueue.update({
    where: { id: row.id },
    data: {
      status: "SKIPPED",
      errorMessage: reason,
    },
  });
  // Also skip any future stages that already exist (in practice none exist
  // yet because we create them lazily, but defensive).
  await db.emailQueue.updateMany({
    where: {
      rsvpId: row.rsvpId,
      stage: { gt: row.stage },
      status: "PENDING",
    },
    data: { status: "SKIPPED", errorMessage: reason },
  });
}

function pushError(result: WorkerResult, msg: string): void {
  if (result.errors.length < MAX_ERRORS) result.errors.push(msg);
}
