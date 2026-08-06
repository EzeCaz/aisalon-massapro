/**
 * Flow worker — sends due EmailQueue rows that belong to flow steps.
 *
 * NEW MODEL (per-step independent triggers):
 *   The trigger (flow-trigger.ts) creates EmailQueue rows directly with
 *   status=PENDING and scheduledFor = trigger_time + step.delay. This
 *   worker just picks up due PENDING rows whose flowStepId is set and sends
 *   them.
 *
 *   No linear run state machine, no branching, no EmailFlowRun. Each queue
 *   row is an independent send.
 *
 * Runs via `POST /api/email-orchestrator/run` (cron or manual).
 *
 * Algorithm:
 *   1. Find PENDING EmailQueue rows where flowStepId IS NOT NULL AND
 *      scheduledFor <= now.
 *   2. For each:
 *      a. Load the flow step + template + audience.
 *      b. Render the subject (A or B variant) + HTML body.
 *      c. Send via the configured provider (mock by default, gmail if env set).
 *      d. On success: mark SENT, store subject + htmlBody for replay.
 *      e. On failure: mark FAILED, increment attemptCount.
 *
 * Idempotent: a row that errors out stays PENDING and will be retried on the
 * next tick (up to MAX_ATTEMPTS, after which it stays FAILED).
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { sendEmail, type SendResult } from "./sender";
import { buildContext, buildLogoBlock, resolveEmailLogoDefault } from "./templates";
import { renderUnifiedEmail, renderUnifiedSubject } from "@/lib/email/render-unified";

export type WorkerResult = {
  sent: number;
  skipped: number; // mock / paused sends (no real delivery)
  failed: number;
  processed: number;
  errorDetails: { queueId: string; error: string }[];
};

/** Outcome of processing a single queue row. */
type ProcessOutcome = "sent" | "mock" | "skipped";

const MAX_ATTEMPTS = 3;

