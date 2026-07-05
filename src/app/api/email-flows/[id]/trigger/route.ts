/**
 * POST /api/email-flows/[id]/trigger — manually trigger a flow's steps for
 * a specific RSVP, OR send to the flow's test audience.
 *
 * Body options:
 *   { rsvpId: string }                  — trigger all steps for one RSVP
 *   { stepId: string, rsvpId: string }  — trigger one step for one RSVP
 *   { stepId: string, eventId: string } — trigger one step for ALL members
 *                                          of its audience (the "send to
 *                                          test audience" action)
 *
 * Auth: CRON_SECRET bearer OR admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  manuallyTriggerStep,
  manuallyTriggerStepForAudience,
} from "@/lib/email-orchestrator/flow-trigger";

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
  let body: { stepId?: string; rsvpId?: string; eventId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Mode 1: send one step to its entire audience (the "send to test
  // audience" action). Requires stepId + eventId.
  if (body.stepId && body.eventId && !body.rsvpId) {
    // Verify the step belongs to this flow.
    const step = await db.emailFlowStep.findUnique({
      where: { id: body.stepId },
      select: { flowId: true },
    });
    if (!step || step.flowId !== flowId) {
      return NextResponse.json({ error: "step not found in this flow" }, { status: 404 });
    }

    const result = await manuallyTriggerStepForAudience(
      body.stepId,
      body.eventId,
      adminUserId || "cron",
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      created: result.created,
      skipped: result.skipped,
    });
  }

  // Mode 2: trigger one step for a specific RSVP.
  if (body.stepId && body.rsvpId) {
    const step = await db.emailFlowStep.findUnique({
      where: { id: body.stepId },
      select: { flowId: true },
    });
    if (!step || step.flowId !== flowId) {
      return NextResponse.json({ error: "step not found in this flow" }, { status: 404 });
    }

    const result = await manuallyTriggerStep(
      body.stepId,
      body.rsvpId,
      adminUserId || "cron",
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true, queueId: result.queueId });
  }

  // Mode 3: trigger ALL steps in the flow for a specific RSVP (one-off).
  // Each step with a template + matching audience gets a queue row.
  if (body.rsvpId && !body.stepId) {
    const steps = await db.emailFlowStep.findMany({
      where: { flowId, templateId: { not: null } },
      include: {
        audience: { select: { id: true, emailsJson: true } },
        flow: { select: { status: true } },
      },
    });

    let created = 0;
    let skipped = 0;
    for (const step of steps) {
      const r = await manuallyTriggerStep(step.id, body.rsvpId, adminUserId || "cron");
      if (r.ok) created++;
      else skipped++;
    }
    return NextResponse.json({ ok: true, created, skipped });
  }

  return NextResponse.json(
    { error: "Provide { stepId, eventId } for audience send, or { rsvpId } for single-RSVP trigger, or { stepId, rsvpId } for single step+RSVP" },
    { status: 400 },
  );
}
