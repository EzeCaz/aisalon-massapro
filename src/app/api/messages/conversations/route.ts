import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/messages/conversations
 * Returns the list of conversations the current user has with other users.
 * Each conversation includes:
 *   - the other user (id, name, email, photoUrl, image, tags)
 *   - lastMessage (body, createdAt, senderId)
 *   - unreadCount (messages from the other user that are not yet read)
 *
 * The list is ordered by the most recent message timestamp desc.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });

  // All messages where I'm either sender or recipient.
  const messages = await db.conversationMessage.findMany({
    where: {
      OR: [{ senderId: me.id }, { recipientId: me.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          email: true,
          photoUrl: true,
          image: true,
          tags: { select: { id: true, label: true, color: true } },
        },
      },
      recipient: {
        select: {
          id: true,
          name: true,
          email: true,
          photoUrl: true,
          image: true,
          tags: { select: { id: true, label: true, color: true } },
        },
      },
    },
  });

  // Group messages by partner (the "other" user in each message).
  const byPartner = new Map<
    string,
    {
      partner: (typeof messages)[number]["sender"];
      lastMessage: (typeof messages)[number];
      unreadCount: number;
    }
  >();

  for (const m of messages) {
    const isSender = m.senderId === me.id;
    const partner = isSender ? m.recipient : m.sender;
    if (!partner) continue;
    const existing = byPartner.get(partner.id);
    const isUnread = !isSender && m.readAt === null;
    if (!existing) {
      byPartner.set(partner.id, {
        partner,
        lastMessage: m,
        unreadCount: isUnread ? 1 : 0,
      });
    } else {
      if (isUnread) existing.unreadCount += 1;
      // lastMessage is already the newest because messages are ordered desc
      // and we saw this partner for the first time on its newest message.
    }
  }

  const conversations = Array.from(byPartner.values()).sort(
    (a, b) =>
      new Date(b.lastMessage.createdAt).getTime() -
      new Date(a.lastMessage.createdAt).getTime()
  );

  return NextResponse.json({ conversations, currentUserId: me.id });
}
