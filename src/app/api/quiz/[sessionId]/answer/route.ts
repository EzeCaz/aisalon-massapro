import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { scoreResponse } from "@/lib/quiz/quiz-scoring";

/**
 * POST /api/quiz/[sessionId]/answer
 * ---------------------------------
 * Submit an answer for the current question.
 *
 * Body:
 *   { questionId: string, selectedIndex: number (0..3) }
 *
 * Validation:
 *   - User must be signed in
 *   - User must have joined the session (have a QuizParticipant row)
 *   - Session status must be "LIVE"
 *   - The questionId must match the session's currentQuestionIndex
 *   - The user must NOT have already answered (unique constraint)
 *   - selectedIndex must be in [0, options.length)
 *
 * Scoring (Kahoot-style):
 *   - responseMs = now - currentQuestionStartedAt
 *   - isCorrect = selectedIndex === question.correctIndex
 *   - points = scoreResponse({ isCorrect, responseMs, questionTimeLimitMs })
 *
 * Side effects:
 *   - Creates QuizResponse row
 *   - Updates QuizParticipant: totalScore += points, correctCount++,
 *     answeredCount++, avgResponseMs (rolling)
 *
 * The route returns the user's own result (correct? + points) WITHOUT
 * revealing the correct answer — that comes via the WebSocket broadcast
 * when the host advances to the reveal stage.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { sessionId } = await params;
  const quiz = await db.quizSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      currentQuestionIndex: true,
      currentQuestionStartedAt: true,
      questionTimeLimitSec: true,
    },
  });
  if (!quiz) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (quiz.status !== "LIVE") {
    return NextResponse.json(
      { error: `Session is ${quiz.status} — cannot answer` },
      { status: 400 },
    );
  }
  if (quiz.currentQuestionIndex == null || !quiz.currentQuestionStartedAt) {
    return NextResponse.json(
      { error: "No active question right now" },
      { status: 400 },
    );
  }

  let body: { questionId?: string; selectedIndex?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.questionId || typeof body.selectedIndex !== "number") {
    return NextResponse.json(
      { error: "questionId and selectedIndex are required" },
      { status: 400 },
    );
  }

  const participant = await db.quizParticipant.findUnique({
    where: {
      sessionId_userId: { sessionId: quiz.id, userId: me.id },
    },
    select: { id: true, totalScore: true, correctCount: true, answeredCount: true, avgResponseMs: true },
  });
  if (!participant) {
    return NextResponse.json(
      { error: "You haven't joined this session" },
      { status: 400 },
    );
  }

  // Fetch the question — must match the current index
  const question = await db.quizQuestion.findUnique({
    where: { id: body.questionId },
    select: {
      id: true,
      sessionId: true,
      order: true,
      optionsJson: true,
      correctIndex: true,
      enabled: true,
      timeLimitSec: true,
    },
  });
  if (!question || question.sessionId !== quiz.id) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  if (question.order !== quiz.currentQuestionIndex) {
    return NextResponse.json(
      { error: "Question is not the current one" },
      { status: 400 },
    );
  }
  if (!question.enabled) {
    return NextResponse.json(
      { error: "Question is disabled" },
      { status: 400 },
    );
  }

  const options = JSON.parse(question.optionsJson) as string[];
  if (body.selectedIndex < 0 || body.selectedIndex >= options.length) {
    return NextResponse.json(
      { error: `selectedIndex must be in [0, ${options.length})` },
      { status: 400 },
    );
  }

  // Compute score
  const now = Date.now();
  const responseMs = now - quiz.currentQuestionStartedAt.getTime();
  const isCorrect = body.selectedIndex === question.correctIndex;
  const questionTimeLimitMs =
    (question.timeLimitSec ?? quiz.questionTimeLimitSec) * 1000;
  const { points } = scoreResponse({
    isCorrect,
    responseMs,
    questionTimeLimitMs,
  });

  // Create the response (unique constraint prevents double-answer)
  try {
    await db.quizResponse.create({
      data: {
        sessionId: quiz.id,
        questionId: question.id,
        participantId: participant.id,
        selectedIndex: body.selectedIndex,
        isCorrect,
        responseMs,
        points,
      },
    });
  } catch (err: unknown) {
    // P2002 = unique constraint violation
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "You already answered this question" },
        { status: 409 },
      );
    }
    throw err;
  }

  // Update participant aggregates
  const newAnsweredCount = participant.answeredCount + 1;
  const newCorrectCount = participant.correctCount + (isCorrect ? 1 : 0);
  const newTotalScore = participant.totalScore + points;
  // Rolling average: (oldAvg * oldCount + newResponse) / newCount
  const oldAvg = participant.avgResponseMs ?? 0;
  const oldCount = participant.answeredCount;
  const newAvgResponseMs = oldCount === 0
    ? responseMs
    : Math.round((oldAvg * oldCount + responseMs) / newAnsweredCount);

  await db.quizParticipant.update({
    where: { id: participant.id },
    data: {
      totalScore: newTotalScore,
      correctCount: newCorrectCount,
      answeredCount: newAnsweredCount,
      avgResponseMs: newAvgResponseMs,
      isOnline: true,
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    result: {
      isCorrect,
      points,
      responseMs,
    },
    // Don't reveal correctIndex yet — host reveals via WebSocket
  });
}
