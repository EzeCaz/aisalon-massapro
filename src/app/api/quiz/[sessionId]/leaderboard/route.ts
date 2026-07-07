import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/quiz/[sessionId]/leaderboard
 * -------------------------------------
 * Public-ish: any signed-in user can fetch the live leaderboard for a
 * quiz session. Used by both the admin Control Room and the member
 * "Between questions" view.
 *
 * Returns participants sorted by totalScore DESC, with tiebreakers:
 *   1. Higher correctCount
 *   2. Lower avgResponseMs
 *   3. Earlier joinedAt
 *
 * Top 3 are flagged for the UI to render as "podium".
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const quiz = await db.quizSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, totalQuestions: true, finishedAt: true },
  });
  if (!quiz) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const participants = await db.quizParticipant.findMany({
    where: { sessionId: quiz.id },
    orderBy: [
      { totalScore: "desc" },
      { correctCount: "desc" },
      { avgResponseMs: "asc" },
      { joinedAt: "asc" },
    ],
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      totalScore: true,
      correctCount: true,
      answeredCount: true,
      avgResponseMs: true,
      isOnline: true,
      userId: true,
    },
  });

  // Compute per-question response counts for the "live answer distribution"
  // — used by the admin to see how the room is leaning.
  const questionIndex = await db.quizSession.findUnique({
    where: { id: quiz.id },
    select: { currentQuestionIndex: true },
  });

  let currentQuestionStats: {
    questionId: string;
    totalResponses: number;
    distribution: number[]; // length 4, count per option index
  } | null = null;

  if (questionIndex?.currentQuestionIndex != null) {
    const currentQ = await db.quizQuestion.findFirst({
      where: {
        sessionId: quiz.id,
        order: questionIndex.currentQuestionIndex,
      },
      select: {
        id: true,
        optionsJson: true,
        responses: {
          select: { selectedIndex: true },
        },
      },
    });
    if (currentQ) {
      const optionCount = (JSON.parse(currentQ.optionsJson) as string[]).length;
      const distribution = new Array(optionCount).fill(0);
      let totalResponses = 0;
      for (const r of currentQ.responses) {
        if (r.selectedIndex != null && r.selectedIndex >= 0 && r.selectedIndex < optionCount) {
          distribution[r.selectedIndex]++;
          totalResponses++;
        }
      }
      currentQuestionStats = {
        questionId: currentQ.id,
        totalResponses,
        distribution,
      };
    }
  }

  return NextResponse.json({
    session: {
      id: quiz.id,
      status: quiz.status,
      totalQuestions: quiz.totalQuestions,
      finishedAt: quiz.finishedAt,
    },
    participants: participants.map((p, i) => ({
      ...p,
      rank: i + 1,
      isPodium: i < 3,
    })),
    currentQuestionStats,
  });
}
