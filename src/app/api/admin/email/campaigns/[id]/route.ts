import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/email/campaigns/[id]
 *   Get a single campaign with full details including recipients and events.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await db.emailCampaign.findUnique({
    where: { id },
    include: {
      template: { select: { id: true, name: true, category: true } },
      creator: { select: { id: true, email: true, name: true } },
      flow: { select: { id: true, name: true, status: true } },
      recipients: {
        orderBy: { createdAt: "desc" },
        take: 200, // cap to avoid huge payloads
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          sentAt: true,
          openCount: true,
          clickCount: true,
          firstOpenedAt: true,
          lastOpenedAt: true,
          errorReason: true,
        },
      },
      _count: { select: { recipients: true, events: true } },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}

/**
 * PATCH /api/admin/email/campaigns/[id]
 *   Update a DRAFT (or PAUSED) campaign's content + status.
 *   Once status is SENDING or SENT, the snapshot is frozen and cannot
 *   be edited. Allowed status transitions:
 *     DRAFT    → SCHEDULED | SENDING | PAUSED
 *     PAUSED   → DRAFT (resume) | SCHEDULED
 *     SCHEDULED→ PAUSED | SENDING
 *     SENDING  → (frozen, only status→FAILED allowed via cron)
 *     SENT     → (frozen)
 *     FAILED   → DRAFT (retry) | PAUSED
 *
 * Body fields (any subset):
 *   name, subject, bodyHtml, bodyText, signatureHtml,
 *   fromName, fromEmail, replyTo, listSource, listConfigJson, templateId,
 *   status  (one of: DRAFT | SCHEDULED | PAUSED)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.emailCampaign.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Status transitions (TSK-0074 Phase 5D) ───────────────────────────────
  // PAUSED is now a valid status — used when a flow is deactivated while a
  // linked campaign is still in DRAFT, or when an admin manually pauses a
  // SENDING / SCHEDULED campaign.
  const VALID_STATUSES = ["DRAFT", "SCHEDULED", "SENDING", "SENT", "FAILED", "PAUSED"];
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Invalid status "${body.status}". Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  // Once sending has started, snapshots are frozen. The only allowed PATCH
  // on a SENDING/SENT campaign is a status change (e.g. SENDING → PAUSED
  // to halt an in-progress send, or SENDING → FAILED by the cron worker).
  const isFrozen = existing.status === "SENDING" || existing.status === "SENT";
  const isStatusOnlyPatch =
    body.status !== undefined &&
    Object.keys(body).every((k) => k === "status");

  if (isFrozen && !isStatusOnlyPatch) {
    return NextResponse.json(
      { error: `Cannot edit a campaign in status ${existing.status} (only status changes allowed)` },
      { status: 409 },
    );
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = (body.name).toString().trim();
  if (body.subject !== undefined) data.subjectSnapshot = (body.subject).toString().trim();
  if (body.bodyHtml !== undefined) data.bodyHtmlSnapshot = (body.bodyHtml).toString();
  if (body.bodyText !== undefined) data.bodyTextSnapshot = body.bodyText ? (body.bodyText).toString() : null;
  if (body.signatureHtml !== undefined)
    data.signatureHtmlSnapshot = body.signatureHtml ? (body.signatureHtml).toString() : null;
  if (body.fromName !== undefined) data.fromName = body.fromName ? (body.fromName).toString().trim() : null;
  if (body.fromEmail !== undefined) data.fromEmail = body.fromEmail ? (body.fromEmail).toString().trim() : null;
  if (body.replyTo !== undefined) data.replyTo = body.replyTo ? (body.replyTo).toString().trim() : null;
  if (body.listSource !== undefined) data.listSource = (body.listSource).toString();
  if (body.listConfigJson !== undefined) data.listConfigJson = (body.listConfigJson).toString();
  if (body.templateId !== undefined) data.templateId = body.templateId ? (body.templateId).toString() : null;
  if (body.status !== undefined) data.status = body.status;

  const campaign = await db.emailCampaign.update({
    where: { id },
    data,
    include: {
      template: { select: { id: true, name: true, category: true } },
      flow: { select: { id: true, name: true, status: true } },
    },
  });

  return NextResponse.json({ campaign });
}

/**
 * DELETE /api/admin/email/campaigns/[id]
 *   Delete a campaign. Only DRAFT, FAILED, or PAUSED campaigns can be
 *   deleted. SENT campaigns are kept for audit history.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.emailCampaign.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (existing.status === "SENDING" || existing.status === "SENT") {
    return NextResponse.json(
      { error: `Cannot delete a campaign in status ${existing.status}` },
      { status: 409 }
    );
  }

  await db.emailCampaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
