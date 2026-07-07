"use client";

/**
 * useQuizSocket
 * -------------
 * React hook that manages the Socket.io connection for a single quiz
 * session. Reconnects on disconnect, auto-joins the session room on
 * connect, and exposes a stable `emit` for host actions.
 *
 * Connection URL: io("/?XTransformPort=3003")
 * (Caddy routes the request to mini-services/quiz-service on port 3003)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export type QuizStatus =
  | "DRAFT"
  | "LOBBY"
  | "LIVE"
  | "PAUSED"
  | "BETWEEN"
  | "FINISHED"
  | "ABORTED";

export interface QuizSocketEvents {
  // Server → Client
  "quiz:state": (payload: { sessionId: string; status?: QuizStatus }) => void;
  "quiz:question": (payload: {
    question: { id: string; order: number; text: string; options: string[] };
    startedAt: string;
    timeLimitSec: number;
    remainingMs: number;
  }) => void;
  "quiz:reveal": (payload: { sessionId: string }) => void;
  "quiz:leaderboard": (payload: { sessionId: string }) => void;
  "quiz:finished": (payload: { sessionId: string }) => void;
  "quiz:participant-joined": (payload: {
    participant: { userId: string; displayName: string; role: string };
  }) => void;
  "quiz:participant-left": (payload: { participantId: string }) => void;
  "quiz:answer-count": (payload: { questionId: string }) => void;
}

interface UseQuizSocketArgs {
  sessionId: string | null;
  userId: string | null;
  displayName?: string;
  role?: string;
  // Called whenever the server signals a state change — the consumer
  // typically re-fetches /api/quiz/[sessionId]/state in response.
  onStateChange?: () => void;
  onReveal?: () => void;
  onLeaderboard?: () => void;
  onFinished?: () => void;
  onParticipantJoined?: () => void;
  onParticipantLeft?: () => void;
  onAnswerCount?: (questionId: string) => void;
}

export function useQuizSocket({
  sessionId,
  userId,
  displayName,
  role,
  onStateChange,
  onReveal,
  onLeaderboard,
  onFinished,
  onParticipantJoined,
  onParticipantLeft,
  onAnswerCount,
}: UseQuizSocketArgs) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Keep latest callbacks in refs so the socket listeners don't need to
  // be re-attached on every render.
  const cbRef = useRef({
    onStateChange,
    onReveal,
    onLeaderboard,
    onFinished,
    onParticipantJoined,
    onParticipantLeft,
    onAnswerCount,
  });
  cbRef.current = {
    onStateChange,
    onReveal,
    onLeaderboard,
    onFinished,
    onParticipantJoined,
    onParticipantLeft,
    onAnswerCount,
  };

  useEffect(() => {
    if (!sessionId || !userId) return;

    const socket = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("quiz:join", {
        sessionId,
        userId,
        displayName: displayName || "Anonymous",
        role: role || "MEMBER",
      });
    });

    socket.on("disconnect", () => setIsConnected(false));
    socket.on("connect_error", () => setIsConnected(false));

    // Server → Client event wiring
    socket.on("quiz:state", () => cbRef.current.onStateChange?.());
    socket.on("quiz:question", () => cbRef.current.onStateChange?.());
    socket.on("quiz:reveal", () => cbRef.current.onReveal?.());
    socket.on("quiz:leaderboard", () => cbRef.current.onLeaderboard?.());
    socket.on("quiz:finished", () => cbRef.current.onFinished?.());
    socket.on("quiz:participant-joined", () =>
      cbRef.current.onParticipantJoined?.(),
    );
    socket.on("quiz:participant-left", () =>
      cbRef.current.onParticipantLeft?.(),
    );
    socket.on("quiz:answer-count", (payload: { questionId: string }) =>
      cbRef.current.onAnswerCount?.(payload.questionId),
    );

    return () => {
      socket.emit("quiz:leave", { sessionId });
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId, displayName, role]);

  // Host action helpers — these are pure broadcasts. The admin UI is
  // responsible for calling the REST PATCH endpoint FIRST, then calling
  // the corresponding host: event to notify clients.
  const emitHostAction = useCallback(
    (event: string) => {
      if (!socketRef.current || !sessionId || !userId) return;
      socketRef.current.emit(event, { sessionId, userId });
    },
    [sessionId, userId],
  );

  const emitAnswer = useCallback(
    (questionId: string, selectedIndex: number) => {
      if (!socketRef.current || !sessionId) return;
      socketRef.current.emit("quiz:answer", {
        sessionId,
        questionId,
        selectedIndex,
      });
    },
    [sessionId],
  );

  return {
    isConnected,
    emitHostAction,
    emitAnswer,
    // Direct access for advanced use cases
    socket: socketRef.current,
  };
}
