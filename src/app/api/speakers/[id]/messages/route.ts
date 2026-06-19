import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email";

/**
 * GET /api/speakers/[id]/messages
 * Returns the message thread between the current user and this speaker
 * (i.e. all messages the current user has sent to this speaker, plus
 * any replies — though replies are not yet supported).
 *
 * The current user can read their OWN outgoing messages only.
 * Admins can read all messages for any speaker.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { id: speakerId } = await params;
  const speaker = await db.speaker.findUnique({
    where: { id: speakerId },
    select: { id: true, name: true, eventId: true },
  });
  if (!speaker) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  const isAdmin = me.role === "ADMIN";
  const where = isAdmin
    ? { speakerId }
    : { speakerId, fromUserId: me.id };

  const messages = await db.speakerMessage.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fromName: true,
      fromEmail: true,
      body: true,
      createdAt: true,
    },
    take: 200,
  });

  return NextResponse.json({ messages, speaker });
}

/**
 * POST /api/speakers/[id]/messages
 * Body: { body: string, fromName?: string, fromEmail?: string }
 *
 * Sends a message to the speaker. The body is stored in the DB and
 * an email notification is sent to the platform admin (who can
 * forward it to the speaker). The fromName / fromEmail come from
 * the authenticated user when available; for anonymous submitters
 * they would need to be supplied — but this route requires auth.
 *
 * Returns: { ok: true, message: {...} }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { id: speakerId } = await params;
  const speaker = await db.speaker.findUnique({
    where: { id: speakerId },
    select: {
      id: true,
      name: true,
      role: true,
      company: true,
      event: { select: { id: true, title: true, slug: true } },
    },
  });
  if (!speaker) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  let body: { body?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: "Message too long (max 4000 characters)" },
      { status: 400 }
    );
  }

  // Use the authenticated user's name/email as the from snapshot.
  // Fall back to session.user.name / session.user.email if the DB
  // record doesn't have them.
  const fromName = me.name || session.user.name || me.email.split("@")[0];
  const fromEmail = me.email;

  const message = await db.speakerMessage.create({
    data: {
      speakerId,
      fromUserId: me.id,
      fromName,
      fromEmail,
      body: text,
    },
  });

  // Email the admin so they can forward to the speaker.
  // (We don't have the speaker's email directly — Speaker has no
  // email field. The admin acts as the relay.)
  const adminEmail = process.env.ADMIN_EMAIL || "eze@massapro.com";
  const eventUrl = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://aisalon.massapro.com"}/events/${speaker.event.slug}`;
  const chatFrom =
    process.env.SMTP_FROM || "AI Salon Chat <chat@aisalon.massapro.com>";
  const subject = `New message for ${speaker.name} — ${speaker.event.title}`;
  const textEmail = `Hi,

${fromName} (${fromEmail}) sent a message to ${speaker.name} via the AI Salon platform.

Event: ${speaker.event.title}
Speaker: ${speaker.name}${speaker.role ? ` (${speaker.role})` : ""}${speaker.company ? ` @ ${speaker.company}` : ""}

Message:
----
${text}
----

Reply directly to ${fromName} at ${fromEmail}, or forward this message to ${speaker.name} if you have their contact info.

Event page: ${eventUrl}

— AI Salon Tel Aviv platform`;
  const htmlEmail = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0a0a0a;">
  <p style="font-size: 14px; color: #666; margin: 0 0 16px;">
    <strong>${fromName}</strong> (<a href="mailto:${fromEmail}">${fromEmail}</a>) sent a message to <strong>${speaker.name}</strong>.
  </p>
  <p style="font-size: 13px; color: #666; margin: 0 0 16px;">
    Event: ${speaker.event.title}<br/>
    Speaker: ${speaker.name}${speaker.role ? ` (${speaker.role})` : ""}${speaker.company ? ` @ ${speaker.company}` : ""}
  </p>
  <div style="padding: 16px; background: #f6f6f6; border-radius: 8px; border-left: 4px solid #FF005A; margin: 16px 0;">
    <pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; white-space: pre-wrap; margin: 0;">${text.replace(/</g, "&lt;")}</pre>
  </div>
  <p style="font-size: 13px; color: #666; margin: 16px 0 0;">
    <a href="mailto:${fromEmail}">Reply to ${fromName} directly</a> · <a href="${eventUrl}">View event page</a>
  </p>
</div>`;
  try {
    await sendMail({ to: adminEmail, subject, text: textEmail, html: htmlEmail, from: chatFrom });
  } catch (err) {
    console.error("[speaker-message] email send failed:", err);
    // Don't fail the request — the message is already stored in the DB.
  }

  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      fromName: message.fromName,
      fromEmail: message.fromEmail,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    },
  });
}
