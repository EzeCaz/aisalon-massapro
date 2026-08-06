/**
 * POST /api/admin/email/report/batch-action
 *
 * Apply a batch action to one or more selected rows from the Email Report.
 * The Report page lets the admin check rows (any mix of campaign/flow/manual
 * types) and then trigger one of these actions:
 *
 *   action: "duplicate"
 *     Clones each selected campaign into a new DRAFT (preserves subject,
 *     body, list source, template link, etc.). For "manual" rows (no
 *     campaign), this is a no-op and returns a skipped count.
 *
 *   action: "send_to_audience"
 *     Clones each selected campaign into a new DRAFT, swaps the recipient
 *     list to the chosen audience, then immediately sends it. The audience
 *     is resolved from `audienceId` (an EmailAudience id) — its emails are
 *     expanded and used as the new listSource "manual_upload" with the
 *     full list of emails as externalEmails.
 *
 * Request body:
 *   {
 *     action: "duplicate" | "send_to_audience",
 *     rowIds: string[],          // e.g. ["campaign:abc", "flow:def", ...]
 *     audienceId?: string,       // required for send_to_audience
 *     newNameSuffix?: string,    // optional suffix appended to duplicated names
 *   }
 *
 * Response:
 *   {
 *     duplicated: number,
 *     sent: number,              // campaigns actually sent (send_to_audience only)
 *     skipped: number,           // rows that couldn't be processed (e.g. manual)
 *     errors: string[],          // per-row error messages
 *     newCampaignIds: string[],  // IDs of newly created campaigns
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { resolveAudienceEmailsById } from "@/lib/email-orchestrator/audience-filter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = (body?.action || "").toString();
  const rowIds: string[] = Array.isArray(body?.rowIds) ? body.rowIds : [];
  const audienceId = body?.audienceId ? (body.audienceId).toString() : null;
  const newNameSuffix = body?.newNameSuffix ? (body.newNameSuffix).toString() : " (copy)";

  if (!["duplicate", "send_to_audience"].includes(action)) {
    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  }
  if (rowIds.length === 0) {
    return NextResponse.json({ error: "No rows selected" }, { status: 400 });
  }
  if (action === "send_to_audience" && !audienceId) {
    return NextResponse.json({ error: "audienceId is required for send_to_audience" }, { status: 400 });
  }

  // Resolve the audience's full email list up-front (only for send_to_audience).
  let audienceEmails: string[] = [];
  let audienceName = "";
  if (action === "send_to_audience") {
    const audience = await db.emailAudience.findUnique({
      where: { id: audienceId! },
      select: { id: true, name: true, kind: true },
    });
    if (!audience) {
      return NextResponse.json({ error: "Audience not found" }, { status: 404 });
    }
    audienceName = audience.name;
    // resolveAudienceEmailsById handles both STATIC (parse emailsJson) and
    // DYNAMIC (run the filter spec against users/rsvps) audiences. This is
    // the same resolver used by the flow orchestrator when sending to an
    // audience, so behavior is consistent.
    audienceEmails = await resolveAudienceEmailsById(audienceId!);
    if (audienceEmails.length === 0) {
      return NextResponse.json(
        { error: `Audience "${audienceName}" has no emails to send to.` },
        { status: 400 },
      );
    }
  }

  // Extract campaign IDs from rowIds. Only "campaign:" and "flow:" prefixes
  // map to actual EmailCampaign records; "manual:" rows are skipped.
  const campaignRowIds = rowIds.filter((r) => r.startsWith("campaign:") || r.startsWith("flow:"));
  const skippedManualCount = rowIds.length - campaignRowIds.length;

  if (campaignRowIds.length === 0) {
    return NextResponse.json({
      duplicated: 0,
      sent: 0,
      skipped: skippedManualCount,
      errors: ["All selected rows are manual sends — cannot duplicate or resend. Select a campaign or flow row instead."],
      newCampaignIds: [],
    });
  }

  const campaignIds = campaignRowIds.map((r) => r.split(":").slice(1).join(":"));
  const sourceCampaigns = await db.emailCampaign.findMany({
    where: { id: { in: campaignIds } },
    include: {
      template: { select: { id: true, name: true } },
      flow: { select: { id: true, name: true, status: true } },
    },
  });

  const errors: string[] = [];
  const newCampaignIds: string[] = [];
  let duplicated = 0;
  let sent = 0;

  for (const src of sourceCampaigns) {
    try {
      const newName = `${src.name}${newNameSuffix}`;
      // For send_to_audience: override listSource to manual_upload + the
      // audience's email list. For plain duplicate: keep original listSource.
      const listSource = action === "send_to_audience" ? "manual_upload" : src.listSource;
      const listConfigJson = action === "send_to_audience"
        ? JSON.stringify({ externalEmails: audienceEmails })
        : src.listConfigJson;

      // Don't carry over flowId — the new campaign is a standalone copy,
      // not linked to the original flow (that would violate the 1:1 unique
      // constraint on EmailCampaign.flowId).
      const created = await db.emailCampaign.create({
        data: {
          name: newName,
          templateId: src.templateId,
          subjectSnapshot: src.subjectSnapshot,
          bodyHtmlSnapshot: src.bodyHtmlSnapshot,
          bodyTextSnapshot: src.bodyTextSnapshot,
          signatureHtmlSnapshot: src.signatureHtmlSnapshot,
          listSource,
          listConfigJson,
          status: "DRAFT",
          fromName: src.fromName,
          fromEmail: src.fromEmail,
          replyTo: src.replyTo,
          chapterId: src.chapterId,
          createdBy: admin.id,
        },
      });
      newCampaignIds.push(created.id);
      duplicated += 1;

      // For send_to_audience: immediately send the new campaign by
      // delegating to /api/admin/email/campaigns/[id]/send. We do an
      // internal fetch (same origin) so all the send logic stays in one
      // place. Forward the admin's cookies for auth.
      if (action === "send_to_audience") {
        const sendUrl = new URL(`/api/admin/email/campaigns/${created.id}/send`, req.url);
        const sendRes = await fetch(sendUrl, {
          method: "POST",
          headers: {
            cookie: req.headers.get("cookie") || "",
          },
        });
        if (sendRes.ok) {
          const data = await sendRes.json().catch(() => ({}));
          sent += 1;
          console.log(`[batch-action] sent ${created.id} to audience "${audienceName}":`, data.sentCount, "delivered");
        } else {
          const errData = await sendRes.json().catch(() => ({}));
          errors.push(`Failed to send "${src.name}" to audience "${audienceName}": ${errData.error || sendRes.statusText}`);
        }
      }
    } catch (e: any) {
      errors.push(`Failed to duplicate "${src.name}": ${e?.message || String(e)}`);
    }
  }

  return NextResponse.json({
    duplicated,
    sent,
    skipped: skippedManualCount,
    errors,
    newCampaignIds,
  });
}
