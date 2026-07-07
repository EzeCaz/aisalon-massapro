import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { getMeId, getMe } from "@/lib/session-user";

/**
 * GET /api/messages/[userId]
 * Returns the message thread between the current user and `userId`.
 * Also marks all messages FROM `userId` TO me as read (so the unread
 * badge updates as soon as the user opens the conversation).
 *
 * Response: { partner: {...}, messages: [...], currentUserId: string }
 *
 * PERF: uses session.user.id from the JWT (skips a db.user.findUnique)
 * and parallelizes the partner + messages queries with Promise.all.
 * The markRead updateMany runs in parallel with the response build
 * (fire-and-forget — the user already sees the un-read state in the
 * thread, and the unread badge refresh is triggered client-side by
 * the GET response itself).
 *
 * ROBUSTNESS: session.user.id can be stale/invalid if the user's JWT
 * was minted during a transient DB issue at login time (the jwt
 * callback falls back to the Google `sub` instead of a Prisma UUID).
 * We use getMeId() which verifies the id resolves to a real DB row
 * and falls back to an email lookup if not. This is what makes the
 * "User not found" toast go away for previously-messaged contacts.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const meId = await getMeId(session);
  if (!meId) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { userId: partnerId } = await params;
  if (partnerId === meId) {
    return NextResponse.json({ error: "Cannot chat with yourself" }, { status: 400 });
  }

  // PERF: fetch partner profile + thread in parallel (used to be serial).
  const [partner, messages] = await Promise.all([
    db.user.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        name: true,
        email: true,
        photoUrl: true,
        image: true,
        company: true,
        bio: true,
        tags: { select: { id: true, label: true, color: true } },
      },
    }),
    db.conversationMessage.findMany({
      where: {
        OR: [
          { senderId: meId, recipientId: partnerId },
          { senderId: partnerId, recipientId: meId },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        senderId: true,
        recipientId: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  if (!partner) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Fire-and-forget: mark messages from partner as read. We don't need
  // to await this — the user already sees the messages in the thread,
  // and the unread badge refresh is triggered by the GET response
  // itself (the client calls refreshUnread() after loading the thread).
  // Using .catch() to swallow any error (don't want an unhandled
  // promise rejection in a fire-and-forget).
  db.conversationMessage
    .updateMany({
      where: { senderId: partnerId, recipientId: meId, readAt: null },
      data: { readAt: new Date() },
    })
    .catch((err) => {
      console.error("[api/messages/[userId]] markRead failed:", err);
    });

  return NextResponse.json({
    partner,
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    })),
    currentUserId: meId,
  });
}

/**
 * POST /api/messages/[userId]
 * Body: { body: string }
 * Sends a new direct message from the current user to `userId`.
 * Optional email notification to the recipient (best-effort, never blocks).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Resolve the sender — must include name/email/photo for the email
  // notification below. getMe() verifies the JWT id resolves to a real
  // DB row and falls back to an email lookup if not, so users with a
  // stale token.id (minted during a transient DB issue at login) can
  // still send DMs without hitting a "User not found" error.
  const me = (await getMe(session, {
    id: true,
    name: true,
    email: true,
    photoUrl: true,
    image: true,
  })) as { id: string; name: string | null; email: string; photoUrl: string | null; image: string | null } | null;
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { userId: partnerId } = await params;
  if (partnerId === me.id) {
    return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
  }

  // PERF: parse body + fetch partner in parallel.
  const [partner, payload] = await Promise.all([
    db.user.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, email: true },
    }),
    req.json().catch(() => null as unknown as { body?: unknown }),
  ]);

  if (!partner) return NextResponse.json({ error: "Recipient not found" }, { status: 404 });

  const text = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: "Message too long (max 4000 characters)" },
      { status: 400 }
    );
  }

  const msg = await db.conversationMessage.create({
    data: {
      senderId: me.id,
      recipientId: partnerId,
      body: text,
    },
  });

  // Fire-and-forget email notification — don't block the response.
  // We send to BOTH the recipient and the platform admin (ADMIN_EMAIL)
  // — the admin gets CC'd on every DM so they can monitor the
  // conversation flow on the platform. Failures are logged only.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    "https://aisalon.massapro.com";
  const fromName = me.name || me.email.split("@")[0];
  const recipientName = partner.name || partner.email.split("@")[0];
  const adminEmail = process.env.ADMIN_EMAIL || "eze@massapro.com";
  const chatFrom =
    process.env.SMTP_FROM || "AI Salon Chat <chat@aisalon.massapro.com>";

  const subject = `New message from ${fromName} on AI Salon TLV`;
  const textEmail = `Hi ${recipientName},

${fromName} sent you a message on AI Salon Tel Aviv.

"${text}"

Reply on the platform: ${siteUrl}/events

— AI Salon Tel Aviv`;
  const htmlEmail = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0a0a0a;">
  <p style="font-size: 14px; color: #666; margin: 0 0 16px;">
    <strong>${fromName}</strong> sent you a message on AI Salon Tel Aviv.
  </p>
  <div style="padding: 16px; background: #f6f6f6; border-radius: 8px; border-left: 4px solid #FF005A; margin: 16px 0;">
    <pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; white-space: pre-wrap; margin: 0;">${text.replace(/</g, "&lt;")}</pre>
  </div>
  <p style="font-size: 13px; color: #666; margin: 16px 0 0;">
    <a href="${siteUrl}/events">Reply on the platform</a>
  </p>
  <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 11px; color: #999; margin: 0;">
    Sent from <strong>${chatFrom}</strong> · AI Salon Tel Aviv
  </p>
</div>`;
  sendMail({
    to: partner.email,
    cc: adminEmail,
    subject,
    text: textEmail,
    html: htmlEmail,
    from: chatFrom,
  }).catch((err) => {
    console.error("[dm] email notification failed:", err);
  });

  return NextResponse.json({
    ok: true,
    message: {
      ...msg,
      createdAt: msg.createdAt.toISOString(),
      readAt: msg.readAt ? msg.readAt.toISOString() : null,
    },
  });
}
