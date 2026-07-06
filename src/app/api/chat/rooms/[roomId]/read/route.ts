import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/chat/rooms/[roomId]/read
 * -----------------------------------
 * Mark all messages in the room as read for the current user by
 * advancing their per-membership lastReadAt cursor to NOW.
 *
 * Called by the client whenever:
 *   - The user opens the room (initial mount)
 *   - The user receives a `chat:new-message` event while viewing
 *     the room (so the unread badge doesn't tick up)
 *
 * Returns the new lastReadAt timestamp.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ roomId: string }> },
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
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  const { roomId } = await params;

  // Find the membership row. If it doesn't exist, the user isn't in
  // the room — return 403.
  const membership = await db.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: me.id } },
    select: { id: true, leftAt: true },
  });
  if (!membership || membership.leftAt) {
    return NextResponse.json(
      { error: "You are not a member of this room." },
      { status: 403 },
    );
  }

  const now = new Date();
  await db.chatRoomMember.update({
    where: { id: membership.id },
    data: { lastReadAt: now },
  });

  return NextResponse.json({
    ok: true,
    lastReadAt: now.toISOString(),
  });
}
