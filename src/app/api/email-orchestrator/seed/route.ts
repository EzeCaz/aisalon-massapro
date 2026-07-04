/**
 * POST /api/email-orchestrator/seed
 *
 * Seeds (or reseeds) the email orchestrator demo data. Auth:
 *   - Bearer CRON_SECRET (for automation / dev scripts)
 *   - OR an authenticated admin session
 *
 * Body:
 *   { action: "seed" | "clear" }  — default "seed"
 *
 * Response:
 *   { ok: true, result: SeedResult | ClearResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { runSeed, clearSeed } from "@/lib/email-orchestrator/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // ── Auth: CRON_SECRET OR admin session ──
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();

  let authed = false;
  if (cronSecret && provided === cronSecret) {
    authed = true;
  } else {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      const me = await db.user.findUnique({
        where: { email: session.user.email },
        select: { role: true },
      });
      if (me && can(me.role, "members.view")) authed = true;
    }
  }

  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = (body as { action?: string }).action === "clear" ? "clear" : "seed";

  try {
    const result = action === "clear" ? await clearSeed() : await runSeed();
    return NextResponse.json({ ok: true, action, result });
  } catch (err) {
    console.error("[email-orchestrator/seed] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
