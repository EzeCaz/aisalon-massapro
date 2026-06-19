import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email";

/**
 * GET /api/messages/[userId]
 * Returns the message thread between the current user and `userId`.
 * Also marks all messages FROM `userId` TO me as read (so the unread
 * badge updates as soon as the user opens the conversation).
 *
 * Response: { partner: {...}, messages: [...], currentUserId: string }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { userId: partnerId } = await params;
  if (partnerId === me.id) {
    return NextResponse.json({ error: "Cannot chat with yourself" }, { status: 400 });
  }

  const partner = await db.user.findUnique({
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
  });
  if (!partner) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Fetch thread (both directions).
  const messages = await db.conversationMessage.findMany({
    where: {
      OR: [
        { senderId: me.id, recipientId: partnerId },
        { senderId: partnerId, recipientId: me.id },
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
  });

  // Mark messages from partner as read.
  await db.conversationMessage.updateMany({
    where: { senderId: partnerId, recipientId: me.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({
    partner,
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    })),
    currentUserId: me.id,
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
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, photoUrl: true, image: true },
  });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { userId: partnerId } = await params;
  if (partnerId === me.id) {
    return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
  }

  const partner = await db.user.findUnique({
    where: { id: partnerId },
    select: { id: true, name: true, email: true },
  });
  if (!partner) return NextResponse.json({ error: "Recipient not found" }, { status: 404 });

  let payload: { body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof payload.body === "string" ? payload.body.trim() : "";
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

  // Best-effort email notification to the recipient. We do NOT have the
  // recipient's email-opt-in status, but every user signed up with an
  // email — sending them a notification about a direct message is
  // reasonable. Failures are logged and ignored.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    "https://aisalon.massapro.com";
  const fromName = me.name || me.email.split("@")[0];
  const subject = `New message from ${fromName} on AI Salon TLV`;
  const textEmail = `Hi ${partner.name || partner.email.split("@")[0]},

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
</div>`;
  try {
    await sendMail({ to: partner.email, subject, text: textEmail, html: htmlEmail });
  } catch (err) {
    console.error("[dm] email notification failed:", err);
  }

  return NextResponse.json({
    ok: true,
    message: {
      ...msg,
      createdAt: msg.createdAt.toISOString(),
      readAt: msg.readAt ? msg.readAt.toISOString() : null,
    },
  });
}
