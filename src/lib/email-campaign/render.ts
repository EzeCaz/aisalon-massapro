/**
 * Email Campaign library — per-recipient rendering.
 *
 * Takes a campaign's snapshot (subject + bodyHtml + bodyText + signature)
 * and a recipient, returns the final subject + HTML + plain text with:
 *   - merge tags replaced ({{first_name}}, {{full_name}}, {{email}})
 *   - all <a href="..."> links wrapped in click-tracking redirects
 *   - open-tracking pixel appended at the end of the HTML
 *   - unsubscribe link appended in the footer
 *   - signature HTML appended before the footer
 *
 * Also generates the Message-ID header value for reply matching.
 */

import { randomBytes } from "node:crypto";

export type RenderInput = {
  campaignId: string;
  trackToken: string;
  recipient: {
    email: string;
    name: string | null;
    userId: string | null;
  };
  snapshot: {
    subject: string;
    bodyHtml: string;
    bodyText: string | null;
    signatureHtml: string | null;
  };
  from: {
    name: string;
    email: string;
  };
  baseUrl: string;
};

export type RenderedEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  messageId: string;
  from: string;
  replyTo?: string;
};

export function generateMessageId(domain: string): string {
  const rand = randomBytes(16).toString("hex");
  return `<${rand}.${Date.now()}@${domain}>`;
}

export function applyMergeTags(
  text: string,
  recipient: { email: string; name: string | null }
): string {
  const firstName = recipient.name?.split(" ")[0] || "";
  const fullName = recipient.name || "";
  return text
    .replace(/\{\{\s*first_name\s*\}\}/g, firstName)
    .replace(/\{\{\s*full_name\s*\}\}/g, fullName)
    .replace(/\{\{\s*email\s*\}\}/g, recipient.email);
}

export function wrapClickLinks(
  html: string,
  campaignId: string,
  trackToken: string,
  baseUrl: string
): string {
  return html.replace(
    /(<a\s+[^>]*?)href="(https?:\/\/[^"]+)"/gi,
    (match, prefix: string, url: string) => {
      if (url.includes("/api/email/click")) return match;
      const encoded = Buffer.from(url, "utf8").toString("base64url");
      const trackUrl = `${baseUrl}/api/email/click?t=${trackToken}&c=${campaignId}&u=${encoded}`;
      return `${prefix}href="${trackUrl}"`;
    }
  );
}

export function appendTrackingPixel(
  html: string,
  campaignId: string,
  trackToken: string,
  baseUrl: string
): string {
  const pixelUrl = `${baseUrl}/api/email/open?t=${trackToken}&c=${campaignId}`;
  const unsubUrl = `${baseUrl}/api/email/unsubscribe?t=${trackToken}&c=${campaignId}`;

  const footer = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">
      <p style="margin: 0 0 8px;">You received this email because you are a member of AI Salon Tel Aviv.</p>
      <p style="margin: 0;"><a href="${unsubUrl}" style="color: #999;">Unsubscribe</a></p>
    </div>
    <img src="${pixelUrl}" width="1" height="1" alt="" style="display:none; visibility:hidden; position:absolute; left:-9999px;" />
  `.trim();

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${html}${footer}`;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderEmail(input: RenderInput): RenderedEmail {
  const { recipient, snapshot, from, baseUrl, campaignId, trackToken } = input;

  const subject = applyMergeTags(snapshot.subject, recipient);
  let html = applyMergeTags(snapshot.bodyHtml, recipient);
  const text = snapshot.bodyText
    ? applyMergeTags(snapshot.bodyText, recipient)
    : htmlToText(snapshot.bodyHtml);

  if (snapshot.signatureHtml) {
    const sig = applyMergeTags(snapshot.signatureHtml, recipient);
    html = html + `\n<div style="margin-top: 24px;">${sig}</div>`;
  }

  html = wrapClickLinks(html, campaignId, trackToken, baseUrl);
  html = appendTrackingPixel(html, campaignId, trackToken, baseUrl);

  const domain = baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const messageId = generateMessageId(domain);

  return {
    to: recipient.email,
    subject,
    html,
    text,
    messageId,
    from: `${from.name} <${from.email}>`,
  };
}
