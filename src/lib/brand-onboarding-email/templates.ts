/**
 * Brand onboarding email templates (cazhype funnel, 2026-09-29).
 *
 * 3-step drip sent to the brand lead after their Brand row is approved
 * + provisioned via /onboarding/[brandSlug]:
 *
 *   1. WELCOME   (Day 0, immediate)  — "Welcome to Coma, here's your
 *                                       setup link + 6-asset checklist"
 *   2. REMINDER  (Day 3, conditional) — "Still missing: hero, mascot"
 *                                       (only sent if any asset is still
 *                                       using the Coma fallback)
 *   3. GO_LIVE   (Day 7, manual)     — "Your brand is live!" (sent on
 *                                       status=ACTIVE transition)
 *
 * Each template:
 *   - Reads the brand context via resolveEmailBrandContext (subject, From
 *     name, palette)
 *   - Links back to /onboarding/[brandSlug] (the admin hub)
 *   - Lists the 6 asset slots with ✓ / ✗ status per slot
 *   - Calls sendMail() from src/lib/email.ts (SMTP-aware, no-ops when
 *     SMTP isn't configured)
 *
 * Trigger options:
 *   - WELCOME  → fired by /api/brand-assets/[brandSlug] PATCH when admin
 *                first activates a previously-DRAFT brand
 *   - REMINDER → fired by /api/cron/email daily, checking for ACTIVE
 *                brands with assets still at "coma-fallback" provenance
 *                3+ days after creation
 *   - GO_LIVE  → fired by /api/brand-assets/[brandSlug] PATCH when status
 *                flips to ACTIVE
 *
 * For round 1, only WELCOME + GO_LIVE are wired from the PATCH endpoint.
 * REMINDER is deferred to round 2 (needs a daily cron + a "last reminder
 * sent at" column on Brand to avoid spam).
 */

import { sendMail, emailConfigured } from "@/lib/email";
import { resolveEmailBrandContext } from "@/lib/email-brand-context";
import {
  ASSET_KEYS,
  ASSET_LABELS,
  type AssetKey,
  type BrandAssets,
} from "@/lib/brand/brand-assets-resolver";

// ── Asset checklist builder ───────────────────────────────────────────────

function buildAssetChecklist(assets: BrandAssets): string {
  return ASSET_KEYS.map((key) => {
    const isUploaded = assets.provenance[key] === "brand-row";
    const icon = isUploaded ? "✓" : "✗";
    const status = isUploaded
      ? "uploaded"
      : "missing (using Coma fallback)";
    return `${icon}  ${ASSET_LABELS[key]} — ${status}`;
  }).join("\n");
}

function buildAssetChecklistHtml(assets: BrandAssets): string {
  return ASSET_KEYS.map((key) => {
    const isUploaded = assets.provenance[key] === "brand-row";
    const color = isUploaded ? "#10a371" : "#d97706";
    const bg = isUploaded ? "#e6f7ee" : "#fef3c7";
    const status = isUploaded ? "uploaded" : "missing — Coma fallback";
    return `
      <tr>
        <td style="padding: 6px 0; font-size: 13px; color: #444;">
          <span style="display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; background: ${bg}; color: ${color}; font-weight: 700; margin-right: 8px;">${isUploaded ? "✓" : "!"}</span>
          ${ASSET_LABELS[key]}
        </td>
        <td style="padding: 6px 0; font-size: 13px; color: ${color}; font-weight: 600;">
          ${status}
        </td>
      </tr>`;
  }).join("");
}

// ── Hub URL helper ───────────────────────────────────────────────────────

function hubUrl(brandSlug: string, appBaseUrl?: string): string {
  const base = appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://platform.joincoma.com";
  return `${base.replace(/\/$/, "")}/onboarding/${brandSlug}`;
}

// ── Stage 1: WELCOME (Day 0) ──────────────────────────────────────────────

