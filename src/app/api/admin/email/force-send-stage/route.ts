/**
 * POST /api/admin/email/force-send-stage
 *
 * Force-send emails for a specific stage, bypassing the stop-awareness
 * rules that would otherwise leave them SKIPPED.
 *
 * Typical use case: Stage 1 (Awareness) has stopIfNotOpenedHours = 5.
 * Users who didn't open Stage 1 within 5h get Stage 2 auto-SKIPPED by
 * the worker. The admin can use this endpoint to override that and
 * force-send Stage 2 (Reminder) to all SKIPPED recipients anyway.
 *
 * Auth: ADMIN / SUPER_ADMIN only.
 *
 * Body:
 *   {
 *     stage: 2,                       // required, 1..5
 *     eventId?: "evt_xxx",            // optional, scope to one event
 *     onlySkipped?: true,             // default true. If false, also
 *                                     //   re-sends SENT rows whose
 *                                     //   scheduledFor has passed.
 *     dryRun?: true                   // default true. Returns counts
 *                                     //   only, doesn't actually send.
 *   }
 *
 * Response:
 *   {
 *     stage: 2,
 *     dryRun: true,
 *     found: 42,                      // SKIPPED rows at this stage
 *     sent: 0,                        // actually sent (0 in dry-run)
 *     failed: 0,
 *     skippedCheckedIn: 3,            // not sent because RSVP checked in
 *     errors: [],
 *     sample: [                       // first 10 rows (for dry-run report)
 *       { id, email, eventName, errorMessage }
 *     ]
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { STAGES, scheduledFor, nextStage } from "@/lib/email-orchestrator/stages";
import {
  buildContext,
  renderTemplate,
  DEFAULT_TEMPLATES,
  buildLogoBlock,
} from "@/lib/email-orchestrator/templates";
import { sendEmail } from "@/lib/email-orchestrator/sender";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // serverless max — sending many emails

type ForceSendResult = {
  stage: number;
  dryRun: boolean;
  found: number;
  sent: number;
  failed: number;
  skippedCheckedIn: number;
  errors: string[];
  sample: Array<{
    id: string;
    email: string;
    eventName: string;
    errorMessage: string | null;
  }>;
};

export async function POST(req: NextRequest) {
  // ── Auth ──
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — use defaults
  }
  const stage = Number(body.stage);
  const eventId: string | undefined = body.eventId || undefined;
  const onlySkipped = body.onlySkipped !== false; // default true
  const dryRun = body.dryRun !== false; // default true

  if (!Number.isInteger(stage) || stage < 1 || stage > STAGES.length) {
    return NextResponse.json(
      { error: `stage must be an integer 1..${STAGES.length}` },
      { status: 400 },
    );
  }

  const result: ForceSendResult = {
    stage,
    dryRun,
    found: 0,
    sent: 0,
    failed: 0,
    skippedCheckedIn: 0,
    errors: [],
    sample: [],
  };

  // ── Find target rows ──
  // We target rows at the requested stage that are SKIPPED (the common
  // case for "force-send"). If onlySkipped=false, also include SENT
  // rows whose scheduledFor has passed (re-send scenario).
  const statusFilter = onlySkipped
    ? { status: "SKIPPED" as const }
    : {
        OR: [
          { status: "SKIPPED" as const },
          { status: "SENT" as const },
        ],
      };

  const rows = await db.emailQueue.findMany({
    where: {
      stage,
      flowStepId: null, // stage-based orchestrator rows only
      ...statusFilter,
      ...(eventId ? { eventId } : {}),
    },
    include: {
      rsvp: {
        include: {
          event: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              venue: true,
              address: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    // No cap — admin explicitly wants ALL of them. Serverless timeout
    // will catch runaway runs.
  });

  result.found = rows.length;

  // Build a quick lookup for sample reporting.
  const sample: ForceSendResult["sample"] = [];
  for (const row of rows.slice(0, 10)) {
    sample.push({
      id: row.id,
      email: row.email,
      eventName: row.rsvp?.event.title ?? "(no event)",
      errorMessage: row.errorMessage,
    });
  }
  result.sample = sample;

  if (dryRun) {
    return NextResponse.json(result);
  }

  // ── Send for real ──
  for (const row of rows) {
    try {
      // Defensive: stage-based rows always have an RSVP. If somehow
      // null, skip it (don't try to send to a phantom).
      if (!row.rsvp) {
        result.failed++;
        result.errors.push(`row ${row.id}: no rsvp linked`);
        continue;
      }

      // Respect the door-checkin rule even on force-send — if the user
      // has already checked in to the event, no point emailing them.
      if (row.rsvp.doorCheckedAt) {
        result.skippedCheckedIn++;
        continue;
      }

      const sendResult = await sendStageEmailDirect(row);
      if (sendResult.ok) {
        result.sent++;
      } else {
        result.failed++;
        if (result.errors.length < 20) {
          result.errors.push(`row ${row.id}: ${sendResult.error}`);
        }
      }
    } catch (err) {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(
          `row ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return NextResponse.json(result);
}

// ────────────────────────────────────────────────────────────────────────────
// sendStageEmailDirect — replicate the worker's sendStageEmail logic but
// without ANY stop-awareness checks. We deliberately inline this rather
// than export the worker's private function so the worker file stays
// focused on its own state machine.
// ────────────────────────────────────────────────────────────────────────────

async function sendStageEmailDirect(
  row: {
    id: string;
    stage: number;
    eventId: string;
    email: string;
    userId: string | null;
    rsvp: {
      id: string;
      name: string | null;
      email: string;
      checkInCode: string | null;
      event: {
        id: string;
        title: string;
        startsAt: Date;
        venue: string | null;
        address: string | null;
        slug: string;
      };
    } | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!row.rsvp) {
    return { ok: false, error: "no rsvp linked" };
  }
  const rsvp = row.rsvp;

  // Load template
  const tplRow = await db.emailStageTemplate.findUnique({
    where: { stage: row.stage },
  });
  const tpl = tplRow ?? null;

  // No-code variant (used by stages 3 and 4)
  const hasNoCode = !rsvp.checkInCode && !!tpl?.noCodeHtmlBody;
  const subject = hasNoCode
    ? (tpl?.noCodeSubject ?? tpl?.subject ?? DEFAULT_TEMPLATES[row.stage]?.subject ?? `AI Salon — stage ${row.stage}`)
    : (tpl?.subject ?? DEFAULT_TEMPLATES[row.stage]?.subject ?? `AI Salon — stage ${row.stage}`);
  const htmlTemplate = hasNoCode
    ? (tpl?.noCodeHtmlBody ?? tpl?.htmlBody ?? DEFAULT_TEMPLATES[row.stage]?.html ?? "<p>{{eventTitle}}</p>")
    : (tpl?.htmlBody ?? DEFAULT_TEMPLATES[row.stage]?.html ?? "<p>{{eventTitle}}</p>");

  // Speakers + agenda
  const [speakers, agenda] = await Promise.all([
    db.speaker.findMany({
      where: { eventId: row.eventId },
      select: { name: true },
    }),
    db.eventAgendaItem.findMany({
      where: { eventId: row.eventId },
      orderBy: { startsAt: "asc" },
      select: { title: true, startsAt: true },
    }),
  ]);

  const baseUrl = process.env.NEXTAUTH_URL || "https://aisalon.massapro.com";
  const ctx = buildContext({
    event: rsvp.event,
    rsvp,
    speakers,
    agenda,
    baseUrl,
    queueId: row.id,
  });

  const logoHtml = buildLogoBlock(tpl?.logoUrl);
  const renderedHtml = renderTemplate(htmlTemplate, ctx, { logoHtml });
  const renderedSubject = subject.replace(/{{eventTitle}}/g, ctx.eventTitle);

  const sendResult = await sendEmail({
    to: row.email,
    subject: renderedSubject,
    html: renderedHtml,
    toName: rsvp.name || undefined,
  });

  if (!sendResult.ok) {
    // Record the failure on the row so the admin can see it in the queue.
    await db.emailQueue.update({
      where: { id: row.id },
      data: {
        // Keep status as SKIPPED if it was SKIPPED — we don't want to
        // mask the original skip reason. Just record the error.
        errorMessage: `force-send failed: ${sendResult.error}`,
        attemptCount: { increment: 1 },
      },
    });
    return sendResult;
  }

  // Mark SENT + store rendered HTML for replay/preview.
  await db.emailQueue.update({
    where: { id: row.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      subject: renderedSubject,
      htmlBody: renderedHtml,
      attemptCount: { increment: 1 },
      errorMessage: null,
      usedNoCodeVariant: hasNoCode,
    },
  });

  // Create the next stage's PENDING row if it doesn't already exist.
  // (If the next stage was SKIPPED along with this one, we leave it
  // alone — the admin can force-send it separately if desired.)
  const next = nextStage(row.stage);
  if (next != null) {
    const existingNext = await db.emailQueue.findFirst({
      where: { rsvpId: rsvp.id, stage: next },
    });
    if (!existingNext) {
      const nextFireTime = scheduledFor(rsvp.event.startsAt, next);
      const effectiveNext =
        nextFireTime && nextFireTime <= new Date()
          ? new Date(Date.now() + 1000)
          : (nextFireTime ?? new Date(Date.now() + 1000));
      await db.emailQueue.create({
        data: {
          rsvpId: rsvp.id,
          eventId: row.eventId,
          userId: row.userId,
          email: row.email,
          stage: next,
          status: "PENDING",
          scheduledFor: effectiveNext,
        },
      });
    }
  }

  return { ok: true };
}
