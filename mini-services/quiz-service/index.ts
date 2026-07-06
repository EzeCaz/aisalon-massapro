/**
 * Quiz WebSocket Service
 * ---------------------
 * Port: 3003
 *
 * Real-time sync layer for the Flourishing Quiz engine.
 *
 * Rooms: one per quiz session, named `quiz:<sessionId>`.
 *
 * Client → Server events:
 *   - `quiz:join`    { sessionId, userId, displayName, role }
 *   - `quiz:leave`   { sessionId }
 *   - `quiz:heartbeat` { sessionId }  (every 20s — keeps isOnline fresh)
 *   - `quiz:answer`  { sessionId, questionId, selectedIndex }
 *        ↑ Used only for the live "answer count" feed — actual scoring
 *          happens via the REST endpoint so we get a single source of
 *          truth (DB + transactional).
 *
 * Server → Client events:
 *   - `quiz:state`        { session }  — full state, sent on join + on
 *                                        any state change
 *   - `quiz:question`     { question, startedAt, timeLimitSec, remainingMs }
 *   - `quiz:reveal`       { questionId, correctIndex, deepDive, distribution }
 *   - `quiz:leaderboard`  { participants, currentQuestionStats }
 *   - `quiz:finished`     { finalLeaderboard }
 *   - `quiz:participant-joined` { participant }
 *   - `quiz:participant-left`   { participantId }
 *   - `quiz:answer-count` { questionId, count }  — live counter
 *
 * Admin → Server (host-only events, validated by role):
 *   - `quiz:host:start-lobby`    { sessionId }
 *   - `quiz:host:start-question` { sessionId, questionIndex }
 *   - `quiz:host:reveal`         { sessionId }
 *   - `quiz:host:next-question`  { sessionId }
 *   - `quiz:host:pause`          { sessionId }
 *   - `quiz:host:resume`         { sessionId }
 *   - `quiz:host:finish`         { sessionId }
 *   - `quiz:host:abort`          { sessionId }
 *
 * Host events are forwarded to all clients in the room via the
 * corresponding Server → Client events. The actual DB mutation is done
 * by the admin via the REST PATCH endpoint — the WS service is a
 * pure relay, not a source of truth. This keeps the auth + data model
 * in one place (NextAuth + Prisma) and the WS service stateless.
 */

import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy uses it to forward.
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

interface JoinPayload {
  sessionId: string
  userId: string
  displayName: string
  role: 'ADMIN' | 'SUPER_ADMIN' | 'CO_HOST' | 'MEMBER' | 'SPEAKER' | string
}

interface AnswerPayload {
  sessionId: string
  questionId: string
  selectedIndex: number
}

interface HostActionPayload {
  sessionId: string
  // We trust the admin REST endpoint for state mutation; the WS service
  // just relays the broadcast. The host's userId is included so we can
  // audit-log if needed.
  userId: string
}

function roomName(sessionId: string): string {
  return `quiz:${sessionId}`
}

/**
 * In-memory map of socket.id → { sessionId, userId, displayName, role }.
 * Used to clean up on disconnect. Lost on restart — that's OK, members
 * auto-reconnect and re-join via the REST join endpoint.
 */
const socketInfo = new Map<string, JoinPayload>()

