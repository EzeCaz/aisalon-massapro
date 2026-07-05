/**
 * GET /api/email-flows/runs — list recent flow queue items (paginated).
 *
 * Replaces the old EmailFlowRun-based listing. Returns EmailQueue rows that
 * belong to flow steps (flowStepId IS NOT NULL), with their flow + step +
 * audience context.
 *
 * Query params:
 *   status   — filter by queue status (PENDING | SENT | OPENED | CLICKED | SKIPPED | FAILED)
 *   flowId   — filter by flow
 *   limit    — default 50, max 200
 *   offset   — default 0
 *
 * Auth: CRON_SECRET OR admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (cronSecret && provided === cronSecret) {
    // ok, cron
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const me = await db.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });
    if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const flowId = url.searchParams.get("flowId") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {
    flowStepId: { not: null },
  };
  if (status) where.status = status;
  if (flowId) where.flowStep = { flowId };

  const [items, total] = await Promise.all([
    db.emailQueue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        rsvp: { select: { id: true, email: true, name: true } },
        event: { select: { id: true, title: true, slug: true, startsAt: true } },
        flowStep: {
          select: {
            id: true,
            position: true,
            flowId: true,
            flow: { select: { id: true, name: true } },
            audience: { select: { id: true, name: true, isTest: true } },
            template: { select: { id: true, name: true, subject: true } },
          },
        },
      },
    }),
    db.emailQueue.count({ where }),
  ]);

  // Serialize Date -> ISO string for client.
  const serialized = items.map((item) => ({
    id: item.id,
    email: item.email,
    status: item.status,
    subjectVariant: item.subjectVariant,
    subject: item.subject,
    scheduledFor: item.scheduledFor.toISOString(),
    sentAt: item.sentAt?.toISOString() ?? null,
    openedAt: item.openedAt?.toISOString() ?? null,
    clickedAt: item.clickedAt?.toISOString() ?? null,
    errorMessage: item.errorMessage,
    createdAt: item.createdAt.toISOString(),
    rsvp: item.rsvp
      ? {
          id: item.rsvp.id,
          email: item.rsvp.email,
          name: item.rsvp.name,
        }
      : null,
    event: item.event
      ? {
          id: item.event.id,
          title: item.event.title,
          slug: item.event.slug,
          startsAt: item.event.startsAt.toISOString(),
        }
      : null,
    flowStep: item.flowStep
      ? {
          id: item.flowStep.id,
          position: item.flowStep.position,
          flow: item.flowStep.flow,
          audience: item.flowStep.audience,
          template: item.flowStep.template,
        }
      : null,
  }));

  return NextResponse.json({ runs: serialized, total, limit, offset });
}
