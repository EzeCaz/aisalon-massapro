import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/quiz/[sessionId]/join
 * -------------------------------
 * Join a quiz session. Idempotent: if the user has already joined,
 * returns the existing participant row.
 *
 * Side effects:
 *   - Creates QuizParticipant row (or upserts if already exists)
 *   - Copies displayName + avatarUrl from the User row so the
 *     leaderboard doesn't break if the user later changes their name
 *   - Sets isOnline = true, lastSeenAt = now
 *
 * Returns the participant row + the WebSocket room name to subscribe to.
 */

export async function POST(
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
    select: { id: true, status: true },
  });
  if (!quiz) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Only allow joining when the session is in a joinable state
  const joinable = new Set(["LOBBY", "LIVE", "PAUSED", "BETWEEN"]);
  if (!joinable.has(quiz.status)) {
    return NextResponse.json(
      {
        error: `Session is ${quiz.status} — cannot join`,
        status: quiz.status,
      },
      { status: 400 },
    );
  }

  const displayName = me.name || me.email.split("@")[0];
  const avatarUrl = me.photoUrl || me.image || null;

  const participant = await db.quizParticipant.upsert({
    where: {
      sessionId_userId: { sessionId: quiz.id, userId: me.id },
    },
    create: {
      sessionId: quiz.id,
      userId: me.id,
      displayName,
      avatarUrl,
      isOnline: true,
      lastSeenAt: new Date(),
    },
    update: {
      isOnline: true,
      lastSeenAt: new Date(),
      // Don't overwrite displayName if the user changed it — leaderboard
      // snapshots the name at join time. Admin can manually re-sync if
      // requested.
    },
  });

  return NextResponse.json({
    participant,
    wsRoom: `quiz:${quiz.id}`,
  });
}
