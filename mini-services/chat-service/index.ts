/**
 * Chat WebSocket Service
 * ----------------------
 * Port: 3004
 *
 * Real-time relay layer for the community chat feature. Mirrors the
 * quiz-service (port 3003) pattern: stateless relay, no DB access,
 * all auth + persistence happens in Next.js REST endpoints.
 *
 * Rooms (socket.io rooms — clients join via `chat:join`):
 *   - `chat:room:<roomId>`   — one per ChatRoom (event rooms + future
 *                              group rooms). Broadcasts: new message,
 *                              typing, presence, message-edited,
 *                              message-deleted, member-joined,
 *                              member-left.
 *   - `chat:user:<userId>`   — one per user. Broadcasts: dm-received
 *                              (when someone DMs them), unread-count
 *                              (live badge refresh), room-invite.
 *
 * Client → Server events:
 *   - `chat:join`         { userId, displayName, role }
 *        ↑ Join the user's personal room. Sent ONCE on connect.
 *   - `chat:room:join`    { roomId }
 *        ↑ Join a chat room. Server also adds the socket to
 *          `chat:room:<roomId>`.
 *   - `chat:room:leave`   { roomId }
 *   - `chat:room:typing`  { roomId, isTyping }
 *        ↑ Broadcast to the room so others see "X is typing…".
 *   - `chat:heartbeat`    {}   (every 25s — keeps connection fresh)
 *
 * Server → Client events (broadcast by the Next.js API routes AFTER
 * the DB mutation succeeds — they POST to a local admin endpoint on
 * this service which then emits. In V1 we use a simpler pattern: the
 * client that sent the message tells the server to broadcast via the
 * `chat:relay:new-message` event below, since the client already has
 * the message row from the REST response):
 *   - `chat:new-message`     { roomId, message }
 *   - `chat:message-edited`  { roomId, messageId, body, editedAt }
 *   - `chat:message-deleted` { roomId, messageId }
 *   - `chat:typing`          { roomId, userId, displayName, isTyping }
 *   - `chat:presence`        { roomId, userId, isOnline }
 *   - `chat:member-joined`   { roomId, member }
 *   - `chat:member-left`     { roomId, userId }
 *   - `chat:dm-received`     { message }       (to recipient's personal room)
 *   - `chat:unread-count`    { total }         (to recipient's personal room)
 *
 * Relay events (client → server, broadcast to room):
 *   - `chat:relay:new-message`     { roomId, message }
 *   - `chat:relay:message-edited`  { roomId, messageId, body, editedAt }
 *   - `chat:relay:message-deleted` { roomId, messageId }
 *   - `chat:relay:dm-sent`         { recipientId, message }
 *
 *   These are emitted by the SENDER client right after the REST POST
 *   succeeds. The server re-broadcasts them to the appropriate room(s)
 *   so OTHER clients (the recipient, or other members of a group room)
 *   see the update. We trust the sender because:
 *     a. The REST endpoint already validated + persisted the message.
 *     b. The relay payload includes the message row from the REST
 *        response, so receivers get the canonical data.
 *     c. Receivers re-fetch from REST on receiving the WS event, so
 *        even if a malicious client sends a bogus relay, the worst
 *        case is an unnecessary fetch.
 */

import { createServer } from "http";
import { Server, Socket } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy uses it to forward.
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Types ────────────────────────────────────────────────────────────
interface JoinPayload {
  userId: string;
  displayName: string;
  role: string;
}

interface RoomPayload {
  roomId: string;
}

interface TypingPayload {
  roomId: string;
  isTyping: boolean;
}

interface RelayMessagePayload {
  roomId: string;
  message: unknown; // The full ChatMessage row from the REST response
}

interface RelayEditPayload {
  roomId: string;
  messageId: string;
  body: string;
  editedAt: string;
}

interface RelayDeletePayload {
  roomId: string;
  messageId: string;
}

interface RelayDmPayload {
  recipientId: string;
  message: unknown; // The full ConversationMessage row
}

// ── State ────────────────────────────────────────────────────────────
/**
 * In-memory map of socket.id → { userId, displayName, role }.
 * Used to: clean up on disconnect, look up the user for a relay event,
 * and broadcast presence changes.
 *
 * Lost on restart — that's OK, clients auto-reconnect + re-join via
 * `chat:join` on the next /state fetch.
 */
interface SocketInfo {
  userId: string;
  displayName: string;
  role: string;
  // Set of room IDs this socket is currently in (so we can emit
  // member-left on disconnect).
  rooms: Set<string>;
}
const socketInfo = new Map<string, SocketInfo>();

function userRoom(userId: string): string {
  return `chat:user:${userId}`;
}
function chatRoomName(roomId: string): string {
  return `chat:room:${roomId}`;
}

