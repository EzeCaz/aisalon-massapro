/**
 * GET /api/email-flows/runs — list all flow runs (paginated, filterable).
 *
 * Query params:
 *   status   — filter by run status (ACTIVE | WAITING_BRANCH | HALTED | COMPLETED | ERROR)
 *   flowId   — filter by flow
 *   limit    — default 50, max 200
 *   offset   — default 0
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET OR admin session.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (cronSecret && provided === cronSecret) {
    // ok, cron
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const me = await db.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });
    if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const flowId = url.searchParams.get("flowId") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (flowId) where.flowId = flowId;

  const [runs, total] = await Promise.all([
    db.emailFlowRun.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        flow: { select: { id: true, name: true } },
        rsvp: { select: { id: true, email: true, name: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    db.emailFlowRun.count({ where }),
  ]);

  return NextResponse.json({ runs, total, limit, offset });
}
