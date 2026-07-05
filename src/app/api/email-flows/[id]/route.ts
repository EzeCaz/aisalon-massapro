/**
 * GET    /api/email-flows/[id] — get one flow (with steps + recent queue items).
 * PATCH  /api/email-flows/[id] — update flow fields + replace all steps.
 * DELETE /api/email-flows/[id] — archive (soft delete) the flow.
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
      steps: {
        orderBy: { position: "asc" },
        include: {
          audience: { select: { id: true, name: true, isTest: true } },
          template: { select: { id: true, name: true, subject: true, stage: true } },
        },
      },
      // Recent queue items for this flow's steps (for the report + history).
      // We can't directly query by flowId on EmailQueue, so we load queue
      // items whose flowStepId is in this flow's steps. Done client-side via
      // the dedicated /api/email-flows/[id]/report endpoint.
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

  // Update flow fields.
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.status !== undefined) updateData.status = body.status;

  // Cap steps at 8.
  const steps = body.steps !== undefined ? body.steps.slice(0, 8) : undefined;

  // Replace steps if provided (transactional delete + recreate).
  if (steps !== undefined) {
    await db.$transaction([
      db.emailFlowStep.deleteMany({ where: { flowId: id } }),
      db.emailFlow.update({
        where: { id },
        data: {
          ...updateData,
          steps: {
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
          },
        },
      }),
    ]);
  } else {
    await db.emailFlow.update({ where: { id }, data: updateData });
  }

  const updated = await db.emailFlow.findUnique({
    where: { id },
    include: {
      steps: {
        orderBy: { position: "asc" },
        include: {
          audience: { select: { id: true, name: true, isTest: true } },
          template: { select: { id: true, name: true, subject: true, stage: true } },
        },
      },
    },
  });
  return NextResponse.json({ ok: true, flow: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  // Soft-delete: set status=ARCHIVED. Don't actually delete — queue items
  // may still exist and we want to keep the audit trail.
  await db.emailFlow.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
  return NextResponse.json({ ok: true });
}
