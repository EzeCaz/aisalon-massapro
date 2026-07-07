import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMeId } from "@/lib/session-user";

/**
 * GET /api/messages/unread-count
 * Returns the number of unread direct messages for the current user.
 * Used to drive the pulsating badge on the inbox icon.
 *
 * PERF: getMeId() verifies the JWT id against the DB on the first call
 * (one indexed lookup), then caches the verified id on the session
 * object so subsequent calls in the same request skip the check.
 * Falls back to an email lookup if the JWT id is missing or stale.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ count: 0 });
  }
  const meId = await getMeId(session);
  if (!meId) return NextResponse.json({ count: 0 });

  const count = await db.conversationMessage.count({
    where: { recipientId: meId, readAt: null },
  });

  return NextResponse.json(
    { count },
    // Allow the browser to dedupe near-simultaneous polls and soften
    // burst latency. Safe because the value is per-user and the WS
    // pushes live updates anyway.
    { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } },
  );
}
