import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logCapiEvent } from "@/lib/email-orchestrator/meta-capi";

/**
 * GET /api/track/open?id=<emailId>
 *
 * Open-tracking pixel. Returns a transparent 1x1 GIF (base64-encoded
 * so we don't need a static asset). Side effects:
 *   - Appends a TrackingLog row (eventType="open")
 *   - Updates EmailQueue.status to 'opened' (only on FIRST open —
 *     subsequent opens still log but don't change status)
 *   - Builds + persists a Meta CAPI stub payload to the TrackingLog
 *
 * No auth — this endpoint is hit by email clients (Gmail, Outlook)
 * when the recipient opens the email. The id query param is the
 * EmailQueue.id (a cuid — not guessable in practice).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return new NextResponse(null, { status: 404 });
  }

  const email = await db.emailQueue.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, role: true } },
      event: { select: { id: true, title: true, slug: true } },
    },
  });

  if (!email) {
    return new NextResponse(null, { status: 404 });
  }

  // -------- Append TrackingLog --------
  const trackingLog = await db.trackingLog.create({
    data: {
      emailId: email.id,
      userId: email.userId,
      eventType: "open",
      userAgent: req.headers.get("user-agent") || null,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    },
  });

  // -------- Update EmailQueue (FIRST open only) --------
  if (!email.openedAt) {
    await db.emailQueue.update({
      where: { id: email.id },
      data: {
        openedAt: new Date(),
        status: email.status === "sent" ? "opened" : email.status,
      },
    });
  }

  // -------- Meta CAPI stub --------
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://aisalon.massapro.com";
  await logCapiEvent({
    userId: email.userId,
    userEmail: email.user.email,
    userRole: email.user.role,
    eventId: email.eventId,
    eventTitle: email.event.title,
    stage: email.stage,
    emailId: email.id,
    eventName: "Open",
    eventSourceUrl: `${siteUrl}/events/${email.event.slug}`,
    trackingLogId: trackingLog.id,
  }).catch((err) => {
    // Don't fail the pixel request if CAPI logging fails — the email
    // open should always register even if Meta tracking is broken.
    console.error("[track/open] CAPI log failed:", err);
  });

  // -------- Return 1x1 transparent GIF --------
  // 43-byte GIF89a — smallest valid transparent GIF.
  const gifBase64 =
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const buf = Buffer.from(gifBase64, "base64");

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
