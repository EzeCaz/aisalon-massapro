import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * POST /api/admin/quiz/[id]/restart
 * ---------------------------------
 * Reset a FINISHED (or ABORTED) quiz session back to DRAFT so the host
 * can run it again. This is a "soft reset" — it preserves:
 *   - The session itself (id, title, event link, host, settings)
 *   - All QuizQuestion rows (so the host doesn't have to re-add them)
 *   - All QuizParticipant rows (so the same cohort stays registered —
 *     useful when running the same quiz back-to-back for the same room)
 *
 * It DOES wipe:
 *   - All QuizResponse rows (every answer ever submitted)
 *   - QuizParticipant.totalScore → 0
 *   - QuizParticipant.correctCount → 0
 *   - QuizParticipant.answeredCount → 0
 *   - QuizParticipant.avgResponseMs → null
 *   - QuizParticipant.isOnline → false (members will re-establish on
 *     their next /state fetch)
 *   - QuizSession.currentQuestionIndex → null
 *   - QuizSession.currentQuestionStartedAt → null
 *   - QuizSession.startedAt → null
 *   - QuizSession.finishedAt → null
 *   - QuizSession.status → "DRAFT"
 *
 * For a harder reset (delete participants too), the host should use the
 * "Clear responses" endpoint first, then call this. For a fully clean
 * copy with the same questions, use the "Duplicate" endpoint instead.
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

  // Forbid restarting an in-flight session — host must Finish or Abort
  // first. This avoids the footgun of wiping a LIVE quiz mid-question.
  const IN_FLIGHT = new Set(["LOBBY", "LIVE", "PAUSED", "BETWEEN"]);
  if (IN_FLIGHT.has(existing.status)) {
    return NextResponse.json(
      {
        error:
          "Session is still in flight — finish or abort it before restarting.",
      },
      { status: 409 },
    );
  }

  // Transaction: wipe responses + reset participant stats + reset session
  // state. Questions are untouched.
  const [wiped, _participantsReset, updated] = await db.$transaction([
    db.quizResponse.deleteMany({ where: { sessionId: id } }),
    db.quizParticipant.updateMany({
      where: { sessionId: id },
      data: {
        totalScore: 0,
        correctCount: 0,
        answeredCount: 0,
        avgResponseMs: null,
        isOnline: false,
      },
    }),
    db.quizSession.update({
      where: { id },
      data: {
        status: "DRAFT",
        currentQuestionIndex: null,
        currentQuestionStartedAt: null,
        startedAt: null,
        finishedAt: null,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    session: updated,
    wipedResponses: wiped.count,
  });
}
