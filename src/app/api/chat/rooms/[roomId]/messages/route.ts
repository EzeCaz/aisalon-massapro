import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/chat/rooms/[roomId]/messages?cursor=<iso>&limit=50
 * ------------------------------------------------------------
 * Paginated message history for a chat room. Newest-first via cursor
 * pagination (cursor = the oldest message's createdAt from the
 * previous page). Returns messages in chronological order so the
 * client can render top-to-bottom.
 *
 * Auth: caller must be an active member of the room (membership row
 * exists and leftAt is null). Admins bypass the membership check.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  const { roomId } = await params;
  const room = await db.chatRoom.findUnique({
    where: { id: roomId },
    select: { id: true, archivedAt: true },
  });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.archivedAt) {
    return NextResponse.json(
      { error: "This room has been archived." },
      { status: 410 },
    );
  }

  // Membership check (admins bypass).
  const isAdmin = me.role === "SUPER_ADMIN" || me.role === "ADMIN";
  if (!isAdmin) {
    const membership = await db.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: me.id } },
      select: { leftAt: true },
    });
    if (!membership || membership.leftAt) {
      return NextResponse.json(
        { error: "You are not a member of this room." },
        { status: 403 },
      );
    }
  }

  // Cursor pagination.
  const url = new URL(req.url);
  const cursorIso = url.searchParams.get("cursor");
  const limit = Math.min(
    100,
    Math.max(20, Number(url.searchParams.get("limit") ?? 50)),
  );

  const messages = await db.chatMessage.findMany({
    where: {
      roomId,
      // Cursor = "show me messages OLDER than this timestamp".
      createdAt: cursorIso ? { lt: new Date(cursorIso) } : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      roomId: true,
      senderId: true,
      sender: {
        select: {
          id: true,
          name: true,
          photoUrl: true,
          image: true,
          role: true,
        },
      },
      body: true,
      editedAt: true,
      deletedAt: true,
      replyToId: true,
      createdAt: true,
    },
  });

  // Reverse so client can render top-to-bottom.
  messages.reverse();

  // The cursor for the next page is the OLDEST message's createdAt
  // (which is messages[0] after reverse, since we fetched desc then
  // reversed). If we got fewer than `limit`, there's no next page.
  const nextCursor =
    messages.length === limit && messages.length > 0
      ? messages[0].createdAt.toISOString()
      : null;

  return NextResponse.json({
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
    })),
    nextCursor,
  });
}

/**
 * POST /api/chat/rooms/[roomId]/messages
 * ---------------------------------------
 * Body: { body: string, replyToId?: string }
 *
 * Inserts a new ChatMessage. Returns the full row (with sender info)
 * so the client can immediately render it AND relay it via the WS
 * service to other room members.
 *
 * The caller's client is responsible for emitting
 * `chat:relay:new-message` to the WS service after this POST
 * succeeds — the WS service then broadcasts to other sockets in the
 * room. This keeps the WS service stateless.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      image: true,
      role: true,
    },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  const { roomId } = await params;
  const room = await db.chatRoom.findUnique({
    where: { id: roomId },
    select: { id: true, archivedAt: true },
  });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.archivedAt) {
    return NextResponse.json(
      { error: "This room has been archived." },
      { status: 410 },
    );
  }

  // Membership check (admins bypass).
  const isAdmin = me.role === "SUPER_ADMIN" || me.role === "ADMIN";
  if (!isAdmin) {
    const membership = await db.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: me.id } },
      select: { leftAt: true },
    });
    if (!membership || membership.leftAt) {
      return NextResponse.json(
        { error: "You are not a member of this room." },
        { status: 403 },
      );
    }
  }

  let payload: { body?: unknown; replyToId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "Message body is required" },
      { status: 400 },
    );
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: "Message too long (max 4000 characters)" },
      { status: 400 },
    );
  }

  // If replyToId is provided, validate it belongs to the same room.
  if (payload.replyToId && typeof payload.replyToId === "string") {
    const parent = await db.chatMessage.findUnique({
      where: { id: payload.replyToId },
      select: { roomId: true },
    });
    if (!parent || parent.roomId !== roomId) {
      return NextResponse.json(
        { error: "Reply-to message must be in the same room." },
        { status: 400 },
      );
    }
  }

  const msg = await db.chatMessage.create({
    data: {
      roomId,
      senderId: me.id,
      body: text,
      replyToId:
        typeof payload.replyToId === "string" ? payload.replyToId : null,
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          photoUrl: true,
          image: true,
          role: true,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    message: {
      ...msg,
      createdAt: msg.createdAt.toISOString(),
      editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
      deletedAt: msg.deletedAt ? msg.deletedAt.toISOString() : null,
    },
  });
}
