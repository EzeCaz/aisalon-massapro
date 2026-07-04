/**
 * Stage definitions for the 5-stage email orchestrator.
 *
 * The orchestrator sends a sequence of 5 emails around each event, timed
 * relative to the event's `startsAt`. Each stage has:
 *   - a number (1..5)
 *   - an offset (hours from event.startsAt — negative = before event)
 *   - a name + slug
 *   - a "stopIfNotOpenedHours" rule: if the email is sent but not opened
 *     within this many hours, the worker SKIPS all subsequent stages for
 *     this RSVP. Null = no stop rule.
 *
 * Stage timing (relative to event.startsAt):
 *   1. Awareness   — sent immediately on RSVP        (offset: -240h = 10 days before)
 *   2. Reminder    — sent 48h before event           (offset: -48h)
 *   3. Final Prep  — sent 4h before event            (offset: -4h)
 *   4. Day-Of      — sent at event start             (offset:  0h)
 *   5. Recap       — sent 24h after event            (offset: +24h)
 *
 * Stop-awareness:
 *   - Stage 1 (Awareness) has stopIfNotOpenedHours = 5
 *     → if the user doesn't open the awareness email within 5 hours of
 *       being sent, stages 2-5 are SKIPPED. This avoids spamming
 *       disengaged users.
 *   - Stage 2 (Reminder) has stopIfNotOpenedHours = 24
 *     → if reminder not opened within 24h (i.e. by event time), skip
 *       stages 3-5.
 *   - Stages 3-5 have NO stop rule (they fire unconditionally if reached).
 */

export type StageConfig = {
  stage: number;
  name: string;
  slug: string;
  /** Hours from event.startsAt. Negative = before event. */
  offsetHours: number;
  /** If set: skip all subsequent stages when this stage's email isn't
   * opened within this many hours of being SENT. */
  stopIfNotOpenedHours: number | null;
  description: string;
};

export const STAGES: readonly StageConfig[] = [
  {
    stage: 1,
    name: "Awareness",
    slug: "awareness",
    offsetHours: -240, // 10 days before
    stopIfNotOpenedHours: 5,
    description:
      "Sent shortly after RSVP. Introduces the event, speakers, and what to expect. If not opened within 5 hours, all subsequent stages are skipped (don't spam disengaged users).",
  },
  {
    stage: 2,
    name: "Reminder",
    slug: "reminder",
    offsetHours: -48, // 2 days before
    stopIfNotOpenedHours: 24,
    description:
      "Sent 48 hours before event. Recap of agenda + logistics. If not opened within 24h, stages 3-5 are skipped.",
  },
  {
    stage: 3,
    name: "Final Prep",
    slug: "final-prep",
    offsetHours: -4, // 4 hours before
    stopIfNotOpenedHours: null,
    description:
      "Sent 4 hours before event. Final logistics: venue address, check-in code, what to bring.",
  },
  {
    stage: 4,
    name: "Day-Of",
    slug: "day-of",
    offsetHours: 0, // at event start
    stopIfNotOpenedHours: null,
    description:
      "Sent at event start. Live links, chat room, real-time updates.",
  },
  {
    stage: 5,
    name: "Recap",
    slug: "recap",
    offsetHours: 24, // 24h after
    stopIfNotOpenedHours: null,
    description:
      "Sent 24 hours after event. Thank-you, recordings, next-event teaser.",
  },
] as const;

export const STAGE_COUNT = STAGES.length;

/** Get a stage config by its 1-indexed stage number. */
export function getStage(stage: number): StageConfig | undefined {
  return STAGES.find((s) => s.stage === stage);
}

/** Compute the scheduled fire time for a stage given an event's startsAt. */
export function scheduledFor(startsAt: Date, stage: number): Date | null {
  const cfg = getStage(stage);
  if (!cfg) return null;
  return new Date(startsAt.getTime() + cfg.offsetHours * 60 * 60 * 1000);
}

/** Get the next stage after the given one, or null if this was the last. */
export function nextStage(stage: number): number | null {
  return stage < STAGE_COUNT ? stage + 1 : null;
}

/** Human-readable label for a status. */
export function statusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "QUEUED":
      return "Queued";
    case "SENT":
      return "Sent";
    case "OPENED":
      return "Opened";
    case "CLICKED":
      return "Clicked";
    case "SKIPPED":
      return "Skipped";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}
