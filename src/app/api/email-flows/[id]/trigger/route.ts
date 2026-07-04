/**
 * POST /api/email-flows/[id]/trigger — manually trigger a flow for a RSVP.
 *
 * Body: { rsvpId: string }
 *
 * Creates an EmailFlowRun with status=ACTIVE + nextRunAt=now. The
 * worker picks it up on the next cron tick.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { manuallyTriggerFlow } from "@/lib/email-orchestrator/flow-trigger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Auth: CRON_SECRET OR admin session.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  let adminUserId: string | null = null;

  if (cronSecret && provided === cronSecret) {
    adminUserId = "cron";
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const me = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });
    if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    adminUserId = me.id;
  }

  const { id: flowId } = await params;
  let body: { rsvpId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.rsvpId) {
    return NextResponse.json({ error: "rsvpId required" }, { status: 400 });
  }

  const result = await manuallyTriggerFlow(flowId, body.rsvpId, adminUserId || "cron");
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, runId: result.runId });
}
