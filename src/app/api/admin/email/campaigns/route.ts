import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/email/campaigns
 *   List all email campaigns (most recent first).
 *   Query params:
 *     - status  filter by status (DRAFT | SCHEDULED | SENDING | SENT | FAILED)
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const where = status && status !== "all" ? { status } : {};

  const campaigns = await db.emailCampaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      template: { select: { id: true, name: true, category: true } },
      creator: { select: { id: true, email: true, name: true } },
      flow: { select: { id: true, name: true, status: true } },
      _count: {
        select: {
          recipients: true,
          events: true,
        },
      },
    },
  });

  return NextResponse.json({ campaigns });
}

/**
 * POST /api/admin/email/campaigns
 *   Create a new DRAFT campaign (does not send anything).
 *   Body: {
 *     name, subject, bodyHtml, bodyText?, signatureHtml?,
 *     templateId?, fromName?, fromEmail?, replyTo?,
 *     listSource, listConfigJson?
 *   }
 *
 * The campaign starts in DRAFT status. Use POST /api/admin/email/campaigns/[id]/send
 * to actually send it to recipients.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body?.name || "").toString().trim();
  const subject = (body?.subject || "").toString().trim();
  const bodyHtml = (body?.bodyHtml || "").toString();
  const bodyText = body?.bodyText ? (body.bodyText).toString() : null;
  const signatureHtml = body?.signatureHtml ? (body.signatureHtml).toString() : null;
  const templateId = body?.templateId ? (body.templateId).toString() : null;
  const fromName = body?.fromName ? (body.fromName).toString().trim() : null;
  const fromEmail = body?.fromEmail ? (body.fromEmail).toString().trim() : null;
  const replyTo = body?.replyTo ? (body.replyTo).toString().trim() : null;
  const listSource = (body?.listSource || "ALL_MEMBERS").toString();
  const listConfigJson = (body?.listConfigJson || "{}").toString();
  // TSK-0074 Phase 5C: optional link to a flow. When set, the campaign is
  // "flow-backed" — flow edits will refresh its snapshots automatically
  // (handled by PATCH /api/email-flows/[id]). If a campaign already exists
  // for this flowId, the unique constraint on flowId will reject the create
  // (1:1 relationship enforced at the DB level).
  const flowId = body?.flowId ? (body.flowId).toString() : null;
  const chapterId = body?.chapterId ? (body.chapterId).toString() : null;

  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Name is required (max 200 chars)" }, { status: 400 });
  }
  if (!subject || subject.length > 500) {
    return NextResponse.json({ error: "Subject is required (max 500 chars)" }, { status: 400 });
  }
  if (!bodyHtml || bodyHtml.length > 500000) {
    return NextResponse.json({ error: "Body HTML is required (max 500000 chars)" }, { status: 400 });
  }

  // If templateId provided, validate it exists
  // TSK-0074: was db.emailTemplate (legacy, now EmailTemplateLegacy).
  // Now looks up the unified EmailTemplate2 table.
  if (templateId) {
    const tpl = await db.emailTemplate2.findUnique({ where: { id: templateId } });
    if (!tpl) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
  }

  // If flowId provided, validate the flow exists + is ACTIVE. Also enforce
  // the 1:1 relationship — if a campaign already exists for this flowId,
  // reject with a clear error rather than letting the DB unique constraint
  // throw a generic P2002.
  if (flowId) {
    const flow = await db.emailFlow.findUnique({
      where: { id: flowId },
      select: { id: true, status: true },
    });
    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }
    if (flow.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Cannot link to a flow in status ${flow.status}. Activate the flow first.` },
        { status: 400 },
      );
    }
    const existingForFlow = await db.emailCampaign.findUnique({
      where: { flowId },
      select: { id: true },
    });
    if (existingForFlow) {
      return NextResponse.json(
        { error: "A campaign already exists for this flow. Edit that campaign instead." },
        { status: 409 },
      );
    }
  }

  const campaign = await db.emailCampaign.create({
    data: {
      name,
      templateId: templateId || null,
      subjectSnapshot: subject,
      bodyHtmlSnapshot: bodyHtml,
      bodyTextSnapshot: bodyText,
      signatureHtmlSnapshot: signatureHtml,
      listSource,
      listConfigJson,
      status: "DRAFT",
      fromName,
      fromEmail,
      replyTo,
      ...(flowId ? { flowId } : {}),
      ...(chapterId ? { chapterId } : {}),
      createdBy: admin.id,
    },
    include: {
      template: { select: { id: true, name: true, category: true } },
      flow: { select: { id: true, name: true, status: true } },
    },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
