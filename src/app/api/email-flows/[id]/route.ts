/**
 * GET    /api/email-flows/[id] — get one flow (with steps + recent runs).
 * PATCH  /api/email-flows/[id] — update flow fields + replace all steps.
 * DELETE /api/email-flows/[id] — archive (soft delete) the flow.
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
    select: { id: true, role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false };
  return { ok: true };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const flow = await db.emailFlow.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { position: "asc" } },
      triggerEvent: { select: { id: true, title: true, slug: true } },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          rsvp: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });
  if (!flow) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ flow });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: {
    name?: string;
    description?: string;
    triggerKind?: string;
    triggerEventId?: string | null;
    status?: string;
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

  // Update flow fields.
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.triggerKind !== undefined) updateData.triggerKind = body.triggerKind;
  if (body.triggerEventId !== undefined) updateData.triggerEventId = body.triggerEventId || null;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.branchEvaluationDelayHours !== undefined) updateData.branchEvaluationDelayHours = body.branchEvaluationDelayHours;

  // Replace steps if provided (transactional delete + recreate).
  if (body.steps !== undefined) {
    await db.$transaction([
      db.emailFlowStep.deleteMany({ where: { flowId: id } }),
      db.emailFlow.update({
        where: { id },
        data: {
          ...updateData,
          steps: {
            create: body.steps.map((s) => ({
              position: s.position,
              templateId: s.templateId || null,
              subjectOverride: s.subjectOverride || null,
              delayValue: s.delayValue ?? 0,
              delayUnit: s.delayUnit ?? "HOURS",
              branchRulesJson: s.branchRulesJson || null,
              filterJson: s.filterJson || null,
            })),
          },
        },
      }),
    ]);
  } else {
    await db.emailFlow.update({ where: { id }, data: updateData });
  }

  const updated = await db.emailFlow.findUnique({
    where: { id },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  return NextResponse.json({ ok: true, flow: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  // Soft-delete: set status=ARCHIVED. Don't actually delete — runs may
  // still be in flight and we want to keep the audit trail.
  await db.emailFlow.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
  return NextResponse.json({ ok: true });
}
