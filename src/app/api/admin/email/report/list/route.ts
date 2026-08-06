/**
 * GET /api/admin/email/report/list
 *
 * Unified email activity report — returns a flat list of every email
 * "send activity" in the system, blending three sources:
 *
 *   1. EmailCampaign with flowId = null  → type "campaign"
 *      (standalone campaigns composed in the admin UI)
 *
 *   2. EmailCampaign with flowId != null  → type "flow"
 *      (campaign auto-created from a flow — sent to the flow's audience)
 *
 *   3. EmailQueue rows with flowStepId = null → type "manual"
 *      (legacy stage-based orchestrator sends and one-off test sends
 *       that bypass the campaign system entirely)
 *
 * Each row carries enough context for the Report page:
 *   - audience name (derived from listSource for campaigns, or from the
 *     flow step's audience for flow-linked campaigns, or "Direct send"
 *     for manual queue items)
 *   - snapshot of the email body (bodyHtmlSnapshot for campaigns,
 *     htmlBody for queue items) so the eye/preview button can render
 *     the email as it was sent
 *   - per-row stats (recipients / sent / opened / clicked / failed)
 *
 * Auth: SUPER_ADMIN or ADMIN only.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a human-readable audience name from a campaign's listSource +
 * listConfigJson. The list-builder.ts module defines the canonical
 * sources; this is a best-effort renderer for the Report page.
 */
function describeCampaignAudience(
  listSource: string,
  listConfigJson: string,
): { name: string; id: string | null } {
  try {
    const cfg = JSON.parse(listConfigJson || "{}");
    switch (listSource) {
      case "all_members":
        return { name: "All members", id: null };
      case "non_members":
        return { name: "Non-members", id: null };
      case "event_rsvp": {
        const ev = cfg.eventId ? `event ${cfg.eventId.slice(-6)}` : "event";
        const statuses = Array.isArray(cfg.rsvpStatuses) && cfg.rsvpStatuses.length
          ? cfg.rsvpStatuses.join("/")
          : "going";
        return { name: `RSVP ${statuses} — ${ev}`, id: null };
      }
      case "manual_upload": {
        const n = Array.isArray(cfg.externalEmails) ? cfg.externalEmails.length
          : Array.isArray(cfg.emails) ? cfg.emails.length
          : 0;
        return { name: `Manual list (${n} emails)`, id: null };
      }
      case "specific_users": {
        const n = Array.isArray(cfg.userIds) ? cfg.userIds.length : 0;
        return { name: `Specific users (${n})`, id: null };
      }
      default:
        // Legacy formats like "ALL_MEMBERS", "TAG:Speaker", "EVENT:abc123",
        // "MANUAL:list@x.com,foo@y.com" — surface the raw value.
        return { name: listSource, id: null };
    }
  } catch {
    return { name: listSource || "—", id: null };
  }
}

