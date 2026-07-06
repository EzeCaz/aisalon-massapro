import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * GET /api/admin/quiz/[id]
 * ------------------------
 * Full session detail — questions, participants, current state.
 * Admin-only.
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
    include: {
      host: { select: { id: true, name: true, email: true } },
      event: { select: { id: true, title: true, slug: true } },
      questions: { orderBy: { order: "asc" } },
      participants: {
        orderBy: { totalScore: "desc" },
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          totalScore: true,
          correctCount: true,
          answeredCount: true,
          avgResponseMs: true,
          isOnline: true,
          lastSeenAt: true,
          joinedAt: true,
          userId: true,
        },
      },
      _count: { select: { responses: true } },
    },
  });

  if (!quiz) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const questions = quiz.questions.map((q) => ({
    ...q,
    options: JSON.parse(q.optionsJson) as string[],
    optionsJson: undefined,
  }));

  return NextResponse.json({
    session: {
      ...quiz,
      questions,
    },
  });
}

/**
 * PATCH /api/admin/quiz/[id]
 * --------------------------
 * Update session-level fields. Used by the Control Room for: start
 * lobby, start question, advance, pause, resume, finish, abort.
 */
export async function PATCH(
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
  const existing = await db.quizSession.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let body: {
    title?: string;
    status?: string;
    questionTimeLimitSec?: number;
    currentQuestionIndex?: number | null;
    currentQuestionStartedAt?: Date | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim().slice(0, 200);
  }
  if (typeof body.status === "string") {
    const valid = new Set([
      "DRAFT",
      "LOBBY",
      "LIVE",
      "PAUSED",
      "BETWEEN",
      "FINISHED",
      "ABORTED",
    ]);
    if (!valid.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (typeof body.questionTimeLimitSec === "number") {
    data.questionTimeLimitSec = Math.max(
      5,
      Math.min(300, body.questionTimeLimitSec),
    );
  }
  if (body.currentQuestionIndex !== undefined) {
    data.currentQuestionIndex = body.currentQuestionIndex;
  }
  if (body.currentQuestionStartedAt !== undefined) {
    data.currentQuestionStartedAt = body.currentQuestionStartedAt;
  }
  if (body.startedAt !== undefined) {
    data.startedAt = body.startedAt;
  }
  if (body.finishedAt !== undefined) {
    data.finishedAt = body.finishedAt;
  }

  const updated = await db.quizSession.update({
    where: { id },
    data,
  });

  return NextResponse.json({ session: updated });
}

/**
 * DELETE /api/admin/quiz/[id]
 * ---------------------------
 * Permanently delete a session. Cascade-deletes questions, responses,
 * participants. No undo.
 */
export async function DELETE(
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
  const existing = await db.quizSession.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await db.quizSession.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
