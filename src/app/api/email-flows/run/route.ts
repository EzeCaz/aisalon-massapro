/**
 * POST /api/email-flows/run — run the flow worker once (cron endpoint).
 *
 * Auth: CRON_SECRET bearer OR admin session.
 *
 * Response: { ok: true, result: WorkerResult }
 *
 * GET — health check + flow queue summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runFlowWorker } from "@/lib/email-orchestrator/flow-worker";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isCron = bearerToken && CRON_SECRET && bearerToken === CRON_SECRET;

  let isAdmin = false;
  if (!isCron) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const me = await db.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });
    isAdmin = !!me && ["SUPER_ADMIN", "ADMIN"].includes(me.role);
  }

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runFlowWorker();
  return NextResponse.json({ ok: true, result });
}

/** GET — health check + flow queue summary (replaces old EmailFlowRun stats). */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isCron = bearerToken && CRON_SECRET && bearerToken === CRON_SECRET;

  // Count flow queue items by status (replaces the old EmailFlowRun groupBy).
  const stats = await db.emailQueue.groupBy({
    by: ["status"],
    _count: true,
    where: { flowStepId: { not: null } },
  });
  const statsMap: Record<string, number> = {};
  for (const s of stats) statsMap[s.status] = s._count;

  return NextResponse.json({
    ok: true,
    auth: isCron ? "cron" : "anonymous",
    queueStats: statsMap,
    totalFlows: await db.emailFlow.count(),
    activeFlows: await db.emailFlow.count({ where: { status: "ACTIVE" } }),
  });
}
