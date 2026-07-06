import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { generateFlourishingQuizQuestions } from "@/lib/quiz/quiz-content";

/**
 * GET /api/admin/quiz
 * -------------------
 * List all quiz sessions. Admin-only.
 *
 * Returns sessions ordered by createdAt DESC, with the host's name and
 * a `_count` of participants + questions for the list view.
 */
export async function GET() {
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

  const sessions = await db.quizSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      host: { select: { id: true, name: true, email: true } },
      event: { select: { id: true, title: true, slug: true } },
      _count: {
        select: { questions: true, participants: true, responses: true },
      },
    },
  });

  return NextResponse.json({ sessions });
}

/**
 * POST /api/admin/quiz
 * --------------------
 * Create a new quiz session.
 *
 * Body:
 *   - title: string (required, 1..200 chars)
 *   - eventId: string | null (optional — links to an Event)
 *   - questionTimeLimitSec: number (optional, default 30, range 5..300)
 *
 * Side effect: seeds the session with the full question bank from
 * generateFlourishingQuizQuestions(). The admin can later toggle
 * individual questions off via PUT /api/admin/quiz/[id]/questions/[qid].
 */
export async function POST(req: Request) {
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

  let body: {
    title?: string;
    eventId?: string | null;
    questionTimeLimitSec?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = (body.title || "").trim();
  if (!title || title.length > 200) {
    return NextResponse.json(
      { error: "Title is required (1-200 chars)" },
      { status: 400 },
    );
  }

  const questionTimeLimitSec = Math.max(
    5,
    Math.min(300, body.questionTimeLimitSec ?? 30),
  );

  // Validate optional eventId
  let eventId: string | null = null;
  if (body.eventId) {
    const event = await db.event.findUnique({ where: { id: body.eventId } });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    eventId = event.id;
  }

  // Generate the question set
  const questions = generateFlourishingQuizQuestions();

  const created = await db.quizSession.create({
    data: {
      title,
      eventId,
      hostId: me.id,
      questionTimeLimitSec,
      totalQuestions: questions.length,
      contentSource: "resource:ai-human-flourishing",
      questions: {
        create: questions.map((q, i) => ({
          order: i,
          text: q.text,
          optionsJson: JSON.stringify(q.options),
          correctIndex: q.correctIndex,
          deepDive: q.deepDive,
          sourceAreaId: q.sourceAreaId,
          enabled: true,
          timeLimitSec: q.timeLimitSec,
        })),
      },
    },
    include: {
      _count: { select: { questions: true, participants: true } },
    },
  });

  return NextResponse.json({ session: created }, { status: 201 });
}
