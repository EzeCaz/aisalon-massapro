import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * PATCH /api/admin/quiz/[id]/questions/[questionId]
 * ---------------------------------------------------
 * Edit a single question. Any subset of the editable fields may be sent;
 * omitted fields are left untouched.
 *
 * Body (all optional):
 *   - text: string
 *   - options: string[]
 *   - correctIndex: number
 *   - deepDive: string | null
 *   - sourceAreaId: string | null
 *   - timeLimitSec: number | null
 *   - enabled: boolean
 *
 * If `options` is sent, `correctIndex` is re-validated against the new
 * options length.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
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

  const { id, questionId } = await params;
  const existingSession = await db.quizSession.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existingSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (existingSession.status === "FINISHED" || existingSession.status === "ABORTED") {
    return NextResponse.json(
      { error: `Session is ${existingSession.status} — cannot edit questions` },
      { status: 400 },
    );
  }

  const existingQuestion = await db.quizQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      sessionId: true,
      optionsJson: true,
      correctIndex: true,
    },
  });
  if (!existingQuestion || existingQuestion.sessionId !== id) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
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

  const data: Record<string, unknown> = {};

  if (typeof body.text === "string") {
    const text = body.text.trim();
    if (!text || text.length > 1000) {
      return NextResponse.json(
        { error: "Question text must be 1-1000 chars" },
        { status: 400 },
      );
    }
    data.text = text;
  }

  // Options + correctIndex are validated together so the correctIndex
  // stays within the new bounds.
  let finalOptions: string[] | null = null;
  if (Array.isArray(body.options)) {
    if (body.options.length < 2 || body.options.length > 6) {
      return NextResponse.json(
        { error: "Options must have 2-6 entries" },
        { status: 400 },
      );
    }
    const clean = body.options.map((o) =>
      typeof o === "string" ? o.trim() : "",
    );
    if (clean.some((o) => !o || o.length > 200)) {
      return NextResponse.json(
        { error: "Each option must be 1-200 chars" },
        { status: 400 },
      );
    }
    finalOptions = clean;
    data.optionsJson = JSON.stringify(clean);
  }

  if (typeof body.correctIndex === "number") {
    const optionsCount = finalOptions
      ? finalOptions.length
      : JSON.parse(existingQuestion.optionsJson).length;
    if (body.correctIndex < 0 || body.correctIndex >= optionsCount) {
      return NextResponse.json(
        { error: `correctIndex must be in [0, ${optionsCount})` },
        { status: 400 },
      );
    }
    data.correctIndex = body.correctIndex;
  } else if (finalOptions) {
    // Options changed but correctIndex wasn't sent — make sure the
    // existing index is still valid. If it's out of bounds, clamp to 0
    // (the host must explicitly pick the right one).
    if (existingQuestion.correctIndex >= finalOptions.length) {
      data.correctIndex = 0;
    }
  }

  if (body.deepDive !== undefined) {
    data.deepDive =
      typeof body.deepDive === "string" && body.deepDive.trim()
        ? body.deepDive.trim().slice(0, 2000)
        : null;
  }
  if (body.sourceAreaId !== undefined) {
    data.sourceAreaId =
      typeof body.sourceAreaId === "string" && body.sourceAreaId.trim()
        ? body.sourceAreaId.trim().slice(0, 100)
        : null;
  }
  if (body.timeLimitSec !== undefined) {
    data.timeLimitSec =
      typeof body.timeLimitSec === "number"
        ? Math.max(5, Math.min(300, Math.round(body.timeLimitSec)))
        : null;
  }
  if (typeof body.enabled === "boolean") {
    data.enabled = body.enabled;
  }

  const updated = await db.quizQuestion.update({
    where: { id: questionId },
    data,
  });

  return NextResponse.json({
    question: {
      ...updated,
      options: JSON.parse(updated.optionsJson) as string[],
      optionsJson: undefined,
    },
  });
}

/**
 * DELETE /api/admin/quiz/[id]/questions/[questionId]
 * ----------------------------------------------------
 * Permanently remove a question. Re-orders the remaining questions to
 * keep the `order` field contiguous (so the question bank doesn't have
 * gaps). Also decrements the parent session's totalQuestions.
 *
 * Forbid deletion if the session is FINISHED/ABORTED (historical record).
 * Also forbid deleting a question that is currently the live one — the
 * host should advance past it first.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
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

  const { id, questionId } = await params;
  const existingSession = await db.quizSession.findUnique({
    where: { id },
    select: { id: true, status: true, currentQuestionIndex: true },
  });
  if (!existingSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (existingSession.status === "FINISHED" || existingSession.status === "ABORTED") {
    return NextResponse.json(
      { error: `Session is ${existingSession.status} — cannot delete questions` },
      { status: 400 },
    );
  }

  const existingQuestion = await db.quizQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, sessionId: true, order: true },
  });
  if (!existingQuestion || existingQuestion.sessionId !== id) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  // Don't allow deleting the currently-live question — would put the
  // session in an inconsistent state. Host should advance past it first.
  if (
    existingSession.currentQuestionIndex === existingQuestion.order &&
    (existingSession.status === "LIVE" || existingSession.status === "BETWEEN")
  ) {
    return NextResponse.json(
      { error: "Cannot delete the question that is currently live" },
      { status: 400 },
    );
  }

  await db.$transaction(async (tx) => {
    await tx.quizQuestion.delete({ where: { id: questionId } });
    // Re-number subsequent questions so `order` stays contiguous
    await tx.quizQuestion.updateMany({
      where: { sessionId: id, order: { gt: existingQuestion.order } },
      data: { order: { decrement: 1 } },
    });
    // Recompute totalQuestions
    const count = await tx.quizQuestion.count({ where: { sessionId: id } });
    await tx.quizSession.update({
      where: { id },
      data: {
        totalQuestions: count,
        // If we deleted a question before the current index, shift the
        // current index down to keep pointing at the same question.
        currentQuestionIndex:
          existingSession.currentQuestionIndex != null &&
          existingQuestion.order < existingSession.currentQuestionIndex
            ? existingSession.currentQuestionIndex - 1
            : existingSession.currentQuestionIndex,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