export async function sendBrandOnboardingWelcomeEmail(opts: {
  to: string;
  leadName?: string | null;
  brandSlug: string;
  brandDisplayName: string;
  brandAssets: BrandAssets;
  appBaseUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const brand = resolveEmailBrandContext(opts.brandSlug);
  const firstName = opts.leadName?.split(" ")[0] || "there";
  const hubLink = hubUrl(opts.brandSlug, opts.appBaseUrl);
  const checklist = buildAssetChecklist(opts.brandAssets);
  const checklistHtml = buildAssetChecklistHtml(opts.brandAssets);

  const subject = `Welcome to Coma — let's set up ${opts.brandDisplayName}`;
  const text = `Hi ${firstName},

Welcome to the Coma platform! Your brand "${opts.brandDisplayName}" has been
approved, and your onboarding hub is ready:

${hubLink}

What you can do from there:
  - Upload your brand assets (logo, hero banner, mascot, favicon, email
    logo, brand book) via drag-and-drop
  - Configure your palette (we've pre-filled the palette you gave us
    during application: ${opts.brandAssets.palette.primary}, ${opts.brandAssets.palette.accent}, ${opts.brandAssets.palette.secondary})
  - Set your mascot name + backstory
  - Preview your mockups with your assets applied
  - Activate your brand (flips status to ACTIVE — your community goes
    live on the platform)

Current asset status:
${checklist}

If a slot shows "Coma fallback", your community will see Coma's default
imagery for that surface until you upload your own. We recommend uploading
all 6 before going live.

Reply to this email if you have questions — we'll get back within 1 business day.

— The ${brand.displayName} team
MassaPro · https://massapro.com`;

  const html = `
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">
    Welcome to Coma, ${firstName}!
  </h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Your brand <strong>${opts.brandDisplayName}</strong> has been approved.
    Your onboarding hub is ready — drag and drop your brand assets to make
    the community truly yours.
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    <a href="${hubLink}" style="display: inline-block; padding: 14px 28px; background: ${brand.gradient}; color: #fff; text-decoration: none; font-weight: 700; border-radius: 8px; font-size: 15px;">
      Open your onboarding hub →
    </a>
  </p>
  <h2 style="font-size: 16px; font-weight: 700; margin: 0 0 12px;">Current asset status</h2>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    ${checklistHtml}
  </table>
  <p style="font-size: 13px; line-height: 1.6; color: #777; margin: 0 0 16px;">
    If a slot shows "Coma fallback", your community will see Coma's default
    imagery for that surface until you upload your own. We recommend uploading
    all 6 before going live.
  </p>
  <p style="font-size: 14px; line-height: 1.6; color: #444; margin: 24px 0 0;">
    — The ${brand.displayName} team<br/>
    <span style="color: #777; font-size: 12px;">MassaPro · https://massapro.com</span>
  </p>
</div>`;

  if (!emailConfigured()) {
    console.log(`[brand-onboarding:welcome] SMTP not configured — would send to ${opts.to}`);
    return { ok: true };
  }

  return sendMail({
    to: opts.to,
    from: brand.fromName,
    subject,
    text,
    html,
  });
}

// ── Stage 2: REMINDER (Day 3, conditional) ─────────────────────────────────

export async function sendBrandOnboardingReminderEmail(opts: {
  to: string;
  leadName?: string | null;
  brandSlug: string;
  brandDisplayName: string;
  brandAssets: BrandAssets;
  missingAssets: AssetKey[];
  appBaseUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const brand = resolveEmailBrandContext(opts.brandSlug);
  const firstName = opts.leadName?.split(" ")[0] || "there";
  const hubLink = hubUrl(opts.brandSlug, opts.appBaseUrl);

  if (opts.missingAssets.length === 0) {
    // Nothing missing — don't send the reminder.
    return { ok: true, error: "No missing assets — skipped" };
  }

  const missingList = opts.missingAssets
    .map((k) => `  - ${ASSET_LABELS[k]}`)
    .join("\n");

  const subject = `3 days in — ${opts.missingAssets.length} asset${opts.missingAssets.length === 1 ? "" : "s"} still missing for ${opts.brandDisplayName}`;
  const text = `Hi ${firstName},

Quick check-in: ${opts.brandDisplayName} has been on the Coma platform
for 3 days. Your community is still seeing Coma's default imagery on these
surfaces:

${missingList}

To make the community truly yours, upload your own assets at:

${hubLink}

It takes 2–3 minutes per asset. Reply to this email if you'd like design
help — we can connect you with a brand designer from the Coma network.

— The ${brand.displayName} team`;

  if (!emailConfigured()) {
    console.log(`[brand-onboarding:reminder] SMTP not configured — would send to ${opts.to} (missing ${opts.missingAssets.length})`);
    return { ok: true };
  }

  const html = `
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 16px;">
    ${opts.missingAssets.length} asset${opts.missingAssets.length === 1 ? "" : "s"} still missing
  </h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Hi ${firstName} — quick check-in. ${opts.brandDisplayName} has been on
    the Coma platform for 3 days, and your community is still seeing
    Coma's default imagery on these surfaces:
  </p>
  <ul style="font-size: 14px; line-height: 1.8; color: #444; margin: 0 0 24px; padding-left: 20px;">
    ${opts.missingAssets.map((k) => `<li>${ASSET_LABELS[k]}</li>`).join("")}
  </ul>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    <a href="${hubLink}" style="display: inline-block; padding: 12px 24px; background: ${brand.gradient}; color: #fff; text-decoration: none; font-weight: 700; border-radius: 8px; font-size: 14px;">
      Open your onboarding hub →
    </a>
  </p>
  <p style="font-size: 13px; line-height: 1.6; color: #777; margin: 0;">
    Reply to this email if you'd like design help — we can connect you with
    a brand designer from the Coma network.
  </p>
</div>`;

  return sendMail({
    to: opts.to,
    from: brand.fromName,
    subject,
    text,
    html,
  });
}

// ── Stage 3: GO_LIVE (Day 7, manual — on status=ACTIVE transition) ────────

export async function sendBrandOnboardingGoLiveEmail(opts: {
  to: string;
  leadName?: string | null;
  brandSlug: string;
  brandDisplayName: string;
  appBaseUrl?: string;
  /** Public URL where the brand's community lives (e.g. https://platform.joincoma.com?brand=cazhype). */
  communityUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const brand = resolveEmailBrandContext(opts.brandSlug);
  const firstName = opts.leadName?.split(" ")[0] || "there";
  const hubLink = hubUrl(opts.brandSlug, opts.appBaseUrl);
  const communityUrl =
    opts.communityUrl ||
    `https://platform.joincoma.com/?brand=${opts.brandSlug}`;

  const subject = `${opts.brandDisplayName} is live on Coma! 🎉`;
  const text = `Hi ${firstName},

${opts.brandDisplayName} is now LIVE on the Coma platform!

Your community home: ${communityUrl}
Your admin hub:      ${hubLink}

What's next?
  1. Invite your first members — share the community URL
  2. Schedule your first event from the admin hub
  3. Generate event mockups with your branding applied (no AIS/Coma imagery — fully yours)
  4. Watch your analytics dashboard fill up

We're here if you need anything. Reply to this email or ping us in the
Coma Slack.

— The ${brand.displayName} team
MassaPro · https://massapro.com`;

  const html = `
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 16px; background: ${brand.gradient}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
    ${opts.brandDisplayName} is live! 🎉
  </h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    Your community is now visible to the world. Here's everything you need:
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 12px;">
    <strong>Your community home:</strong><br/>
    <a href="${communityUrl}" style="color: ${brand.primaryColor}; word-break: break-all;">${communityUrl}</a>
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    <strong>Your admin hub:</strong><br/>
    <a href="${hubLink}" style="color: ${brand.primaryColor}; word-break: break-all;">${hubLink}</a>
  </p>
  <h2 style="font-size: 16px; font-weight: 700; margin: 0 0 12px;">What's next?</h2>
  <ol style="font-size: 14px; line-height: 1.8; color: #444; margin: 0 0 24px; padding-left: 20px;">
    <li>Invite your first members — share the community URL</li>
    <li>Schedule your first event from the admin hub</li>
    <li>Generate event mockups with your branding applied (no AIS/Coma imagery — fully yours)</li>
    <li>Watch your analytics dashboard fill up</li>
  </ol>
  <p style="font-size: 14px; line-height: 1.6; color: #444; margin: 24px 0 0;">
    — The ${brand.displayName} team<br/>
    <span style="color: #777; font-size: 12px;">MassaPro · https://massapro.com</span>
  </p>
</div>`;

  if (!emailConfigured()) {
    console.log(`[brand-onboarding:go-live] SMTP not configured — would send to ${opts.to}`);
    return { ok: true };
  }

  return sendMail({
    to: opts.to,
    from: brand.fromName,
    subject,
    text,
    html,
  });
}