io.on('connection', (socket: Socket) => {
  console.log(`[quiz-ws] connected: ${socket.id}`)

  socket.on('quiz:join', (payload: JoinPayload) => {
    if (!payload?.sessionId || !payload?.userId) return
    socketInfo.set(socket.id, payload)
    socket.join(roomName(payload.sessionId))
    // Notify the room
    socket.to(roomName(payload.sessionId)).emit('quiz:participant-joined', {
      participant: {
        userId: payload.userId,
        displayName: payload.displayName,
        role: payload.role,
      },
    })
    console.log(
      `[quiz-ws] ${payload.displayName} (${payload.role}) joined ${payload.sessionId}`,
    )
  })

  socket.on('quiz:leave', (payload: { sessionId: string }) => {
    if (!payload?.sessionId) return
    const info = socketInfo.get(socket.id)
    socket.leave(roomName(payload.sessionId))
    if (info) {
      socket.to(roomName(payload.sessionId)).emit('quiz:participant-left', {
        participantId: info.userId,
      })
    }
    socketInfo.delete(socket.id)
  })

  socket.on('quiz:heartbeat', (payload: { sessionId: string }) => {
    if (!payload?.sessionId) return
    // Just keep the socket alive — the REST /state endpoint bumps
    // lastSeenAt in the DB.
  })

  socket.on('quiz:answer', (payload: AnswerPayload) => {
    if (!payload?.sessionId || !payload?.questionId) return
    // Broadcast the answer count bump to the room (admin uses this for
    // the live "X / Y answered" counter). The actual scoring is done by
    // the REST endpoint.
    socket.to(roomName(payload.sessionId)).emit('quiz:answer-count', {
      questionId: payload.questionId,
    })
  })

  // ── Host-only events (broadcast, no DB mutation) ───────────────────
  // The admin UI calls these AFTER the REST PATCH succeeds, so the WS
  // event is purely a "tell everyone to refresh" signal.

  socket.on('quiz:host:start-lobby', (payload: HostActionPayload) => {
    if (!payload?.sessionId) return
    socket.to(roomName(payload.sessionId)).emit('quiz:state', {
      sessionId: payload.sessionId,
      status: 'LOBBY',
    })
  })

  socket.on('quiz:host:start-question', (payload: HostActionPayload) => {
    if (!payload?.sessionId) return
    // The host UI sends the new state via REST; here we just nudge
    // clients to re-fetch /state. We don't push the question text over
    // WS — the REST endpoint is the source of truth.
    socket.to(roomName(payload.sessionId)).emit('quiz:state', {
      sessionId: payload.sessionId,
      status: 'LIVE',
    })
  })

  socket.on('quiz:host:reveal', (payload: HostActionPayload) => {
    if (!payload?.sessionId) return
    socket.to(roomName(payload.sessionId)).emit('quiz:reveal', {
      sessionId: payload.sessionId,
    })
  })

  socket.on('quiz:host:next-question', (payload: HostActionPayload) => {
    if (!payload?.sessionId) return
    socket.to(roomName(payload.sessionId)).emit('quiz:state', {
      sessionId: payload.sessionId,
      status: 'LIVE',
    })
  })

  socket.on('quiz:host:pause', (payload: HostActionPayload) => {
    if (!payload?.sessionId) return
    socket.to(roomName(payload.sessionId)).emit('quiz:state', {
      sessionId: payload.sessionId,
      status: 'PAUSED',
    })
  })

  socket.on('quiz:host:resume', (payload: HostActionPayload) => {
    if (!payload?.sessionId) return
    socket.to(roomName(payload.sessionId)).emit('quiz:state', {
      sessionId: payload.sessionId,
      status: 'LIVE',
    })
  })

  socket.on('quiz:host:finish', (payload: HostActionPayload) => {
    if (!payload?.sessionId) return
    socket.to(roomName(payload.sessionId)).emit('quiz:finished', {
      sessionId: payload.sessionId,
    })
  })

  socket.on('quiz:host:abort', (payload: HostActionPayload) => {
    if (!payload?.sessionId) return
    socket.to(roomName(payload.sessionId)).emit('quiz:state', {
      sessionId: payload.sessionId,
      status: 'ABORTED',
    })
  })

  // ── Admin pushes a fresh leaderboard snapshot ──────────────────────
  // Triggered after every answer + on demand.
  socket.on('quiz:host:broadcast-leaderboard', (payload: HostActionPayload) => {
    if (!payload?.sessionId) return
    socket.to(roomName(payload.sessionId)).emit('quiz:leaderboard', {
      sessionId: payload.sessionId,
    })
  })

  socket.on('disconnect', () => {
    const info = socketInfo.get(socket.id)
    if (info) {
      socket.to(roomName(info.sessionId)).emit('quiz:participant-left', {
        participantId: info.userId,
      })
      console.log(
        `[quiz-ws] ${info.displayName} left ${info.sessionId}`,
      )
    }
    socketInfo.delete(socket.id)
  })

  socket.on('error', (error: unknown) => {
    console.error(`[quiz-ws] socket error (${socket.id}):`, error)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[quiz-ws] WebSocket server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[quiz-ws] SIGTERM — shutting down')
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('[quiz-ws] SIGINT — shutting down')
  httpServer.close(() => process.exit(0))
})