/** Main entry — called by /api/email-orchestrator/run. */
export async function runFlowWorker(): Promise<WorkerResult> {
  const now = new Date();
  const result: WorkerResult = {
    sent: 0,
    skipped: 0,
    failed: 0,
    processed: 0,
    errorDetails: [],
  };

  // Find all due PENDING flow queue rows.
  const dueRows = await db.emailQueue.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: now },
      flowStepId: { not: null },
    },
    include: {
      rsvp: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              startsAt: true,
              venue: true,
              address: true,
            },
          },
        },
      },
      flowStep: {
        include: {
          // TSK-0074: now selects from EmailTemplate2 (was EmailStageTemplate).
          // Field renamed htmlBody → bodyHtml. Added logoUrl so we can fix
          // the brand-logo bug (flow-sent emails were missing the logo).
          template: { select: { id: true, subject: true, bodyHtml: true, name: true, logoUrl: true, logoHidden: true } },
          audience: { select: { id: true, name: true } },
          flow: { select: { id: true, name: true, status: true } },
        },
      },
    },
    take: 50, // cap per tick to avoid timeouts
  });

  for (const row of dueRows) {
    result.processed++;
    try {
      const outcome = await processQueueRow(row);
      if (outcome === "sent") {
        result.sent++;
      } else if (outcome === "mock" || outcome === "skipped") {
        result.skipped++;
      }
    } catch (err) {
      result.failed++;
      result.errorDetails.push({
        queueId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await markRowFailed(row, err);
    }
  }

  return result;
}

type DueQueueRow = Prisma.EmailQueueGetPayload<{
  include: {
    rsvp: {
      include: {
        user: {
          select: {
            id: true;
            email: true;
            name: true;
          };
        };
        event: {
          select: {
            id: true;
            title: true;
            slug: true;
            startsAt: true;
            venue: true;
            address: true;
          };
        };
      };
    };
    flowStep: {
      include: {
        template: { select: { id: true; subject: true; bodyHtml: true; name: true; logoUrl: true; logoHidden: true } };
        audience: { select: { id: true; name: true } };
        flow: { select: { id: true; name: true; status: true } };
      };
    };
  };
}>;

async function processQueueRow(row: DueQueueRow): Promise<ProcessOutcome> {
  const step = row.flowStep;
  if (!step) throw new Error(`queue row ${row.id} has no flowStep`);
  if (!step.template) throw new Error(`step ${step.id} has no template`);

  // Skip if the flow is no longer ACTIVE (paused / archived).
  if (step.flow.status !== "ACTIVE") {
    await db.emailQueue.update({
      where: { id: row.id },
      data: { status: "SKIPPED", errorMessage: `flow status is ${step.flow.status}` },
    });
    return "skipped";
  }

  // ── Resolve recipient fields ────────────────────────────────────────
  // The queue row may or may not have a linked RSVP. Audience sends to
  // emails without an RSVP leave rsvpId null; we use the denormalized
  // email/eventId/userId columns on EmailQueue directly in that case.
  // For event context, prefer the included rsvp.event (already loaded via
  // the include), otherwise fall back to fetching the event by row.eventId.
  let eventCtx: {
    id: string;
    title: string;
    slug: string;
    startsAt: Date;
    venue: string | null;
    address: string | null;
  };

  if (row.rsvp) {
    eventCtx = row.rsvp.event;
  } else {
    const fetched = await db.event.findUnique({
      where: { id: row.eventId },
      select: {
        id: true,
        title: true,
        slug: true,
        startsAt: true,
        venue: true,
        address: true,
      },
    });
    if (!fetched) {
      throw new Error(`queue row ${row.id} has no rsvp and event ${row.eventId} not found`);
    }
    eventCtx = fetched;
  }

  // Recipient display name: prefer rsvp.name, then user.name (if linked),
  // otherwise fall back to the email address.
  let recipientName: string | null = row.rsvp?.name ?? null;
  if (!recipientName && row.userId) {
    const u = await db.user.findUnique({
      where: { id: row.userId },
      select: { name: true },
    });
    recipientName = u?.name ?? null;
  }
  const recipientEmail = row.email; // always set on EmailQueue
  const checkInCode = row.rsvp?.checkInCode ?? null;

  // Pick the subject based on the assigned variant.
  const variant = row.subjectVariant ?? "A";
  const subjectSource =
    variant === "B"
      ? (step.subjectVariantB ?? step.subjectVariantA ?? step.template.subject)
      : (step.subjectVariantA ?? step.template.subject);

  // Build context.
  const baseUrl = process.env.NEXTAUTH_URL || "https://aisalon.massapro.com";

  // Look up the chapter name + chapterId for the {{chapter_name}} merge
  // token AND the per-chapter email-logo override (ChapterSetting[emailLogo]).
  // TSK-0075: resolves the chapter name from the V7 Chapter relation
  // (chapterRef.name) — preferred over the legacy `chapter` String field
  // (which defaults to "Tel Aviv" and was the root cause of Montreal emails
  // saying "Tel Aviv").
  let chapterName: string | undefined;
  let chapterId: string | null = null;
  try {
    const eventWithChapter = await db.event.findUnique({
      where: { id: row.eventId },
      select: {
        chapter: true,
        chapterId: true,
        chapterRef: { select: { id: true, name: true } },
      },
    });
    chapterName =
      eventWithChapter?.chapterRef?.name ?? eventWithChapter?.chapter ?? undefined;
    chapterId = eventWithChapter?.chapterId ?? null;
  } catch {
    // ignore — buildContext falls back to empty chapterName.
  }

  const ctx = buildContext({
    event: eventCtx,
    rsvp: {
      name: recipientName ?? recipientEmail,
      email: recipientEmail,
      checkInCode,
    },
    speakers: [],
    agenda: [],
    baseUrl,
    queueId: row.id,
    chapterName,
  });

  // TSK-0074: FIX THE LOGO BUG. Previously `renderTemplate(step.template.htmlBody, ctx)`
  // was called with NO `opts.logoHtml` — flow-sent emails got NO brand logo.
  // Now we use the unified renderer + pass `logoHtml: buildLogoBlock(step.template.logoUrl)`
  // so flow-sent emails get the same top-right brand mark as stage-based sends.
  //
  // Also: field renamed htmlBody → bodyHtml on EmailTemplate2.
  //
  // PER USER SPEC 2026-08-05: resolve the default email logo async
  // (chapter override → global SiteSetting → env var → seeded default)
  // and pass it to buildLogoBlock. The per-template logoUrl override
  // (step.template.logoUrl) still wins.
  const resolvedLogoDefault = await resolveEmailLogoDefault(chapterId);
  const htmlBody = renderUnifiedEmail({
    html: step.template.bodyHtml,
    ctx,
    logoHtml: buildLogoBlock(
      step.template.logoUrl,
      step.template.logoHidden ?? false,
      resolvedLogoDefault,
    ),
    clickWrapFn: ctx.wrapLink,
    openPixelUrl: ctx.openPixelUrl,
    chapterName: ctx.chapterName,
  });
  const renderedSubject = renderUnifiedSubject(subjectSource, ctx);

  // Send via the configured provider (gmail if env set + creds present,
  // smtp if SMTP_* set, mock otherwise).
  const sendResult: SendResult = await sendEmail({
    to: recipientEmail,
    subject: renderedSubject,
    html: htmlBody,
  });

  if (!sendResult.ok) {
    throw new Error(`send failed: ${sendResult.error}`);
  }

  // Mock / paused sends: keep the row SKIPPED so the admin UI is honest.
  if (sendResult.mock) {
    await db.emailQueue.update({
      where: { id: row.id },
      data: {
        status: "SKIPPED",
        subject: renderedSubject,
        htmlBody,
        errorMessage: `Mock/paused send — provider=${sendResult.provider}. No email was delivered. Configure SMTP_* or EMAIL_PROVIDER=gmail + Google OAuth2 creds to send for real.`,
      },
    });
    return "mock";
  }

  // Mark SENT + store subject + htmlBody for replay.
  const now = new Date();
  await db.emailQueue.update({
    where: { id: row.id },
    data: {
      status: "SENT",
      sentAt: now,
      subject: renderedSubject,
      htmlBody,
    },
  });
  return "sent";
}

async function markRowFailed(row: DueQueueRow, err: unknown) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const newAttemptCount = row.attemptCount + 1;

  if (newAttemptCount >= MAX_ATTEMPTS) {
    // Permanently failed.
    await db.emailQueue.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        errorMessage,
        attemptCount: newAttemptCount,
      },
    });
  } else {
    // Retry on the next tick (keep PENDING, bump attemptCount, reschedule
    // 1 minute out to avoid hammering a broken provider).
    await db.emailQueue.update({
      where: { id: row.id },
      data: {
        errorMessage,
        attemptCount: newAttemptCount,
        scheduledFor: new Date(Date.now() + 60 * 1000),
      },
    });
  }
}
