/**
 * Email sender — Gmail OAuth2 or mock, controlled by `EMAIL_PROVIDER` env var.
 *
 * Production (real Gmail):
 *   EMAIL_PROVIDER=gmail
 *   GOOGLE_CLIENT_ID=...
 *   GOOGLE_CLIENT_SECRET=...
 *   GOOGLE_REFRESH_TOKEN=...  (offline refresh token for the sender account)
 *   EMAIL_FROM=organizer@aisalon.massapro.com
 *
 * Mock (default):
 *   EMAIL_PROVIDER not set, or = "mock"
 *   → logs the email to stdout + writes to EmailQueue.htmlBody for in-app preview
 *
 * The refresh-token → access-token exchange uses Google's OAuth2 token
 * endpoint. Access tokens live ~1h; we refresh on every send (cheap).
 */

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  /** Optional friendly name for the recipient (used in To header). */
  toName?: string;
};

export type SendResult =
  | { ok: true; provider: "gmail" | "mock"; messageId?: string }
  | { ok: false; error: string };

function getProvider(): "gmail" | "mock" {
  const p = process.env.EMAIL_PROVIDER?.toLowerCase();
  return p === "gmail" ? "gmail" : "mock";
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
  if (provider === "gmail") {
    return sendViaGmail(args);
  }
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
  };
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
  return { ok: true, provider: "mock", messageId: `mock_${Date.now()}` };
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
