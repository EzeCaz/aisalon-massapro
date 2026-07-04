import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/email/click?t=<trackToken>&c=<campaignId>&u=<base64-url>
 *
 * Click-tracking redirect. Logs a CLICK EmailEvent, updates the
 * recipient's clickCount, then 302-redirects to the original URL.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const trackToken = url.searchParams.get("t");
  const campaignId = url.searchParams.get("c");
  const encodedUrl = url.searchParams.get("u");

  let destination = "/";
  if (encodedUrl) {
    try {
      destination = Buffer.from(encodedUrl, "base64url").toString("utf8");
      if (!/^https?:\/\//i.test(destination)) {
        destination = "/";
      }
    } catch {
      destination = "/";
    }
  }

  if (trackToken && campaignId) {
    logClick(trackToken, campaignId, destination, req).catch((err) => {
      console.error("[email/click] log failed:", err);
    });
  }

  return NextResponse.redirect(destination, 302);
}

async function logClick(
  trackToken: string,
  campaignId: string,
  destinationUrl: string,
  req: NextRequest
) {
  const recipient = await db.emailRecipient.findUnique({
    where: { trackToken },
    select: { id: true, email: true, firstClickedAt: true, clickCount: true },
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
      firstClickedAt: recipient.firstClickedAt ?? now,
      lastClickedAt: now,
      clickCount: (recipient.clickCount ?? 0) + 1,
    },
  });

  await db.emailEvent.create({
    data: {
      campaignId,
      recipientId: recipient.id,
      email: recipient.email,
      type: "CLICK",
      details: destinationUrl,
      userAgent,
      ipAddress,
    },
  });
}
