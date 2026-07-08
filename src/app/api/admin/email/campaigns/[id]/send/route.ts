import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { sendMail, emailConfigured } from "@/lib/email";
import { randomUUID } from "crypto";

/**
 * POST /api/admin/email/campaigns/[id]/send
 *
 * Resolves the recipient list based on listSource + listConfigJson, then
 * sends the campaign's snapshot to each recipient. Marks the campaign as
 * SENDING while in progress, then SENT (or FAILED if any error) when done.
 *
 * Behavior:
 *   - listSource === "ALL_MEMBERS": all users with an email
 *   - listSource === "TAG:<label>": all users with at least one matching tag
 *   - listSource === "EVENT:<eventId>": all users who RSVP'd to that event
 *   - listSource === "MANUAL": listConfigJson is { emails: ["a@x.com", ...] }
 *   - Otherwise: empty list (no recipients)
 *
 * This endpoint is synchronous — it sends all emails in the request. For
 * large lists (100+), this may exceed Vercel's serverless function timeout
 * (10s on Hobby, 60s on Pro). For production-grade sending, this should be
 * moved to a queue + background worker, but for the AI Salon community
 * (~100 members) this is sufficient.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status === "SENDING" || campaign.status === "SENT") {
    return NextResponse.json(
      { error: `Campaign already in status ${campaign.status}` },
      { status: 409 }
    );
  }

  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "SMTP is not configured on the server. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars." },
      { status: 503 }
    );
  }

  // ---- Resolve recipients ----
  const recipients = await resolveRecipients(campaign.listSource, campaign.listConfigJson);
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No recipients matched the list filter. Update the list source and try again." },
      { status: 400 }
    );
  }

  // ---- Mark as SENDING ----
  await db.emailCampaign.update({
    where: { id },
    data: {
      status: "SENDING",
      startedAt: new Date(),
      recipientCount: recipients.length,
    },
  });

  // ---- Wipe any prior recipients from a previous failed send ----
  await db.emailRecipient.deleteMany({ where: { campaignId: id } });

  // ---- Create recipient rows + send ----
  const fromName = campaign.fromName || "AI Salon Tel Aviv";
  const fromEmail = campaign.fromEmail || process.env.SMTP_FROM || "no-reply@aisalon.massapro.com";
  const from = `${fromName} <${fromEmail}>`;
  const replyTo = campaign.replyTo || undefined;

  // If the campaign targets an event (listSource === "EVENT:<eventId>"),
  // look up the event slug + title so we can resolve {{eventUrl}},
  // {{myCodeUrl}}, {{event.myCodeUrl}}, {{eventTitle}} merge tags.
  // Falls through to "no event context" (tokens resolve to "") if the
  // event was deleted or the campaign isn't event-bound.
  const eventMatch = campaign.listSource.match(/^EVENT:(.+)$/);
  const eventCtx = eventMatch
    ? await db.event.findUnique({
        where: { id: eventMatch[1] },
        select: { slug: true, title: true, venue: true, address: true },
      })
    : null;
  const baseUrl =
    process.env.EMAIL_TRACKING_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://aisalon.massapro.com";
  const eventUrl = eventCtx ? `${baseUrl}/e/${eventCtx.slug}` : "";
  const myCodeUrl = eventCtx ? `${eventUrl}/my-code` : "";

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    // Per-recipient trackToken (for open/click tracking later)
    const trackToken = randomUUID().replace(/-/g, "");
    const recipientRow = await db.emailRecipient.create({
      data: {
        campaignId: id,
        userId: r.userId || null,
        email: r.email,
        name: r.name || null,
        trackToken,
        status: "QUEUED",
      },
    });

    // Personalize the body — replace merge fields. {{name}}/{{email}} are
    // always available; {{eventUrl}}, {{myCodeUrl}}, {{event.myCodeUrl}},
    // {{eventTitle}}, {{eventVenue}}, {{eventAddress}} only resolve when
    // the campaign targets an event (otherwise stripped to "").
    const personalizedHtml = campaign.bodyHtmlSnapshot
      .replace(/\{\{name\}\}/g, r.name || "there")
      .replace(/\{\{email\}\}/g, r.email)
      .replace(/\{\{\s*eventUrl\s*\}\}/g, eventUrl)
      .replace(/\{\{\s*event\.myCodeUrl\s*\}\}/g, myCodeUrl)
      .replace(/\{\{\s*myCodeUrl\s*\}\}/g, myCodeUrl)
      .replace(/\{\{\s*eventTitle\s*\}\}/g, eventCtx?.title || "")
      .replace(/\{\{\s*eventVenue\s*\}\}/g, eventCtx?.venue || "")
      .replace(/\{\{\s*eventAddress\s*\}\}/g, eventCtx?.address || "");
    const personalizedSubject = campaign.subjectSnapshot
      .replace(/\{\{name\}\}/g, r.name || "there")
      .replace(/\{\{\s*eventUrl\s*\}\}/g, eventUrl)
      .replace(/\{\{\s*event\.myCodeUrl\s*\}\}/g, myCodeUrl)
      .replace(/\{\{\s*myCodeUrl\s*\}\}/g, myCodeUrl)
      .replace(/\{\{\s*eventTitle\s*\}\}/g, eventCtx?.title || "");

    const result = await sendMail({
      to: r.email,
      cc: undefined,
      subject: personalizedSubject,
      html: personalizedHtml,
      from,
      ...(replyTo ? { cc: replyTo } : {}),
    });

    if (result.ok) {
      sentCount++;
      await db.emailRecipient.update({
        where: { id: recipientRow.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      await db.emailEvent.create({
        data: {
          campaignId: id,
          recipientId: recipientRow.id,
          email: r.email,
          type: "SENT",
        },
      });
    } else {
      failedCount++;
      await db.emailRecipient.update({
        where: { id: recipientRow.id },
        data: { status: "FAILED", errorReason: result.error || "Unknown error" },
      });
      await db.emailEvent.create({
        data: {
          campaignId: id,
          recipientId: recipientRow.id,
          email: r.email,
          type: "FAILED",
          details: result.error || "Unknown error",
        },
      });
      errors.push(`${r.email}: ${result.error}`);
    }
  }

  // ---- Mark as SENT (or FAILED if all sends failed) ----
  const finalStatus = sentCount === 0 ? "FAILED" : "SENT";
  await db.emailCampaign.update({
    where: { id },
    data: {
      status: finalStatus,
      completedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    status: finalStatus,
    sentCount,
    failedCount,
    totalRecipients: recipients.length,
    ...(errors.length > 0 ? { errors: errors.slice(0, 20) } : {}),
  });
}

/**
 * Resolve the list of recipients based on listSource + listConfigJson.
 */
