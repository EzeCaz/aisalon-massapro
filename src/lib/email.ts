import nodemailer from "nodemailer";
import { resolveEmailBrandContext, type EmailBrandContext } from "@/lib/email-brand-context";

/**
 * Email sending utility.
 *
 * Reads SMTP configuration from env vars:
 *  - SMTP_HOST       e.g. smtp.gmail.com
 *  - SMTP_PORT       e.g. 465 (SSL) or 587 (STARTTLS)
 *  - SMTP_USER       SMTP username
 *  - SMTP_PASS       SMTP password / app-specific password
 *  - SMTP_FROM       From address, e.g. "AI Salon {chapter_name} <no-reply@massapro.com>"
 *  - SMTP_SECURE     "true" for port 465 (SSL), "false" for 587 (STARTTLS)
 *
 * If SMTP_HOST is missing, sends are no-ops and we log to console instead.
 * This lets the platform boot & be tested without an SMTP server, while
 * still letting production deployments drop in real SMTP credentials.
 */

let cachedTransport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (cachedTransport) return cachedTransport;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    // No SMTP configured — caller should handle the no-op case
    return null;
  }

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return cachedTransport;
}

export const emailConfigured = () => getTransport() !== null;

export async function sendMail(opts: {
  to: string;
  cc?: string;
  /** TSK-0074: optional Reply-To header (proper header, not a CC). Used by
   *  campaign sends via sendCampaignEmail — replaces the legacy `cc: replyTo`
   *  bug in /campaigns/[id]/send/route.ts that was incorrectly CC'ing the
   *  replyTo address on every send. */
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  /** Optional file attachments (e.g. .ics calendar invites). */
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
}): Promise<{ ok: boolean; error?: string }> {
  const transport = getTransport();
  const from = opts.from ||
    process.env.SMTP_FROM ||
    "AI Salon Chat <chat@aisalon.massapro.com>";

  if (!transport) {
    // Dev mode: log instead of sending. This is intentional — production
    // must set SMTP_* env vars for real delivery.
    console.log(
      "[email] (no SMTP configured — logging instead)\n" +
        `From: ${from}\nTo: ${opts.to}${opts.cc ? `\nCc: ${opts.cc}` : ""}${opts.replyTo ? `\nReply-To: ${opts.replyTo}` : ""}\nSubject: ${opts.subject}\n` +
        `----\n${opts.text || opts.html}\n----`
    );
    return { ok: true };
  }

  try {
    await transport.sendMail({
      from,
      to: opts.to,
      cc: opts.cc,
      replyTo: opts.replyTo,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || "application/octet-stream",
      })),
    });
    return { ok: true };
  } catch (err) {
    console.error("[email] sendMail failed:", err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Send a freshly-generated password to a user's email.
 * Used by the email sign-up flow: the user enters email + name, we
 * generate a random password, hash it, store it, and email the plaintext
 * to the user.
 *
 * The "Sign in" button links to {siteUrl}/login (the login page), with
 * ?callbackUrl=/events so the user lands on the events list after
 * signing in. We ALSO print the full URL in plain text below the button
 * — some email clients (notably Outlook desktop) strip the href from
 * <a> tags or break them with link-protection wrappers, so the plain-
 * text fallback lets the user copy-paste if the button doesn't work.
 *
 * BRAND CONTEXT (added 2026-08-11):
 *   - `brandSlug` controls which brand's wordmark, colors, and copy are
 *     used in the email. A Coma signup gets a Coma-branded email with
 *     navy/amber colors, "coma" wordmark, and Coma tagline — no "AI Salon"
 *     or "Tel Aviv" mentions at all.
 *   - `chapterName` is now OPTIONAL and brand-dependent in meaning:
 *       * AIS: chapter name ("Tel Aviv", "Montreal") is shown — same as before.
 *       * Coma: chapter name is omitted (a Coma user signing up hasn't
 *         created a chapter yet). The email is brand-only.
 *     If you pass chapterName with a Coma brandSlug, it's still rendered
 *     but the brand wordmark stays "Coma" (not "Coma Tel Aviv").
 *   - For backwards compat, when no brandSlug is provided the email
 *     falls back to the AIS brand — same behavior as before.
 */
export async function sendPasswordEmail(opts: {
  to: string;
  name: string | null;
  password: string;
  siteUrl: string;
  /** Optional chapter display name. Ignored for Coma (brand-only email). */
  chapterName?: string;
  /** Brand slug. When "coma", renders a Coma-branded email (no "AI Salon"). */
  brandSlug?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const firstName = opts.name?.split(" ")[0] || "there";
  const brand = resolveEmailBrandContext(opts.brandSlug);
  // For Coma: chapter name is not shown (Coma users sign up before they
  // have a chapter). For AIS: chapter name is appended to the brand display
  // name in the subject + headline (same as before).
  const isComa = brand.slug === "coma";
  const chapterName = opts.chapterName && !isComa ? opts.chapterName : null;
  const brandDisplay = chapterName
    ? `${brand.displayName} ${chapterName}`
    : brand.displayName;

  // Strip any trailing slash from siteUrl + append /login.
  // Use the brand-specific login URL (carries ?brand= param so the brand
  // sticks even when the email is opened on a different domain).
  // Add ?callbackUrl=/events so the user lands on the events list after login.
  const base = opts.siteUrl.replace(/\/$/, "");
  const loginUrl = `${base}/login?brand=${brand.slug}&callbackUrl=${encodeURIComponent("/events")}`;

  const subject = isComa
    ? `Your ${brand.displayName} login`
    : `Your ${brand.displayName} ${chapterName ?? ""} login`.trim();

  const text = isComa
    ? `Hi ${firstName},

Welcome to ${brand.displayName} — ${brand.tagline}.

Here is your one-time password for your first login:

    ${opts.password}

Go to the login page here:
${loginUrl}

(If the button above doesn't work in your email client, copy and paste
the URL into your browser.)

After you sign in, you can change your password from your profile page.

— The ${brand.displayName} team
${brand.siteUrl}`
    : `Hi ${firstName},

Welcome to ${brand.displayName} ${chapterName} — the community for AI builders, founders, CMOs and investors in ${chapterName}.

Here is your one-time password for your first login:

    ${opts.password}

Go to the login page here:
${loginUrl}

(If the button above doesn't work in your email client, copy and paste
the URL into your browser.)

After you sign in, you can change your password from your profile page.

— The ${brand.displayName} ${chapterName} team
${brand.siteUrl}`;

  const html = isComa
    ? buildComaPasswordHtml({ firstName, password: opts.password, loginUrl, brand })
    : buildAisPasswordHtml({
        firstName,
        password: opts.password,
        loginUrl,
        brand,
        chapterName: chapterName ?? "",
      });

  return sendMail({
    to: opts.to,
    subject,
    text,
    html,
    // Use the brand-specific From: address (overridable by SMTP_FROM env).
    from: process.env.SMTP_FROM || brand.fromName,
  });
}

/**
 * Build the Coma-branded password email HTML.
 *
 * Coma brand identity:
 *   - Navy primary (#0A1F44) — institutional, serious
 *   - Amber accent (#F5A623) — energetic, warm
 *   - Wordmark: "coma" lowercase, no chapter name appended
 *   - No "Tel Aviv" mention anywhere — Coma is brand-first, chapter-less
 *     at signup (chapter is created later in onboarding)
 *   - Tagline: "Building the Operating System for Communities"
 */
function buildComaPasswordHtml(opts: {
  firstName: string;
  password: string;
  loginUrl: string;
  brand: EmailBrandContext;
}): string {
  const { firstName, password, loginUrl, brand } = opts;
  return `
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <div style="margin: 0 0 24px;">
    <span style="font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: ${brand.primaryColor};">coma</span>
  </div>
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px; color: ${brand.primaryColor};">
    Welcome to Coma
  </h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Hi ${firstName},
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Your Coma platform account is ready. Here is your one-time password for
    your first login:
  </p>
  <div style="text-align: center; padding: 20px; margin: 24px 0; background: #FAF7F0; border-radius: 10px; border: 1px solid ${brand.accentColor}33;">
    <div style="font-family: 'SF Mono', Menlo, monospace; font-size: 22px; font-weight: 700; letter-spacing: 2px; color: ${brand.primaryColor};">
      ${password}
    </div>
  </div>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 12px;">
    <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background: ${brand.primaryColor}; color: #fff; text-decoration: none; font-weight: 600; border-radius: 6px;">
      Go to login page →
    </a>
  </p>
  <p style="font-size: 12px; line-height: 1.5; color: #777; margin: 0 0 20px; word-break: break-all;">
    If the button doesn't work, copy and paste this URL into your browser:<br/>
    <a href="${loginUrl}" style="color: ${brand.primaryColor}; word-break: break-all;">${loginUrl}</a>
  </p>
  <p style="font-size: 13px; line-height: 1.5; color: #777; margin: 0 0 24px;">
    After you sign in, you'll be guided through creating your chapter.
    You can change your password anytime from your profile page.
  </p>
  <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #999; margin: 0;">
    <strong style="color: ${brand.primaryColor};">coma</strong> · ${brand.tagline}<br/>
    <a href="${brand.siteUrl}" style="color: #999;">${brand.siteUrl.replace(/^https?:\/\//, "")}</a>
  </p>
</div>`;
}

/**
 * Build the AI Salon-branded password email HTML.
 *
 * Preserves the original AIS look (pink #FF005A password box, gradient
 * accents) but routes through the brand-context helper for consistency.
 */
function buildAisPasswordHtml(opts: {
  firstName: string;
  password: string;
  loginUrl: string;
  brand: EmailBrandContext;
  chapterName: string;
}): string {
  const { firstName, password, loginUrl, brand, chapterName } = opts;
  const brandDisplay = chapterName
    ? `${brand.displayName} ${chapterName}`
    : brand.displayName;
  return `
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">Welcome to ${brandDisplay}</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Hi ${firstName},
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Here is your one-time password for your first login:
  </p>
  <div style="text-align: center; padding: 20px; margin: 24px 0; background: #f6f6f6; border-radius: 10px; border: 1px solid #eee;">
    <div style="font-family: 'SF Mono', Menlo, monospace; font-size: 22px; font-weight: 700; letter-spacing: 2px; color: ${brand.secondaryColor};">
      ${password}
    </div>
  </div>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 12px;">
    <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; font-weight: 600; border-radius: 6px;">
      Go to login page →
    </a>
  </p>
  <p style="font-size: 12px; line-height: 1.5; color: #777; margin: 0 0 20px; word-break: break-all;">
    If the button doesn't work, copy and paste this URL into your browser:<br/>
    <a href="${loginUrl}" style="color: ${brand.primaryColor}; word-break: break-all;">${loginUrl}</a>
  </p>
  <p style="font-size: 13px; line-height: 1.5; color: #777; margin: 0;">
    After you sign in, you can change your password from your profile page.
  </p>
  <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #999; margin: 0;">
    ${brandDisplay} · ${brand.tagline}<br/>
    <a href="${brand.siteUrl}" style="color: #999;">${brand.siteUrl.replace(/^https?:\/\//, "")}</a>
  </p>
</div>`;
}

/**
 * Send a registration confirmation email with a .ics calendar attachment.
 * Called after a successful RSVP.
 *
 * The email includes:
 *   - Event details (title, date, time, venue, address)
 *   - A link back to the event page
 *   - A .ics file attachment that the user can open in Apple Calendar,
 *     Outlook desktop, or any iCal-compatible calendar app
 *   - A note about the on-platform "Save to Calendar" button for
 *     Google/Outlook web/Yahoo
 */
export async function sendRsvpConfirmationEmail(opts: {
  to: string;
  name: string | null;
  eventTitle: string;
  eventStartsAt: string; // ISO
  eventEndsAt: string;   // ISO
  eventVenue?: string | null;
  eventAddress?: string | null;
  eventCity?: string | null;
  eventCountry?: string | null;
  eventDescription?: string | null;
  eventUrl: string;
  icsContent: string;
  /** Optional chapter display name. Defaults to "Tel Aviv". */
  chapterName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const firstName = opts.name?.split(" ")[0] || "there";
  const chapterName = opts.chapterName ?? "Tel Aviv";
  const start = new Date(opts.eventStartsAt);
  const end = new Date(opts.eventEndsAt);

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(d);
  const fmtTime = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);

  const locationParts = [opts.eventVenue, opts.eventAddress, opts.eventCity, opts.eventCountry]
    .filter((p): p is string => Boolean(p && p.trim()));
  const location = locationParts.join(", ");

  const subject = `You're registered: ${opts.eventTitle}`;
  const text = `Hi ${firstName},

You're registered for:

  ${opts.eventTitle}

When: ${fmtDate(start)} at ${fmtTime(start)} – ${fmtTime(end)} (Israel Time)
${location ? `Where: ${location}\n` : ""}

Event page: ${opts.eventUrl}

We've attached a .ics calendar file to this email — open it to add the
event to Apple Calendar, Outlook desktop, or any iCal-compatible app.

For Google Calendar, Outlook on the web, or Yahoo Calendar, visit the
event page and click "Save to Calendar".

See you at the event!

— The AI Salon ${chapterName} team
MassaPro · https://massapro.com`;

  const html = `
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">You're registered 🎉</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Hi ${firstName},
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    You're registered for:
  </p>
  <div style="padding: 20px; margin: 24px 0; background: linear-gradient(135deg, #FF005A 0%, #00E6FF 100%); border-radius: 10px; color: #fff;">
    <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">${opts.eventTitle}</div>
    <div style="font-size: 14px; opacity: 0.95;">
      📅 ${fmtDate(start)}<br/>
      ⏰ ${fmtTime(start)} – ${fmtTime(end)} (Israel Time)
      ${location ? `<br/>📍 ${location}` : ""}
    </div>
  </div>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    <a href="${opts.eventUrl}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; font-weight: 600; border-radius: 6px;">
      View event page →
    </a>
  </p>
  <div style="padding: 16px; margin: 24px 0; background: #f6f6f6; border-radius: 8px; border: 1px solid #eee;">
    <p style="font-size: 13px; line-height: 1.5; color: #555; margin: 0;">
      <strong>📅 Add to your calendar:</strong> We've attached a <code style="background: #fff; padding: 2px 6px; border-radius: 3px; font-size: 12px;">.ics</code> file to this email — open it to add the event to Apple Calendar, Outlook desktop, or any iCal-compatible app.
    </p>
    <p style="font-size: 13px; line-height: 1.5; color: #555; margin: 8px 0 0;">
      For Google Calendar, Outlook on the web, or Yahoo Calendar, visit the event page and click <strong>"Save to Calendar"</strong>.
    </p>
  </div>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    See you at the event!
  </p>
  <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #999; margin: 0;">
    AI Salon ${chapterName} · Empowering AI Connections<br/>
    <a href="https://massapro.com" style="color: #999;">MassaPro</a>
  </p>
</div>`;

  // Sanitize the event title for the attachment filename.
  const safeFilename = opts.eventTitle
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "event";

  return sendMail({
    to: opts.to,
    subject,
    text,
    html,
    attachments: [
      {
        filename: `${safeFilename}.ics`,
        content: opts.icsContent,
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
      },
    ],
  });
}
/**
 * Send a chapter onboarding form invite email to a chapter lead.
 *
 * Called by POST /api/admin/members/[id]/send-chapter-onboarding when an
 * admin clicks the "Send chapter onboarding form" button on the
 * EditMemberDialog. The email contains a tokenized URL to the public form
 * at /chapter-onboarding/[token].
 *
 * The URL is valid for 30 days (per ChapterOnboardingInvite.expiresAt).
 * After submission, the same URL shows a "you've already submitted" view.
 */
export async function sendChapterOnboardingEmail(opts: {
  to: string;
  name: string | null;
  chapterName?: string | null;
  formUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const firstName = opts.name?.split(" ")[0] || "there";
  const chapterName = opts.chapterName?.trim() || "your new chapter";
  const subject = `Your AI Salon ${chapterName} chapter onboarding form`;
  const text = `Hi ${firstName},

Welcome to AI Salon ${chapterName}! We're excited to launch your chapter.

To get your chapter set up on the platform, please fill out the onboarding form at:

${opts.formUrl}

The form takes about 10–15 minutes. You'll need:
  - Your chapter's basic info (name, city, timezone)
  - WhatsApp group URL + LinkedIn page URL
  - Brand assets (logo, banner images) — optional, we have defaults
  - Languages your chapter operates in + target audience
  - Launch plan (target date, first event details)

The form is private to you — only the global AI Salon team sees your
responses. Once you submit, we'll provision the chapter within 2 business
days and send you admin access.

If you have any questions, just reply to this email.

— The AI Salon global team
MassaPro · https://massapro.com`;

  const html = `
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">Welcome to AI Salon ${chapterName}!</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Hi ${firstName},
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    We're excited to launch your chapter on the AI Salon platform. To get
    everything set up — your public landing page, login page, brand assets,
    and email templates — please fill out the onboarding form below.
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    <a href="${opts.formUrl}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #FF005A 0%, #00E6FF 100%); color: #fff; text-decoration: none; font-weight: 700; border-radius: 8px; font-size: 15px;">
      Open onboarding form →
    </a>
  </p>
  <p style="font-size: 12px; line-height: 1.5; color: #777; margin: 0 0 20px; word-break: break-all;">
    If the button doesn't work, copy and paste this URL into your browser:<br/>
    <a href="${opts.formUrl}" style="color: #004F98; word-break: break-all;">${opts.formUrl}</a>
  </p>
  <div style="padding: 16px; margin: 24px 0; background: #f6f6f6; border-radius: 8px; border: 1px solid #eee;">
    <p style="font-size: 13px; line-height: 1.6; color: #555; margin: 0;">
      <strong>What you'll need:</strong>
    </p>
    <ul style="font-size: 13px; line-height: 1.6; color: #555; margin: 8px 0 0; padding-left: 20px;">
      <li>Chapter basic info (name, city, timezone)</li>
      <li>WhatsApp group URL + LinkedIn page URL</li>
      <li>Brand assets (logo, banner) — optional, we have defaults</li>
      <li>Languages + target audience</li>
      <li>Launch plan (target date, first event)</li>
    </ul>
    <p style="font-size: 13px; line-height: 1.6; color: #555; margin: 12px 0 0;">
      ⏱️ Takes about 10–15 minutes · 🔒 Private to you + the global team
    </p>
  </div>
  <p style="font-size: 14px; line-height: 1.6; color: #444; margin: 0 0 12px;">
    Once you submit, we'll provision the chapter within 2 business days and
    send you admin access. If you have questions, just reply to this email.
  </p>
  <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #999; margin: 0;">
    AI Salon · Empowering AI Connections<br/>
    <a href="https://massapro.com" style="color: #999;">MassaPro</a> ·
    <a href="https://aisalon.massapro.com" style="color: #999;">aisalon.massapro.com</a>
  </p>
</div>`;

  return sendMail({ to: opts.to, subject, text, html });
}

/**
 * Send the "your chapter is live" notification email to a chapter lead.
 *
 * Called by POST /api/admin/chapter-onboarding/[id]/provision AFTER the
 * chapter has been fully provisioned (Chapter row created, brand images
 * applied, lead User linked + role upgraded, email infra cloned). The
 * email lets the lead know they can now sign in to the admin area.
 *
 * The adminUrl should be an absolute URL pointing to the chapter's admin
 * landing page (e.g. https://aisalon.massapro.com/admin?chapterSlug=montreal).
 * The loginUrl is the fallback for leads who haven't signed in before.
 *
 * If sendMail fails, the caller should treat it as non-fatal — the
 * provisioning itself already succeeded; the lead can still be reached
 * via the original onboarding email thread.
 */
export async function sendChapterProvisionedEmail(opts: {
  to: string;
  name: string | null;
  chapterName: string;
  chapterSlug: string;
  adminUrl: string;
  loginUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const firstName = opts.name?.split(" ")[0] || "there";
  const subject = `🎉 AI Salon ${opts.chapterName} is live! Your admin access is ready`;
  const text = `Hi ${firstName},

Great news — AI Salon ${opts.chapterName} is now live on the platform!

Here's what's been set up for you:
  - Public chapter landing page at /c/${opts.chapterSlug}
  - Login page with your chapter's brand at /login?chapterSlug=${opts.chapterSlug}
  - Your brand images (favicon, login hero, login banner, email logo)
  - Email infrastructure (audiences, flows, and draft campaigns cloned
    from the Tel Aviv source chapter — ready to customize and send)

To access your admin dashboard, sign in at:
${opts.loginUrl}

Once signed in, you'll land on the admin home page where you can:
  - Edit your chapter's events
  - Manage email flows and audiences
  - Update brand images and chapter settings

If you have any questions, just reply to this email or reach out to
aisalon@massapro.com.

Welcome aboard, and welcome to the global AI Salon community!

— The AI Salon global team
MassaPro · https://massapro.com`;

  const html = `
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">
    🎉 AI Salon ${opts.chapterName} is live!
  </h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Hi ${firstName},
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Great news — your chapter has been fully provisioned on the AI Salon
    platform. Everything is ready for you to start building your local
    community.
  </p>

  <div style="padding: 16px; margin: 24px 0; background: #f6f6f6; border-radius: 8px; border: 1px solid #eee;">
    <p style="font-size: 13px; line-height: 1.6; color: #555; margin: 0 0 8px;">
      <strong>What's been set up for you:</strong>
    </p>
    <ul style="font-size: 13px; line-height: 1.7; color: #555; margin: 0; padding-left: 20px;">
      <li>Public chapter landing page at <code style="background: #fff; padding: 1px 4px; border-radius: 3px; font-size: 12px;">/c/${opts.chapterSlug}</code></li>
      <li>Login page with your chapter's brand at <code style="background: #fff; padding: 1px 4px; border-radius: 3px; font-size: 12px;">/login?chapterSlug=${opts.chapterSlug}</code></li>
      <li>Your brand images (favicon, login hero, login banner, email logo)</li>
      <li>Email infrastructure — audiences, flows, and draft campaigns cloned from the Tel Aviv source chapter, ready to customize and send</li>
    </ul>
  </div>

  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    <a href="${opts.adminUrl}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #FF005A 0%, #00E6FF 100%); color: #fff; text-decoration: none; font-weight: 700; border-radius: 8px; font-size: 15px;">
      Go to admin dashboard →
    </a>
  </p>

  <p style="font-size: 12px; line-height: 1.5; color: #777; margin: 0 0 20px; word-break: break-all;">
    If the button doesn't work, copy and paste this URL into your browser:<br/>
    <a href="${opts.adminUrl}" style="color: #004F98; word-break: break-all;">${opts.adminUrl}</a>
  </p>

  <p style="font-size: 14px; line-height: 1.6; color: #444; margin: 0 0 12px;">
    If you have any questions, just reply to this email or reach out to
    <a href="mailto:aisalon@massapro.com" style="color: #004F98;">aisalon@massapro.com</a>.
    Welcome aboard!
  </p>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #999; margin: 0;">
    AI Salon · Empowering AI Connections<br/>
    <a href="https://massapro.com" style="color: #999;">MassaPro</a> ·
    <a href="https://aisalon.massapro.com" style="color: #999;">aisalon.massapro.com</a>
  </p>
</div>`;

  return sendMail({ to: opts.to, subject, text, html });
}
