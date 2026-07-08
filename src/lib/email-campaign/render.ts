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
  /**
   * Optional event context — when the campaign targets an event
   * (listSource === "EVENT:<eventId>"), pass the event slug + title here
   * so the renderer can resolve {{eventUrl}}, {{myCodeUrl}},
   * {{event.myCodeUrl}}, and {{eventTitle}} merge tags.
   *
   * When omitted (e.g. ALL_MEMBERS / TAG / MANUAL campaigns), these tags
   * resolve to empty strings — same as how {{first_name}} resolves to ""
   * when the recipient has no name.
   */
  event?: {
    slug: string;
    title?: string | null;
    startsAt?: string | null;
    venue?: string | null;
    address?: string | null;
  };
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

/**
 * Optional event context for the merge-tag resolver. When provided,
 * the following additional tokens resolve:
 *   {{eventUrl}}        — full URL to /e/<slug>
 *   {{myCodeUrl}}       — full URL to /e/<slug>/my-code (mobile check-in page)
 *   {{event.myCodeUrl}} — alias for {{myCodeUrl}} (dotted form)
 *   {{eventTitle}}      — event.title
 *   {{eventVenue}}      — event.venue
 *   {{eventAddress}}    — event.address
 * When omitted (or when slug is empty), all of the above resolve to "".
 */
export type MergeEventContext = {
  slug: string;
  title?: string | null;
  venue?: string | null;
  address?: string | null;
  /** Base URL for building absolute links — typically the same baseUrl
   *  passed to renderEmail(). */
  baseUrl: string;
};

export function applyMergeTags(
  text: string,
  recipient: { email: string; name: string | null },
  event?: MergeEventContext,
): string {
  const firstName = recipient.name?.split(" ')[0] || "";
  const fullName = recipient.name || "";
  let out = text
    .replace(/\{\{\s*first_name\s*\}\}/g, firstName)
    .replace(/\{\{\s*full_name\s*\}\}/g, fullName)
    .replace(/\{\{\s*email\s*\}\}/g, recipient.email);

  if (event && event.slug) {
    const eventUrl = `${event.baseUrl}/e/${event.slug}`;
    const myCodeUrl = `${eventUrl}/my-code`;
    out = out
      .replace(/\{\{\s*eventUrl\s*\}\}/g, eventUrl)
      .replace(/\{\{\s*event\.myCodeUrl\s*\}\}/g, myCodeUrl)
      .replace(/\{\{\s*myCodeUrl\s*\}\}/g, myCodeUrl)
      .replace(/\{\{\s*eventTitle\s*\}\}/g, event.title || "")
      .replace(/\{\{\s*eventVenue\s*\}\}/g, event.venue || "")
      .replace(/\{\{\s*eventAddress\s*\}\}/g, event.address || "");
  } else {
    // No event context — strip these tokens to empty strings so they
    // don't leak as literal "{{eventUrl}}" text in the sent email.
    out = out
      .replace(/\{\{\s*eventUrl\s*\}\}/g, "")
      .replace(/\{\{\s*event\.myCodeUrl\s*\}\}/g, "")
      .replace(/\{\{\s*myCodeUrl\s*\}\}/g, "")
      .replace(/\{\{\s*eventTitle\s*\}\}/g, "")
      .replace(/\{\{\s*eventVenue\s*\}\}/g, "")
      .replace(/\{\{\s*eventAddress\s*\}\}/g, "");
  }

  return out;
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
  const { recipient, snapshot, from, baseUrl, campaignId, trackToken, event } = input;

  const eventCtx: MergeEventContext | undefined = event
    ? { slug: event.slug, title: event.title, venue: event.venue, address: event.address, baseUrl }
    : undefined;

  const subject = applyMergeTags(snapshot.subject, recipient, eventCtx);
  let html = applyMergeTags(snapshot.bodyHtml, recipient, eventCtx);
  const text = snapshot.bodyText
    ? applyMergeTags(snapshot.bodyText, recipient, eventCtx)
    : htmlToText(snapshot.bodyHtml);

  if (snapshot.signatureHtml) {
    const sig = applyMergeTags(snapshot.signatureHtml, recipient, eventCtx);
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
