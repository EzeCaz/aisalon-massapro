import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/email/open?t=<trackToken>&c=<campaignId>
 *
 * Tracking pixel endpoint. Returns a 1x1 transparent GIF.
 * Logs an OPEN EmailEvent and updates the recipient's openCount.
 */
const PIXEL_GIF_BASE64 =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const trackToken = url.searchParams.get("t");
  const campaignId = url.searchParams.get("c");

  if (trackToken && campaignId) {
    logOpen(trackToken, campaignId, req).catch((err) => {
      console.error("[email/open] log failed:", err);
    });
  }

  const buf = Buffer.from(PIXEL_GIF_BASE64, "base64");
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

async function logOpen(trackToken: string, campaignId: string, req: NextRequest) {
  const recipient = await db.emailRecipient.findUnique({
    where: { trackToken },
    select: { id: true, email: true, firstOpenedAt: true, openCount: true },
  });
  if (!recipient) return;

  const now = new Date();
  const userAgent = req.headers.get("user-agent") || null;
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  await db.emailRecipient.update({
    where: { id: recipient.id },
    data: {
      firstOpenedAt: recipient.firstOpenedAt ?? now,
      lastOpenedAt: now,
      openCount: (recipient.openCount ?? 0) + 1,
    },
  });

  await db.emailEvent.create({
    data: {
      campaignId,
      recipientId: recipient.id,
      email: recipient.email,
      type: "OPEN",
      userAgent,
      ipAddress,
    },
  });
}
