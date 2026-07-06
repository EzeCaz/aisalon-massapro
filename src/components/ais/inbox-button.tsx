"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { MessagesDialog } from "./messages-dialog";

/**
 * InboxButton
 *
 * Header inbox trigger + DM dialog. This is a thin wrapper around
 * <MessagesDialog> that owns its own `open` state and renders the
 * toolbar trigger button. The actual conversation list / thread UI
 * lives in <MessagesDialog> so it can be reused by other pages
 * (e.g. /community's "Contact" button opens the same dialog
 * pre-targeted at a specific member).
 *
 * Live updates come from the WebSocket subscription inside
 * <MessagesDialog> (chat:dm-received events from the chat-service).
 * A 20s polling fallback refreshes the unread badge when the WS
 * is disconnected.
 */

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

  if (!loggedIn) return null;

  return (
    <>
      <button
        aria-label="Inbox — messages"
        onClick={() => setOpen(true)}
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

      <MessagesDialog
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        userName={userName}
        userRole={userRole}
        initialUnreadCount={unread}
        // The header InboxButton never opens pre-targeted — it always
        // shows the conversation list first. We pass a callback to
        // sync the badge with the dialog's internal unread count.
        onUnreadChange={setUnread}
      />
    </>
  );
}
