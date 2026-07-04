import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/email/campaigns/[id]/stats
 *
 * Returns aggregated stats for a campaign:
 *   - counts: total, sent, failed, opened, clicked, replied, bounced, unsubscribed
 *   - timeline: opens + clicks per hour for the first 48h after first send
 *   - clickMap: top 10 most-clicked URLs with counts
 *   - recentEvents: latest 50 EmailEvent rows
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
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Recipient status counts
  const statusGroups = await db.emailRecipient.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: true,
  });
  const counts: Record<string, number> = {
    QUEUED: 0,
    SENT: 0,
    FAILED: 0,
    BOUNCED: 0,
    UNSUBSCRIBED: 0,
  };
  for (const g of statusGroups) counts[g.status] = g._count;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Recipients that opened / clicked / replied
  const openedCount = await db.emailRecipient.count({
    where: { campaignId: id, openCount: { gt: 0 } },
  });
  const clickedCount = await db.emailRecipient.count({
    where: { campaignId: id, clickCount: { gt: 0 } },
  });
  const repliedCount = await db.emailRecipient.count({
    where: { campaignId: id, repliedAt: { not: null } },
  });

  // Click map — top 10 most-clicked URLs
  const clickEvents = await db.emailEvent.findMany({
    where: { campaignId: id, type: "CLICK", details: { not: null } },
    select: { details: true },
  });
  const urlCounts = new Map<string, number>();
  for (const e of clickEvents) {
    if (!e.details) continue;
    urlCounts.set(e.details, (urlCounts.get(e.details) ?? 0) + 1);
  }
  const clickMap = Array.from(urlCounts.entries())
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Timeline — opens + clicks per hour for first 48h after startedAt
  const startedAt = campaign.startedAt ?? campaign.createdAt;
  const sinceMs = Date.now() - startedAt.getTime();
  const hoursToShow = Math.min(48, Math.ceil(sinceMs / (1000 * 60 * 60)));
  const timeline: { hour: number; opens: number; clicks: number; replies: number }[] = [];
  for (let h = 0; h <= hoursToShow; h++) {
    const from = new Date(startedAt.getTime() + h * 60 * 60 * 1000);
    const to = new Date(from.getTime() + 60 * 60 * 1000);
    const opens = await db.emailEvent.count({
      where: { campaignId: id, type: "OPEN", createdAt: { gte: from, lt: to } },
    });
    const clicks = await db.emailEvent.count({
      where: { campaignId: id, type: "CLICK", createdAt: { gte: from, lt: to } },
    });
    const replies = await db.emailEvent.count({
      where: { campaignId: id, type: "REPLY", createdAt: { gte: from, lt: to } },
    });
    timeline.push({ hour: h, opens, clicks, replies });
  }

  // Recent events (latest 50)
  const recentEvents = await db.emailEvent.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { recipient: { select: { email: true, name: true } } },
  });

  return NextResponse.json({
    campaign,
    counts: {
      total,
      ...counts,
      opened: openedCount,
      clicked: clickedCount,
      replied: repliedCount,
    },
    timeline,
    clickMap,
    recentEvents,
  });
}
