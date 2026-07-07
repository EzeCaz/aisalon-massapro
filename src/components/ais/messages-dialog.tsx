"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { tagColor } from "@/lib/tags";
import { Inbox, Send, Loader2, ArrowLeft, Search } from "lucide-react";
import { useChatSocket, type ChatMessagePayload } from "@/components/chat/use-chat-socket";

/**
 * MessagesDialog
 *
 * Reusable 1-on-1 DM dialog. Extracted from InboxButton so that
 * other pages (e.g. /community) can open the same chat UI
 * pre-targeted at a specific member via the `initialPartnerId`
 * prop.
 *
 * The dialog always shows:
 *   - Left column: conversation list (searchable)
 *   - Right column: active thread (messages + composer)
 *
 * When `initialPartnerId` is set, the dialog opens with that
 * partner's thread already loaded (used by the Community page's
 * "Contact" button).
 */

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
  // Whether the dialog is open (controlled).
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Current user (for WS subscription + identifying "me" in thread).
  userId: string;
  userName: string | null;
  userRole: string;
  // Optional: open pre-targeted at this partner. When set and the
  // dialog opens, we skip the conversation list and load this
  // partner's thread directly. Used by the Community "Contact" flow.
  initialPartnerId?: string | null;
  // Optional: partner object to use as the initial active partner.
  // If provided, we skip the API fetch for the partner's profile
  // (used by MemberCard, which already has the profile data). Falls
  // back to fetching via /api/messages/[userId] otherwise.
  initialPartner?: {
    id: string;
    name: string | null;
    email: string;
    photoUrl: string | null;
    image: string | null;
    company?: string | null;
    bio?: string | null;
    tags: { id: string; label: string; color: string | null }[];
  } | null;
  // Initial unread count (rendered in the header pill).
  initialUnreadCount?: number;
  // Optional callback fired whenever the internal unread count
  // changes (so the parent trigger button can keep its badge in sync).
  onUnreadChange?: (count: number) => void;
};

