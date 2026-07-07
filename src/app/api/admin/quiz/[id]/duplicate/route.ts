import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * POST /api/admin/quiz/[id]/duplicate
 * -----------------------------------
 * Create a brand-new QuizSession in DRAFT status with the same title
 * (suffixed " (copy)"), question time limit, event link, content source,
 * host, and a deep copy of every QuizQuestion (text, optionsJson,
 * correctIndex, deepDive, sourceAreaId, enabled, timeLimitSec, order).
 *
 * The new session is completely independent — running it does NOT
 * affect the original. Participants + responses are NOT copied (the
 * duplicate starts with a clean slate).
 *
 * Use cases:
 *   - "I want to run this quiz again next month without re-typing all
 *      the questions."
 *   - "I want to experiment with editing the question set without
 *      destroying the version I already ran."
 *
 * Admin/super-admin/co-host only.
 *
 * Query params:
 *   ?title=...  Override the default " (copy)" suffix with a custom
 *               title for the duplicate.
 */
export async function POST(
  req: Request,
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
  const source = await db.quizSession.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
    },
  });
  if (!source) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Optional custom title via ?title=
  const url = new URL(req.url);
  const customTitle = url.searchParams.get("title")?.trim().slice(0, 200);
  const newTitle =
    customTitle ||
    `${source.title.slice(0, 193)} (copy)`;

  // Create the new session + copy all questions in one transaction so
  // we never end up with a half-duplicated session.
  const duplicate = await db.$transaction(async (tx) => {
    const created = await tx.quizSession.create({
      data: {
        title: newTitle,
        eventId: source.eventId,
        hostId: me.id, // the duplicating user becomes the host of the new session
        contentSource: source.contentSource,
        questionTimeLimitSec: source.questionTimeLimitSec,
        totalQuestions: source.questions.length,
        status: "DRAFT",
      },
    });

    // Bulk-insert the questions. Prisma's createMany lets us do this in
    // one round-trip instead of N.
    if (source.questions.length > 0) {
      await tx.quizQuestion.createMany({
        data: source.questions.map((q) => ({
          sessionId: created.id,
          order: q.order,
          text: q.text,
          optionsJson: q.optionsJson,
          correctIndex: q.correctIndex,
          deepDive: q.deepDive,
          sourceAreaId: q.sourceAreaId,
          enabled: q.enabled,
          timeLimitSec: q.timeLimitSec,
        })),
      });
    }

    return created;
  });

  return NextResponse.json({
    ok: true,
    session: duplicate,
    duplicatedQuestions: source.questions.length,
  });
}
