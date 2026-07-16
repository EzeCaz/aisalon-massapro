/**
 * POST /api/track/page-leave
 *
 * Pairs with POST /api/track/pageview to record session duration.
 * Called by the client on:
 *   - route change (before the new pageview fires)
 *   - beforeunload (page close / refresh / tab close)
 *   - visibilitychange (tab hidden — best-effort, may not always fire)
 *
 * Body: {
 *   pageViewId: string  // returned by /api/track/pageview
 * }
 *
 * Sets PageView.leftAt = now() and PageView.durationMs = now - enteredAt.
 * Idempotent: if the row was already closed, this is a no-op.
 *
 * If pageViewId is missing or invalid, the request is silently ignored
 * (return 200 ok) — fire-and-forget should never block the client.
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const pageViewId: string | undefined = body.pageViewId
    if (!pageViewId || typeof pageViewId !== "string") {
      return NextResponse.json({ ok: true, ignored: true, reason: "no pageViewId" })
    }

    // Look up the row. We don't trust the client's enteredAt — always
    // recompute durationMs from the server-side enteredAt.
    const row = await db.pageView.findUnique({
      where: { id: pageViewId },
      select: { enteredAt: true, leftAt: true },
    })
    if (!row) {
      return NextResponse.json({ ok: true, ignored: true, reason: "not found" })
    }
    if (row.leftAt) {
      // Already closed — idempotent no-op.
      return NextResponse.json({ ok: true, ignored: true, reason: "already closed" })
    }

    const now = new Date()
    const durationMs = Math.max(0, now.getTime() - row.enteredAt.getTime())

    await db.pageView.update({
      where: { id: pageViewId },
      data: {
        leftAt: now,
        durationMs,
      },
    })

    return NextResponse.json({ ok: true, durationMs })
  } catch (err) {
    console.error("[track/page-leave] error:", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
