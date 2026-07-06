import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * POST /api/admin/quiz/[id]/clear-responses
 * -----------------------------------------
 * Wipe every QuizResponse row for this session + zero out the
 * participant score counters (totalScore, correctCount, answeredCount,
 * avgResponseMs). The participant rows themselves are preserved so the
 * roster stays intact.
 *
 * Use cases:
 *   - "I want a clean leaderboard but want to keep the same players
 *      registered."
 *   - "I made a mistake on a question and want to re-ask it without
 *      the old answers polluting the scores."
 *
 * Unlike /restart, this endpoint does NOT change the session status —
 * the host can call it on a DRAFT session (pre-launch sanity reset)
 * or on a LIVE session (emergency mid-flight reset, though they'd
 * usually Abort + Restart instead).
 *
 * Admin/super-admin/co-host only.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me || !can(me.role, "quiz.host")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.quizSession.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const [wiped, _reset] = await db.$transaction([
    db.quizResponse.deleteMany({ where: { sessionId: id } }),
    db.quizParticipant.updateMany({
      where: { sessionId: id },
      data: {
        totalScore: 0,
        correctCount: 0,
        answeredCount: 0,
        avgResponseMs: null,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    wipedResponses: wiped.count,
  });
}
