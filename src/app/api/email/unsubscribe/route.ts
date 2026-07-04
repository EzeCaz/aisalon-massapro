import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/email/unsubscribe?t=<trackToken>&c=<campaignId>
 *
 * Marks the recipient as UNSUBSCRIBED and shows a confirmation page.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const trackToken = url.searchParams.get("t");
  const campaignId = url.searchParams.get("c");

  if (!trackToken || !campaignId) {
    return new NextResponse("Invalid unsubscribe link", { status: 400 });
  }

  const recipient = await db.emailRecipient.findUnique({
    where: { trackToken },
    select: { id: true, email: true, status: true },
  });

  if (!recipient) {
    return new NextResponse("Invalid unsubscribe link", { status: 404 });
  }

  if (recipient.status !== "UNSUBSCRIBED") {
    await db.emailRecipient.update({
      where: { id: recipient.id },
      data: { status: "UNSUBSCRIBED" },
    });
    await db.emailEvent.create({
      data: {
        campaignId,
        recipientId: recipient.id,
        email: recipient.email,
        type: "UNSUBSCRIBE",
      },
    });
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Unsubscribed</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #f6f6f6; padding: 40px 20px; text-align: center; color: #0a0a0a; }
  .card { max-width: 480px; margin: 0 auto; background: #fff; padding: 40px;
          border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { font-size: 15px; line-height: 1.6; color: #555; margin: 0 0 12px; }
  .email { font-weight: 600; color: #0a0a0a; }
  .footer { margin-top: 32px; font-size: 12px; color: #999; }
</style></head>
<body>
  <div class="card">
    <h1>You're unsubscribed</h1>
    <p>We've removed <span class="email">${recipient.email}</span> from the AI Salon Tel Aviv mailing list.</p>
    <p>You won't receive future campaigns from us.</p>
    <div class="footer">AI Salon Tel Aviv · MassaPro</div>
  </div>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
