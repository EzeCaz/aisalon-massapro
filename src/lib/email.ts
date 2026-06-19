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
  subject: string;
  text?: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const transport = getTransport();
  const from = process.env.SMTP_FROM || "AI Salon Tel Aviv <no-reply@aisalon.massapro.com>";

  if (!transport) {
    // Dev mode: log instead of sending. This is intentional — production
    // must set SMTP_* env vars for real delivery.
    console.log(
      "[email] (no SMTP configured — logging instead)\n" +
        `To: ${opts.to}\nSubject: ${opts.subject}\n` +
        `----\n${opts.text || opts.html}\n----`
    );
    return { ok: true };
  }

  try {
    await transport.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
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
