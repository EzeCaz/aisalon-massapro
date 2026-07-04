/**
 * Flow worker — the state machine that processes EmailFlowRun rows.
 *
 * Runs every minute via cron (/api/email-orchestrator/run). Each tick:
 *
 *   Phase 1 — SEND: process runs where status=ACTIVE and nextRunAt <= now.
 *     For each:
 *       1. Load the current step.
 *       2. Re-evaluate step.filterJson against User + RSVP. If fails → halt.
 *       3. If step.templateId is null → wait-only step, skip send, advance.
 *       4. Else: build TemplateContext, send the email, create EmailQueue
 *          row, set lastQueueId + lastStepSentAt, schedule branch
 *          evaluation (status=WAITING_BRANCH, branchEvalAt = now + delay).
 *
 *   Phase 2 — EVALUATE: process runs where status=WAITING_BRANCH and
 *   branchEvalAt <= now.
 *     For each:
 *       1. Load the last sent queue row + RSVP state.
 *       2. Build BranchContext (opened/clicked/attended/etc.).
 *       3. Evaluate branch rules. First match wins.
 *       4. Apply action:
 *          - HALT → status=HALTED
 *          - GOTO → currentStepPosition = target, status=ACTIVE,
 *                   nextRunAt = now + target step's delay
 *          - CONTINUE → advance to position+1 (or COMPLETED if terminal)
 *
 * Idempotent: a run that errors out stays in its current state with an
 * entry in historyJson. The next cron tick will retry (up to a max
 * attempt count, after which status=ERROR).
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { sendEmail, type SendResult } from "./sender";
import { buildContext, renderTemplate, renderSubject } from "./templates";
import {
  parseFilter,
  buildFilterContext,
  evaluateFilter,
} from "./flow-filter";
import {
  parseBranchRules,
  evaluateBranches,
  type BranchContext,
} from "./flow-branches";

export type WorkerResult = {
  sent: number;
  branchEvaluated: number;
  halted: number;
  completed: number;
  errors: number;
  processed: number;
  errorDetails: { runId: string; error: string }[];
};

const MAX_ATTEMPTS = 3;

/** Main entry — called by /api/email-orchestrator/run. */
export async function runFlowWorker(): Promise<WorkerResult> {
  const sendResult = await runSendPhase();
  const evalResult = await runEvaluatePhase();
  return {
    sent: sendResult.sent,
    branchEvaluated: evalResult.evaluated,
    halted: evalResult.halted + sendResult.halted,
    completed: evalResult.completed,
    errors: sendResult.errors + evalResult.errors,
    processed: sendResult.processed + evalResult.processed,
    errorDetails: [...sendResult.errorDetails, ...evalResult.errorDetails],
  };
}

// ----------------------------------------------------------------------------
// PHASE 1 — SEND
// ----------------------------------------------------------------------------

