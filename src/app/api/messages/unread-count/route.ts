import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/messages/unread-count
 * Returns the number of unread direct messages for the current user.
 * Used to drive the pulsating badge on the inbox icon.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ count: 0 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!me) return NextResponse.json({ count: 0 });

  const count = await db.conversationMessage.count({
    where: { recipientId: me.id, readAt: null },
  });

  return NextResponse.json({ count });
}
