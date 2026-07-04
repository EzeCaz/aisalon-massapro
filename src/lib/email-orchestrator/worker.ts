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
} from "./templates";
import { sendEmail } from "./sender";

export type WorkerResult = {
  created: number; // stage 1 rows created
  sent: number; // emails sent this run
  skipped: number; // rows skipped (stop-awareness or checked-in)
  failed: number; // rows that failed to send
  processed: number; // total PENDING rows examined
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
    errors: [],
  };

  // ── Phase 1: bootstrap stage 1 for new GOING RSVPs ──────────────────────
  await bootstrapStage1ForNewRsvps(result);

  // ── Phase 2: process due PENDING rows ───────────────────────────────────
  await processDuePending(result);

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
    };
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Load the template (from DB if seeded, else from defaults).
  const tplRow = await db.emailStageTemplate.findUnique({
    where: { stage: row.stage },
  });
  const tpl =
    tplRow ?? null;
  const subject =
    tpl?.subject ?? DEFAULT_TEMPLATES[row.stage]?.subject ?? `AI Salon — stage ${row.stage}`;
  const htmlTemplate =
    tpl?.htmlBody ?? DEFAULT_TEMPLATES[row.stage]?.html ?? "<p>{{eventTitle}}</p>";

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
    event: row.rsvp.event,
    rsvp: row.rsvp,
    speakers,
    agenda,
    baseUrl,
    queueId: row.id,
  });

  const renderedHtml = renderTemplate(htmlTemplate, ctx);
  const renderedSubject = subject.replace(/{{eventTitle}}/g, ctx.eventTitle);

  const sendResult = await sendEmail({
    to: row.email,
    subject: renderedSubject,
    html: renderedHtml,
    toName: row.rsvp.name || undefined,
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
    },
  });

  return { ok: true };
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
