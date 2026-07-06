"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { tagColor } from "@/lib/tags";
import { Inbox, Send, Loader2, ArrowLeft, Search } from "lucide-react";
import { useChatSocket, type ChatMessagePayload } from "@/components/chat/use-chat-socket";

type Partner = {
  id: string;
  name: string | null;
  email: string;
  photoUrl: string | null;
  image: string | null;
  company?: string | null;
  bio?: string | null;
  tags: { id: string; label: string; color: string | null }[];
};

type Conversation = {
  partner: Partner;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
};

type ThreadMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

function initialsOf(name: string | null, email: string) {
  return (name || email)
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

type Props = {
  // Initial unread count for the badge (rendered server-side).
  initialUnreadCount: number;
  // Whether this user is logged in (controls rendering).
  loggedIn: boolean;
  // ── Required for the WebSocket subscription ──────────────────
  // The current user's id, name, role — used to join the personal
  // `chat:user:<id>` room so we receive `chat:dm-received` events
  // when other members DM us.
  userId: string;
  userName: string | null;
  userRole: string;
};

export function InboxButton({
  initialUnreadCount,
  loggedIn,
  userId,
  userName,
  userRole,
}: Props) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePartner, setActivePartner] = useState<Partner | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep latest activePartner in a ref so the WS callback (which is
  // set up ONCE) always sees the current value.
  const activePartnerRef = useRef<Partner | null>(null);
  activePartnerRef.current = activePartner;
  const openRef = useRef<boolean>(open);
  openRef.current = open;

  // ── Data fetchers (declared BEFORE the WS hook so the WS callback
  //    closure can reference them) ─────────────────────────────────
  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/unread-count", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.count === "number") setUnread(data.count);
    } catch {
      /* ignore */
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/messages/conversations", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
      setCurrentUserId(data.currentUserId || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load conversations");
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Refresh just the active thread (no loading state — used by the WS
  // callback to append new messages live without flicker).
  const refreshThread = useCallback(async (partner: Partner) => {
    try {
      const res = await fetch(`/api/messages/${partner.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setThread(data.messages || []);
      // The GET endpoint marks partner→me messages as read, so the
      // unread badge should now be 0 for this partner.
      refreshUnread();
    } catch {
      /* ignore */
    }
  }, [refreshUnread]);

  // Load the thread with a specific partner (full UI loading state).
  const loadThread = useCallback(async (partner: Partner) => {
    setLoadingThread(true);
    setThread([]);
    setActivePartner(partner);
    try {
      const res = await fetch(`/api/messages/${partner.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load conversation");
      const data = await res.json();
      setThread(data.messages || []);
      // After loading the thread, the server marked partner→me messages as
      // read — refresh the unread count and the conversations list so the
      // unread dot disappears for this partner.
      refreshUnread();
      loadConversations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load thread");
    } finally {
      setLoadingThread(false);
    }
  }, [loadConversations, refreshUnread]);

  // ── WebSocket subscription for live DM delivery ────────────────
  // The hook connects to the chat-service on port 3004, joins our
  // personal room (`chat:user:<userId>`), and calls onDmReceived
  // whenever someone else sends us a DM. This replaces the old 5s
  // polling loop for the active thread, and complements the 20s
  // unread-count polling loop (which is kept as a fallback for when
  // the WS is disconnected).
  const { relayDmSent } = useChatSocket({
    userId,
    displayName: userName,
    role: userRole,
    activeRoomId: null, // DMs don't use room-based presence
    onDmReceived: () => {
      refreshUnread();
      if (openRef.current) {
        loadConversations();
        const partner = activePartnerRef.current;
        if (partner) {
          refreshThread(partner);
        }
      }
    },
    onUnreadCountChange: () => {
      refreshUnread();
    },
  });

  // Fallback: poll for unread count every 20s (in case the WS is
  // disconnected or the browser tab was backgrounded and missed an
  // event). The WS handles the live case; this is a safety net.
  useEffect(() => {
    if (!loggedIn) return;
    refreshUnread();
    pollRef.current = setInterval(refreshUnread, 20000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loggedIn, refreshUnread]);

  // When the dialog opens, load the conversation list.
  useEffect(() => {
    if (open && loggedIn) {
      loadConversations();
      setActivePartner(null);
      setThread([]);
    }
  }, [open, loggedIn, loadConversations]);

  // NOTE: We previously polled the active thread every 5s. That's now
  // handled by the WebSocket `chat:dm-received` event — when the
  // partner sends a new DM, the WS pushes it to us and we call
  // refreshThread() in the onDmReceived callback above.

  // Scroll to bottom of thread when new messages arrive.
  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [thread.length, activePartner]);

  // Send a new message.
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!activePartner || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    setSending(true);
    // Optimistic: append immediately.
    const tempId = `tmp-${Date.now()}`;
    const optimistic: ThreadMessage = {
      id: tempId,
      senderId: currentUserId || "me",
      recipientId: activePartner.id,
      body,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    setThread((t) => [...t, optimistic]);
    try {
      const res = await fetch(`/api/messages/${activePartner.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Replace optimistic message with the real one.
      setThread((t) => t.map((m) => (m.id === tempId ? data.message : m)));
      // Refresh conversations list so the latest message shows up.
      loadConversations();
      // Tell the chat-service to push a `chat:dm-received` event to
      // the recipient's personal room so their InboxButton updates
      // live (instead of waiting up to 20s for the next poll).
      if (data.message) {
        relayDmSent(activePartner.id, data.message as unknown as ChatMessagePayload);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
      // Remove the optimistic message on failure.
      setThread((t) => t.filter((m) => m.id !== tempId));
      setDraft(body); // restore draft so the user can retry
    } finally {
      setSending(false);
    }
  }

  if (!loggedIn) return null;

  const filteredConversations = search.trim()
    ? conversations.filter(
        (c) =>
          c.partner.name?.toLowerCase().includes(search.toLowerCase()) ||
          c.partner.email.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          aria-label="Inbox — messages"
          className="relative ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 transition-colors"
        >
          <Inbox className="h-5 w-5" />
          {unread > 0 && (
            <span
              className="ais-pulse-badge absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF005A] px-1 text-[10px] font-bold text-white"
              title={`${unread} unread message${unread === 1 ? "" : "s"}`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl w-[95vw] h-[80vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-black/10 bg-white/95">
          <DialogTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Messages
            {unread > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-[#FF005A] px-2 py-0.5 text-[10px] font-bold text-white">
                {unread} unread
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* Conversation list — hidden when a thread is open on mobile, always visible on desktop */}
          <div
            className={`${
              activePartner ? "hidden md:flex" : "flex"
            } w-full md:w-72 lg:w-80 flex-col border-r border-black/10 min-h-0`}
          >
            <div className="p-2 border-b border-black/10">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black/80" />
                <Input
                  placeholder="Search conversations…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto ais-scroll">
              {loadingList ? (
                <div className="p-4 text-center text-sm text-black/50 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-black/50">
                  <Inbox className="h-8 w-8 mx-auto mb-2 text-black/30" />
                  No conversations yet.
                  <div className="mt-1 text-xs">
                    Find someone on the event page and click
                    <br />
                    &ldquo;Contact the speaker&rdquo; to start a chat.
                  </div>
                </div>
              ) : (
                filteredConversations.map((c) => {
                  const isMe =
                    c.lastMessage.senderId === currentUserId;
                  return (
                    <button
                      key={c.partner.id}
                      onClick={() => loadThread(c.partner)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-black/5 transition-colors border-b border-black/5 ${
                        activePartner?.id === c.partner.id ? "bg-black/5" : ""
                      }`}
                    >
                      <Avatar className="h-9 w-9 flex-shrink-0">
                        <AvatarImage
                          src={c.partner.photoUrl || c.partner.image || undefined}
                          alt={c.partner.name || c.partner.email}
                        />
                        <AvatarFallback className="bg-black text-white text-xs font-semibold">
                          {initialsOf(c.partner.name, c.partner.email) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-semibold text-sm truncate">
                            {c.partner.name || c.partner.email.split("@")[0]}
                          </div>
                          <div className="text-[10px] text-black/80 flex-shrink-0">
                            {formatTime(c.lastMessage.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-xs text-black/50 truncate">
                            {isMe ? "You: " : ""}
                            {truncate(c.lastMessage.body, 38)}
                          </div>
                          {c.unreadCount > 0 && (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF005A] px-1 text-[10px] font-bold text-white">
                              {c.unreadCount > 99 ? "99+" : c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread view */}
          <div
            className={`${
              activePartner ? "flex" : "hidden md:flex"
            } flex-1 flex-col min-h-0 bg-white`}
          >
            {activePartner ? (
              <>
                {/* Thread header */}
                <div className="flex items-center gap-3 px-3 py-2.5 border-b border-black/10 bg-white">
                  <button
                    onClick={() => setActivePartner(null)}
                    className="md:hidden p-1 rounded hover:bg-black/5"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={activePartner.photoUrl || activePartner.image || undefined}
                      alt={activePartner.name || activePartner.email}
                    />
                    <AvatarFallback className="bg-black text-white text-xs font-semibold">
                      {initialsOf(activePartner.name, activePartner.email) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {activePartner.name || activePartner.email.split("@")[0]}
                    </div>
                    {activePartner.company && (
                      <div className="text-xs text-black/50 truncate">
                        {activePartner.company}
                      </div>
                    )}
                  </div>
                  {activePartner.tags.length > 0 && (
                    <div className="hidden sm:flex flex-wrap gap-1 justify-end">
                      {activePartner.tags.slice(0, 2).map((t) => (
                        <span
                          key={t.id}
                          className="ais-tag"
                          style={{
                            backgroundColor: `${t.color || tagColor(t.label)}20`,
                            color: t.color || tagColor(t.label),
                          }}
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto ais-scroll px-4 py-3 space-y-2 bg-black/[0.02]">
                  {loadingThread ? (
                    <div className="flex items-center justify-center h-full text-sm text-black/50 gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                  ) : thread.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center text-sm text-black/50 px-6">
                      <div>
                        <Inbox className="h-8 w-8 mx-auto mb-2 text-black/30" />
                        No messages yet.
                        <br />
                        Say hello below 👇
                      </div>
                    </div>
                  ) : (
                    thread.map((m) => {
                      const mine = m.senderId === currentUserId;
                      return (
                        <div
                          key={m.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                              mine
                                ? "bg-[#FF005A] text-white rounded-br-sm"
                                : "bg-white border border-black/10 text-black rounded-bl-sm"
                            }`}
                          >
                            <div>{m.body}</div>
                            <div
                              className={`mt-1 text-[10px] ${
                                mine ? "text-white/70" : "text-black/80"
                              } text-right`}
                            >
                              {formatTime(m.createdAt)}
                              {mine && (
                                <span className="ml-1">
                                  {m.readAt ? "· Read" : "· Sent"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={threadEndRef} />
                </div>

                {/* Send box */}
                <form
                  onSubmit={sendMessage}
                  className="flex items-end gap-2 px-3 py-2 border-t border-black/10 bg-white"
                >
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message…"
                    disabled={sending}
                    className="flex-1"
                    maxLength={4000}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={sending || !draft.trim()}
                    className="bg-[#FF005A] hover:bg-[#D8004D] text-white"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <div className="hidden md:flex flex-1 items-center justify-center text-center text-sm text-black/50 px-6">
                <div>
                  <Inbox className="h-10 w-10 mx-auto mb-2 text-black/30" />
                  Select a conversation to start chatting.
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
