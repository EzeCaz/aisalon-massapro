/**
 * GET /api/email-flows/[id]/report
 *
 * Returns a per-step breakdown of email metrics for a flow, with a sub-level
 * by subject variant (A/B). Used by the Flow Runs Report tab in the builder.
 *
 * Response shape:
 *   {
 *     flow: { id, name, status, description },
 *     summary: { totalSent, totalOpened, totalClicked, totalFailed, totalPending, openRate, clickRate },
 *     steps: Array<{
 *       step: { id, position, audienceName, triggerKind, templateName, subjectA, subjectB },
 *       stats: { sent, opened, clicked, failed, pending, openRate, clickRate },
 *       byVariant: {
 *         A: { sent, opened, clicked, openRate, clickRate },
 *         B: { sent, opened, clicked, openRate, clickRate },
 *       },
 *     }>,
 *     recentQueue: Array<{ id, email, status, subjectVariant, sentAt, openedAt, clickedAt }>
 *   }
 *
 * Auth: CRON_SECRET bearer OR admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

async function checkAuth(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearerToken && CRON_SECRET && bearerToken === CRON_SECRET) return { ok: true };

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false };
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false };
  return { ok: true };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const flow = await db.emailFlow.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      description: true,
      steps: {
        orderBy: { position: "asc" },
        include: {
          audience: { select: { id: true, name: true, isTest: true } },
          template: { select: { id: true, name: true, subject: true, stage: true } },
        },
      },
    },
  });

  if (!flow) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Load all queue items for this flow's steps.
  const stepIds = flow.steps.map((s) => s.id);
  const queueItems = await db.emailQueue.findMany({
    where: { flowStepId: { in: stepIds } },
    select: {
      id: true,
      email: true,
      status: true,
      subjectVariant: true,
      sentAt: true,
      openedAt: true,
      clickedAt: true,
      scheduledFor: true,
      flowStepId: true,
      audienceId: true,
      errorMessage: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500, // cap for performance
  });

  // Build per-step + per-variant stats.
  const stepsReport = flow.steps.map((step) => {
    const stepItems = queueItems.filter((q) => q.flowStepId === step.id);

    const stats = computeStats(stepItems);
    const variantA = computeStats(stepItems.filter((q) => (q.subjectVariant ?? "A") === "A"));
    const variantB = computeStats(stepItems.filter((q) => q.subjectVariant === "B"));

    return {
      step: {
        id: step.id,
        position: step.position,
        audienceName: step.audience?.name ?? "Everyone (no audience filter)",
        isTestAudience: step.audience?.isTest ?? false,
        triggerKind: step.triggerKind ?? "—",
        triggerEventId: step.triggerEventId,
        templateName: step.template?.name ?? "—",
        templateStage: step.template?.stage ?? null,
        subjectA: step.subjectVariantA ?? step.template?.subject ?? "—",
        subjectB: step.subjectVariantB ?? null,
      },
      stats,
      byVariant: { A: variantA, B: variantB },
    };
  });

  // Flow-level summary (all steps combined).
  const summary = computeStats(queueItems);

  // Recent queue items (for the "recent activity" list).
  const recentQueue = queueItems.slice(0, 50).map((q) => ({
    id: q.id,
    email: q.email,
    status: q.status,
    subjectVariant: q.subjectVariant ?? "A",
    sentAt: q.sentAt?.toISOString() ?? null,
    openedAt: q.openedAt?.toISOString() ?? null,
    clickedAt: q.clickedAt?.toISOString() ?? null,
    scheduledFor: q.scheduledFor.toISOString(),
    errorMessage: q.errorMessage,
  }));

  return NextResponse.json({
    flow: {
      id: flow.id,
      name: flow.name,
      status: flow.status,
      description: flow.description,
    },
    summary,
    steps: stepsReport,
    recentQueue,
    totalCount: queueItems.length,
  });
}

type QueueItemLite = {
  id: string;
  status: string;
  subjectVariant: string | null;
  sentAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
};

function computeStats(items: QueueItemLite[]) {
  const sent = items.filter((q) => q.status === "SENT" || q.status === "OPENED" || q.status === "CLICKED").length;
  const opened = items.filter((q) => q.openedAt != null).length;
  const clicked = items.filter((q) => q.clickedAt != null).length;
  const failed = items.filter((q) => q.status === "FAILED").length;
  const pending = items.filter((q) => q.status === "PENDING").length;
  const skipped = items.filter((q) => q.status === "SKIPPED").length;

  return {
    sent,
    opened,
    clicked,
    failed,
    pending,
    skipped,
    total: items.length,
    openRate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0, // 1 decimal place, %
    clickRate: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0,
  };
}
