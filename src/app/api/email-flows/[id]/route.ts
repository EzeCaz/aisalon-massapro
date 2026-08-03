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

async function checkAuth(req: NextRequest): Promise<{ ok: true; adminUserId: string | null } | { ok: false }> {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearerToken && CRON_SECRET && bearerToken === CRON_SECRET) {
    // Cron caller — no real user id. Campaign auto-create on flow save
    // is skipped when adminUserId is null (cron doesn't usually save
    // flows to ACTIVE, but we still need to handle it gracefully).
    return { ok: true, adminUserId: null };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false };
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false };
  return { ok: true, adminUserId: me.id };
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
  const adminUserId = auth.adminUserId;

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

  // ── Fetch PREVIOUS flow state ────────────────────────────────────────────
  // TSK-0074 Phase 5A: needed to detect ACTIVE → non-ACTIVE transitions so
  // we can pause the linked campaign if the flow is being deactivated.
  const previous = await db.emailFlow.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, chapterId: true },
  });
  if (!previous) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const previousStatus = previous.status;
  const newStatus = body.status !== undefined ? body.status : previousStatus;

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

  // ── TSK-0074 Phase 5A: sync linked EmailCampaign ──────────────────────────
  // When a flow is saved as ACTIVE, ensure there's a linked campaign whose
  // snapshots mirror the flow's first step. When the flow is deactivated,
  // pause any DRAFT linked campaign so it doesn't show as "ready to send".
  let linkedCampaignId: string | null = null;
  try {
    if (newStatus === "ACTIVE") {
      // Load the first step (with template + audience) so we can snapshot it.
      const firstStep = await db.emailFlowStep.findFirst({
        where: { flowId: id },
        orderBy: { position: "asc" },
        include: {
          template: {
            select: {
              id: true,
              subject: true,
              bodyHtml: true,
              bodyText: true,
              signatureHtml: true,
            },
          },
          audience: { select: { id: true, name: true } },
        },
      });

      const existingCampaign = await db.emailCampaign.findUnique({
        where: { flowId: id },
        select: { id: true, status: true },
      });

      if (!existingCampaign) {
        // Create a fresh DRAFT campaign linked to this flow.
        // Skip creation if adminUserId is null (cron caller) — can't
        // satisfy the createdBy FK constraint without a real user id.
        if (adminUserId) {
          const subject =
            firstStep?.template?.subject ??
            firstStep?.subjectVariantA ??
            "";
          const bodyHtml = firstStep?.template?.bodyHtml ?? "";
          const bodyText = firstStep?.template?.bodyText ?? null;
          const signatureHtml = firstStep?.template?.signatureHtml ?? null;
          const listSource = firstStep?.audienceId
            ? `AUDIENCE:${firstStep.audienceId}`
            : "ALL_MEMBERS";
          const listConfigJson = JSON.stringify({
            audienceId: firstStep?.audienceId ?? null,
          });

          const created = await db.emailCampaign.create({
            data: {
              // Use the NEW name if the flow is being renamed, otherwise
              // the previous name. previous.name is the OLD name (fetched
              // before update); body.name (if set) is the NEW name.
              name: `${body.name !== undefined ? body.name : previous.name} — campaign`,
              flowId: id,
              templateId: firstStep?.templateId ?? null,
              subjectSnapshot: subject,
              bodyHtmlSnapshot: bodyHtml,
              bodyTextSnapshot: bodyText,
              signatureHtmlSnapshot: signatureHtml,
              listSource,
              listConfigJson,
              recipientCount: 0,
              status: "DRAFT",
              fromName: "AI Salon",
              fromEmail:
                process.env.SMTP_FROM || "no-reply@aisalon.massapro.com",
              replyTo: null,
              createdBy: adminUserId,
              chapterId: previous.chapterId,
            },
          });
          linkedCampaignId = created.id;
        }
      } else {
        // Existing campaign — refresh snapshots from the flow's first step.
        // Keep the existing status (don't reset SENT → DRAFT).
        const updatePayload: Record<string, unknown> = {};
        if (firstStep?.templateId !== undefined) {
          updatePayload.templateId = firstStep.templateId ?? null;
        }
        if (firstStep?.template?.subject || firstStep?.subjectVariantA) {
          updatePayload.subjectSnapshot =
            firstStep?.template?.subject ??
            firstStep?.subjectVariantA ??
            "";
        }
        if (firstStep?.template?.bodyHtml) {
          updatePayload.bodyHtmlSnapshot = firstStep.template.bodyHtml;
        }
        if (firstStep?.template?.bodyText !== undefined) {
          updatePayload.bodyTextSnapshot = firstStep.template.bodyText ?? null;
        }
        if (firstStep?.template?.signatureHtml !== undefined) {
          updatePayload.signatureHtmlSnapshot =
            firstStep.template.signatureHtml ?? null;
        }
        if (firstStep?.audienceId !== undefined) {
          updatePayload.listSource = firstStep.audienceId
            ? `AUDIENCE:${firstStep.audienceId}`
            : "ALL_MEMBERS";
          updatePayload.listConfigJson = JSON.stringify({
            audienceId: firstStep.audienceId ?? null,
          });
        }
        // Sync name with the flow's name (only if the campaign is still DRAFT
        // — don't rename a SENT campaign's audit record).
        if (existingCampaign.status === "DRAFT" && body.name !== undefined) {
          updatePayload.name = `${body.name} — campaign`;
        }
        if (Object.keys(updatePayload).length > 0) {
          await db.emailCampaign.update({
            where: { id: existingCampaign.id },
            data: updatePayload,
          });
        }
        linkedCampaignId = existingCampaign.id;
      }
    } else {
      // Flow is NOT ACTIVE (DRAFT, PAUSED, or ARCHIVED).
      // Don't delete the linked campaign — just pause DRAFT ones so they
      // don't appear "ready to send" while the flow is inactive.
      // Specifically handle the ACTIVE → non-ACTIVE transition.
      const wasActive = previousStatus === "ACTIVE";
      const linked = await db.emailCampaign.findUnique({
        where: { flowId: id },
        select: { id: true, status: true },
      });
      if (linked) {
        linkedCampaignId = linked.id;
        if (wasActive && linked.status === "DRAFT") {
          await db.emailCampaign.update({
            where: { id: linked.id },
            data: { status: "PAUSED" },
          });
        }
      }
    }
  } catch (e) {
    // Campaign sync is best-effort — don't fail the flow PATCH if it
    // errors. Log and continue so the flow save itself always succeeds.
    console.error("[email-flows PATCH] campaign sync failed:", e);
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
  return NextResponse.json({ ok: true, flow: updated, linkedCampaignId });
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
