import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { InboxButton } from "./inbox-button";

/**
 * Server component that hydrates <InboxButton /> with the initial unread
 * count for the current user. Renders nothing when the user is logged out
 * (so the icon never flashes on the login page).
 */
export async function InboxButtonServer() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, role: true },
  });
  if (!me) return null;

  const unreadCount = await db.conversationMessage.count({
    where: { recipientId: me.id, readAt: null },
  });

  return (
    <InboxButton
      initialUnreadCount={unreadCount}
      loggedIn
      userId={me.id}
      userName={me.name}
      userRole={me.role}
    />
  );
}
