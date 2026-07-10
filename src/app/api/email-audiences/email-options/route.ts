/**
 * GET /api/email-audiences/email-options
 *
 * Returns the list of selectable email targets for engagement-based audience
 * rules. The user picks from this list when configuring a rule like
 * "Did NOT open <email X>".
 *
 * Two kinds of targets are returned, with a stable composite value of
 * `<kind>:<id>` so the audience-filter evaluator can route them correctly:
 *
 *   - { value: "template:<id>", label: "Flow template — <name>",
 *       group: "Templates", stage?: 1-5, sentCount?: N }
 *   - { value: "campaign:<id>", label: "Campaign — <name> (<subject>)",
 *       group: "Campaigns", sentAt?: ISO, recipientCount?: N }
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

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ── Templates ────────────────────────────────────────────────────────────
  // All EmailStageTemplates (default stages + custom). For each, include the
  // number of EmailQueue rows that were SENT for this template, so the user
  // has a hint of how much tracking data exists.
  const templates = await db.emailStageTemplate.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      stage: true,
      subject: true,
      isDefault: true,
    },
    orderBy: [{ stage: "asc" }, { name: "asc" }],
  });

  // Pull sent counts in one query, group by stage + template id.
  const sentQueues = await db.emailQueue.groupBy({
    by: ["stage", "flowStepId"],
    where: { status: { in: ["SENT", "OPENED", "CLICKED"] } },
    _count: { _all: true },
  });
  // Build a lookup by (stage, flowStep.templateId) — we need templateId, so
  // also fetch the flow steps.
  const flowSteps = await db.emailFlowStep.findMany({
    where: { NOT: { templateId: null } },
    select: { id: true, templateId: true },
  });
  const stepIdToTemplateId = new Map(flowSteps.map((s) => [s.id, s.templateId]));
  // countByTemplateId: Map<templateId, number>
  const countByTemplateId = new Map<string, number>();
  for (const q of sentQueues) {
    if (q.flowStepId) {
      const tid = stepIdToTemplateId.get(q.flowStepId);
      if (tid) countByTemplateId.set(tid, (countByTemplateId.get(tid) ?? 0) + q._count._all);
    } else if (q.stage != null) {
      // Legacy orchestrator row — attribute to the default template for this stage.
      const t = templates.find((t) => t.stage === q.stage);
      if (t) countByTemplateId.set(t.id, (countByTemplateId.get(t.id) ?? 0) + q._count._all);
    }
  }

  const templateOptions = templates.map((t) => {
    const sentCount = countByTemplateId.get(t.id) ?? 0;
    const stageLabel = t.stage
      ? `Stage ${t.stage}`
      : "Custom";
    return {
      value: `template:${t.id}`,
      label: `${t.name} — "${t.subject}"  ·  ${stageLabel}${sentCount > 0 ? `  ·  ${sentCount} sent` : ""}`,
      group: "Templates (flow + stage defaults)",
      kind: "template" as const,
      templateId: t.id,
      stage: t.stage,
      sentCount,
    };
  });

  // ── Campaigns ────────────────────────────────────────────────────────────
  // Recent EmailCampaigns (limit 50, most recent first) that have actually
  // been sent (so they have tracking data).
  const campaigns = await db.emailCampaign.findMany({
    where: { status: { in: ["SENT", "SENDING", "SCHEDULED"] } },
    select: {
      id: true,
      name: true,
      subjectSnapshot: true,
      status: true,
      recipientCount: true,
      completedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const campaignOptions = campaigns.map((c) => ({
    value: `campaign:${c.id}`,
    label: `${c.name} — "${c.subjectSnapshot}"  ·  ${c.recipientCount} recipients  ·  ${c.status}${c.completedAt ? `  ·  ${new Date(c.completedAt).toLocaleDateString()}` : ""}`,
    group: "Campaigns (one-off sends)",
    kind: "campaign" as const,
    campaignId: c.id,
    recipientCount: c.recipientCount,
    sentAt: c.completedAt,
  }));

  return NextResponse.json({
    options: [...templateOptions, ...campaignOptions],
    templates: templateOptions,
    campaigns: campaignOptions,
  });
}
