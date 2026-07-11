/**
 * GET /api/email-orchestrator/queue
 *
 * Returns the orchestrator queue with summary counts. Auth:
 *   - Bearer CRON_SECRET OR admin session
 *
 * Query params:
 *   ?status=PENDING|SENT|...   — filter by status
 *   ?stage=1..5                 — filter by stage
 *   ?eventId=<id>               — filter by event
 *   ?search=<text>              — search by email/name
 *   ?limit=50&offset=0          — pagination (default 50, max 1000)
 *
 * Response:
 *   {
 *     items: EmailQueue[],
 *     summary: { total, pending, sent, opened, clicked, skipped, failed },
 *     events: { id, title, slug, startsAt }[]
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

async function checkAuth(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (cronSecret && provided === cronSecret) return true;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  return !!(me && can(me.role, "members.view"));
}

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const stageStr = url.searchParams.get("stage");
  const eventId = url.searchParams.get("eventId");
  const search = url.searchParams.get("search")?.trim();
  const limit = Math.min(
    1000,
    parseInt(url.searchParams.get("limit") || "50", 10),
  );
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const where: import("@prisma/client").Prisma.EmailQueueWhereInput = {};
  if (status && status !== "ALL") where.status = status;
  if (stageStr) where.stage = parseInt(stageStr, 10);
  if (eventId) where.eventId = eventId;
  if (search) {
    where.OR = [
      { email: { contains: search } },
      { rsvp: { name: { contains: search } } },
    ];
  }

  const [items, summaryCounts, events, totalMatching] = await Promise.all([
    db.emailQueue.findMany({
      where,
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            startsAt: true,
          },
        },
        rsvp: {
          select: {
            id: true,
            name: true,
            email: true,
            doorCheckedAt: true,
            checkInCode: true,
          },
        },
        _count: { select: { trackingLogs: true } },
      },
    }),
    db.emailQueue.groupBy({
      by: ["status"],
      _count: true,
    }),
    db.event.findMany({
      where: { emailQueueItems: { some: {} } },
      select: { id: true, title: true, slug: true, startsAt: true },
      orderBy: { startsAt: "desc" },
    }),
    // Total rows matching the current WHERE (filter-aware, independent of
    // limit/offset). Used by the UI to render "Showing X of Y" + Load-more.
    db.emailQueue.count({ where }),
  ]);

  const summary: Record<string, number> = { total: 0 };
  for (const row of summaryCounts) {
    summary[row.status] = row._count;
    summary.total += row._count;
  }

  // Serialize Date -> ISO string for client.
  const serialized = items.map((item) => ({
    ...item,
    scheduledFor: item.scheduledFor.toISOString(),
    sentAt: item.sentAt?.toISOString() ?? null,
    openedAt: item.openedAt?.toISOString() ?? null,
    clickedAt: item.clickedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    event: {
      ...item.event,
      startsAt: item.event.startsAt.toISOString(),
    },
    rsvp: item.rsvp
      ? {
          ...item.rsvp,
          doorCheckedAt: item.rsvp.doorCheckedAt?.toISOString() ?? null,
        }
      : null,
  }));

  return NextResponse.json({
    items: serialized,
    summary,
    events: events.map((e) => ({
      ...e,
      startsAt: e.startsAt.toISOString(),
    })),
    // Total rows matching the current WHERE (filter-aware).
    // Used by the UI to render "Showing X of Y" + the Load-more button.
    totalMatching,
    hasMore: offset + items.length < totalMatching,
  });
}
