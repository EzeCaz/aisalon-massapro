/**
 * POST /api/email-orchestrator/run
 *
 * Triggers the email orchestrator workers. Auth:
 *   - Bearer CRON_SECRET (for Vercel Cron)
 *   - OR an authenticated admin session (for manual triggers from the UI)
 *
 * Runs BOTH workers:
 *   - Legacy stage-based orchestrator (5 hardcoded stages — only fires on
 *     real RSVPs without any flow queue rows)
 *   - New flow worker (per-step triggered sends)
 *
 * Response:
 *   { result: LegacyResult, flowResult: FlowWorkerResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { runWorker } from "@/lib/email-orchestrator/worker";
import { runFlowWorker } from "@/lib/email-orchestrator/flow-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel serverless max duration

export async function POST(req: NextRequest) {
  // ── Auth: CRON_SECRET OR admin session ──
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();

  let authed = false;
  if (cronSecret && provided === cronSecret) {
    authed = true;
  } else {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      const me = await db.user.findUnique({
        where: { email: session.user.email },
        select: { role: true },
      });
      if (me && can(me.role, "members.view")) authed = true;
    }
  }

  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Run BOTH workers in parallel:
    //   - Legacy stage-based orchestrator (5 hardcoded stages)
    //   - New flow worker (per-step triggered sends)
    const [legacyResult, flowResult] = await Promise.all([
      runWorker().catch((err) => ({
        error: err instanceof Error ? err.message : String(err),
        created: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        processed: 0,
        errors: [String(err)],
      })),
      runFlowWorker().catch((err) => ({
        sent: 0,
        failed: 0,
        processed: 0,
        errorDetails: [{ queueId: "", error: String(err) }],
      })),
    ]);
    return NextResponse.json({ result: legacyResult, flowResult });
  } catch (err) {
    console.error("[email-orchestrator/run] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/** Also allow GET for Vercel Cron (which uses GET by default). */
export async function GET(req: NextRequest) {
  return POST(req);
}
