/**
 * POST /api/admin/cleanup-synthetic-rsvps
 *
 * Removes the synthetic EventRsvp rows that were created by the OLD
 * version of manuallyTriggerStepForAudience (the "Send to Audience"
 * action on a flow step). Those rows have:
 *   - source = "IMPORT"
 *   - name = null
 *   - status = "GOING"
 *   - At least one EmailQueue row referencing them via rsvpId
 *   - No doorCheckedAt / attendedAt / approvedByCoHostId (no real attendance)
 *
 * ALSO applies the EmailQueue.rsvpId-nullable migration if it hasn't
 * been applied yet (idempotent — checks information_schema first).
 *
 * Body / query:
 *   { dryRun: true }  — default. Returns report, makes no changes.
 *   { dryRun: false } — actually applies the migration + deletes the rows.
 *                       Always nullifies EmailQueue.rsvpId before deleting
 *                       to preserve email history.
 *   { eventId: "X" }  — restrict to one event.
 *
 * Auth: CRON_SECRET bearer OR admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // ── Auth ──
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  let authorized = false;

  if (cronSecret && provided === cronSecret) {
    authorized = true;
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const me = await db.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });
    if (me?.role === "ADMIN" || me?.role === "SUPER_ADMIN") {
      authorized = true;
    }
  }
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── Parse params ──
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }
  const dryRun = body?.dryRun !== false; // default true
  const eventIdArg: string | undefined = body?.eventId;

  const report: {
    migration: {
      checked: boolean;
      alreadyApplied: boolean | null;
      applied: boolean;
      error?: string;
    };
    candidates: number;
    synthetic: number;
    byEvent: Array<{
      eventId: string;
      eventTitle: string;
      startsAt: string;
      count: number;
      sample: string[];
    }>;
    dryRun: boolean;
    queueRowsNullified?: number;
    rsvpsDeleted?: number;
    postCleanup?: Array<{ eventId: string; eventTitle: string; remaining: number }>;
  } = {
    migration: { checked: false, alreadyApplied: null, applied: false },
    candidates: 0,
    synthetic: 0,
    byEvent: [],
    dryRun,
  };

  try {
    // ── Step 1: ensure EmailQueue.rsvpId is nullable ──
    // Check information_schema to see if the column is already nullable.
    const colInfo: Array<{ is_nullable: string }> = await db.$queryRaw`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'EmailQueue'
        AND column_name = 'rsvpId'
    `;
    const isNullable = colInfo[0]?.is_nullable === "YES";
    report.migration.checked = true;
    report.migration.alreadyApplied = isNullable;

    if (!isNullable) {
      if (dryRun) {
        // In dry-run we don't alter the schema. We still report it would be applied.
        report.migration.applied = false;
      } else {
        // Apply the migration: DROP NOT NULL + recreate FK with CASCADE.
        await db.$executeRawUnsafe(
          `ALTER TABLE "EmailQueue" ALTER COLUMN "rsvpId" DROP NOT NULL`,
        );
        await db.$executeRawUnsafe(
          `ALTER TABLE "EmailQueue" DROP CONSTRAINT IF EXISTS "EmailQueue_rsvpId_fkey"`,
        );
        await db.$executeRawUnsafe(
          `ALTER TABLE "EmailQueue" ADD CONSTRAINT "EmailQueue_rsvpId_fkey"
           FOREIGN KEY ("rsvpId") REFERENCES "EventRsvp"("id") ON DELETE CASCADE`,
        );
        report.migration.applied = true;
      }
    }
  } catch (err) {
    report.migration.error = String(err);
    // If we can't verify / apply the migration, we cannot proceed safely.
    return NextResponse.json(
      { error: "migration_check_failed", report },
      { status: 500 },
    );
  }

  // ── Step 2: find candidate synthetic RSVPs ──
  const where = {
    source: "IMPORT" as const,
    name: null,
    status: "GOING" as const,
    doorCheckedAt: null,
    attendedAt: null,
    approvedByCoHostId: null,
    ...(eventIdArg ? { eventId: eventIdArg } : {}),
  };

  const candidates = await db.eventRsvp.findMany({
    where,
    include: {
      _count: { select: { emailQueueItems: true } },
      event: { select: { id: true, title: true, startsAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Keep only rows that have at least one EmailQueue row referencing them
  // (real manual imports wouldn't have email queue items tied to them).
  const synthetic = candidates.filter((r) => r._count.emailQueueItems > 0);

  report.candidates = candidates.length;
  report.synthetic = synthetic.length;

  // Group by event for the report.
  const byEvent: Record<string, typeof synthetic> = {};
  for (const r of synthetic) {
    if (!byEvent[r.eventId]) byEvent[r.eventId] = [];
    byEvent[r.eventId].push(r);
  }
  for (const [evtId, rows] of Object.entries(byEvent)) {
    const evt = rows[0].event;
    report.byEvent.push({
      eventId: evtId,
      eventTitle: evt.title,
      startsAt: evt.startsAt.toISOString(),
      count: rows.length,
      sample: rows.slice(0, 5).map((r) => r.email),
    });
  }

  // ── Step 3: apply (if not dry-run) ──
  if (!dryRun && synthetic.length > 0) {
    const syntheticIds = synthetic.map((r) => r.id);

    // Nullify EmailQueue.rsvpId first (preserve email history).
    const updateResult = await db.emailQueue.updateMany({
      where: { rsvpId: { in: syntheticIds } },
      data: { rsvpId: null },
    });
    report.queueRowsNullified = updateResult.count;

    // Delete the synthetic RSVPs.
    const deleteResult = await db.eventRsvp.deleteMany({
      where: { id: { in: syntheticIds } },
    });
    report.rsvpsDeleted = deleteResult.count;

    // Post-cleanup counts.
    report.postCleanup = [];
    for (const evtId of Object.keys(byEvent)) {
      const remaining = await db.eventRsvp.count({ where: { eventId: evtId } });
      report.postCleanup.push({
        eventId: evtId,
        eventTitle: byEvent[evtId][0].event.title,
        remaining,
      });
    }
  }

  return NextResponse.json({ ok: true, report });
}
