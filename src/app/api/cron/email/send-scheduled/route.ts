import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendCampaignBatch } from "@/lib/email-campaign/sender";

/**
 * POST /api/cron/email/send-scheduled
 *
 * Cron job — picks up campaigns in SCHEDULED state whose scheduledAt
 * has passed, and campaigns in SENDING state that still have QUEUED
 * recipients. Runs sendCampaignBatch for each.
 *
 * Auth (either):
 *   - X-CRON-SECRET header matching CRON_SECRET env var (for Vercel Cron)
 *   - Valid admin session (for admin UI's "Send due" button)
 *
 * NOTE: Vercel Hobby tier only allows daily crons. For more frequent
 * runs, the admin UI has a "Send due" button that calls this endpoint.
 * Upgrading to Pro tier would enable proper per-minute crons.
 */
export async function POST(req: NextRequest) {
  // Try cron secret first
  const secret = req.headers.get("x-cron-secret");
  const secretOk = secret && secret === process.env.CRON_SECRET;

  // Fall back to admin session
  let adminOk = false;
  if (!secretOk) {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      const me = await db.user.findUnique({ where: { email: session.user.email } });
      adminOk = me?.role === "ADMIN";
    }
  }

  if (!secretOk && !adminOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // 1) Find SCHEDULED campaigns whose time has come
  const due = await db.emailCampaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true, name: true },
  });

  // 2) Find SENDING campaigns that still have QUEUED recipients
  const inProgress = await db.emailCampaign.findMany({
    where: { status: "SENDING" },
    select: { id: true, name: true },
  });

  const toProcess = [...due, ...inProgress];
  const results: any[] = [];

  for (const c of toProcess) {
    try {
      const result = await sendCampaignBatch(c.id);
      results.push({ id: c.id, name: c.name, ok: true, ...result });
    } catch (err) {
      results.push({
        id: c.id,
        name: c.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    processed: toProcess.length,
    results,
  });
}

