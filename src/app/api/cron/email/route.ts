import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMail, emailConfigured } from "@/lib/email";
import { randomUUID } from "crypto";

/**
 * GET /api/cron/email
 *
 * Scheduled email processor — designed to be invoked by Vercel Cron
 * (every 5–15 minutes). Two jobs per run:
 *
 *   1. Retry FAILED recipients on SENT campaigns (transient SMTP
 *      errors get a second chance). Each recipient gets at most
 *      MAX_RETRY_ATTEMPTS retries (default 3) before being abandoned.
 *
 *   2. Process QUEUED recipients on SENDING campaigns (i.e. a send
 *      was started but timed out before finishing all recipients —
 *      common for large lists on serverless). Up to BATCH_SIZE
 *      (default 50) recipients per run to stay under the function
 *      timeout.
 *
 * Auth: Vercel Cron passes the `CRON_SECRET` env var in the
 * `authorization` header. If CRON_SECRET is set on the server, we
 * require it. If it's not set, the endpoint refuses to run (fail
 * closed) so it can't be abused by anonymous callers.
 *
 * Vercel cron config (vercel.json):
 *   {
 *     "crons": [
 *       { "path": "/api/cron/email", "schedule": "0-59/10 star star star star" }
 *     ]
 *   }
 */
export async function GET(req: NextRequest) {
  // ---- Auth ----
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Fail closed — refuse to run if the secret isn't configured,
    // otherwise anyone could trigger bulk email sends.
    return NextResponse.json(
      { error: "CRON_SECRET is not configured — refusing to run" },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (provided !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "SMTP not configured — nothing to do" },
      { status: 200 } // 200 so cron doesn't alert
    );
  }

  const MAX_RETRY_ATTEMPTS = 3;
  const BATCH_SIZE = 50;

  const stats = {
    retriedFailed: 0,
    recoveredFailed: 0,
    stillFailing: 0,
    processedQueued: 0,
    sentQueued: 0,
    failedQueued: 0,
  };

  // ---------------- Job 1: Retry FAILED recipients ----------------
  const failedRecipients = await db.emailRecipient.findMany({
    where: {
      status: "FAILED",
      retryCount: { lt: MAX_RETRY_ATTEMPTS },
    },
    include: {
      campaign: {
        select: {
          id: true,
          subjectSnapshot: true,
          bodyHtmlSnapshot: true,
          fromName: true,
          fromEmail: true,
          replyTo: true,
          status: true,
        },
      },
    },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });

  for (const r of failedRecipients) {
    if (!r.campaign) continue;
    stats.retriedFailed++;

    const fromName = r.campaign.fromName || "AI Salon Tel Aviv";
    const fromEmail =
      r.campaign.fromEmail || process.env.SMTP_FROM || "no-reply@aisalon.massapro.com";
    const from = `${fromName} <${fromEmail}>`;

    const personalizedHtml = r.campaign.bodyHtmlSnapshot
      .replace(/\{\{name\}\}/g, r.name || "there")
      .replace(/\{\{email\}\}/g, r.email);

    const result = await sendMail({
      to: r.email,
      subject: r.campaign.subjectSnapshot,
      html: personalizedHtml,
      from,
      ...(r.campaign.replyTo ? { cc: r.campaign.replyTo } : {}),
    });

    if (result.ok) {
      stats.recoveredFailed++;
      await db.emailRecipient.update({
        where: { id: r.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          retryCount: { increment: 1 },
          errorReason: null,
        },
      });
      await db.emailEvent.create({
        data: {
          campaignId: r.campaignId,
          recipientId: r.id,
          email: r.email,
          type: "SENT",
          details: "retry-success",
        },
      });
    } else {
      stats.stillFailing++;
      await db.emailRecipient.update({
        where: { id: r.id },
        data: {
          retryCount: { increment: 1 },
          errorReason: result.error || "Unknown error",
        },
      });
    }
  }

  // ---------------- Job 2: Process QUEUED recipients ----------------
  // (i.e. a send was started but the request timed out before finishing)
  const sendingCampaigns = await db.emailCampaign.findMany({
    where: { status: "SENDING" },
    select: { id: true },
  });

  for (const campaign of sendingCampaigns) {
    const queued = await db.emailRecipient.findMany({
      where: { campaignId: campaign.id, status: "QUEUED" },
      include: {
        campaign: {
          select: {
            subjectSnapshot: true,
            bodyHtmlSnapshot: true,
            fromName: true,
            fromEmail: true,
            replyTo: true,
          },
        },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });

    for (const r of queued) {
      stats.processedQueued++;
      if (!r.campaign) continue;

      const fromName = r.campaign.fromName || "AI Salon Tel Aviv";
      const fromEmail =
        r.campaign.fromEmail || process.env.SMTP_FROM || "no-reply@aisalon.massapro.com";
      const from = `${fromName} <${fromEmail}>`;

      const personalizedHtml = r.campaign.bodyHtmlSnapshot
        .replace(/\{\{name\}\}/g, r.name || "there")
        .replace(/\{\{email\}\}/g, r.email);

      const result = await sendMail({
        to: r.email,
        subject: r.campaign.subjectSnapshot,
        html: personalizedHtml,
        from,
        ...(r.campaign.replyTo ? { cc: r.campaign.replyTo } : {}),
      });

      if (result.ok) {
        stats.sentQueued++;
        await db.emailRecipient.update({
          where: { id: r.id },
          data: { status: "SENT", sentAt: new Date() },
        });
        await db.emailEvent.create({
          data: {
            campaignId: r.campaignId,
            recipientId: r.id,
            email: r.email,
            type: "SENT",
            details: "cron-queued",
          },
        });
      } else {
        stats.failedQueued++;
        await db.emailRecipient.update({
          where: { id: r.id },
          data: { status: "FAILED", errorReason: result.error || "Unknown error" },
        });
        await db.emailEvent.create({
          data: {
            campaignId: r.campaignId,
            recipientId: r.id,
            email: r.email,
            type: "FAILED",
            details: result.error || "Unknown error",
          },
        });
      }
    }

    // If no more QUEUED recipients remain on this campaign, finalize it.
    const remaining = await db.emailRecipient.count({
      where: { campaignId: campaign.id, status: "QUEUED" },
    });
    if (remaining === 0) {
      const sentCount = await db.emailRecipient.count({
        where: { campaignId: campaign.id, status: "SENT" },
      });
      const failedCount = await db.emailRecipient.count({
        where: { campaignId: campaign.id, status: "FAILED" },
      });
      await db.emailCampaign.update({
        where: { id: campaign.id },
        data: {
          status: sentCount === 0 ? "FAILED" : "SENT",
          completedAt: new Date(),
        },
      });
      // Suppress unused vars warning — these are useful for debugging
      void sentCount;
      void failedCount;
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    stats,
  });
}

/**
 * POST /api/cron/email
 *
 * Same as GET but allows the admin to manually trigger a cron run
 * (useful for testing). Requires the CRON_SECRET just like GET, OR
 * an admin session — whichever is present.
 */
export async function POST(req: NextRequest) {
  // Allow either CRON_SECRET or an admin session
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (cronSecret && provided === cronSecret) {
    // Authenticated via cron secret — delegate to GET handler
    return GET(req);
  }

  // Otherwise require an admin session
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/auth");
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return GET(req);
}
