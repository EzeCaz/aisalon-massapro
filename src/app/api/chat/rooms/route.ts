import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/chat/rooms
 * -------------------
 * List every chat room the current user is a member of (and hasn't
 * left). Includes per-room unread count + last message preview so the
 * UI can render a WhatsApp-style room list.
 *
 * Returns:
 *   {
 *     rooms: [
 *       {
 *         id, type, title, eventId, description, createdAt,
 *         unreadCount, lastReadAt,
 *         lastMessage: { id, body, senderName, createdAt } | null,
 *         memberCount,
 *       },
 *       ...
 *     ]
 *   }
 *
 * Sorted by lastMessage.createdAt desc (rooms with no messages sort
 * by createdAt desc).
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
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  // Fetch all memberships + room info + last message in one query.
  const memberships = await db.chatRoomMember.findMany({
    where: { userId: me.id, leftAt: null, room: { archivedAt: null } },
    include: {
      room: {
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          eventId: true,
          createdAt: true,
          event: {
            select: { id: true, title: true, slug: true, startsAt: true },
          },
          _count: { select: { members: { where: { leftAt: null } } } },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              body: true,
              createdAt: true,
              sender: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { room: { updatedAt: "desc" } },
  });

  // For each membership, compute unread count (messages newer than
  // lastReadAt, not sent by me, not deleted).
  const rooms = await Promise.all(
    memberships.map(async (m) => {
      const lastReadAt = m.lastReadAt;
      const unreadCount = await db.chatMessage.count({
        where: {
          roomId: m.roomId,
          createdAt: lastReadAt ? { gt: lastReadAt } : undefined,
          senderId: { not: me.id },
          deletedAt: null,
        },
      });
      const lastMsg = m.room.messages[0];
      return {
        id: m.room.id,
        type: m.room.type,
        title: m.room.title,
        description: m.room.description,
        eventId: m.room.eventId,
        event: m.room.event,
        createdAt: m.room.createdAt.toISOString(),
        lastReadAt: lastReadAt ? lastReadAt.toISOString() : null,
        unreadCount,
        memberCount: m.room._count.members,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              body: lastMsg.body,
              createdAt: lastMsg.createdAt.toISOString(),
              senderId: lastMsg.sender?.id ?? null,
              senderName: lastMsg.sender?.name ?? "System",
            }
          : null,
      };
    }),
  );

  // Sort: rooms with a lastMessage by lastMessage.createdAt desc,
  // then rooms with no messages by createdAt desc.
  rooms.sort((a, b) => {
    const aTs = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bTs = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    if (aTs !== bTs) return bTs - aTs;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return NextResponse.json({ rooms });
}
