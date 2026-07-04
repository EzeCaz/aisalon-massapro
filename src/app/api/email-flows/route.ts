/**
 * GET /api/email-flows — list all flows (with summary counts per status).
 * POST /api/email-flows — create a new flow.
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
  if (bearerToken && CRON_SECRET && bearerToken === CRON_SECRET) return { ok: true, mode: "cron" as const };

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false };
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false };
  return { ok: true, mode: "admin" as const, userId: me.id };
}

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const flows = await db.emailFlow.findMany({
    include: {
      _count: { select: { runs: true, steps: true } },
      triggerEvent: { select: { id: true, title: true, slug: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Summary counts of run statuses per flow.
  const runStats = await db.emailFlowRun.groupBy({
    by: ["flowId", "status"],
    _count: true,
  });
  const statsByFlow = new Map<string, Record<string, number>>();
  for (const r of runStats) {
    const f = statsByFlow.get(r.flowId) ?? {};
    f[r.status] = r._count;
    statsByFlow.set(r.flowId, f);
  }

  return NextResponse.json({
    flows: flows.map((f) => ({
      ...f,
      runStats: statsByFlow.get(f.id) ?? {},
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    description?: string;
    triggerKind?: string;
    triggerEventId?: string | null;
    branchEvaluationDelayHours?: number;
    steps?: Array<{
      position: number;
      templateId?: string | null;
      subjectOverride?: string | null;
      delayValue?: number;
      delayUnit?: string;
      branchRulesJson?: string | null;
      filterJson?: string | null;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!body.triggerKind) return NextResponse.json({ error: "triggerKind required" }, { status: 400 });

  const flow = await db.emailFlow.create({
    data: {
      name: body.name,
      description: body.description || null,
      triggerKind: body.triggerKind,
      triggerEventId: body.triggerEventId || null,
      branchEvaluationDelayHours: body.branchEvaluationDelayHours ?? 5,
      createdBy: auth.mode === "admin" ? auth.userId : null,
      steps: body.steps?.length
        ? {
            create: body.steps.map((s) => ({
              position: s.position,
              templateId: s.templateId || null,
              subjectOverride: s.subjectOverride || null,
              delayValue: s.delayValue ?? 0,
              delayUnit: s.delayUnit ?? "HOURS",
              branchRulesJson: s.branchRulesJson || null,
              filterJson: s.filterJson || null,
            })),
          }
        : undefined,
    },
    include: { steps: true },
  });

  return NextResponse.json({ ok: true, flow });
}
