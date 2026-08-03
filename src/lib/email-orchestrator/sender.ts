/**
 * Email sender — provider priority: Gmail OAuth2 → SMTP → mock.
 *
 * Provider selection (auto):
 *   1. EMAIL_PROVIDER=gmail AND GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET +
 *      GOOGLE_REFRESH_TOKEN are set → Gmail OAuth2 API.
 *   2. SMTP_HOST + SMTP_USER + SMTP_PASS are set → SMTP via nodemailer
 *      (shares the same transport as transactional emails in @/lib/email).
 *   3. Otherwise → mock (logs to stdout, no network call).
 *
 * Optional kill switches (checked before provider selection):
 *   - EMAIL_SEND_ENABLED="false"  (hard env escape hatch)
 *   - SiteSetting[emailSendPaused]="true"  (admin UI toggle, default "true"
 *     — admin must click "Resume sending" in /admin/email before real
 *     sends go out, even if a provider is configured).
 *
 * When the result is a mock or paused send, `mock: true` is set on the
 * result. Callers (worker.ts, flow-worker.ts) should mark the queue row
 * SKIPPED (not SENT) in that case, so the admin UI is honest about what
 * actually left the server.
 *
 * ── Configuration cheatsheet ──────────────────────────────────────────
 *
 * Gmail OAuth2 (recommended for high volume, ~250 emails/day per account):
 *   EMAIL_PROVIDER=gmail
 *   GOOGLE_CLIENT_ID=...
 *   GOOGLE_CLIENT_SECRET=...
 *   GOOGLE_REFRESH_TOKEN=...  (one-time offline token via OAuth playground)
 *   EMAIL_FROM="AI Salon <organizer@aisalon.massapro.com>"
 *
 * SMTP (recommended for low-medium volume; works with any provider —
 * Gmail App Password, SendGrid, AWS SES, Postmark, Mailgun, Brevo, etc.):
 *   SMTP_HOST=smtp.gmail.com         (or smtp.sendgrid.net, email-smtp.us-east-1.amazonaws.com, ...)
 *   SMTP_PORT=465                    (SSL) or 587 (STARTTLS)
 *   SMTP_SECURE=true                 (true for 465, false for 587)
 *   SMTP_USER=your-account@gmail.com (or "apikey" for SendGrid, your SES SMTP username, etc.)
 *   SMTP_PASS=your-16-char-app-password
 *   SMTP_FROM="AI Salon <no-reply@aisalon.massapro.com>"
 *
 * Mock (default — no env vars needed):
 *   → emails are logged to stdout + written to EmailQueue.htmlBody for
 *     in-app preview, but no email is actually sent.
 */

import { sendMail } from "@/lib/email";

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  /** Optional friendly name for the recipient (used in To header). */
  toName?: string;
};

export type SendResult =
  | { ok: true; provider: "gmail" | "smtp" | "mock"; messageId?: string; mock?: boolean }
  | { ok: false; error: string };

/**
 * Detect which email provider is configured.
 *
 * Priority:
 *   1. `gmail` — only if EMAIL_PROVIDER=gmail AND all 3 Google creds set.
 *      (We don't auto-pick gmail just because the creds happen to be set —
 *      the user must explicitly opt in, because Gmail OAuth2 is more
 *      fragile than SMTP and shouldn't surprise the operator.)
 *   2. `smtp` — if SMTP_HOST + SMTP_USER + SMTP_PASS are set.
 *   3. `mock` — fallback. Logs to stdout, no network call.
 */
export function getProvider(): "gmail" | "smtp" | "mock" {
  const p = process.env.EMAIL_PROVIDER?.toLowerCase();
  // Explicit "mock" override — always wins (for dev/staging).
  if (p === "mock") return "mock";
  if (p === "gmail") {
    if (
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    ) {
      return "gmail";
    }
    // Misconfiguration: EMAIL_PROVIDER=gmail but creds missing.
    // Fall through to smtp/mock rather than crashing — the user will see
    // the misconfiguration banner in the admin UI.
    console.warn(
      "[email-sender] EMAIL_PROVIDER=gmail but GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN not all set — falling through to SMTP/mock.",
    );
  }
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  ) {
    return "smtp";
  }
  return "mock";
}

/**
 * True if SMTP_* env vars are set (i.e. SMTP would actually send).
 * Exposed for the admin UI to display provider status.
 */
export function isSmtpConfigured(): boolean {
  return (
    !!process.env.SMTP_HOST &&
    !!process.env.SMTP_USER &&
    !!process.env.SMTP_PASS
  );
}

