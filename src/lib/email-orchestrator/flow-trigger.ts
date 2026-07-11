/**
 * Flow trigger — creates EmailQueue rows when a trigger event fires.
 *
 * NEW MODEL (per-step entry-event triggers):
 *   Each EmailFlowStep has its own triggerKind (RSVP_GOING, DOOR_CHECKED_IN,
 *   etc.) and an optional audience filter. When a trigger event fires for an
 *   RSVP, we find all ACTIVE flow steps whose triggerKind matches AND
 *   (triggerEventId IS NULL OR triggerEventId = rsvp.eventId), check the
 *   audience filter, and if the RSVP email is in the audience, create an
 *   EmailQueue row scheduled to send after the step's delay.
 *
 * Called from:
 *   - RSVP creation (RSVP_GOING)
 *   - Door check-in (DOOR_CHECKED_IN)
 *   - Attendance mark (MARKED_ATTENDED / MARKED_NO_SHOW)
 *   - Manual admin add (MANUAL)
 *
 * Idempotent: if an EmailQueue row already exists for the same
 * (flowStepId, rsvpId), we skip creating a duplicate.
 */

import { db } from "@/lib/db";
import { resolveAudienceEmailsById } from "./audience-filter";

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

export type TriggerResult = {
  created: number;
  skipped: number;
  matchedSteps: number;
};

/**
 * Find all ACTIVE flow steps matching the trigger kind + event, and create
 * EmailQueue rows for each (idempotent on flowStepId + rsvpId).
 *
 * Returns the number of new queue rows created.
 */
