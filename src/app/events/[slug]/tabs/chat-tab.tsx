"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Users,
  MessageCircle,
  Loader2,
  Circle,
  ArrowDown,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useChatSocket, type ChatMessagePayload } from "@/components/chat/use-chat-socket";

// ── Types ────────────────────────────────────────────────────────────
interface Member {
  userId: string;
  role: "HOST" | "MEMBER";
  lastReadAt: string | null;
  leftAt: string | null;
  name: string | null;
  photoUrl: string | null;
  image: string | null;
  company: string | null;
  siteRole: string;
}

interface RoomData {
  id: string;
  type: string;
  eventId: string | null;
  title: string;
  description: string | null;
  createdAt: string;
  members: Member[];
  myMembership: { role: string; lastReadAt: string | null } | null;
  unreadCount: number;
}

interface Props {
  eventId: string;
  eventTitle: string;
  me: { id: string; name: string | null; email: string; role: string };
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

/**
 * ChatTab
 * --------
 * Embedded event-group-chat UI shown as a tab on /events/[slug].
 *
 * Layout: a single column with header (room title + member count +
 * presence dots) + scrollable message list + composer.
 *
 * Real-time: uses useChatSocket to receive `chat:new-message` events
 * from other members. Outgoing messages go through REST POST, then
 * the local sender calls `relayNewMessage` to notify others via WS.
 */
export function ChatTab({ eventId, eventTitle, me }: Props) {
  const { toast } = useToast();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [typingUsers, setTypingUsers] = useState<
    Map<string, { name: string; ts: number }>
  >(new Map());
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const lastReadAtPushedRef = useRef<string | null>(null);

  // ── Load room ────────────────────────────────────────────────────
  const loadRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/events/${eventId}/room`);
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "You don't have access to this chat.");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load chat room");
      }
      const data = (await res.json()) as { room: RoomData };
      setRoom(data.room);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // ── Load messages (initial + paginated) ──────────────────────────
  const loadMessages = useCallback(async () => {
    if (!room) return;
    try {
      const res = await fetch(
        `/api/chat/rooms/${room.id}/messages?limit=50`,
      );
      if (!res.ok) {
        throw new Error("Failed to load messages");
      }
      const data = (await res.json()) as {
        messages: ChatMessagePayload[];
        nextCursor: string | null;
      };
      setMessages(data.messages);
      // After loading, mark the room as read so the unread badge clears.
      await markRead(room.id);
    } catch {
      /* ignore — non-critical */
    }
  }, [room]);

  const markRead = useCallback(async (roomId: string) => {
    // Avoid spamming the endpoint — only push once per second.
    const now = Date.now();
    const last = lastReadAtPushedRef.current;
    if (last && now - parseInt(last, 10) < 1000) return;
    lastReadAtPushedRef.current = String(now);
    try {
      await fetch(`/api/chat/rooms/${roomId}/read`, { method: "POST" });
    } catch {
      /* ignore */
    }
  }, []);

  // ── Send a message ───────────────────────────────────────────────
  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !room || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/chat/rooms/${room.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send message");
      }
      const data = (await res.json()) as { message: ChatMessagePayload };
      // Optimistic local render
      setMessages((prev) => [...prev, data.message]);
      // Tell the WS service to relay to OTHER clients in the room
      relayNewMessage(room.id, data.message);
      // Re-mark as read (we just sent, so we're caught up)
      await markRead(room.id);
    } catch (e: unknown) {
      toast({
        title: "Failed to send",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      // Restore the draft so the user can retry
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  // ── WebSocket subscription ───────────────────────────────────────
  const {
    isConnected,
    relayNewMessage,
    emitTyping,
  } = useChatSocket({
    userId: me.id,
    displayName: me.name,
    role: me.role,
    activeRoomId: room?.id ?? null,
    onNewMessage: (msg) => {
      // Avoid double-adding our own message (we already added it
      // optimistically in sendMessage).
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // If the user is viewing the bottom of the list, auto-scroll + mark read.
      const container = messagesContainerRef.current;
      const atBottom =
        container &&
        container.scrollHeight - container.scrollTop - container.clientHeight <
          200;
      if (atBottom) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 50);
        markRead(msg.roomId);
      }
    },
    onPresence: (p) => {
      setPresence((prev) => ({ ...prev, [p.userId]: p.isOnline }));
    },
    onTyping: (p) => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (p.isTyping) {
          next.set(p.userId, { name: p.displayName, ts: Date.now() });
        } else {
          next.delete(p.userId);
        }
        return next;
      });
    },
  });

  // ── Auto-clean stale typing indicators (after 3s of no update) ───
  useEffect(() => {
    if (typingUsers.size === 0) return;
    const t = setInterval(() => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        const cutoff = Date.now() - 3000;
        for (const [uid, info] of next) {
          if (info.ts < cutoff) next.delete(uid);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typingUsers.size]);

  // ── Lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    if (room) {
      loadMessages();
    }
  }, [room, loadMessages]);

  // Auto-scroll to bottom on initial message load
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages.length === 0]); // only on first load — eslint disabled below
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // Track whether the user is scrolled up (to show "jump to bottom" button)
  const onScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;
    setShowJumpToBottom(!atBottom && messages.length > 0);
  }, [messages.length]);

  // ── Local typing indicator broadcast (debounced) ─────────────────
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!room) return;
    // Tell others we're typing (debounced — at most once per 1.5s)
    if (typingTimeoutRef.current) return;
    emitTyping(room.id, true);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(room.id, false);
      typingTimeoutRef.current = null;
    }, 1500);
  };

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin opacity-60" />
          Loading chat…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#FF005A]" />
            Event chat
          </CardTitle>
          <CardDescription>{eventTitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!room) return null;

  const onlineCount = Object.values(presence).filter(Boolean).length;
  const typingList = Array.from(typingUsers.values())
    .map((t) => t.name)
    .slice(0, 3);

  return (
    <Card className="flex flex-col h-[70vh] min-h-[500px]">
      {/* Header */}
      <CardHeader className="pb-3 border-b shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[#FF005A]" />
              {room.title}
            </CardTitle>
            <CardDescription className="mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {room.members.length} member
                {room.members.length !== 1 ? "s" : ""}
              </span>
              {onlineCount > 0 && (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <Circle className="h-2 w-2 fill-green-500 stroke-green-500" />
                  {onlineCount} online
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 ${
                  isConnected ? "text-green-700" : "text-amber-700"
                }`}
              >
                {isConnected ? "● live" : "○ reconnecting…"}
              </span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 relative"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
            <MessageCircle className="h-10 w-10 opacity-30" />
            <p>No messages yet — be the first to say hi 👋</p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isMine = m.senderId === me.id;
            const prevSame =
              idx > 0 && messages[idx - 1].senderId === m.senderId;
            const senderName = m.sender?.name || "Unknown";
            const senderPhoto = m.sender?.photoUrl || m.sender?.image;
            const isHost = room.members.find(
              (mem) => mem.userId === m.senderId,
            )?.role === "HOST";
            return (
              <div
                key={m.id}
                className={`flex gap-2 ${
                  isMine ? "flex-row-reverse" : "flex-row"
                } ${prevSame ? "mt-0.5" : "mt-3"}`}
              >
                {/* Avatar (hide if same sender as previous) */}
                <div className="w-8 shrink-0">
                  {!prevSame && (
                    <Avatar className="h-8 w-8">
                      {senderPhoto && <AvatarImage src={senderPhoto} alt={senderName} />}
                      <AvatarFallback className="text-[10px]">
                        {initials(senderName)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
                <div
                  className={`flex flex-col max-w-[75%] ${
                    isMine ? "items-end" : "items-start"
                  }`}
                >
                  {!prevSame && (
                    <div
                      className={`flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5 ${
                        isMine ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <span className="font-medium">{isMine ? "You" : senderName}</span>
                      {isHost && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 h-3.5 bg-amber-50 text-amber-700 border-amber-200"
                        >
                          HOST
                        </Badge>
                      )}
                      <span>{formatTime(m.createdAt)}</span>
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap break-words ${
                      isMine
                        ? "bg-[#FF005A] text-white rounded-tr-sm"
                        : "bg-gray-100 text-gray-900 rounded-tl-sm"
                    } ${prevSame ? (isMine ? "rounded-tr-lg" : "rounded-tl-lg") : ""}`}
                  >
                    {m.deletedAt ? (
                      <span className="italic opacity-60">
                        [message deleted]
                      </span>
                    ) : (
                      m.body
                    )}
                    {m.editedAt && !m.deletedAt && (
                      <span
                        className={`text-[9px] ml-1 opacity-60 ${
                          isMine ? "text-white/70" : "text-gray-500"
                        }`}
                      >
                        (edited)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {/* Typing indicator */}
        {typingList.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground italic">
            <div className="flex gap-0.5">
              <span className="h-1 w-1 bg-gray-400 rounded-full animate-pulse" />
              <span className="h-1 w-1 bg-gray-400 rounded-full animate-pulse [animation-delay:200ms]" />
              <span className="h-1 w-1 bg-gray-400 rounded-full animate-pulse [animation-delay:400ms]" />
            </div>
            {typingList.length === 1
              ? `${typingList[0]} is typing…`
              : `${typingList.join(", ")} are typing…`}
          </div>
        )}
        <div ref={messagesEndRef} />

        {/* Jump-to-bottom button */}
        {showJumpToBottom && (
          <button
            onClick={() =>
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
            }
            className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-white shadow-md border rounded-full p-1.5 hover:bg-gray-50"
            title="Jump to latest"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="border-t p-3 shrink-0">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message…  (Enter to send, Shift+Enter for newline)"
            maxLength={4000}
            disabled={sending}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={!draft.trim() || sending}
            className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white"
            size="icon"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
          Be kind. Messages can be seen by all {room.members.length} member
          {room.members.length !== 1 ? "s" : ""} of this event chat.
        </p>
      </div>
    </Card>
  );
}
