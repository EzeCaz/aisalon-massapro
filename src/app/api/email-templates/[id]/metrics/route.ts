/**
 * GET /api/email-templates/[id]/metrics — aggregate metrics for a single
 * template across ALL flows + campaigns that used it.
 *
 * Returns:
 *   {
 *     template: { id, name, subject, stage, ... },
 *     metrics:  { sent, opened, clicked, failed, pending, openRate, clickRate },
 *     byVariant: { A: {...}, B: {...} },
 *     byFlow:   [ { flowId, flowName, sent, opened, clicked, failed } ],
 *     recentSends: [ { id, email, status, subjectVariant, sentAt, openedAt, clickedAt, flowName } ]
 *   }
 *
 * Auth: admin session (SUPER_ADMIN or ADMIN).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function checkAuth(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false };
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false };
  return { ok: true };
}

function aggregate(rows: { status: string }[]) {
  const sent = rows.filter((r) => r.status === "SENT" || r.status === "OPENED" || r.status === "CLICKED").length;
  const opened = rows.filter((r) => r.status === "OPENED" || r.status === "CLICKED").length;
  const clicked = rows.filter((r) => r.status === "CLICKED").length;
  const failed = rows.filter((r) => r.status === "FAILED").length;
  const pending = rows.filter((r) => r.status === "PENDING" || r.status === "QUEUED").length;
  return {
    sent,
    opened,
    clicked,
    failed,
    pending,
    openRate: sent > 0 ? (opened / sent) * 100 : 0,
    clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await db.emailStageTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Find all EmailQueue rows whose flowStep uses this template.
  // Join through EmailFlowStep → flow to get the flow name.
  const queueRows = await db.emailQueue.findMany({
    where: {
      flowStep: { templateId: id },
    },
    select: {
      id: true,
      email: true,
      status: true,
      subjectVariant: true,
      sentAt: true,
      openedAt: true,
      clickedAt: true,
      createdAt: true,
      flowStep: {
        select: {
          id: true,
          position: true,
          flow: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500, // cap for performance
  });

  // Overall metrics
  const metrics = aggregate(queueRows);

  // Per-variant breakdown. Legacy rows without a variant are treated as "A".
  const byVariant = {
    A: aggregate(queueRows.filter((r) => r.subjectVariant === "A" || r.subjectVariant === null)),
    B: aggregate(queueRows.filter((r) => r.subjectVariant === "B")),
  };

  // Per-flow breakdown
  const byFlowMap = new Map<string, { flowId: string; flowName: string; rows: { status: string }[] }>();
  for (const r of queueRows) {
    const flowId = r.flowStep?.flow.id ?? "unknown";
    const flowName = r.flowStep?.flow.name ?? "Unknown flow";
    if (!byFlowMap.has(flowId)) {
      byFlowMap.set(flowId, { flowId, flowName, rows: [] });
    }
    byFlowMap.get(flowId)!.rows.push({ status: r.status });
  }
  const byFlow = Array.from(byFlowMap.values()).map((f) => ({
    flowId: f.flowId,
    flowName: f.flowName,
    ...aggregate(f.rows),
  }));

  // Recent sends (last 25).
  const recentSends = queueRows.slice(0, 25).map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status,
    subjectVariant: r.subjectVariant,
    sentAt: r.sentAt,
    openedAt: r.openedAt,
    clickedAt: r.clickedAt,
    flowName: r.flowStep?.flow.name ?? "Unknown",
    stepPosition: r.flowStep?.position ?? null,
  }));

  return NextResponse.json({
    template: {
      id: template.id,
      name: template.name,
      subject: template.subject,
      stage: template.stage,
      isDefault: template.isDefault,
      isActive: template.isActive,
    },
    metrics,
    byVariant,
    byFlow,
    recentSends,
  });
}
