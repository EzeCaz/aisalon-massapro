/**
 * Flow trigger — creates EmailFlowRun rows when a trigger event fires.
 *
 * Called from:
 *   - RSVP creation (RSVP_GOING)
 *   - Door check-in (DOOR_CHECKED_IN)
 *   - Attendance mark (MARKED_ATTENDED / MARKED_NO_SHOW)
 *   - Manual admin add (MANUAL)
 *
 * For each ACTIVE flow whose triggerKind matches, creates an
 * EmailFlowRun row with status=ACTIVE and nextRunAt=now() (so the
 * worker picks it up on the next tick).
 *
 * Idempotent: if a run already exists for the same (flowId, rsvpId),
 * returns silently. This prevents duplicate runs when the same trigger
 * fires twice (e.g. RSVP updated from MAYBE to GOING).
 */

import { db } from "@/lib/db";

export type TriggerKind =
  | "RSVP_GOING"
  | "DOOR_CHECKED_IN"
  | "MARKED_ATTENDED"
  | "MARKED_NO_SHOW"
  | "MANUAL";

export type TriggerInput = {
  rsvpId: string;
  triggerKind: TriggerKind;
  /** Optional: admin user who triggered this (for MANUAL). */
  adminUserId?: string;
};

/**
 * Find all ACTIVE flows matching the trigger kind + event, and create
 * EmailFlowRun rows for each (idempotent on flowId+rsvpId).
 *
 * Returns the number of new runs created.
 */
export async function triggerFlowsForRsvp(input: TriggerInput): Promise<{
  created: number;
  skipped: number;
  flowIds: string[];
}> {
  // Load the RSVP + event to figure out which flows match.
  const rsvp = await db.eventRsvp.findUnique({
    where: { id: input.rsvpId },
    select: {
      id: true,
      eventId: true,
      userId: true,
      email: true,
      status: true,
    },
  });
  if (!rsvp) {
    return { created: 0, skipped: 0, flowIds: [] };
  }

  // Find matching ACTIVE flows: triggerKind matches AND
  // (triggerEventId IS NULL OR triggerEventId = rsvp.eventId).
  const flows = await db.emailFlow.findMany({
    where: {
      status: "ACTIVE",
      triggerKind: input.triggerKind,
      OR: [
        { triggerEventId: null },
        { triggerEventId: rsvp.eventId },
      ],
    },
    select: { id: true, name: true },
  });

  if (flows.length === 0) {
    return { created: 0, skipped: 0, flowIds: [] };
  }

  // Idempotency check: skip flows that already have a run for this RSVP.
  const existingRuns = await db.emailFlowRun.findMany({
    where: {
      rsvpId: rsvp.id,
      flowId: { in: flows.map((f) => f.id) },
    },
    select: { flowId: true },
  });
  const existingFlowIds = new Set(existingRuns.map((r) => r.flowId));
  const newFlows = flows.filter((f) => !existingFlowIds.has(f.id));

  if (newFlows.length === 0) {
    return { created: 0, skipped: flows.length, flowIds: [] };
  }

  // Create new runs in parallel.
  const now = new Date();
  const created = await Promise.all(
    newFlows.map((flow) =>
      db.emailFlowRun.create({
        data: {
          flowId: flow.id,
          userId: rsvp.userId,
          rsvpId: rsvp.id,
          eventId: rsvp.eventId,
          currentStepPosition: 1,
          status: "ACTIVE",
          nextRunAt: now,
          historyJson: JSON.stringify([
            {
              at: now.toISOString(),
              step: 0,
              action: "TRIGGER",
              reason: `${input.triggerKind} → flow ${flow.name}`,
            },
          ]),
        },
      }),
    ),
  );

  return {
    created: created.length,
    skipped: existingFlowIds.size,
    flowIds: created.map((r) => r.id),
  };
}

/**
 * Manually trigger a flow for a specific RSVP (admin action).
 * Bypasses the trigger kind check — useful for re-running a flow
 * after fixing a bug.
 */
export async function manuallyTriggerFlow(flowId: string, rsvpId: string, adminUserId: string): Promise<{
  ok: boolean;
  runId?: string;
  reason?: string;
}> {
  const flow = await db.emailFlow.findUnique({
    where: { id: flowId },
    select: { id: true, name: true, status: true },
  });
  if (!flow) return { ok: false, reason: "flow not found" };
  if (flow.status !== "ACTIVE") return { ok: false, reason: `flow status is ${flow.status}` };

  const rsvp = await db.eventRsvp.findUnique({
    where: { id: rsvpId },
    select: { id: true, userId: true, eventId: true },
  });
  if (!rsvp) return { ok: false, reason: "rsvp not found" };

  // Idempotency: don't create duplicate runs.
  const existing = await db.emailFlowRun.findFirst({
    where: { flowId, rsvpId: rsvp.id },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "run already exists for this flow+rsvp" };

  const now = new Date();
  const run = await db.emailFlowRun.create({
    data: {
      flowId,
      userId: rsvp.userId,
      rsvpId: rsvp.id,
      eventId: rsvp.eventId,
      currentStepPosition: 1,
      status: "ACTIVE",
      nextRunAt: now,
      historyJson: JSON.stringify([
        {
          at: now.toISOString(),
          step: 0,
          action: "MANUAL_TRIGGER",
          reason: `Manually triggered by ${adminUserId}`,
        },
      ]),
    },
  });

  return { ok: true, runId: run.id };
}
