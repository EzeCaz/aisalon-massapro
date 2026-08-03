import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { sendCampaignEmail } from "@/lib/email-orchestrator/sender";
import { renderUnifiedEmail, renderUnifiedSubject } from "@/lib/email/render-unified";
import { htmlToText } from "@/lib/email-campaign/render";

/**
 * POST /api/admin/email/campaigns/[id]/test-send
 *
 * TSK-0074 (email unification Phase 4): test-send modal endpoint.
 *
 * Sends the campaign's rendered email to a free-typed list of email
 * addresses (comma-separated or array). Bypasses the audience entirely —
 * no EmailRecipient rows are created, no EmailEvent rows are logged.
 * Just `console.log` + return success/failure counts.
 *
 * The `isTest: true` flag is passed to `sendCampaignEmail` so test sends
 * bypass the SiteSetting[emailSendPaused] check (admin can verify rendering
 * even while production sends are paused). The hard env kill switch
 * (EMAIL_SEND_ENABLED=false) is still honored — test sends are blocked
 * when the kill switch is off.
 *
 * Auth: admin-only (same `requireAdmin` check as the /send route).
 *
 * Body:
 *   { emails: string[] | string }
 *     - If string: comma-separated (or newline-separated) list of emails.
 *     - If array: each entry is one email.
 *   - All entries are trimmed, lowercased, deduped, and validated against
 *     a basic email regex. Invalid entries are silently dropped (the
 *     `errors` array in the response lists them).
 *
 * Response:
 *   200: { sent: N, failed: M, total: T, errors: ["email: reason", ...] }
 *   400: { error: "no valid emails provided" }
 *   401: { error: "Unauthorized" }
 *   404: { error: "Campaign not found" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  // Same check as /api/admin/email/campaigns/[id]/send — admin-only.
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // ── Load campaign ────────────────────────────────────────────────────────
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // ── Parse + validate emails ──────────────────────────────────────────────
  let body: { emails?: unknown; email?: unknown } = {};
  try {
    body = await req.json() as { emails?: unknown; email?: unknown };
  } catch {
    // empty body — fall through to validation which will reject
  }

  // Accept either `emails: string[]` or `emails: "a@x.com, b@x.com"` (or
  // newline-separated). Also accept a top-level `emails` string for
  // convenience (the modal may send either shape).
  let rawEmails: unknown[] = [];
  if (Array.isArray(body.emails)) {
    rawEmails = body.emails;
  } else if (typeof body.emails === "string") {
    // Split on commas, newlines, semicolons, or whitespace.
    rawEmails = body.emails.split(/[\s,;]+/).filter(Boolean);
  } else if (typeof body.email === "string") {
    // Convenience: accept `email: "a@x.com"` (single email).
    rawEmails = [body.email];
  }

  // Normalize + dedupe + validate.
  const seen = new Set<string>();
  const invalid: string[] = [];
  const validEmails: string[] = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const raw of rawEmails) {
    if (typeof raw !== "string") continue;
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    if (!emailRegex.test(email)) {
      invalid.push(email);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    validEmails.push(email);
  }

  if (validEmails.length === 0) {
    return NextResponse.json(
      {
        error: "No valid emails provided",
        invalid,
      },
      { status: 400 },
    );
  }

  // ── Build render context ────────────────────────────────────────────────
  // Use the first valid email's local part as the "firstName" so the
  // {{firstName}} token resolves to something (instead of literal text).
  // The test-send modal is for previewing the rendered email — the admin
  // can see how personalization looks for a real recipient.
  const firstEmail = validEmails[0];
  const firstNameFromEmail = firstEmail.split("@")[0].replace(/[._-]+/g, " ").split(" ")[0] || "friend";

  // Resolve chapter name (default "Tel Aviv" for backward compat).
  let chapterName = "Tel Aviv";
  if (campaign.chapterId) {
    try {
      const chapter = await db.chapter.findUnique({
        where: { id: campaign.chapterId },
        select: { name: true },
      });
      if (chapter?.name) chapterName = chapter.name;
    } catch {
      // keep default
    }
  }

  // If the campaign targets an event (listSource === "EVENT:<eventId>"),
  // look up the event slug + title so {{eventUrl}}, {{myCodeUrl}},
  // {{eventTitle}}, etc. resolve correctly in the test send.
  const eventMatch = campaign.listSource.match(/^EVENT:(.+)$/);
  const eventCtx = eventMatch
    ? await db.event.findUnique({
        where: { id: eventMatch[1] },
        select: { slug: true, title: true, venue: true, address: true },
      })
    : null;
  const baseUrl =
    process.env.EMAIL_TRACKING_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://aisalon.massapro.com";
  const eventUrl = eventCtx ? `${baseUrl}/e/${eventCtx.slug}` : "";
  const myCodeUrl = eventCtx ? `${eventUrl}/my-code` : "";

  const renderCtx = {
    firstName: firstNameFromEmail,
    name: firstNameFromEmail,
    email: firstEmail,
    chapterName,
    eventTitle: eventCtx?.title ?? "",
    eventVenue: eventCtx?.venue ?? "",
    eventAddress: eventCtx?.address ?? "",
    eventUrl,
    myCodeUrl,
  };

  // Render once (same HTML for every test recipient — test sends don't
  // get per-recipient tracking pixels since no EmailRecipient rows are
  // created). We use a synthetic trackToken purely for the unsubscribe
  // + click-wrap URLs so they're well-formed; clicking them in a test
  // email will 404 (no matching recipient row), which is fine for a test.
  const syntheticTrackToken = `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?t=${syntheticTrackToken}&c=${id}`;
  const renderedHtml = renderUnifiedEmail({
    html: campaign.bodyHtmlSnapshot,
    ctx: renderCtx,
    // No logo for campaign test sends (same as production campaign sends —
    // UI subagent will add logoUrl support in a later phase).
    campaignId: id,
    trackToken: syntheticTrackToken,
    baseUrl,
    unsubscribeUrl,
    chapterName,
  });
  const renderedText = campaign.bodyTextSnapshot
    ? renderUnifiedSubject(campaign.bodyTextSnapshot, renderCtx)
    : htmlToText(campaign.bodyHtmlSnapshot);

  // ── Send to each email ──────────────────────────────────────────────────
  // From: campaign override (fromName + fromEmail) or SMTP_FROM / EMAIL_FROM.
  const fromName = campaign.fromName || "AI Salon";
  const fromEmail =
    campaign.fromEmail || process.env.SMTP_FROM || "no-reply@aisalon.massapro.com";
  const from = `${fromName} <${fromEmail}>`;
  const replyTo = campaign.replyTo || undefined;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const email of validEmails) {
    // Per-recipient personalization: re-render subject (firstName may differ
    // if emails are different). The HTML stays the same (already rendered
    // with the first email's firstName — test sends are for preview, not
    // production-grade personalization).
    const perRecipientCtx = { ...renderCtx, email };
    const perRecipientSubject = renderUnifiedSubject(campaign.subjectSnapshot, perRecipientCtx);

    const result = await sendCampaignEmail({
      to: email,
      subject: perRecipientSubject,
      html: renderedHtml,
      text: renderedText,
      from,
      replyTo,
      campaignId: id,
      isTest: true, // bypasses SiteSetting[emailSendPaused]
    });

    if (result.ok) {
      sent++;
      // Audit log — no DB rows are created for test sends.
      console.log(
        `[email-test-send] CAMPAIGN: ${id} | TO: ${email} | SUBJECT: ${perRecipientSubject} | PROVIDER: ${result.provider}${result.mock ? " (mock)" : ""}`,
      );
    } else {
      failed++;
      const errMsg = result.error || "Unknown error";
      errors.push(`${email}: ${errMsg}`);
      console.error(
        `[email-test-send] FAILED | CAMPAIGN: ${id} | TO: ${email} | ERROR: ${errMsg}`,
      );
    }
  }

  // Append invalid-email errors to the response.
  for (const inv of invalid) {
    errors.push(`${inv}: invalid email format (skipped)`);
  }

  return NextResponse.json({
    sent,
    failed,
    total: validEmails.length,
    invalid,
    ...(errors.length > 0 ? { errors: errors.slice(0, 50) } : {}),
  });
}
