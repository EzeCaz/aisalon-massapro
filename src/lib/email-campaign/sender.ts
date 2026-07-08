/**
 * Email Campaign library — send worker.
 *
 * Sends one campaign to all its recipients. Designed to be called from:
 *   - the immediate-send API route (POST /api/admin/email/campaigns/[id]/send)
 *   - the scheduled-send cron job (POST /api/cron/email/send-scheduled)
 *
 * Strategy:
 *   - Process recipients in batches of 50 to stay within Vercel's
 *     serverless function timeout (60s on Hobby tier).
 *   - For each recipient: render email, sendMail, update EmailRecipient
 *     row, log EmailEvent row.
 *   - On per-recipient failure: log error, mark as FAILED, continue.
 *   - Returns a summary; if more recipients remain, caller should call
 *     again (or rely on the cron to pick it up).
 */

import { db } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { renderEmail } from "./render";
import { randomBytes } from "node:crypto";

export type SendResult = {
  campaignId: string;
  sent: number;
  failed: number;
  total: number;
  remaining: number;
  paused: boolean;
  error?: string;
};

const BATCH_SIZE = 50;
const SEND_DELAY_MS = 100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function generateTrackToken(): string {
  return randomBytes(16).toString("hex");
}

export async function sendCampaignBatch(
  campaignId: string,
  batchSize: number = BATCH_SIZE
): Promise<SendResult> {
  const campaign = await db.emailCampaign.findUnique({
    where: { id: campaignId },
    include: {
      recipients: {
        where: { status: "QUEUED" },
        take: batchSize,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!campaign) {
    return {
      campaignId,
      sent: 0,
      failed: 0,
      total: 0,
      remaining: 0,
      paused: false,
      error: "Campaign not found",
    };
  }

  if (campaign.status === "SCHEDULED" || campaign.status === "DRAFT") {
    await db.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "SENDING", startedAt: new Date() },
    });
  } else if (campaign.status !== "SENDING" && campaign.status !== "PAUSED") {
    return {
      campaignId,
      sent: 0,
      failed: 0,
      total: campaign.recipientCount,
      remaining: 0,
      paused: false,
      error: `Campaign is in ${campaign.status} state, not sendable`,
    };
  }

  const baseUrl =
    process.env.EMAIL_TRACKING_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";
  const fromName = campaign.fromName || "AI Salon";
  const fromEmail =
    campaign.fromEmail || process.env.SMTP_USER || "noreply@massapro.com";
  const replyTo = campaign.replyTo || undefined;

  const snapshot = {
    subject: campaign.subjectSnapshot,
    bodyHtml: campaign.bodyHtmlSnapshot,
    bodyText: campaign.bodyTextSnapshot,
    signatureHtml: campaign.signatureHtmlSnapshot,
  };

  // If the campaign targets an event (listSource === "EVENT:<eventId>"),
  // look up the event once so we can resolve {{eventUrl}}, {{myCodeUrl}},
  // {{event.myCodeUrl}}, {{eventTitle}}, etc. merge tags. When the campaign
  // is event-bound but the event was deleted, we fall through to "no event
  // context" — those tokens resolve to empty strings instead of erroring.
  const eventMatch = campaign.listSource.match(/^EVENT:(.+)$/);
  const eventCtx = eventMatch
    ? await db.event.findUnique({
        where: { id: eventMatch[1] },
        select: { slug: true, title: true, venue: true, address: true },
      }).then((e) => e ? { slug: e.slug, title: e.title, venue: e.venue, address: e.address } : undefined)
    : undefined;

  let sent = 0;
  let failed = 0;

  for (const recipient of campaign.recipients) {
    try {
      const rendered = renderEmail({
        campaignId,
        trackToken: recipient.trackToken,
        recipient: {
          email: recipient.email,
          name: recipient.name,
          userId: recipient.userId,
        },
        snapshot,
        from: { name: fromName, email: fromEmail },
        baseUrl,
        ...(eventCtx ? { event: eventCtx } : {}),
      });

      const result = await sendMail({
        to: rendered.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        from: rendered.from,
      });

      if (result.ok) {
        await db.emailRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            messageId: rendered.messageId,
          },
        });
        await db.emailEvent.create({
          data: {
            campaignId,
            recipientId: recipient.id,
            email: recipient.email,
            type: "SENT",
          },
        });
        sent++;
      } else {
        await db.emailRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "FAILED",
            errorReason: result.error || "Unknown SMTP error",
          },
        });
        await db.emailEvent.create({
          data: {
            campaignId,
            recipientId: recipient.id,
            email: recipient.email,
            type: "BOUNCE",
            details: result.error || "Unknown SMTP error",
          },
        });
        failed++;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      try {
        await db.emailRecipient.update({
          where: { id: recipient.id },
          data: { status: "FAILED", errorReason: reason },
        });
        await db.emailEvent.create({
          data: {
            campaignId,
            recipientId: recipient.id,
            email: recipient.email,
            type: "BOUNCE",
            details: reason,
          },
        });
      } catch {}
      failed++;
    }

    if (SEND_DELAY_MS > 0) {
      await sleep(SEND_DELAY_MS);
    }
  }

  const remaining = await db.emailRecipient.count({
    where: { campaignId, status: "QUEUED" },
  });

  if (remaining === 0) {
    await db.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: "SENT",
        completedAt: new Date(),
      },
    });
  }

  const total = await db.emailRecipient.count({
    where: { campaignId },
  });

  return {
    campaignId,
    sent,
    failed,
    total,
    remaining,
    paused: false,
    error:
      remaining > 0
        ? `More recipients remaining (${remaining}). Call again to continue.`
        : undefined,
  };
}

/**
 * Create the EmailRecipient rows for a campaign, based on its
 * listSource + listConfigJson. Called when the admin transitions a
 * campaign from DRAFT to SCHEDULED or sends it immediately.
 *
 * Idempotent: if recipients already exist for the campaign, this is
 * a no-op (so re-scheduling the same campaign doesn't duplicate).
 */
export async function materializeRecipients(
  campaignId: string
): Promise<number> {
  const campaign = await db.emailCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) throw new Error("Campaign not found");

  const existingCount = await db.emailRecipient.count({
    where: { campaignId },
  });
  if (existingCount > 0) return existingCount;

  const listConfig = JSON.parse(campaign.listConfigJson) as any;
  const { buildRecipientList } = await import("./list-builder");
  const recipients = await buildRecipientList(
    campaign.listSource as any,
    listConfig
  );

  const rows = recipients.map((r) => ({
    campaignId,
    email: r.email,
    name: r.name,
    userId: r.userId,
    trackToken: generateTrackToken(),
    status: "QUEUED" as const,
  }));

  const INSERT_BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    try {
      const r = await db.emailRecipient.createMany({
        data: batch as any,
        skipDuplicates: true,
      });
      inserted += r.count;
    } catch (err) {
      console.error(`[email-campaign] insert batch failed:`, err);
    }
  }

  await db.emailCampaign.update({
    where: { id: campaignId },
    data: { recipientCount: inserted },
  });

  return inserted;
}