async function resolveRecipients(
  listSource: string,
  listConfigJson: string
): Promise<Array<{ userId?: string; email: string; name?: string | null }>> {
  let config: any = {};
  try {
    config = JSON.parse(listConfigJson || "{}");
  } catch {
    config = {};
  }

  // ALL_MEMBERS — every user with an email
  if (listSource === "ALL_MEMBERS") {
    const users = await db.user.findMany({
      where: { email: { not: "" } },
      select: { id: true, email: true, name: true },
    });
    return users.map((u) => ({ userId: u.id, email: u.email, name: u.name }));
  }

  // TAG:<label> — all users with at least one MemberTag matching the label
  const tagMatch = listSource.match(/^TAG:(.+)$/);
  if (tagMatch) {
    const label = tagMatch[1];
    const users = await db.user.findMany({
      where: { tags: { some: { label } } },
      select: { id: true, email: true, name: true },
    });
    return users.map((u) => ({ userId: u.id, email: u.email, name: u.name }));
  }

  // EVENT:<eventId> — all users who RSVP'd to that event
  const eventMatch = listSource.match(/^EVENT:(.+)$/);
  if (eventMatch) {
    const eventId = eventMatch[1];
    const rsvps = await db.eventRsvp.findMany({
      where: { eventId, status: "GOING" },
      select: { userId: true, email: true, name: true },
    });
    return rsvps.map((r) => ({
      userId: r.userId || undefined,
      email: r.email,
      name: r.name,
    }));
  }

  // MANUAL — listConfigJson is { emails: ["a@x.com", ...] }
  if (listSource === "MANUAL" && Array.isArray(config.emails)) {
    const seen = new Set<string>();
    const out: Array<{ userId?: string; email: string; name?: string | null }> = [];
    for (const emailRaw of config.emails) {
      const email = (emailRaw || "").toString().trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      // Try to resolve to a platform user
      const user = await db.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true },
      });
      out.push({
        userId: user?.id,
        email,
        name: user?.name || null,
      });
    }
    return out;
  }

  return [];
}