export async function triggerFlowsForRsvp(input: TriggerInput): Promise<TriggerResult> {
  // Load the RSVP + event to figure out which steps match.
  const rsvp = await db.eventRsvp.findUnique({
    where: { id: input.rsvpId },
    select: {
      id: true,
      eventId: true,
      userId: true,
      email: true,
      name: true,
      status: true,
    },
  });
  if (!rsvp) {
    return { created: 0, skipped: 0, matchedSteps: 0 };
  }

  // Find matching ACTIVE flow steps:
  //   - step.triggerKind = input.triggerKind
  //   - step.flow.status = ACTIVE
  //   - (step.triggerEventId IS NULL OR step.triggerEventId = rsvp.eventId)
  //   - step.templateId IS NOT NULL (skip wait-only steps)
  const steps = await db.emailFlowStep.findMany({
    where: {
      triggerKind: input.triggerKind,
      templateId: { not: null },
      flow: { status: "ACTIVE" },
      OR: [
        { triggerEventId: null },
        { triggerEventId: rsvp.eventId },
      ],
    },
    include: {
      flow: { select: { id: true, name: true } },
      audience: { select: { id: true, emailsJson: true } },
      template: { select: { id: true, subject: true, htmlBody: true } },
    },
  });

  if (steps.length === 0) {
    return { created: 0, skipped: 0, matchedSteps: 0 };
  }

  // For each step, check the audience filter + idempotency, then create the
  // queue row.
  let created = 0;
  let skipped = 0;

  // Cache resolved audience email sets per step.audienceId (avoids re-resolving
  // the same DYNAMIC audience for every RSVP in a batch).
  const audienceEmailCache = new Map<string, Set<string>>();

  for (const step of steps) {
    // Audience filter: if step.audienceId is set, the RSVP email must be in
    // the audience's email list.
    if (step.audienceId && step.audience) {
      let emailSet = audienceEmailCache.get(step.audienceId);
      if (!emailSet) {
        const emails = await resolveAudienceEmailsById(step.audienceId);
        emailSet = new Set(emails);
        audienceEmailCache.set(step.audienceId, emailSet);
      }
      if (!emailSet.has(rsvp.email.toLowerCase())) {
        skipped++;
        continue;
      }
    }

    // Idempotency: skip if a queue row already exists for this step + RSVP.
    const existing = await db.emailQueue.findFirst({
      where: { flowStepId: step.id, rsvpId: rsvp.id },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Compute the scheduled send time = now + step.delay.
    const delayMs = delayToMs(step.delayValue, step.delayUnit);
    const scheduledFor = new Date(Date.now() + delayMs);

    // A/B subject assignment: 50/50 random.
    // If subjectVariantB is set, randomly pick A or B. Otherwise, A only.
    const subjectVariant = step.subjectVariantB
      ? (Math.random() < 0.5 ? "A" : "B")
      : "A";

    await db.emailQueue.create({
      data: {
        rsvpId: rsvp.id,
        eventId: rsvp.eventId,
        userId: rsvp.userId,
        email: rsvp.email,
        stage: step.position, // reuse stage field for step position (legacy)
        flowStepId: step.id,
        status: "PENDING",
        scheduledFor,
        subjectVariant,
        audienceId: step.audienceId,
      },
    });
    created++;
  }

  return {
    created,
    skipped,
    matchedSteps: steps.length,
  };
}

/**
 * Manually trigger a flow step for a specific RSVP (admin action).
 * Bypasses the trigger kind check — useful for re-running a step
 * after fixing a bug, or for MANUAL trigger kind steps.
 */
export async function manuallyTriggerStep(
  stepId: string,
  rsvpId: string,
  adminUserId: string,
): Promise<{ ok: boolean; queueId?: string; reason?: string }> {
  const step = await db.emailFlowStep.findUnique({
    where: { id: stepId },
    include: {
      flow: { select: { id: true, name: true, status: true } },
      audience: { select: { id: true, emailsJson: true } },
    },
  });
  if (!step) return { ok: false, reason: "step not found" };
  if (step.flow.status !== "ACTIVE") return { ok: false, reason: `flow status is ${step.flow.status}` };
  if (!step.templateId) return { ok: false, reason: "step has no template (wait-only)" };

  const rsvp = await db.eventRsvp.findUnique({
    where: { id: rsvpId },
    select: { id: true, userId: true, eventId: true, email: true, name: true },
  });
  if (!rsvp) return { ok: false, reason: "rsvp not found" };

  // Idempotency: don't create duplicate queue rows.
  const existing = await db.emailQueue.findFirst({
    where: { flowStepId: step.id, rsvpId: rsvp.id },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "queue row already exists for this step+rsvp" };

  // A/B subject assignment.
  const subjectVariant = step.subjectVariantB
    ? (Math.random() < 0.5 ? "A" : "B")
    : "A";

  const delayMs = delayToMs(step.delayValue, step.delayUnit);
  const scheduledFor = new Date(Date.now() + delayMs);

  const queue = await db.emailQueue.create({
    data: {
      rsvpId: rsvp.id,
      eventId: rsvp.eventId,
      userId: rsvp.userId,
      email: rsvp.email,
      stage: step.position,
      flowStepId: step.id,
      status: "PENDING",
      scheduledFor,
      subjectVariant,
      audienceId: step.audienceId,
    },
  });

  return { ok: true, queueId: queue.id };
}

/**
 * Manually trigger a flow step for ALL members of an audience.
 * This is the "send to test audience" action — creates queue rows for
 * every email in the audience, creating a synthetic RSVP per email if
 * one doesn't already exist for the chosen event.
 *
 * Used by the admin "Send to test audience" button.
 */
export async function manuallyTriggerStepForAudience(
  stepId: string,
  eventId: string,
  adminUserId: string,
): Promise<{ ok: boolean; created: number; skipped: number; reason?: string }> {
  const step = await db.emailFlowStep.findUnique({
    where: { id: stepId },
    include: {
      flow: { select: { id: true, name: true, status: true } },
      audience: { select: { id: true, name: true, kind: true } },
      template: { select: { id: true, subject: true } },
    },
  });
  if (!step) return { ok: false, created: 0, skipped: 0, reason: "step not found" };
  if (step.flow.status !== "ACTIVE") return { ok: false, created: 0, skipped: 0, reason: `flow status is ${step.flow.status}` };
  if (!step.templateId) return { ok: false, created: 0, skipped: 0, reason: "step has no template (wait-only)" };
  if (!step.audienceId || !step.audience) return { ok: false, created: 0, skipped: 0, reason: "step has no audience" };

  // Resolve audience emails (supports both STATIC and DYNAMIC audiences).
  const audienceEmails = await resolveAudienceEmailsById(step.audienceId);
  if (audienceEmails.length === 0) {
    return { ok: false, created: 0, skipped: 0, reason: "audience has no emails" };
  }

  // Find or create an RSVP for each audience email on the chosen event.
  // The event must exist.
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) return { ok: false, created: 0, skipped: 0, reason: "event not found" };

  let created = 0;
  let skipped = 0;

  for (const email of audienceEmails) {
    // Look up an existing RSVP for this email + event. If one exists, link
    // the queue row to it. If not, we leave rsvpId null — the queue row
    // uses the denormalized email/eventId/userId columns directly.
    // We deliberately DO NOT create a synthetic RSVP here. Creating RSVPs
    // just to satisfy the FK had the side-effect of polluting the event's
    // registrant list with hundreds of IMPORT rows whenever an admin sent
    // a flow email to an audience larger than the RSVP list.
    let rsvp: { id: string; userId: string | null } | null = await db.eventRsvp.findUnique({
      where: { eventId_email: { eventId: event.id, email } },
      select: { id: true, userId: true },
    });

    // Try to link a userId from the User table by email (so {{firstName}}
    // token replacement can use the user's name).
    let userId: string | null = rsvp?.userId ?? null;
    if (!userId) {
      const user = await db.user.findUnique({
        where: { email },
        select: { id: true },
      });
      userId = user?.id ?? null;
    }

    // Idempotency: skip if a queue row already exists for this step + RSVP.
    // If rsvp is null, fall back to (flowStepId, email) for dedup.
    const existing = rsvp
      ? await db.emailQueue.findFirst({
          where: { flowStepId: step.id, rsvpId: rsvp.id },
          select: { id: true },
        })
      : await db.emailQueue.findFirst({
          where: { flowStepId: step.id, email, rsvpId: null },
          select: { id: true },
        });
    if (existing) {
      skipped++;
      continue;
    }

    // A/B subject assignment.
    const subjectVariant = step.subjectVariantB
      ? (Math.random() < 0.5 ? "A" : "B")
      : "A";

    const delayMs = delayToMs(step.delayValue, step.delayUnit);
    const scheduledFor = new Date(Date.now() + delayMs);

    await db.emailQueue.create({
      data: {
        rsvpId: rsvp?.id ?? null,
        eventId: event.id,
        userId,
        email,
        stage: step.position,
        flowStepId: step.id,
        status: "PENDING",
        scheduledFor,
        subjectVariant,
        audienceId: step.audienceId,
      },
    });
    created++;
  }

  return { ok: true, created, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
