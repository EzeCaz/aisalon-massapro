/**
 * GET /api/email-flows — list all flows (with summary counts per status).
 * POST /api/email-flows — create a new flow.
 *
 * Auth: CRON_SECRET bearer OR admin session.
 *
 * Step body shape (new model):
 *   {
 *     position: number,           // 1..8
 *     audienceId?: string | null, // reusable EmailAudience id
 *     triggerKind?: string | null,// RSVP_GOING | DOOR_CHECKED_IN | MARKED_ATTENDED | MARKED_NO_SHOW | MANUAL
 *     triggerEventId?: string | null, // null = all events
 *     templateId?: string | null, // EmailStageTemplate id (null = wait-only)
 *     subjectVariantA?: string | null, // Subject A (null = use template.subject)
 *     subjectVariantB?: string | null, // Subject B (null = no A/B test)
 *     delayValue?: number,        // default 0
 *     delayUnit?: string,         // MINUTES | HOURS | DAYS (default MINUTES)
 *   }
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
      _count: { select: { steps: true } },
      steps: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          audienceId: true,
          triggerKind: true,
          triggerEventId: true,
          templateId: true,
          subjectVariantA: true,
          subjectVariantB: true,
          delayValue: true,
          delayUnit: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Summary counts of queue items per flow (by status) — replaces the old
  // EmailFlowRun-based stats. We group EmailQueue rows by their step's flowId.
  const queueStats = await db.emailQueue.findMany({
    where: { flowStepId: { not: null } },
    select: {
      status: true,
      flowStep: { select: { flowId: true } },
    },
  });
  const statsByFlow = new Map<string, Record<string, number>>();
  for (const q of queueStats) {
    const fid = q.flowStep?.flowId;
    if (!fid) continue;
    const f = statsByFlow.get(fid) ?? {};
    f[q.status] = (f[q.status] ?? 0) + 1;
    f.total = (f.total ?? 0) + 1;
    statsByFlow.set(fid, f);
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
    status?: string;
    steps?: Array<{
      position: number;
      audienceId?: string | null;
      triggerKind?: string | null;
      triggerEventId?: string | null;
      templateId?: string | null;
      subjectVariantA?: string | null;
      subjectVariantB?: string | null;
      delayValue?: number;
      delayUnit?: string;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Cap steps at 8.
  const steps = (body.steps ?? []).slice(0, 8);

  const flow = await db.emailFlow.create({
    data: {
      name: body.name,
      description: body.description || null,
      status: body.status || "DRAFT",
      createdBy: auth.mode === "admin" ? auth.userId : null,
      steps: steps.length
        ? {
            create: steps.map((s) => ({
              position: s.position,
              audienceId: s.audienceId || null,
              triggerKind: s.triggerKind || null,
              triggerEventId: s.triggerEventId || null,
              templateId: s.templateId || null,
              subjectVariantA: s.subjectVariantA || null,
              subjectVariantB: s.subjectVariantB || null,
              delayValue: s.delayValue ?? 0,
              delayUnit: s.delayUnit ?? "MINUTES",
            })),
          }
        : undefined,
    },
    include: { steps: { orderBy: { position: "asc" } } },
  });

  return NextResponse.json({ ok: true, flow });
}
