import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * POST /api/admin/email/campaigns/[id]/resend
 *
 * Clones an existing campaign (subject, body, signature, from/reply-to,
 * AND the original audience — listSource + listConfigJson) into a new
 * DRAFT campaign, then immediately fires the same send pipeline as
 * POST /api/admin/email/campaigns/[id]/send by delegating to that
 * route's handler with an internal Request.
 *
 * This is the "Resend to same audience" action surfaced in the admin
 * campaign list. It exists as a one-click way to re-blast a previously
 * sent (or failed) campaign to its original recipient list without
 * having to walk through the 4-step composer again.
 *
 * Behavior:
 *   - Source campaign must be in SENT or FAILED state. We block DRAFT /
 *     SCHEDULED / SENDING (use the regular Edit + Send flow instead).
 *   - The clone keeps the SAME listSource + listConfigJson — we do not
 *     re-resolve the audience from current DB state at clone time. The
 *     send route does the resolution at send time, so a "resend" will
 *     pick up NEW members who joined since the original send (for
 *     list sources like ALL_MEMBERS / TAG:* / AUDIENCE:*). For
 *     MANUAL / EVENT:<id> sources the recipient list is whatever the
 *     stored config resolves to at send time.
 *   - The clone's name is suffixed with " (Resend YYYY-MM-DD HH:mm)"
 *     so it's distinguishable in the campaign list.
 *   - The clone is NOT linked to the source's flow (flowId is null)
 *     because flow-linked campaigns have a 1:1 constraint.
 *   - The clone's createdBy is the current admin.
 *
 * Response: { campaign: <new campaign row>, sendResult: <send route response> }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const source = await db.emailCampaign.findUnique({ where: { id } });
  if (!source) {
    return NextResponse.json(
      { error: "Source campaign not found" },
      { status: 404 }
    );
  }

  // Only allow resending from terminal states. Resending a DRAFT would
  // be confusing (just send the DRAFT). Resending a SCHEDULED would
  // double-send. Resending a SENDING could collide with the in-flight
  // batch worker.
  if (source.status !== "SENT" && source.status !== "FAILED") {
    return NextResponse.json(
      {
        error: `Cannot resend a campaign in status ${source.status}. Only SENT or FAILED campaigns can be resent.`,
      },
      { status: 409 }
    );
  }

  // Build the new name with a timestamp suffix so it's easy to tell
  // resend blasts apart from the original in the list.
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace("T", " ")
    .slice(0, 16); // "YYYY-MM-DD HH:mm"
  const newName =
    source.name.length > 180
      ? `${source.name.slice(0, 180)}… (Resend ${stamp})`
      : `${source.name} (Resend ${stamp})`;

  // Clone the campaign as a fresh DRAFT. We deliberately do NOT copy:
  //   - flowId (1:1 constraint with EmailFlow, and the resend is a
  //     one-off blast, not part of an automated flow)
  //   - status / startedAt / completedAt / scheduledAt / recipientCount
  //     (all reset to DRAFT defaults — the send route will populate them)
  //   - id / createdAt / updatedAt (DB defaults)
  const clone = await db.emailCampaign.create({
    data: {
      name: newName,
      templateId: source.templateId,
      subjectSnapshot: source.subjectSnapshot,
      bodyHtmlSnapshot: source.bodyHtmlSnapshot,
      bodyTextSnapshot: source.bodyTextSnapshot,
      signatureHtmlSnapshot: source.signatureHtmlSnapshot,
      listSource: source.listSource,
      listConfigJson: source.listConfigJson,
      fromName: source.fromName,
      fromEmail: source.fromEmail,
      replyTo: source.replyTo,
      chapterId: source.chapterId,
      status: "DRAFT",
      createdBy: admin.id,
    },
    include: {
      template: { select: { id: true, name: true, category: true } },
    },
  });

  // Delegate the actual send to the existing /send route by issuing an
  // internal sub-request. This keeps the send pipeline (recipient
  // resolution, rendering with logo + tracking, per-recipient send +
  // event logging) in ONE place — we don't want to duplicate ~200
  // lines of sender logic here and risk the two paths drifting.
  //
  // We construct the absolute URL using the request's origin so this
  // works in both local dev and Vercel preview/prod.
  const sendUrl = new URL(
    `/api/admin/email/campaigns/${clone.id}/send`,
    _req.nextUrl.origin
  );
  const sendRes = await fetch(sendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Forward the admin's auth cookie so requireAdmin() inside the
      // send route succeeds. Without this, the internal fetch would be
      // unauthenticated and return 401.
      cookie: _req.headers.get("cookie") || "",
    },
    body: JSON.stringify({}),
  });

  let sendResult: any = null;
  let sendError: string | null = null;
  if (sendRes.ok) {
    sendResult = await sendRes.json();
  } else {
    // The send failed (e.g. no SMTP configured, no recipients matched).
    // Surface the error to the admin so they can see why the resend
    // didn't go through. The clone still exists as a DRAFT they can
    // retry manually.
    const errBody = await sendRes.json().catch(() => ({}));
    sendError =
      errBody?.error ||
      `Send failed with HTTP ${sendRes.status} ${sendRes.statusText}`;
  }

  return NextResponse.json(
    {
      campaign: clone,
      sendResult,
      ...(sendError ? { sendError } : {}),
    },
    // 200 if the send succeeded, 207 (multi-status) if the clone was
    // created but the send step failed — the admin can still inspect
    // the clone in the campaign list and retry it manually.
    { status: sendRes.ok ? 200 : 207 }
  );
}
