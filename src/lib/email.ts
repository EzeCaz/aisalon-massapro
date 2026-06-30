import nodemailer from "nodemailer";

/**
 * Email sending utility.
 *
 * Reads SMTP configuration from env vars:
 *  - SMTP_HOST       e.g. smtp.gmail.com
 *  - SMTP_PORT       e.g. 465 (SSL) or 587 (STARTTLS)
 *  - SMTP_USER       SMTP username
 *  - SMTP_PASS       SMTP password / app-specific password
 *  - SMTP_FROM       From address, e.g. "AI Salon Tel Aviv <no-reply@massapro.com>"
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
        `From: ${from}\nTo: ${opts.to}${opts.cc ? `\nCc: ${opts.cc}` : ""}\nSubject: ${opts.subject}\n` +
        `----\n${opts.text || opts.html}\n----`
    );
    return { ok: true };
  }

  try {
    await transport.sendMail({
      from,
      to: opts.to,
      cc: opts.cc,
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
 */
export async function sendPasswordEmail(opts: {
  to: string;
  name: string | null;
  password: string;
  siteUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const firstName = opts.name?.split(" ")[0] || "there";
  const loginUrl = `${opts.siteUrl.replace(/\/$/, "")}/login`;
  const subject = "Your AI Salon Tel Aviv login";
  const text = `Hi ${firstName},

Welcome to AI Salon Tel Aviv — the community for AI builders, founders, CMOs and investors in Tel Aviv.

Here is your one-time password for your first login:

    ${opts.password}

Sign in here: ${loginUrl}

After you sign in, you can change your password from your profile page.

— The AI Salon Tel Aviv team
MassaPro · https://massapro.com`;
  const html = `
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">Welcome to AI Salon Tel Aviv</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Hi ${firstName},
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
    Here is your one-time password for your first login:
  </p>
  <div style="text-align: center; padding: 20px; margin: 24px 0; background: #f6f6f6; border-radius: 10px; border: 1px solid #eee;">
    <div style="font-family: 'SF Mono', Menlo, monospace; font-size: 22px; font-weight: 700; letter-spacing: 2px; color: #FF005A;">
      ${opts.password}
    </div>
  </div>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; font-weight: 600; border-radius: 6px;">
      Sign in →
    </a>
  </p>
  <p style="font-size: 13px; line-height: 1.5; color: #777; margin: 0;">
    After you sign in, you can change your password from your profile page.
  </p>
  <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #999; margin: 0;">
    AI Salon Tel Aviv · Empowering AI Connections<br/>
    <a href="https://massapro.com" style="color: #999;">MassaPro</a>
  </p>
</div>`;
  return sendMail({ to: opts.to, subject, text, html });
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
}): Promise<{ ok: boolean; error?: string }> {
  const firstName = opts.name?.split(" ")[0] || "there";
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

— The AI Salon Tel Aviv team
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
    AI Salon Tel Aviv · Empowering AI Connections<br/>
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