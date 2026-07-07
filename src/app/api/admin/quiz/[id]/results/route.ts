import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * GET /api/admin/quiz/[id]/results
 * ---------------------------------
 * Full "end-of-quiz summary" payload for the admin Control Room:
 *
 *   - session metadata (title, status, startedAt, finishedAt, …)
 *   - final leaderboard (participants sorted by score; first 3 flagged
 *     as podium)
 *   - per-question breakdown: for every question, the correct answer +
 *     the full response matrix (one row per participant: selectedIndex
 *     or null if they didn't answer, isCorrect, responseMs, points,
 *     answeredAt).
 *
 * Admin-only (requires the `quiz.host` permission).
 *
 * The payload is shaped so the client can render the entire results
 * view in one pass — no extra round-trips per question.
 */
export async function GET(
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
  const quiz = await db.quizSession.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      questionTimeLimitSec: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      totalQuestions: true,
      _count: { select: { responses: true, participants: true } },
    },
  });
  if (!quiz) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // ── Participants (final leaderboard) ────────────────────────────
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
      joinedAt: true,
    },
  });

  const leaderboard = participants.map((p, i) => ({
    ...p,
    rank: i + 1,
    isPodium: i < 3,
  }));

  // ── Questions + every response ──────────────────────────────────
  const questions = await db.quizQuestion.findMany({
    where: { sessionId: quiz.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      text: true,
      optionsJson: true,
      correctIndex: true,
      deepDive: true,
      sourceAreaId: true,
      enabled: true,
      timeLimitSec: true,
      responses: {
        select: {
          id: true,
          participantId: true,
          selectedIndex: true,
          isCorrect: true,
          responseMs: true,
          points: true,
          answeredAt: true,
        },
      },
    },
  });

  const questionBreakdown = questions.map((q) => {
    const options = JSON.parse(q.optionsJson) as string[];
    // Index responses by participantId so we can fill "no answer" rows.
    const byParticipant = new Map<
      string,
      {
        id: string;
        selectedIndex: number | null;
        isCorrect: boolean;
        responseMs: number | null;
        points: number;
        answeredAt: string;
      }
    >();
    for (const r of q.responses) {
      byParticipant.set(r.participantId, {
        id: r.id,
        selectedIndex: r.selectedIndex,
        isCorrect: r.isCorrect,
        responseMs: r.responseMs,
        points: r.points,
        answeredAt: r.answeredAt.toISOString(),
      });
    }

    // Build a row for every participant (even those who didn't answer)
    // so the admin sees the full picture.
    const responses = leaderboard.map((p) => {
      const r = byParticipant.get(p.id);
      return {
        participantId: p.id,
        displayName: p.displayName,
        rank: p.rank,
        answered: !!r,
        selectedIndex: r?.selectedIndex ?? null,
        isCorrect: r?.isCorrect ?? false,
        responseMs: r?.responseMs ?? null,
        points: r?.points ?? 0,
        answeredAt: r?.answeredAt ?? null,
      };
    });

    // Aggregate stats for the question header
    const totalAnswered = responses.filter((r) => r.answered).length;
    const totalCorrect = responses.filter((r) => r.isCorrect).length;
    const distribution = new Array(options.length).fill(0);
    for (const r of responses) {
      if (r.selectedIndex != null && r.selectedIndex >= 0 && r.selectedIndex < options.length) {
        distribution[r.selectedIndex]++;
      }
    }

    return {
      id: q.id,
      order: q.order,
      text: q.text,
      options,
      correctIndex: q.correctIndex,
      deepDive: q.deepDive,
      sourceAreaId: q.sourceAreaId,
      enabled: q.enabled,
      timeLimitSec: q.timeLimitSec,
      totalAnswered,
      totalCorrect,
      totalParticipants: leaderboard.length,
      distribution,
      responses,
    };
  });

  return NextResponse.json({
    session: quiz,
    leaderboard,
    questions: questionBreakdown,
  });
}
