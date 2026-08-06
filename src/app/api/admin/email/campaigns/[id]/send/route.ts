import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { sendCampaignEmail, isSmtpConfigured, isGmailConfigured } from "@/lib/email-orchestrator/sender";
import { renderUnifiedEmail, renderUnifiedSubject } from "@/lib/email/render-unified";
import { buildLogoBlock, resolveEmailLogoDefault } from "@/lib/email-orchestrator/templates";
import { randomUUID } from "crypto";
import { htmlToText } from "@/lib/email-campaign/render";
import { resolveAudienceEmailsById } from "@/lib/email-orchestrator/audience-filter";

/**
 * POST /api/admin/email/campaigns/[id]/send
 *
 * Resolves the recipient list based on listSource + listConfigJson, then
 * sends the campaign's snapshot to each recipient. Marks the campaign as
 * SENDING while in progress, then SENT (or FAILED if any error) when done.
 *
 * Behavior:
 *   - listSource === "ALL_MEMBERS": all users with an email
 *   - listSource === "TAG:<label>": all users with at least one matching tag
 *   - listSource === "EVENT:<eventId>": all users who RSVP'd to that event
 *   - listSource === "MANUAL": listConfigJson is { emails: ["a@x.com", ...] }
 *   - listSource === "AUDIENCE:<id>": resolve via audience-filter evaluator
 *     (supports STATIC email lists AND DYNAMIC filter specs with exclusions;
 *     this is what flow-linked campaigns use — when a flow with an audience
 *     on its first step is saved as ACTIVE, the auto-created linked campaign
 *     gets listSource = "AUDIENCE:<audienceId>")
 *   - Otherwise: empty list (no recipients)
 *
 * This endpoint is synchronous — it sends all emails in the request. For
 * large lists (100+), this may exceed Vercel's serverless function timeout
 * (10s on Hobby, 60s on Pro). For production-grade sending, this should be
 * moved to a queue + background worker, but for the AI Salon community
 * (~100 members) this is sufficient.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await db.emailCampaign.findUnique({
    where: { id },
    include: {
      // TSK-0074: load the linked template's logoUrl + mobileOverridesHtml
      // so campaign sends render the brand logo + mobile overrides (same
      // as flow-sent emails via the orchestrator worker). Previously
      // campaign sends had NO logo (the renderer was called without
      // logoHtml, and the comment said "UI subagent will add logoUrl
      // support in a later phase" — this is that phase).
      template: {
        select: {
          logoUrl: true,
          logoHidden: true,
          mobileOverridesHtml: true,
        },
      },
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status === "SENDING" || campaign.status === "SENT") {
    return NextResponse.json(
      { error: `Campaign already in status ${campaign.status}` },
      { status: 409 }
    );
  }

  // TSK-0074: was `emailConfigured()` (SMTP-only check). Now accepts Gmail
  // OAuth2 as a valid provider too. If neither is configured, returns 503
  // so the admin sees the misconfiguration before any recipient rows are
  // created (otherwise every recipient would be marked SKIPPED/mock).
  if (!isSmtpConfigured() && !isGmailConfigured()) {
    return NextResponse.json(
      { error: "No email provider is configured on the server. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars (or EMAIL_PROVIDER=gmail + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN)." },
      { status: 503 }
    );
  }

  // ---- Resolve recipients ----
  const recipients = await resolveRecipients(campaign.listSource, campaign.listConfigJson);
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No recipients matched the list filter. Update the list source and try again." },
      { status: 400 }
    );
  }

  // ---- Mark as SENDING ----
  await db.emailCampaign.update({
    where: { id },
    data: {
      status: "SENDING",
      startedAt: new Date(),
      recipientCount: recipients.length,
    },
  });

  // ---- Wipe any prior recipients from a previous failed send ----
  await db.emailRecipient.deleteMany({ where: { campaignId: id } });

  // ---- Create recipient rows + send ----
  // Default from-name is "AI Salon" (chapter-neutral). The from-name is
  // admin-editable per campaign, so we only use this default when the
  // admin left it blank. We resolve the chapter name separately below
  // for the {{chapter_name}} merge token in the body.
  const fromName = campaign.fromName || "AI Salon";
  const fromEmail = campaign.fromEmail || process.env.SMTP_FROM || "no-reply@aisalon.massapro.com";
  const from = `${fromName} <${fromEmail}>`;
  const replyTo = campaign.replyTo || undefined;

  // If the campaign targets an event (listSource === "EVENT:<eventId>"),
  // look up the event slug + title so we can resolve {{eventUrl}},
  // {{myCodeUrl}}, {{event.myCodeUrl}}, {{eventTitle}} merge tags.
  // Falls through to "no event context" (tokens resolve to "") if the
  // event was deleted or the campaign isn't event-bound.
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

  // Resolve the chapter display name for the {{chapter_name}} merge token.
  // If the campaign is linked to a chapter, use its name; otherwise fall
  // back to "Tel Aviv" (the original AI Salon chapter) for backward
  // compatibility with existing seeded templates.
  let chapterName = "Tel Aviv";
  if (campaign.chapterId) {
    try {
      const chapter = await db.chapter.findUnique({
        where: { id: campaign.chapterId },
        select: { name: true },
      });
      if (chapter?.name) chapterName = chapter.name;
    } catch {
      // DB error — keep the default "Tel Aviv".
    }
  }

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  // PER USER SPEC 2026-08-05: resolve the default email brand logo ONCE
  // before the recipient loop (chapter override → global SiteSetting → env
  // var → seeded default). Reused for every recipient — the logo default is
  // campaign-scoped, not recipient-scoped. The per-template logoUrl override
  // (campaign.template?.logoUrl) still wins over this default.
  //
  // NOTE: This uses the campaign's chapterId (not the per-recipient
  // chapterId) because the logo is a campaign-level brand decision — the
  // admin picked the template + logo when composing the campaign, and that
  // brand should stay consistent across all recipients of THIS campaign.
  // The {{chapter_name}} merge tag in the BODY, however, IS resolved
  // per-recipient below (r.chapterName → campaignChapterName → "Tel Aviv").
  const resolvedLogoDefault = await resolveEmailLogoDefault(campaign.chapterId ?? null);

  for (const r of recipients) {
    // Per-recipient trackToken (for open/click tracking later)
    const trackToken = randomUUID().replace(/-/g, "");
    const recipientRow = await db.emailRecipient.create({
      data: {
        campaignId: id,
        userId: r.userId || null,
        email: r.email,
        name: r.name || null,
        // Persist the recipient's chapter on the EmailRecipient row so the
        // cron retry/queue-drain path (/api/cron/email) can resolve
        // {{chapter_name}} without re-querying the User table.
        chapterId: r.chapterId ?? null,
        trackToken,
        status: "QUEUED",
      },
    });

    // TSK-0074: REPLACED the inline regex `.replace()` chain with a call
    // to the unified renderer. The legacy code:
    //   1. Did NOT inject the brand logo.
    //   2. Did NOT wrap links with the click-redirect (no click tracking).
    //   3. Did NOT append the open-tracking pixel (no open tracking).
    //   4. Did NOT append the unsubscribe footer.
    //   5. Had a `cc: replyTo` bug (was CC'ing the replyTo address on every send).
    // The unified renderer fixes all 5 issues in one place.
    const firstName = (r.name || "there").split(" ")[0];
    // Per-recipient chapter name resolution (priority):
    //   1. r.chapterName — the recipient's own chapter (from User.chapter)
    //   2. chapterName — the campaign's linked chapter (computed above)
    //   3. "Tel Aviv" — platform-wide fallback (already baked into chapterName)
    // This lets a single campaign reach members across multiple chapters
    // and have each email show the recipient's own chapter name.
    const perRecipientChapterName =
      r.chapterName && r.chapterName.trim() ? r.chapterName : chapterName;
    // Build the finishOnboardingUrl with ?chapterSlug=<recipient's slug>
    // so when the user clicks the link in the email, the /onboarding page
    // renders with their chapter's branding (logo, name, copy) even if
    // their user.chapterId is null (e.g. they signed up before the
    // signup-form-was-chapter-aware fix). Without this, the URL is just
    // /onboarding with no slug, and resolveChapter() on the onboarding
    // page falls back to DEFAULT_CHAPTER_SLUG = "tel-aviv" — so Montreal
    // members see Tel Aviv branding on the onboarding page they reached
    // via an email link.
    const finishOnboardingUrl = r.chapterSlug
      ? `${baseUrl}/onboarding?chapterSlug=${encodeURIComponent(r.chapterSlug)}`
      : `${baseUrl}/onboarding`;
    const renderCtx = {
      firstName,
      name: r.name || "",
      email: r.email,
      chapterName: perRecipientChapterName,
      eventTitle: eventCtx?.title ?? "",
      eventVenue: eventCtx?.venue ?? "",
      eventAddress: eventCtx?.address ?? "",
      eventUrl,
      myCodeUrl,
      finishOnboardingUrl,
    };
    const personalizedSubject = renderUnifiedSubject(campaign.subjectSnapshot, renderCtx);
    const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?t=${trackToken}&c=${id}`;
    const personalizedHtml = renderUnifiedEmail({
      html: campaign.bodyHtmlSnapshot,
      ctx: renderCtx,
      // TSK-0074: pass the linked template's logoUrl + mobileOverridesHtml
      // so campaign sends get the same brand logo + mobile styling as
      // flow-sent emails. buildLogoBlock falls back to the default brand
      // logo when logoUrl is null/empty.
      logoHtml: buildLogoBlock(
        campaign.template?.logoUrl ?? null,
        campaign.template?.logoHidden ?? false,
        resolvedLogoDefault,
      ),
      mobileOverridesHtml: campaign.template?.mobileOverridesHtml ?? undefined,
      campaignId: id,
      trackToken,
      baseUrl,
      unsubscribeUrl,
      chapterName: perRecipientChapterName,
    });
    // Plain-text alternative: snapshot.bodyTextSnapshot if set, else derive
    // from the snapshot bodyHtml (NOT the rendered HTML — we don't want
    // tracking pixels + footers in the plain-text version).
    const personalizedText = campaign.bodyTextSnapshot
      ? renderUnifiedSubject(campaign.bodyTextSnapshot, renderCtx)
      : htmlToText(campaign.bodyHtmlSnapshot);

    // TSK-0074: was `sendMail({ ..., cc: replyTo })` — the `cc: replyTo` was
    // a bug (was CC'ing the replyTo address on every send). Now passes
    // `replyTo` as a proper Reply-To header via sendCampaignEmail.
    const result = await sendCampaignEmail({
      to: r.email,
      subject: personalizedSubject,
      html: personalizedHtml,
      text: personalizedText,
      from,
      replyTo,
      campaignId: id,
      recipientId: recipientRow.id,
    });

    if (result.ok) {
      // TSK-0074: mock / paused sends are marked SKIPPED (not SENT) so the
      // admin sees accurate counts in the campaign report. Real sends mark
      // SENT as before.
      if (result.mock) {
        failedCount++;
        await db.emailRecipient.update({
          where: { id: recipientRow.id },
          data: {
            status: "FAILED",
            errorReason: result.skipped
              ? `Skipped — global email sending is paused (SiteSetting[emailSendPaused]=true). Resume sending in /admin/email to deliver.`
              : `Mock send — provider=${result.provider}. No email was delivered. Configure SMTP_* or EMAIL_PROVIDER=gmail + Google OAuth2 creds to send for real.`,
          },
        });
        await db.emailEvent.create({
          data: {
            campaignId: id,
            recipientId: recipientRow.id,
            email: r.email,
            type: "SKIPPED",
            details: result.skipped
              ? "Paused (admin toggle)"
              : `Mock send (provider=${result.provider})`,
          },
        });
        errors.push(`${r.email}: ${result.skipped ? "paused" : "mock send"}`);
      } else {
        sentCount++;
        await db.emailRecipient.update({
          where: { id: recipientRow.id },
          data: { status: "SENT", sentAt: new Date() },
        });
        await db.emailEvent.create({
          data: {
            campaignId: id,
            recipientId: recipientRow.id,
            email: r.email,
            type: "SENT",
          },
        });
      }
    } else {
      failedCount++;
      await db.emailRecipient.update({
        where: { id: recipientRow.id },
        data: { status: "FAILED", errorReason: result.error || "Unknown error" },
      });
      await db.emailEvent.create({
        data: {
          campaignId: id,
          recipientId: recipientRow.id,
          email: r.email,
          type: "FAILED",
          details: result.error || "Unknown error",
        },
      });
      errors.push(`${r.email}: ${result.error}`);
    }
  }

  // ---- Mark as SENT (or FAILED if all sends failed) ----
  const finalStatus = sentCount === 0 ? "FAILED" : "SENT";
  await db.emailCampaign.update({
    where: { id },
    data: {
      status: finalStatus,
      completedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    status: finalStatus,
    sentCount,
    failedCount,
    totalRecipients: recipients.length,
    ...(errors.length > 0 ? { errors: errors.slice(0, 20) } : {}),
  });
}

/**
 * Resolve the list of recipients based on listSource + listConfigJson.
 */
