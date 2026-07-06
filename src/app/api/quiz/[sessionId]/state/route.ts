import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/quiz/[sessionId]/state
 * -------------------------------
 * Public-ish: returns the live state of the quiz session for a member's
 * device to render. Auth is required (member must be signed in) but no
 * admin permission is needed.
 *
 * Returns:
 *   - session: { id, title, status, currentQuestionIndex, questionTimeLimitSec,
 *                totalQuestions, startedAt, finishedAt }
 *   - currentQuestion: when status === "LIVE", the question text + 4
 *     options (with index scrambled per-participant? — for V1 we keep
 *     option order identical to the admin's source). The correctIndex
 *     is NOT included.
 *   - me: the participant row for the signed-in user (if they've joined)
 *
 * Question reveal logic:
 *   - DRAFT    → "Waiting for host to start"
 *   - LOBBY    → "Waiting in lobby"
 *   - LIVE     → show question text + options + remaining time
 *   - PAUSED   → "Question paused"
 *   - BETWEEN  → "Showing leaderboard / next question coming up"
 *   - FINISHED → show final leaderboard
 *   - ABORTED  → "Session ended"
 */

const ALLOWED_STATUSES = new Set([
  "DRAFT",
  "LOBBY",
  "LIVE",
  "PAUSED",
  "BETWEEN",
  "FINISHED",
  "ABORTED",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, photoUrl: true, image: true },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { sessionId } = await params;
  const quiz = await db.quizSession.findUnique({
    where: { id: sessionId },
    include: {
      questions: {
        where: { enabled: true },
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          text: true,
          optionsJson: true,
          timeLimitSec: true,
          sourceAreaId: true,
        },
      },
    },
  });
  if (!quiz) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Find the participant row for the signed-in user (if they've joined)
  const participant = await db.quizParticipant.findUnique({
    where: {
      sessionId_userId: { sessionId: quiz.id, userId: me.id },
    },
    select: {
      id: true,
      displayName: true,
      totalScore: true,
      correctCount: true,
      answeredCount: true,
      avgResponseMs: true,
      isOnline: true,
      joinedAt: true,
    },
  });

  // Mark them as online + bump lastSeenAt (best-effort — don't block on failure)
  if (participant) {
    await db.quizParticipant
      .update({
        where: { id: participant.id },
        data: { isOnline: true, lastSeenAt: new Date() },
      })
      .catch(() => {
        /* ignore — non-critical */
      });
  }

  // Determine current question
  let currentQuestion: {
    id: string;
    order: number;
    text: string;
    options: string[];
    timeLimitSec: number;
    sourceAreaId: string | null;
    startedAt: Date | null;
    remainingMs: number | null;
  } | null = null;

  if (
    quiz.status === "LIVE" &&
    quiz.currentQuestionIndex != null &&
    quiz.currentQuestionIndex >= 0 &&
    quiz.currentQuestionIndex < quiz.questions.length
  ) {
    const q = quiz.questions[quiz.currentQuestionIndex];
    const timeLimitSec = q.timeLimitSec ?? quiz.questionTimeLimitSec;
    const startedAt = quiz.currentQuestionStartedAt;
    const now = Date.now();
    const elapsedMs = startedAt ? now - startedAt.getTime() : 0;
    const remainingMs = Math.max(0, timeLimitSec * 1000 - elapsedMs);
    currentQuestion = {
      id: q.id,
      order: q.order,
      text: q.text,
      options: JSON.parse(q.optionsJson) as string[],
      timeLimitSec,
      sourceAreaId: q.sourceAreaId,
      startedAt,
      remainingMs,
    };
  }

  // Check if the participant has already answered the current question
  let myAnswer: { selectedIndex: number; isCorrect: boolean; points: number } | null = null;
  if (currentQuestion && participant) {
    const response = await db.quizResponse.findUnique({
      where: {
        questionId_participantId: {
          questionId: currentQuestion.id,
          participantId: participant.id,
        },
      },
      select: { selectedIndex: true, isCorrect: true, points: true },
    });
    if (response) {
      myAnswer = response;
    }
  }

  // Compute my rank in the leaderboard (if I'm a participant)
  let myRank: { rank: number; total: number } | null = null;
  if (participant) {
    const higher = await db.quizParticipant.count({
      where: {
        sessionId: quiz.id,
        totalScore: { gt: participant.totalScore },
      },
    });
    const total = await db.quizParticipant.count({
      where: { sessionId: quiz.id },
    });
    myRank = { rank: higher + 1, total };
  }

  return NextResponse.json({
    session: {
      id: quiz.id,
      title: quiz.title,
      status: ALLOWED_STATUSES.has(quiz.status) ? quiz.status : "DRAFT",
      currentQuestionIndex: quiz.currentQuestionIndex,
      questionTimeLimitSec: quiz.questionTimeLimitSec,
      totalQuestions: quiz.totalQuestions,
      enabledQuestionsCount: quiz.questions.length,
      startedAt: quiz.startedAt,
      finishedAt: quiz.finishedAt,
    },
    currentQuestion,
    myAnswer,
    me: participant
      ? {
          ...participant,
          rank: myRank,
        }
      : null,
  });
}
