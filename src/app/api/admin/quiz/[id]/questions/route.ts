import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * GET /api/admin/quiz/[id]/questions
 * -----------------------------------
 * List all questions for a session, ordered by `order`. Admin-only.
 * Returns the full question text + options + correctIndex + deepDive
 * (this is the editor's source of truth — never expose this to members).
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
  const existing = await db.quizSession.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const questions = await db.quizQuestion.findMany({
    where: { sessionId: id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({
    questions: questions.map((q) => ({
      ...q,
      options: JSON.parse(q.optionsJson) as string[],
      optionsJson: undefined,
    })),
  });
}

/**
 * POST /api/admin/quiz/[id]/questions
 * ------------------------------------
 * Add a new question to the session. The new question is appended to the
 * end of the question bank (order = max(existing.order) + 1).
 *
 * Body:
 *   - text: string (required, 1..1000)
 *   - options: string[] (required, length 2..6, each 1..200 chars)
 *   - correctIndex: number (required, 0..options.length-1)
 *   - deepDive: string | null (optional, max 2000 chars)
 *   - sourceAreaId: string | null (optional, max 100 chars)
 *   - timeLimitSec: number | null (optional, 5..300)
 *   - enabled: boolean (optional, default true)
 *
 * Side effect: bumps the parent session's totalQuestions.
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
  const existing = await db.quizSession.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  // Forbid editing once the session is FINISHED or ABORTED — those are
  // historical records. DRAFT/LOBBY/LIVE/PAUSED/BETWEEN are all fine
  // (host can fix a typo mid-quiz if needed).
  if (existing.status === "FINISHED" || existing.status === "ABORTED") {
    return NextResponse.json(
      { error: `Session is ${existing.status} — cannot add questions` },
      { status: 400 },
    );
  }

  let body: {
    text?: string;
    options?: string[];
    correctIndex?: number;
    deepDive?: string | null;
    sourceAreaId?: string | null;
    timeLimitSec?: number | null;
    enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text || text.length > 1000) {
    return NextResponse.json(
      { error: "Question text is required (1-1000 chars)" },
      { status: 400 },
    );
  }

  const options = Array.isArray(body.options) ? body.options : [];
  if (options.length < 2 || options.length > 6) {
    return NextResponse.json(
      { error: "Options must have 2-6 entries" },
      { status: 400 },
    );
  }
  const cleanOptions = options.map((o) => (typeof o === "string" ? o.trim() : ""));
  if (cleanOptions.some((o) => !o || o.length > 200)) {
    return NextResponse.json(
      { error: "Each option must be 1-200 chars" },
      { status: 400 },
    );
  }

  if (
    typeof body.correctIndex !== "number" ||
    body.correctIndex < 0 ||
    body.correctIndex >= cleanOptions.length
  ) {
    return NextResponse.json(
      { error: `correctIndex must be in [0, ${cleanOptions.length})` },
      { status: 400 },
    );
  }

  const deepDive =
    typeof body.deepDive === "string" && body.deepDive.trim()
      ? body.deepDive.trim().slice(0, 2000)
      : null;
  const sourceAreaId =
    typeof body.sourceAreaId === "string" && body.sourceAreaId.trim()
      ? body.sourceAreaId.trim().slice(0, 100)
      : null;
  const timeLimitSec =
    typeof body.timeLimitSec === "number"
      ? Math.max(5, Math.min(300, Math.round(body.timeLimitSec)))
      : null;
  const enabled = body.enabled !== false; // default true

  // Append at the end
  const maxOrderRow = await db.quizQuestion.aggregate({
    where: { sessionId: id },
    _max: { order: true },
  });
  const nextOrder = (maxOrderRow._max.order ?? -1) + 1;

  const created = await db.$transaction(async (tx) => {
    const q = await tx.quizQuestion.create({
      data: {
        sessionId: id,
        order: nextOrder,
        text,
        optionsJson: JSON.stringify(cleanOptions),
        correctIndex: body.correctIndex as number,
        deepDive,
        sourceAreaId,
        timeLimitSec,
        enabled,
      },
    });
    await tx.quizSession.update({
      where: { id },
      data: { totalQuestions: nextOrder + 1 },
    });
    return q;
  });

  return NextResponse.json(
    {
      question: {
        ...created,
        options: JSON.parse(created.optionsJson) as string[],
        optionsJson: undefined,
      },
    },
    { status: 201 },
  );
}
