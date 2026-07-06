/**
 * Quiz Scoring — Kahoot-style
 * ---------------------------
 * Points formula:
 *   - Wrong answer or no answer: 0 points
 *   - Correct answer: base 500 + speed bonus up to 500
 *   - Speed bonus scales linearly with remaining time:
 *       speedBonus = round(500 * (1 - responseMs / questionTimeLimitMs))
 *       clamped to [0, 500]
 *   - Total per-question max: 1000 points
 *
 * The "Fastest Responder" bonus is purely positional (top-3 fastest
 * correct answers get a small extra: +50/+30/+20) — applied at the
 * end of question scoring, not stored per-response.
 */

export interface ScoreInput {
  isCorrect: boolean;
  responseMs: number | null; // null = no answer
  questionTimeLimitMs: number;
}

export interface ScoreResult {
  points: number;
  base: number;
  speedBonus: number;
}

export function scoreResponse(input: ScoreInput): ScoreResult {
  if (!input.isCorrect || input.responseMs == null) {
    return { points: 0, base: 0, speedBonus: 0 };
  }
  const base = 500;
  const ratio = Math.max(
    0,
    Math.min(1, 1 - input.responseMs / input.questionTimeLimitMs),
  );
  const speedBonus = Math.round(500 * ratio);
  return { points: base + speedBonus, base, speedBonus };
}

/**
 * Compute the "fastest responder" positional bonus for the top-3
 * correct answers in a single question. Returns a map of
 * participantId → bonus points.
 *
 *   1st fastest: +50
 *   2nd fastest: +30
 *   3rd fastest: +20
 */
export function fastestResponderBonus(
  correctResponses: Array<{ participantId: string; responseMs: number }>,
): Record<string, number> {
  const sorted = [...correctResponses].sort((a, b) => a.responseMs - b.responseMs);
  const bonus: Record<string, number> = {};
  const tiers = [50, 30, 20];
  sorted.slice(0, 3).forEach((r, i) => {
    bonus[r.participantId] = tiers[i];
  });
  return bonus;
}