// ── Connection handler ───────────────────────────────────────────────
io.on("connection", (socket: Socket) => {
  console.log(`[chat-ws] connected: ${socket.id}`);

  // ── Personal room join — sent once on connect ─────────────────────
  socket.on("chat:join", (payload: JoinPayload) => {
    if (!payload?.userId) return;
    const info: SocketInfo = {
      userId: payload.userId,
      displayName: payload.displayName || "(unknown)",
      role: payload.role || "MEMBER",
      rooms: new Set(),
    };
    socketInfo.set(socket.id, info);
    socket.join(userRoom(payload.userId));
    console.log(
      `[chat-ws] ${info.displayName} (${info.role}) connected — personal room joined`,
    );
  });

  // ── Room join / leave ─────────────────────────────────────────────
  socket.on("chat:room:join", (payload: RoomPayload) => {
    if (!payload?.roomId) return;
    const info = socketInfo.get(socket.id);
    if (!info) return;
    socket.join(chatRoomName(payload.roomId));
    info.rooms.add(payload.roomId);
    // Tell the room a member is now online. The client uses this to
    // show a green dot next to the member's name.
    socket.to(chatRoomName(payload.roomId)).emit("chat:presence", {
      roomId: payload.roomId,
      userId: info.userId,
      displayName: info.displayName,
      isOnline: true,
    });
    console.log(
      `[chat-ws] ${info.displayName} joined room ${payload.roomId}`,
    );
  });

  socket.on("chat:room:leave", (payload: RoomPayload) => {
    if (!payload?.roomId) return;
    const info = socketInfo.get(socket.id);
    socket.leave(chatRoomName(payload.roomId));
    if (info) {
      info.rooms.delete(payload.roomId);
      socket.to(chatRoomName(payload.roomId)).emit("chat:presence", {
        roomId: payload.roomId,
        userId: info.userId,
        displayName: info.displayName,
        isOnline: false,
      });
    }
  });

  // ── Typing indicator ──────────────────────────────────────────────
  socket.on("chat:room:typing", (payload: TypingPayload) => {
    if (!payload?.roomId) return;
    const info = socketInfo.get(socket.id);
    if (!info) return;
    socket.to(chatRoomName(payload.roomId)).emit("chat:typing", {
      roomId: payload.roomId,
      userId: info.userId,
      displayName: info.displayName,
      isTyping: payload.isTyping,
    });
  });

  // ── Heartbeat ─────────────────────────────────────────────────────
  socket.on("chat:heartbeat", () => {
    // Just keeps the connection alive — no state change. The REST
    // /api/chat/rooms endpoint bumps lastSeenAt if needed.
  });

  // ── Relay events (sender → other clients in the room) ─────────────
  // The sender has ALREADY persisted the message via REST; this just
  // tells everyone else to refresh.

  socket.on("chat:relay:new-message", (payload: RelayMessagePayload) => {
    if (!payload?.roomId || !payload?.message) return;
    socket.to(chatRoomName(payload.roomId)).emit("chat:new-message", {
      roomId: payload.roomId,
      message: payload.message,
    });
  });

  socket.on("chat:relay:message-edited", (payload: RelayEditPayload) => {
    if (!payload?.roomId || !payload?.messageId) return;
    socket.to(chatRoomName(payload.roomId)).emit("chat:message-edited", {
      roomId: payload.roomId,
      messageId: payload.messageId,
      body: payload.body,
      editedAt: payload.editedAt,
    });
  });

  socket.on("chat:relay:message-deleted", (payload: RelayDeletePayload) => {
    if (!payload?.roomId || !payload?.messageId) return;
    socket.to(chatRoomName(payload.roomId)).emit("chat:message-deleted", {
      roomId: payload.roomId,
      messageId: payload.messageId,
    });
  });

  // ── DM relay ──────────────────────────────────────────────────────
  // The sender persisted a 1:1 DM via /api/messages/[userId]. They
  // emit this event so the recipient's InboxButton updates live.
  socket.on("chat:relay:dm-sent", (payload: RelayDmPayload) => {
    if (!payload?.recipientId || !payload?.message) return;
    socket.to(userRoom(payload.recipientId)).emit("chat:dm-received", {
      message: payload.message,
    });
    // Also nudge the recipient to refresh their unread count.
    socket.to(userRoom(payload.recipientId)).emit("chat:unread-count", {});
  });

  // ── Disconnect — clean up presence ────────────────────────────────
  socket.on("disconnect", () => {
    const info = socketInfo.get(socket.id);
    if (info) {
      // Notify every room the user was in that they're now offline.
      for (const roomId of info.rooms) {
        socket.to(chatRoomName(roomId)).emit("chat:presence", {
          roomId,
          userId: info.userId,
          displayName: info.displayName,
          isOnline: false,
        });
      }
      console.log(
        `[chat-ws] ${info.displayName} disconnected — left ${info.rooms.size} room(s)`,
      );
    }
    socketInfo.delete(socket.id);
  });

  socket.on("error", (error: unknown) => {
    console.error(`[chat-ws] socket error (${socket.id}):`, error);
  });
});

// ── Start ────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3004;
httpServer.listen(PORT, () => {
  console.log(`[chat-ws] WebSocket server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[chat-ws] SIGTERM — shutting down");
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[chat-ws] SIGINT — shutting down");
  httpServer.close(() => process.exit(0));
});