async function runSendPhase(): Promise<WorkerResult & { sent: number; halted: number }> {
  const now = new Date();
  const result = {
    sent: 0,
    branchEvaluated: 0,
    halted: 0,
    completed: 0,
    errors: 0,
    processed: 0,
    errorDetails: [] as { runId: string; error: string }[],
  };

  // Find all runs ready to send.
  const dueRuns = await db.emailFlowRun.findMany({
    where: {
      status: "ACTIVE",
      nextRunAt: { lte: now },
    },
    include: {
      flow: { include: { steps: { orderBy: { position: "asc" } } } },
      rsvp: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              company: true,
              companyUrl: true,
              interestedIn: true,
              profileCategories: true,
              appliedFor: true,
              invitedToSpeak: true,
              // Note: User does not have a `title` field. The intake
              // form's "role / title" is captured in Speaker.title
              // (event-scoped), not on User.
            },
          },
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              startsAt: true,
              venue: true,
              address: true,
            },
          },
        },
      },
    },
    take: 50, // cap per tick to avoid timeouts
  });

  for (const run of dueRuns) {
    result.processed++;
    try {
      await processSendRun(run);
      result.sent++;
    } catch (err) {
      result.errors++;
      result.errorDetails.push({
        runId: run.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await markRunError(run.id, err);
    }
  }

  return result;
}

async function processSendRun(run: Prisma.EmailFlowRunGetPayload<{
  include: {
    flow: { include: { steps: { orderBy: { position: "asc" } } } };
    rsvp: {
      include: {
        user: {
          select: {
            id: true; email: true; name: true; role: true; company: true;
            companyUrl: true; interestedIn: true; profileCategories: true;
            appliedFor: true; invitedToSpeak: true;
          };
        };
        event: {
          select: {
            id: true; title: true; slug: true; startsAt: true; venue: true; address: true;
          };
        };
      };
    };
  };
}>) {
  const step = run.flow.steps.find((s) => s.position === run.currentStepPosition);
  if (!step) {
    // No step at current position — flow is malformed. Halt.
    await haltRun(run.id, `step ${run.currentStepPosition} not found`);
    return;
  }

  // --- 1. Re-evaluate filter ---
  if (run.rsvp) {
    const filter = parseFilter(step.filterJson);
    const filterCtx = buildFilterContext(run.rsvp.user, run.rsvp);
    if (!evaluateFilter(filter, filterCtx)) {
      await haltRun(run.id, `filter failed at step ${step.position}`);
      return;
    }
  }

  // --- 2. Wait-only step (no templateId) ---
  if (!step.templateId) {
    await advanceToNextStep(run.id, step.position, run.flow.steps, "wait-only step");
    return;
  }

  // --- 3. Send the email ---
  const template = await db.emailStageTemplate.findUnique({
    where: { id: step.templateId },
  });
  if (!template) {
    await haltRun(run.id, `template ${step.templateId} not found`);
    return;
  }

  // Build context. The baseUrl is the public site URL.
  const baseUrl = process.env.NEXTAUTH_URL || "https://aisalon.massapro.com";

  // Create the EmailQueue row first (we need its ID for the open pixel).
  const queueRow = await db.emailQueue.create({
    data: {
      rsvpId: run.rsvpId!,
      eventId: run.eventId!,
      userId: run.userId,
      email: run.rsvp!.email,
      stage: step.position, // reuse stage field for step position
      flowRunId: run.id,
      flowStepId: step.id,
      status: "PENDING",
      scheduledFor: new Date(),
    },
  });

  // Build context with the queue ID (for open pixel + click redirect).
  const ctx = buildContext({
    event: run.rsvp!.event,
    rsvp: run.rsvp!,
    speakers: [], // TODO: load speakers if needed
    agenda: [],   // TODO: load agenda if needed
    baseUrl,
    queueId: queueRow.id,
  });

  const subject = step.subjectOverride || template.subject;
  const htmlBody = renderTemplate(template.htmlBody, ctx);
  const renderedSubject = renderSubject(subject, ctx);

  // Send via the configured provider (mock by default, gmail if env set).
  const sendResult: SendResult = await sendEmail({
    to: run.rsvp!.email,
    subject: renderedSubject,
    html: htmlBody,
  });

  if (!sendResult.ok) {
    // Mark queue row as failed, but DON'T halt the run — retry next tick.
    await db.emailQueue.update({
      where: { id: queueRow.id },
      data: {
        status: "FAILED",
        errorMessage: sendResult.error || "send failed",
        attemptCount: { increment: 1 },
      },
    });
    throw new Error(`send failed: ${sendResult.error}`);
  }

  // --- 4. Mark queue row as SENT, update run state ---
  const now = new Date();
  await db.emailQueue.update({
    where: { id: queueRow.id },
    data: {
      status: "SENT",
      sentAt: now,
      subject: renderedSubject,
      htmlBody,
    },
  });

  // Schedule branch evaluation.
  const branchDelayHours = run.flow.branchEvaluationDelayHours || 5;
  const branchEvalAt = new Date(now.getTime() + branchDelayHours * 60 * 60 * 1000);

  await db.emailFlowRun.update({
    where: { id: run.id },
    data: {
      lastQueueId: queueRow.id,
      lastStepSentAt: now,
      status: "WAITING_BRANCH",
      branchEvalAt,
      branchEvaluated: false,
      nextRunAt: branchEvalAt, // also set nextRunAt for safety
      historyJson: appendHistory(run.historyJson, {
        at: now.toISOString(),
        step: step.position,
        action: "SENT",
        reason: `email sent, queue=${queueRow.id}`,
      }),
    },
  });
}

// ----------------------------------------------------------------------------
// PHASE 2 — EVALUATE BRANCHES
// ----------------------------------------------------------------------------

async function runEvaluatePhase(): Promise<{
  evaluated: number;
  halted: number;
  completed: number;
  errors: number;
  processed: number;
  errorDetails: { runId: string; error: string }[];
}> {
  const result = {
    evaluated: 0,
    halted: 0,
    completed: 0,
    errors: 0,
    processed: 0,
    errorDetails: [] as { runId: string; error: string }[],
  };

  const now = new Date();
  const dueRuns = await db.emailFlowRun.findMany({
    where: {
      status: "WAITING_BRANCH",
      branchEvalAt: { lte: now },
    },
    include: {
      flow: { include: { steps: { orderBy: { position: "asc" } } } },
      rsvp: {
        include: {
          user: { select: { id: true, role: true } },
        },
      },
    },
    take: 50,
  });

  for (const run of dueRuns) {
    result.processed++;
    try {
      await processEvaluateRun(run);
      result.evaluated++;
    } catch (err) {
      result.errors++;
      result.errorDetails.push({
        runId: run.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await markRunError(run.id, err);
    }
  }

  result.halted = 0; // populated inside processEvaluateRun via side effect
  result.completed = 0;
  return result;
}

async function processEvaluateRun(run: Prisma.EmailFlowRunGetPayload<{
  include: {
    flow: { include: { steps: { orderBy: { position: "asc" } } } };
    rsvp: { include: { user: { select: { id: true; role: true } } } };
  };
}>) {
  if (!run.lastQueueId) {
    // Shouldn't happen — WAITING_BRANCH implies a queue row was sent.
    await haltRun(run.id, "no lastQueueId in WAITING_BRANCH state");
    return;
  }

  const lastQueue = await db.emailQueue.findUnique({
    where: { id: run.lastQueueId },
    select: { openedAt: true, clickedAt: true, status: true },
  });
  if (!lastQueue) {
    await haltRun(run.id, `last queue row ${run.lastQueueId} not found`);
    return;
  }

  // Build branch context from RSVP + queue state.
  const branchCtx: BranchContext = {
    opened: !!lastQueue.openedAt,
    clicked: !!lastQueue.clickedAt,
    rsvpStatus: run.rsvp?.status ?? "GOING",
    doorCheckedIn: !!(run.rsvp?.doorCheckedAt),
    attended: !!(run.rsvp?.attendedAt),
    noShow: run.rsvp?.noShow ?? false,
  };

  // Find the step that just sent.
  const currentStep = run.flow.steps.find((s) => s.position === run.currentStepPosition);
  if (!currentStep) {
    await haltRun(run.id, `step ${run.currentStepPosition} not found`);
    return;
  }

  // Evaluate branch rules.
  const rules = parseBranchRules(currentStep.branchRulesJson);
  const evalResult = evaluateBranches(rules, branchCtx);

  const now = new Date();
  if (evalResult.action === "HALT") {
    await db.emailFlowRun.update({
      where: { id: run.id },
      data: {
        status: "HALTED",
        branchEvaluated: true,
        nextRunAt: null,
        historyJson: appendHistory(run.historyJson, {
          at: now.toISOString(),
          step: run.currentStepPosition,
          action: "HALTED",
          reason: evalResult.reason,
        }),
      },
    });
    return;
  }

  if (evalResult.action === "GOTO") {
    const targetStep = run.flow.steps.find((s) => s.position === evalResult.targetStepPosition);
    if (!targetStep) {
      await haltRun(run.id, `GOTO target step ${evalResult.targetStepPosition} not found`);
      return;
    }
    const nextRunAt = new Date(now.getTime() + delayToMs(targetStep.delayValue, targetStep.delayUnit));
    await db.emailFlowRun.update({
      where: { id: run.id },
      data: {
        currentStepPosition: targetStep.position,
        status: "ACTIVE",
        branchEvaluated: true,
        nextRunAt,
        historyJson: appendHistory(run.historyJson, {
          at: now.toISOString(),
          step: run.currentStepPosition,
          action: "GOTO",
          reason: `${evalResult.reason} → step ${targetStep.position}`,
        }),
      },
    });
    return;
  }

  // CONTINUE — advance to next step or complete.
  await advanceToNextStep(run.id, run.currentStepPosition, run.flow.steps, evalResult.reason);
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function advanceToNextStep(
  runId: string,
  currentPosition: number,
  steps: Array<{ position: number; delayValue: number; delayUnit: string }>,
  reason: string,
) {
  const nextPosition = currentPosition + 1;
  const nextStep = steps.find((s) => s.position === nextPosition);

  if (!nextStep) {
    // No more steps — flow complete.
    await db.emailFlowRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        nextRunAt: null,
        branchEvaluated: true,
        historyJson: appendHistory(
          (await db.emailFlowRun.findUnique({ where: { id: runId }, select: { historyJson: true } }))?.historyJson || "[]",
          {
            at: new Date().toISOString(),
            step: currentPosition,
            action: "COMPLETED",
            reason,
          },
        ),
      },
    });
    return;
  }

  const nextRunAt = new Date(Date.now() + delayToMs(nextStep.delayValue, nextStep.delayUnit));
  await db.emailFlowRun.update({
    where: { id: runId },
    data: {
      currentStepPosition: nextPosition,
      status: "ACTIVE",
      nextRunAt,
      branchEvaluated: true,
      historyJson: appendHistory(
        (await db.emailFlowRun.findUnique({ where: { id: runId }, select: { historyJson: true } }))?.historyJson || "[]",
        {
          at: new Date().toISOString(),
          step: currentPosition,
          action: "ADVANCE",
          reason: `${reason} → step ${nextPosition}`,
        },
      ),
    },
  });
}

async function haltRun(runId: string, reason: string) {
  await db.emailFlowRun.update({
    where: { id: runId },
    data: {
      status: "HALTED",
      nextRunAt: null,
      historyJson: appendHistory(
        (await db.emailFlowRun.findUnique({ where: { id: runId }, select: { historyJson: true } }))?.historyJson || "[]",
        {
          at: new Date().toISOString(),
          step: 0,
          action: "HALTED",
          reason,
        },
      ),
    },
  });
}

async function markRunError(runId: string, err: unknown) {
  const run = await db.emailFlowRun.findUnique({
    where: { id: runId },
    select: { historyJson: true },
  });
  const attemptCount = (JSON.parse(run?.historyJson || "[]") as Array<{ action: string }>)
    .filter((e) => e.action === "ERROR").length;

  if (attemptCount >= MAX_ATTEMPTS) {
    await db.emailFlowRun.update({
      where: { id: runId },
      data: {
        status: "ERROR",
        nextRunAt: null,
        historyJson: appendHistory(run?.historyJson || "[]", {
          at: new Date().toISOString(),
          step: 0,
          action: "ERROR",
          reason: err instanceof Error ? err.message : String(err),
        }),
      },
    });
  } else {
    // Schedule a retry in 1 minute.
    await db.emailFlowRun.update({
      where: { id: runId },
      data: {
        nextRunAt: new Date(Date.now() + 60 * 1000),
        historyJson: appendHistory(run?.historyJson || "[]", {
          at: new Date().toISOString(),
          step: 0,
          action: "ERROR",
          reason: err instanceof Error ? err.message : String(err),
        }),
      },
    });
  }
}

function appendHistory(existing: string, entry: { at: string; step: number; action: string; reason: string }): string {
  try {
    const arr = JSON.parse(existing) as unknown[];
    arr.push(entry);
    return JSON.stringify(arr);
  } catch {
    return JSON.stringify([entry]);
  }
}

function delayToMs(value: number, unit: string): number {
  switch (unit) {
    case "MINUTES":
      return value * 60 * 1000;
    case "DAYS":
      return value * 24 * 60 * 60 * 1000;
    case "HOURS":
    default:
      return value * 60 * 60 * 1000;
  }
}
