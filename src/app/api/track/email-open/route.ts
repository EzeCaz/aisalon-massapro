/**
 * GET /api/track/email-open?id=<queueId>
 *
 * Returns a 1x1 transparent GIF. Side effects:
 *   - Marks the EmailQueue row as OPENED (sets openedAt if not already set).
 *   - Creates a TrackingLog row with type="OPEN".
 *   - Constructs + persists the Meta CAPI payload (sends to Meta if env is set).
 *
 * Cache headers: no-store, no-cache — we want this to fire every time.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildMetaPayload, recordAndSendMeta } from "@/lib/email-orchestrator/meta-capi";

export const dynamic = "force-dynamic";

// 1x1 transparent GIF (43 bytes).
const PIXEL = Buffer.from(
  "R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
  "base64",
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const queueId = url.searchParams.get("id");
  if (!queueId) {
    return new NextResponse(null, { status: 404 });
  }

  // Best-effort tracking — never block the pixel response on errors.
  try {
    const row = await db.emailQueue.findUnique({
      where: { id: queueId },
      select: { id: true, email: true, status: true, openedAt: true, eventId: true },
    });
    if (row) {
      const userAgent = req.headers.get("user-agent") || null;
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

      // Build CAPI payload.
      const payload = buildMetaPayload({
        queueId: row.id,
        type: "OPEN",
        email: row.email,
        eventTime: new Date(),
      });

      await db.$transaction(async (tx) => {
        // Update queue row (only set openedAt on first open).
        await tx.emailQueue.update({
          where: { id: row.id },
          data: {
            status: row.status === "CLICKED" ? "CLICKED" : "OPENED",
            openedAt: row.openedAt ?? new Date(),
          },
        });
        await recordAndSendMeta(payload, row.id, "OPEN", null, userAgent, ip, tx);
      });
    }
  } catch (err) {
    console.error("[track/email-open] error:", err);
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
