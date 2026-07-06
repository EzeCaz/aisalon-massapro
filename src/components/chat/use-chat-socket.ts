"use client";

/**
 * useChatSocket
 * --------------
 * React hook that manages the Socket.io connection to the chat
 * WebSocket service (mini-services/chat-service, port 3004).
 *
 * ONE hook manages TWO concerns:
 *   1. Personal room — the user's own `chat:user:<userId>` room.
 *      Receives: `chat:dm-received`, `chat:unread-count`.
 *      Always connected while the user is signed in.
 *   2. Active chat room — a `chat:room:<roomId>` the user is viewing.
 *      Receives: `chat:new-message`, `chat:typing`, `chat:presence`,
 *                 `chat:message-edited`, `chat:message-deleted`.
 *      Joined when `activeRoomId` is set, left when it changes/nulls.
 *
 * Connection URL: io("/?XTransformPort=3004")
 * (Caddy routes the request to mini-services/chat-service on port 3004)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export interface ChatMessagePayload {
  id: string;
  roomId: string;
  senderId: string | null;
  sender: {
    id: string;
    name: string | null;
    photoUrl: string | null;
    image: string | null;
    role: string;
  } | null;
  body: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToId: string | null;
  createdAt: string;
}

interface UseChatSocketArgs {
  userId: string | null;
  displayName?: string | null;
  role?: string | null;
  // The room the user is currently viewing (null = no room open).
  // The hook joins/leaves the corresponding socket.io room as this changes.
  activeRoomId?: string | null;
  // ── Personal-room callbacks (always on) ───────────────────────
  onDmReceived?: (message: ChatMessagePayload) => void;
  onUnreadCountChange?: () => void;
  // ── Active-room callbacks ─────────────────────────────────────
  onNewMessage?: (message: ChatMessagePayload) => void;
  onMessageEdited?: (payload: {
    roomId: string;
    messageId: string;
    body: string;
    editedAt: string;
  }) => void;
  onMessageDeleted?: (payload: { roomId: string; messageId: string }) => void;
  onTyping?: (payload: {
    roomId: string;
    userId: string;
    displayName: string;
    isTyping: boolean;
  }) => void;
  onPresence?: (payload: {
    roomId: string;
    userId: string;
    displayName: string;
    isOnline: boolean;
  }) => void;
}

export function useChatSocket({
  userId,
  displayName,
  role,
  activeRoomId,
  onDmReceived,
  onUnreadCountChange,
  onNewMessage,
  onMessageEdited,
  onMessageDeleted,
  onTyping,
  onPresence,
}: UseChatSocketArgs) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Keep the latest callbacks + activeRoomId in refs so the socket
  // listeners don't need to be re-attached on every render.
  const cbRef = useRef({
    onDmReceived,
    onUnreadCountChange,
    onNewMessage,
    onMessageEdited,
    onMessageDeleted,
    onTyping,
    onPresence,
  });
  cbRef.current = {
    onDmReceived,
    onUnreadCountChange,
    onNewMessage,
    onMessageEdited,
    onMessageDeleted,
    onTyping,
    onPresence,
  };

  // Track which room we're currently joined to so we can leave it
  // when activeRoomId changes.
  const joinedRoomRef = useRef<string | null>(null);

  // ── Connection lifecycle (depends only on userId) ───────────────
  useEffect(() => {
    if (!userId) return;

    const socket = io("/?XTransformPort=3004", {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      // Join the user's personal room (for DMs + unread count updates).
      socket.emit("chat:join", {
        userId,
        displayName: displayName || "(anonymous)",
        role: role || "MEMBER",
      });
      // If we have an active room at connect time, rejoin it (e.g.
      // after a transient disconnect).
      if (joinedRoomRef.current) {
        socket.emit("chat:room:join", { roomId: joinedRoomRef.current });
      }
    });

    socket.on("disconnect", () => setIsConnected(false));
    socket.on("connect_error", () => setIsConnected(false));

    // Personal-room events
    socket.on("chat:dm-received", (payload: { message: ChatMessagePayload }) => {
      cbRef.current.onDmReceived?.(payload.message);
    });
    socket.on("chat:unread-count", () => {
      cbRef.current.onUnreadCountChange?.();
    });

    // Active-room events
    socket.on(
      "chat:new-message",
      (payload: { roomId: string; message: ChatMessagePayload }) => {
        cbRef.current.onNewMessage?.(payload.message);
      },
    );
    socket.on(
      "chat:message-edited",
      (payload: {
        roomId: string;
        messageId: string;
        body: string;
        editedAt: string;
      }) => {
        cbRef.current.onMessageEdited?.(payload);
      },
    );
    socket.on(
      "chat:message-deleted",
      (payload: { roomId: string; messageId: string }) => {
        cbRef.current.onMessageDeleted?.(payload);
      },
    );
    socket.on(
      "chat:typing",
      (payload: {
        roomId: string;
        userId: string;
        displayName: string;
        isTyping: boolean;
      }) => {
        cbRef.current.onTyping?.(payload);
      },
    );
    socket.on(
      "chat:presence",
      (payload: {
        roomId: string;
        userId: string;
        displayName: string;
        isOnline: boolean;
      }) => {
        cbRef.current.onPresence?.(payload);
      },
    );

    // Heartbeat every 25s — keeps the connection from being killed
    // by intermediate proxies (Caddy has a 60s idle timeout).
    const hb = setInterval(() => {
      if (socket.connected) socket.emit("chat:heartbeat", {});
    }, 25_000);

    return () => {
      clearInterval(hb);
      socket.disconnect();
      socketRef.current = null;
      joinedRoomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, displayName, role]);

  // ── Active room join/leave (depends on activeRoomId) ────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !userId) return;

    // Leave the previous room.
    if (joinedRoomRef.current && joinedRoomRef.current !== activeRoomId) {
      socket.emit("chat:room:leave", { roomId: joinedRoomRef.current });
      joinedRoomRef.current = null;
    }

    // Join the new room (if any).
    if (activeRoomId && joinedRoomRef.current !== activeRoomId) {
      socket.emit("chat:room:join", { roomId: activeRoomId });
      joinedRoomRef.current = activeRoomId;
    }
  }, [activeRoomId, userId]);

  // ── Emit helpers ────────────────────────────────────────────────

  /**
   * Tell the WS service to broadcast a new message to OTHER clients
   * in the room. Call this AFTER the REST POST succeeds — the
   * message argument is the response body from /api/chat/rooms/[id]/messages.
   */
  const relayNewMessage = useCallback(
    (roomId: string, message: ChatMessagePayload) => {
      socketRef.current?.emit("chat:relay:new-message", { roomId, message });
    },
    [],
  );

  /**
   * Tell the WS service to broadcast an edit to other clients.
   */
  const relayMessageEdited = useCallback(
    (roomId: string, messageId: string, body: string, editedAt: string) => {
      socketRef.current?.emit("chat:relay:message-edited", {
        roomId,
        messageId,
        body,
        editedAt,
      });
    },
    [],
  );

  /**
   * Tell the WS service to broadcast a deletion to other clients.
   */
  const relayMessageDeleted = useCallback(
    (roomId: string, messageId: string) => {
      socketRef.current?.emit("chat:relay:message-deleted", {
        roomId,
        messageId,
      });
    },
    [],
  );

  /**
   * Tell the WS service to broadcast a DM to the recipient's personal
   * room. Call this AFTER the REST POST to /api/messages/[userId]
   * succeeds — `message` is the response body.
   */
  const relayDmSent = useCallback(
    (recipientId: string, message: ChatMessagePayload) => {
      socketRef.current?.emit("chat:relay:dm-sent", { recipientId, message });
    },
    [],
  );

  /**
   * Tell the WS service the local user is typing (or stopped typing)
   * in a room. The service broadcasts to OTHER sockets in the room.
   */
  const emitTyping = useCallback(
    (roomId: string, isTyping: boolean) => {
      socketRef.current?.emit("chat:room:typing", { roomId, isTyping });
    },
    [],
  );

  return {
    isConnected,
    relayNewMessage,
    relayMessageEdited,
    relayMessageDeleted,
    relayDmSent,
    emitTyping,
    // Direct access for advanced use cases (e.g. custom event listeners).
    socket: socketRef.current,
  };
}