async function resolveRecipients(
  listSource: string,
  listConfigJson: string
): Promise<
  Array<{
    userId?: string;
    email: string;
    name?: string | null;
    chapterId?: string | null;
    chapterName?: string | null;
    chapterSlug?: string | null;
  }>
> {
  let config: any = {};
  try {
    config = JSON.parse(listConfigJson || "{}");
  } catch {
    config = {};
  }

  // Common User select that includes chapter info for per-recipient
  // {{chapter_name}} resolution AND the chapter slug (used to build
  // chapter-aware {{finishOnboardingUrl}} links). Used by ALL_MEMBERS,
  // TAG, MANUAL, and AUDIENCE paths. EVENT path goes through RSVPs and
  // hydrates the user separately below.
  const userSelectWithChapter = {
    id: true,
    email: true,
    name: true,
    chapterId: true,
    chapter: { select: { name: true, slug: true } },
  } as const;

  // ALL_MEMBERS — every user with an email
  if (listSource === "ALL_MEMBERS") {
    const users = await db.user.findMany({
      where: { email: { not: "" } },
      select: userSelectWithChapter,
    });
    return users.map((u) => ({
      userId: u.id,
      email: u.email,
      name: u.name,
      chapterId: u.chapterId,
      chapterName: u.chapter?.name ?? null,
      chapterSlug: u.chapter?.slug ?? null,
    }));
  }

  // TAG:<label> — all users with at least one MemberTag matching the label
  const tagMatch = listSource.match(/^TAG:(.+)$/);
  if (tagMatch) {
    const label = tagMatch[1];
    const users = await db.user.findMany({
      where: { tags: { some: { label } } },
      select: userSelectWithChapter,
    });
    return users.map((u) => ({
      userId: u.id,
      email: u.email,
      name: u.name,
      chapterId: u.chapterId,
      chapterName: u.chapter?.name ?? null,
      chapterSlug: u.chapter?.slug ?? null,
    }));
  }

  // EVENT:<eventId> — all users who RSVP'd to that event. RSVPs may not
  // have a userId (manual email-only RSVPs), so we hydrate chapter info
  // from the User row only when userId is present.
  const eventMatch = listSource.match(/^EVENT:(.+)$/);
  if (eventMatch) {
    const eventId = eventMatch[1];
    const rsvps = await db.eventRsvp.findMany({
      where: { eventId, status: "GOING" },
      select: {
        userId: true,
        email: true,
        name: true,
        user: {
          select: {
            chapterId: true,
            chapter: { select: { name: true, slug: true } },
          },
        },
      },
    });
    return rsvps.map((r) => ({
      userId: r.userId || undefined,
      email: r.email,
      name: r.name,
      chapterId: r.user?.chapterId ?? null,
      chapterName: r.user?.chapter?.name ?? null,
      chapterSlug: r.user?.chapter?.slug ?? null,
    }));
  }

  // MANUAL — listConfigJson is { emails: ["a@x.com", ...] }
  if (listSource === "MANUAL" && Array.isArray(config.emails)) {
    const seen = new Set<string>();
    const out: Array<{
      userId?: string;
      email: string;
      name?: string | null;
      chapterId?: string | null;
      chapterName?: string | null;
    }> = [];
    for (const emailRaw of config.emails) {
      const email = (emailRaw || "").toString().trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      // Try to resolve to a platform user
      const user = await db.user.findUnique({
        where: { email },
        select: userSelectWithChapter,
      });
      out.push({
        userId: user?.id,
        email,
        name: user?.name || null,
        chapterId: user?.chapterId ?? null,
        chapterName: user?.chapter?.name ?? null,
        chapterSlug: user?.chapter?.slug ?? null,
      });
    }
    return out;
  }

  // AUDIENCE:<audienceId> — resolve via the audience-filter evaluator.
  // This is what flow-linked campaigns use: when a flow with an audience on
  // its first step is saved as ACTIVE, the auto-created linked campaign gets
  // listSource = "AUDIENCE:<audienceId>" + listConfigJson = { audienceId }.
  // We resolve BOTH static (email list) and dynamic (filter spec) audiences,
  // apply any stored exclusions, then hydrate each email into a recipient
  // row (with userId linkage if the email matches a platform user).
  const audienceMatch = listSource.match(/^AUDIENCE:(.+)$/);
  if (audienceMatch) {
    const audienceId = audienceMatch[1];
    const emails = await resolveAudienceEmailsById(audienceId);
    const seen = new Set<string>();
    const out: Array<{
      userId?: string;
      email: string;
      name?: string | null;
      chapterId?: string | null;
      chapterName?: string | null;
      chapterSlug?: string | null;
    }> = [];
    for (const email of emails) {
      const lower = email.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      const user = await db.user.findUnique({
        where: { email: lower },
        select: userSelectWithChapter,
      });
      out.push({
        userId: user?.id,
        email: lower,
        name: user?.name || null,
        chapterId: user?.chapterId ?? null,
        chapterName: user?.chapter?.name ?? null,
        chapterSlug: user?.chapter?.slug ?? null,
      });
    }
    return out;
  }

  return [];
}