/**
 * True if Gmail OAuth2 creds are set (i.e. Gmail would actually send).
 * Exposed for the admin UI to display provider status.
 */
export function isGmailConfigured(): boolean {
  return (
    process.env.EMAIL_PROVIDER?.toLowerCase() === "gmail" &&
    !!process.env.GOOGLE_CLIENT_ID &&
    !!process.env.GOOGLE_CLIENT_SECRET &&
    !!process.env.GOOGLE_REFRESH_TOKEN
  );
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  // Global kill switch — two layers:
  //   1. DB flag (set by admin in /admin/email tab, takes effect immediately,
  //      no redeploy needed). Always checked at runtime.
  //   2. Hard env var EMAIL_SEND_ENABLED="false" (escape hatch for ops).
  // When paused, the queue still records the attempt so the admin can preview
  // the rendered HTML in the Email Queue panel.
  if (process.env.EMAIL_SEND_ENABLED === "false") {
    return pausedResult(args);
  }
  const { isEmailSendPaused } = await import("@/lib/site-settings");
  if (await isEmailSendPaused()) {
    return pausedResult(args);
  }

  const provider = getProvider();
  if (provider === "gmail") return sendViaGmail(args);
  if (provider === "smtp") return sendViaSmtp(args);
  return sendViaMock(args);
}

function pausedResult(args: SendArgs): SendResult {
  console.log(
    `[email-paused] TO: ${args.to} | SUBJECT: ${args.subject} | HTML_LEN: ${args.html.length}`,
  );
  return {
    ok: true,
    provider: "mock",
    messageId: `paused_${Date.now()}`,
    mock: true,
  };
}

// ----------------------------------------------------------------------------
// SMTP sender — reuses the shared nodemailer transport from @/lib/email
// ----------------------------------------------------------------------------

async function sendViaSmtp(args: SendArgs): Promise<SendResult> {
  const result = await sendMail({
    to: args.to,
    subject: args.subject,
    html: args.html,
  });
  if (result.ok) {
    return {
      ok: true,
      provider: "smtp",
      messageId: `smtp_${Date.now()}`,
    };
  }
  return { ok: false, error: result.error || "SMTP send failed" };
}

// ----------------------------------------------------------------------------
// Mock sender
// ----------------------------------------------------------------------------

async function sendViaMock(args: SendArgs): Promise<SendResult> {
  // Simulate small latency so the UI feels real.
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
  console.log(
    `[email-mock] TO: ${args.to} | SUBJECT: ${args.subject} | HTML_LEN: ${args.html.length}`,
  );
  return {
    ok: true,
    provider: "mock",
    messageId: `mock_${Date.now()}`,
    mock: true,
  };
}

// ----------------------------------------------------------------------------
// Gmail OAuth2 sender
// ----------------------------------------------------------------------------

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getGmailAccessToken(): Promise<string> {
  // Reuse cached token if it has >60s of life left.
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail provider selected but GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN not set",
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token refresh failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedAccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

async function sendViaGmail(args: SendArgs): Promise<SendResult> {
  try {
    const accessToken = await getGmailAccessToken();
    const from = process.env.EMAIL_FROM || "AI Salon <noreply@aisalon.massapro.com>";
    const toHeader = args.toName
      ? `${encodeHeader(args.toName)} <${args.to}>`
      : args.to;

    const rawMessage = [
      `From: ${from}`,
      `To: ${toHeader}`,
      `Subject: ${encodeHeader(args.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      args.html,
    ].join("\r\n");

    // Gmail API requires base64url-encoded raw message.
    const encoded = Buffer.from(rawMessage, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Retry with exponential backoff on 429 / 5xx (max 3 attempts).
    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encoded }),
        },
      );

      if (res.ok) {
        const json = (await res.json()) as { id: string };
        return { ok: true, provider: "gmail", messageId: json.id };
      }

      const text = await res.text();
      lastError = `Gmail API ${res.status}: ${text}`;

      // 429 = rate limit. Honor Retry-After if present, else exponential backoff.
      // 5xx = transient server error. Retry.
      // 4xx (other) = permanent failure. Don't retry.
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get("retry-after");
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`[email-gmail] ${res.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/3)`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      // Permanent error — bail.
      break;
    }

    return { ok: false, error: lastError };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Encode a header value per RFC 2047 if it contains non-ASCII chars. */
function encodeHeader(s: string): string {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
}
