/**
 * Branch evaluator for EmailFlowStep.branchRulesJson.
 *
 * A step's branch rules are stored as a JSON array of:
 *   { rule: BranchRule, action: BranchAction, targetStepPosition?: number }
 *
 * Rules are evaluated in order. The FIRST matching rule wins.
 * If no rules match, the default action is CONTINUE (proceed to next
 * step).
 *
 * Rule evaluation requires looking up the most recent EmailQueue row
 * for this run + step (to check openedAt / clickedAt) and the RSVP
 * state (for RSVP_CANCELLED / DOOR_CHECKED_IN / etc.).
 */

import type { Prisma } from "@prisma/client";

export type BranchRule =
  | "OPENED"
  | "NOT_OPENED"
  | "CLICKED"
  | "NOT_CLICKED"
  | "RSVP_CANCELLED"
  | "DOOR_CHECKED_IN"
  | "MARKED_ATTENDED"
  | "MARKED_NO_SHOW";

export type BranchAction = "HALT" | "GOTO" | "CONTINUE";

export type BranchRuleEntry = {
  rule: BranchRule;
  action: BranchAction;
  /** Required if action=GOTO. Must be > current step position. */
  targetStepPosition?: number;
  /** Optional human-readable note shown in admin history. */
  note?: string;
};

export type BranchContext = {
  /** Whether the last sent email was opened (within branchEvalDelayHours). */
  opened: boolean;
  /** Whether the last sent email was clicked. */
  clicked: boolean;
  /** Current RSVP state. */
  rsvpStatus: string; // GOING | MAYBE | NOT_GOING
  doorCheckedIn: boolean;
  attended: boolean;
  noShow: boolean;
};

/** Parse branch rules from JSON. Returns [] if empty/invalid. */
export function parseBranchRules(json: string | null | undefined): BranchRuleEntry[] {
  if (!json || !json.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed as BranchRuleEntry[];
  } catch {
    console.error("[flow-branches] invalid branchRulesJson:", json);
    return [];
  }
}

export type BranchEvalResult =
  | { action: "HALT"; reason: string }
  | { action: "GOTO"; targetStepPosition: number; reason: string }
  | { action: "CONTINUE"; reason: string };

/** Evaluate all branch rules. First match wins. */
export function evaluateBranches(
  rules: BranchRuleEntry[],
  ctx: BranchContext,
): BranchEvalResult {
  for (const rule of rules) {
    if (matches(rule.rule, ctx)) {
      const reason = rule.note || `rule=${rule.rule} action=${rule.action}`;
      if (rule.action === "HALT") {
        return { action: "HALT", reason };
      }
      if (rule.action === "GOTO" && rule.targetStepPosition) {
        return {
          action: "GOTO",
          targetStepPosition: rule.targetStepPosition,
          reason,
        };
      }
      return { action: "CONTINUE", reason };
    }
  }
  return { action: "CONTINUE", reason: "no branch rules matched" };
}

function matches(rule: BranchRule, ctx: BranchContext): boolean {
  switch (rule) {
    case "OPENED":
      return ctx.opened;
    case "NOT_OPENED":
      return !ctx.opened;
    case "CLICKED":
      return ctx.clicked;
    case "NOT_CLICKED":
      return !ctx.clicked;
    case "RSVP_CANCELLED":
      return ctx.rsvpStatus === "NOT_GOING";
    case "DOOR_CHECKED_IN":
      return ctx.doorCheckedIn;
    case "MARKED_ATTENDED":
      return ctx.attended;
    case "MARKED_NO_SHOW":
      return ctx.noShow;
    default:
      return false;
  }
}
