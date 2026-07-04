import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/cron/email/imap-poll
 *
 * Connects to the IMAP inbox (eze@massapro.com), scans for recent
 * emails, matches In-Reply-To headers against EmailRecipient.messageId,
 * logs REPLY events.
 *
 * Auth (either):
 *   - X-CRON-SECRET header matching CRON_SECRET env var (for Vercel Cron)
 *   - Valid admin session (for admin UI's "Poll replies" button)
 *
 * NOTE: Vercel Hobby tier only allows daily crons. For more frequent
 * runs, the admin UI has a "Poll replies" button that calls this endpoint.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  const secretOk = secret && secret === process.env.CRON_SECRET;

  let adminOk = false;
  if (!secretOk) {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      const me = await db.user.findUnique({ where: { email: session.user.email } });
      adminOk = me?.role === "ADMIN";
    }
  }

  if (!secretOk && !adminOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = process.env.IMAP_HOST;
  const port = process.env.IMAP_PORT ? parseInt(process.env.IMAP_PORT, 10) : 993;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!host || !user || !pass) {
    return NextResponse.json(
      { error: "IMAP_* env vars not configured" },
      { status: 500 }
    );
  }

  // Dynamic import — imapflow is server-only
  const { ImapFlow } = await import("imapflow");

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass },
    logger: false,
  });

  let scanned = 0;
  let replies = 0;
  const errors: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Search for emails received in the last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const searchResult = await client.search({ since });
      const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
      scanned = uids.length;

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(uid, {
            envelope: true,
            source: true,
          });
          if (!msg) continue;
          const envelope = (msg as any).envelope;
          if (!envelope) continue;

          // Match against EmailRecipient.messageId.
          // The In-Reply-To header contains the Message-ID we generated.
          const inReplyTo = envelope.inReplyTo as string | undefined;
          if (!inReplyTo) continue;

          const recipient = await db.emailRecipient.findFirst({
            where: { messageId: inReplyTo },
            select: { id: true, campaignId: true, email: true, repliedAt: true },
          });
          if (!recipient) continue;
          if (recipient.repliedAt) continue; // already logged

          // Extract reply snippet (first 200 chars of text body)
          let snippet = "";
          const source: Buffer | undefined = (msg as any).source;
          if (source) {
            const sourceStr = source.toString("utf8");
            snippet = sourceStr
              .replace(/<[^>]+>/g, " ")
              .replace(/=\r?\n/g, "")
              .replace(/\r?\n/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 200);
          }

          await db.emailRecipient.update({
            where: { id: recipient.id },
            data: { repliedAt: new Date(), replySnippet: snippet },
          });
          await db.emailEvent.create({
            data: {
              campaignId: recipient.campaignId,
              recipientId: recipient.id,
              email: recipient.email,
              type: "REPLY",
              details: snippet,
            },
          });
          replies++;
        } catch (err) {
          errors.push(
            `uid ${uid}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    errors.push(
      `imap connection: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return NextResponse.json({ scanned, replies, errors });
}