export function MessagesDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userRole,
  initialPartnerId,
  initialPartner,
  initialUnreadCount = 0,
  onUnreadChange,
}: Props) {
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
  // `skipConversationRefresh` is true when we already have the partner
  // (Community "Contact" flow) — avoids a wasteful 1.4–3.7s call to
  // /api/messages/conversations that the user will never look at.
  const loadThread = useCallback(async (partner: Partner, opts?: { skipConversationRefresh?: boolean }) => {
    setLoadingThread(true);
    setThread([]);
    setActivePartner(partner);
    try {
      const res = await fetch(`/api/messages/${partner.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load conversation");
      const data = await res.json();
      setThread(data.messages || []);
      if (data.currentUserId) setCurrentUserId(data.currentUserId);
      // After loading the thread, the server marked partner→me messages as
      // read — refresh the unread count. Only refresh the conversations
      // list if the user can actually see it (i.e. they opened the dialog
      // WITHOUT a specific partner pre-targeted).
      refreshUnread();
      if (!opts?.skipConversationRefresh && openRef.current) {
        loadConversations();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load thread");
    } finally {
      setLoadingThread(false);
    }
  }, [loadConversations, refreshUnread]);

  // ── WebSocket subscription for live DM delivery ────────────────
  // The hook connects to the chat-service on port 3004, joins our
  // personal room (`chat:user:<userId>`), and calls onDmReceived
  // whenever someone else sends us a DM.
  //
  // We track `isConnected` so we can:
  //   - Skip the 20s polling fallback when the WS is healthy (saves
  //     ~323 server calls per dev session).
  //   - Trigger an immediate refresh on reconnect (so we catch up on
  //     anything missed while the socket was down).
  const lastDmReceivedAt = useRef<number>(0);
  const { relayDmSent, isConnected } = useChatSocket({
    userId,
    displayName: userName,
    role: userRole,
    activeRoomId: null, // DMs don't use room-based presence
    onDmReceived: () => {
      // Debounce: if multiple DMs arrive in quick succession (e.g. a
      // partner sends 3 messages in a row), we only refresh once per
      // 500ms window. This prevents 3× (refreshUnread + loadConversations
      // + refreshThread) = 9 server calls from a single inbound burst.
      const now = Date.now();
      if (now - lastDmReceivedAt.current < 500) {
        // Still schedule an unread refresh, but skip the heavy convos + thread refresh.
        refreshUnread();
        return;
      }
      lastDmReceivedAt.current = now;
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

  // Sync internal unread count up to the parent (so the header
  // InboxButton trigger can keep its badge in sync).
  useEffect(() => {
    if (onUnreadChange) onUnreadChange(unread);
  }, [unread, onUnreadChange]);

  // Refresh unread count on reconnect (catch up on missed events).
  useEffect(() => {
    if (isConnected) {
      refreshUnread();
      if (openRef.current) loadConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Polling fallback — ONLY when the WS is disconnected, OR as a
  // long-interval safety net when the tab is foregrounded after
  // being backgrounded (the WS may have missed events while hidden).
  useEffect(() => {
    // Always do an immediate refresh on mount.
    refreshUnread();

    // Short poll (5s) when WS is down — fast enough to feel live,
    // but only runs in the broken state.
    // Long poll (60s) as a permanent safety net — catches anything
    // missed by the WS even when it's healthy (rare).
    const shortPoll = isConnected ? null : setInterval(refreshUnread, 5000);
    const longPoll = setInterval(refreshUnread, 60000);

    // When the tab becomes visible again, refresh immediately
    // (the WS may have missed events while the tab was hidden).
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshUnread();
        if (openRef.current) loadConversations();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (shortPoll) clearInterval(shortPoll);
      clearInterval(longPoll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshUnread, isConnected, loadConversations]);

  // When the dialog opens, load the conversation list AND — if an
  // initial partner was specified — open that partner's thread.
  // PERF: when opening with initialPartnerId (Community "Contact" flow),
  // we SKIP loadConversations() entirely. The conversation list is
  // hidden when a thread is open, so fetching it is pure waste — it
  // was previously adding 1.4–3.7s of latency to the Contact button.
  useEffect(() => {
    if (!open) return;

    if (initialPartnerId && initialPartner) {
      // Community "Contact" flow — we already have the partner profile,
      // so skip the API round-trip and load just the thread. Don't
      // refresh the conversation list — the user is looking at the
      // thread, not the list.
      loadThread(initialPartner as Partner, { skipConversationRefresh: true });
    } else if (initialPartnerId) {
      // initialPartnerId set but no initialPartner object — fetch
      // partner profile + thread in one shot via the GET endpoint.
      setLoadingThread(true);
      fetch(`/api/messages/${initialPartnerId}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          if (data.partner) {
            setActivePartner(data.partner as Partner);
            setThread(data.messages || []);
            if (data.currentUserId) setCurrentUserId(data.currentUserId);
            refreshUnread();
          }
        })
        .catch(() => {
          /* ignore */
        })
        .finally(() => setLoadingThread(false));
    } else {
      // No initial partner — show the conversation list. This is the
      // header InboxButton flow.
      loadConversations();
      setActivePartner(null);
      setThread([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPartnerId]);

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
        const apiError = err?.error || "";
        // Translate raw API errors into user-friendly messages.
        // "User not found" usually means the sender's session has a
        // stale JWT id — reloading the page (which re-runs the jwt
        // callback's self-heal) fixes it.
        let friendly: string;
        if (apiError === "User not found") {
          friendly = "Your session is stale — please refresh the page and try again.";
        } else if (apiError === "Recipient not found") {
          friendly = "This member can no longer receive messages.";
        } else if (res.status === 401) {
          friendly = "Please sign in again to send messages.";
        } else {
          friendly = apiError || `Failed to send (HTTP ${res.status})`;
        }
        throw new Error(friendly);
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

  const filteredConversations = search.trim()
    ? conversations.filter(
        (c) =>
          c.partner.name?.toLowerCase().includes(search.toLowerCase()) ||
          c.partner.email.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                    Find someone in the Community and click
                    <br />
                    &ldquo;Contact&rdquo; to start a chat.
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