// ── route ────────────────────────────────────────────────────────────────────

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1) All campaigns (covers type "campaign" + type "flow").
  const campaigns = await db.emailCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      template: { select: { id: true, name: true, category: true } },
      creator: { select: { id: true, email: true, name: true } },
      flow: { select: { id: true, name: true, status: true } },
      _count: { select: { recipients: true, events: true } },
    },
    take: 500, // cap to keep payload manageable
  });

  // 2) Manual sends — EmailQueue items without a flow step. These represent
  //    legacy stage-based orchestrator sends + any direct queue inserts
  //    (e.g. test-send). We group them by (subject, event) so the report
  //    shows one row per "send batch" rather than one row per recipient.
  //    Grouping reduces thousands of queue rows into a manageable list.
  const manualQueueItems = await db.emailQueue.findMany({
    where: { flowStepId: null },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true,
      email: true,
      subject: true,
      htmlBody: true,
      status: true,
      stage: true,
      sentAt: true,
      createdAt: true,
      openedAt: true,
      clickedAt: true,
      event: { select: { id: true, title: true } },
    },
  });

  // Group manual queue items by (subject || "(no subject)", eventId) so the
  // report shows one row per logical "send batch" instead of per recipient.
  type ManualGroup = {
    key: string;
    subject: string;
    eventId: string | null;
    eventTitle: string | null;
    htmlBody: string | null;
    statuses: Record<string, number>;
    recipients: number;
    firstCreatedAt: Date;
    lastSentAt: Date | null;
  };
  const manualGroups = new Map<string, ManualGroup>();
  for (const q of manualQueueItems) {
    const subj = q.subject || "(no subject)";
    const key = `${subj}::${q.event?.id ?? "no-event"}`;
    let g = manualGroups.get(key);
    if (!g) {
      g = {
        key,
        subject: subj,
        eventId: q.event?.id ?? null,
        eventTitle: q.event?.title ?? null,
        htmlBody: q.htmlBody,
        statuses: {},
        recipients: 0,
        firstCreatedAt: q.createdAt,
        lastSentAt: null,
      };
      manualGroups.set(key, g);
    }
    g.statuses[q.status] = (g.statuses[q.status] || 0) + 1;
    g.recipients += 1;
    if (q.sentAt) {
      if (!g.lastSentAt || q.sentAt > g.lastSentAt) g.lastSentAt = q.sentAt;
    }
    // Prefer a non-null htmlBody snapshot for the preview.
    if (!g.htmlBody && q.htmlBody) g.htmlBody = q.htmlBody;
  }

  // 3) For flow-linked campaigns, fetch each flow's first-step audience so
  //    the audience column shows the actual audience name rather than the
  //    listSource. This is a single batched query across all flowIds.
  const flowIds = campaigns.map((c) => c.flowId).filter(Boolean) as string[];
  const flowAudiences = new Map<string, { id: string | null; name: string }>();
  if (flowIds.length > 0) {
    const steps = await db.emailFlowStep.findMany({
      where: { flowId: { in: flowIds }, position: 1 },
      select: {
        flowId: true,
        audience: { select: { id: true, name: true } },
      },
    });
    for (const s of steps) {
      flowAudiences.set(s.flowId, {
        id: s.audience?.id ?? null,
        name: s.audience?.name ?? "Everyone (no audience)",
      });
    }
  }

  // 4) Aggregate per-campaign open/click/failed counts from EmailRecipient.
  //    EmailRecipient has the rich tracking data (sentAt, openCount, etc.).
  //    We do a single grouped query rather than N+1 per-campaign queries.
  const campaignIds = campaigns.map((c) => c.id);
  const recipientStats = await db.emailRecipient.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: campaignIds } },
    _count: { _all: true },
  });
  // Fold into a per-campaign summary map.
  const perCampaign = new Map<string, {
    sent: number; opened: number; clicked: number; failed: number; total: number;
  }>();
  for (const r of recipientStats) {
    const entry = perCampaign.get(r.campaignId) ?? { sent: 0, opened: 0, clicked: 0, failed: 0, total: 0 };
    entry.total += r._count._all;
    if (r.status === "SENT" || r.status === "BOUNCED") entry.sent += r._count._all;
    if (r.status === "FAILED") entry.failed += r._count._all;
    // OPENED/CLICKED are tracked via separate columns, not status — so we
    // approximate using status. (More accurate counts come from the
    // per-campaign stats endpoint.)
    perCampaign.set(r.campaignId, entry);
  }
  // For accurate opened/clicked, do one more grouped query.
  const openedAgg = await db.emailRecipient.groupBy({
    by: ["campaignId"],
    where: { campaignId: { in: campaignIds }, firstOpenedAt: { not: null } },
    _count: { _all: true },
  });
  for (const r of openedAgg) {
    const entry = perCampaign.get(r.campaignId);
    if (entry) entry.opened = r._count._all;
  }
  const clickedAgg = await db.emailRecipient.groupBy({
    by: ["campaignId"],
    where: { campaignId: { in: campaignIds }, firstClickedAt: { not: null } },
    _count: { _all: true },
  });
  for (const r of clickedAgg) {
    const entry = perCampaign.get(r.campaignId);
    if (entry) entry.clicked = r._count._all;
  }

  // 5) Build the unified row list.
  type ReportRow = {
    id: string;
    type: "campaign" | "flow" | "manual";
    name: string;
    subject: string;
    status: string;
    audienceName: string;
    audienceId: string | null;
    flowId: string | null;
    flowName: string | null;
    templateId: string | null;
    templateName: string | null;
    recipients: number;
    sentCount: number;
    openedCount: number;
    clickedCount: number;
    failedCount: number;
    createdAt: string;
    sentAt: string | null;
    bodyHtml: string | null;
    listSource: string | null;
    creatorEmail: string | null;
  };

  const rows: ReportRow[] = [];

  // 5a) Campaign rows (covers campaign + flow types).
  for (const c of campaigns) {
    const stats = perCampaign.get(c.id) ?? { sent: 0, opened: 0, clicked: 0, failed: 0, total: 0 };
    let audienceName: string;
    let audienceId: string | null = null;
    if (c.flowId) {
      const fa = flowAudiences.get(c.flowId);
      audienceName = fa?.name ?? "Flow audience";
      audienceId = fa?.id ?? null;
    } else {
      const a = describeCampaignAudience(c.listSource, c.listConfigJson);
      audienceName = a.name;
      audienceId = a.id;
    }
    rows.push({
      id: `campaign:${c.id}`,
      type: c.flowId ? "flow" : "campaign",
      name: c.name,
      subject: c.subjectSnapshot,
      status: c.status,
      audienceName,
      audienceId,
      flowId: c.flowId,
      flowName: c.flow?.name ?? null,
      templateId: c.templateId,
      templateName: c.template?.name ?? null,
      recipients: c._count.recipients || c.recipientCount || stats.total,
      sentCount: stats.sent,
      openedCount: stats.opened,
      clickedCount: stats.clicked,
      failedCount: stats.failed,
      createdAt: c.createdAt.toISOString(),
      sentAt: c.completedAt?.toISOString() ?? c.startedAt?.toISOString() ?? null,
      bodyHtml: c.bodyHtmlSnapshot,
      listSource: c.listSource,
      creatorEmail: c.creator?.email ?? null,
    });
  }

  // 5b) Manual rows.
  for (const g of manualGroups.values()) {
    const sent = (g.statuses.SENT || 0) + (g.statuses.OPENED || 0) + (g.statuses.CLICKED || 0);
    const opened = g.statuses.OPENED || 0 + g.statuses.CLICKED || 0;
    const clicked = g.statuses.CLICKED || 0;
    const failed = g.statuses.FAILED || 0;
    rows.push({
      id: `manual:${g.key}`,
      type: "manual",
      name: g.eventTitle ? `Manual — ${g.eventTitle}` : "Manual send",
      subject: g.subject,
      status: failed > 0 && sent === 0 ? "FAILED" : sent > 0 ? "SENT" : "PENDING",
      audienceName: g.eventTitle ? `Event: ${g.eventTitle}` : "Direct send",
      audienceId: null,
      flowId: null,
      flowName: null,
      templateId: null,
      templateName: null,
      recipients: g.recipients,
      sentCount: sent,
      openedCount: opened,
      clickedCount: clicked,
      failedCount: failed,
      createdAt: g.firstCreatedAt.toISOString(),
      sentAt: g.lastSentAt?.toISOString() ?? null,
      bodyHtml: g.htmlBody,
      listSource: null,
      creatorEmail: null,
    });
  }

  // Sort: most recent activity first (by sentAt if present, else createdAt).
  rows.sort((a, b) => {
    const at = a.sentAt ?? a.createdAt;
    const bt = b.sentAt ?? b.createdAt;
    return bt.localeCompare(at);
  });

  return NextResponse.json({
    rows,
    flows: campaigns
      .filter((c) => c.flowId && c.flow)
      .map((c) => ({ id: c.flow!.id, name: c.flow!.name }))
      // de-dupe by id (a flow could have only 1 linked campaign, but be safe)
      .filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i),
    campaigns: campaigns
      .filter((c) => !c.flowId)
      .map((c) => ({ id: c.id, name: c.name })),
  });
}
