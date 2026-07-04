/**
 * POST /api/email-orchestrator/simulate
 *
 * Simulates tracking events on a SENT EmailQueue row — useful for testing
 * the orchestrator UI without actually opening emails.
 *
 * Auth: Bearer CRON_SECRET OR admin session.
 *
 * Body:
 *   { queueId: string, action: "open" | "click", targetUrl?: string }
 *
 * Effect:
 *   - For "open": marks the queue row as OPENED (sets openedAt), creates
 *     a TrackingLog with type="OPEN", and persists the Meta CAPI payload.
 *   - For "click": marks the queue row as CLICKED (sets clickedAt), creates
 *     a TrackingLog with type="CLICK" + targetUrl, persists Meta CAPI payload.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { buildMetaPayload, recordAndSendMeta } from "@/lib/email-orchestrator/meta-capi";

export const dynamic = "force-dynamic";

async function checkAuth(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (cronSecret && provided === cronSecret) return true;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  return !!(me && can(me.role, "members.view"));
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { queueId, action, targetUrl } = body as {
    queueId?: string;
    action?: "open" | "click";
    targetUrl?: string;
  };

  if (!queueId || !action) {
    return NextResponse.json(
      { error: "Missing queueId or action" },
      { status: 400 },
    );
  }
  if (action !== "open" && action !== "click") {
    return NextResponse.json(
      { error: `Invalid action: ${action}` },
      { status: 400 },
    );
  }

  const row = await db.emailQueue.findUnique({
    where: { id: queueId },
    include: { rsvp: { select: { email: true } } },
  });
  if (!row) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }
  if (row.status !== "SENT" && row.status !== "OPENED" && row.status !== "CLICKED") {
    return NextResponse.json(
      { error: `Queue item is in status ${row.status} — must be SENT to simulate` },
      { status: 400 },
    );
  }

  const type = action === "open" ? "OPEN" : "CLICK";
  const payload = buildMetaPayload({
    queueId: row.id,
    type,
    email: row.email,
    targetUrl: action === "click" ? targetUrl || row.eventId : null,
    eventTime: new Date(),
  });

  const userAgent = "Simulated by admin";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  await db.$transaction(async (tx) => {
    // Update queue row.
    await tx.emailQueue.update({
      where: { id: row.id },
      data: {
        status: action === "click" ? "CLICKED" : "OPENED",
        openedAt: row.openedAt ?? new Date(),
        clickedAt: action === "click" ? new Date() : row.clickedAt,
      },
    });
    // Record tracking log + meta payload.
    await recordAndSendMeta(
      payload,
      row.id,
      type,
      action === "click" ? targetUrl || null : null,
      userAgent,
      ip,
      tx,
    );
  });

  return NextResponse.json({ ok: true, type, queueId: row.id });
}
