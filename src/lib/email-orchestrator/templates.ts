/**
 * Default HTML templates for each of the 5 orchestrator stages.
 *
 * These are seeded into the `EmailStageTemplate` table by `seed.ts` and
 * can be edited by admins at runtime (via the API — UI editor not yet
 * built). Each template supports the following {{placeholder}} tokens:
 *
 *   {{firstName}}      — RSVP user's first name (or "friend" if unknown)
 *   {{eventTitle}}     — event.title
 *   {{eventDate}}      — formatted startsAt (e.g. "Tue, Mar 12, 2025 · 6:00 PM")
 *   {{eventVenue}}     — event.venue or "TBD"
 *   {{eventAddress}}   — event.address or ""
 *   {{eventUrl}}       — full URL to /e/{slug}
 *   {{checkInCode}}    — RSVP.checkInCode or ""
 *   {{speakers}}       — comma-separated list of speaker names
 *   {{agenda}}         — newline-separated agenda items
 *
 * Tracking: the worker injects an open-tracking pixel (<img src=...>) and
 * wraps all links with the click-redirect before sending. See
 * `renderTemplate` for the injection points.
 *
 * Design system: AI Salon — pink #FF005A + cyan #00E6FF gradient accents
 * on a clean white background. Inline CSS only (email-safe). 600px wide.
 */

import type { Event, EventRsvp, Speaker, EventAgendaItem } from "@prisma/client";

// ----------------------------------------------------------------------------
// Brand logo (top-right of every email)
// ----------------------------------------------------------------------------

/** Default brand logo URL — a small AI Salon mark hosted on Vercel Blob.
 *  Override per-template via `EmailStageTemplate.logoUrl`, or globally via
 *  the `EMAIL_BRAND_LOGO_URL` env var.
 *
 *  Spec: ~24px tall, transparent background, anchored top-right of the
 *  560px-wide email body. Equivalent to a Plus Jakarta Sans 24px glyph. */
export const DEFAULT_BRAND_LOGO_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393632010-jeorqc.png";

/** Resolve the brand logo URL with the fallback chain:
 *  per-template → env var → hardcoded default. */
export function resolveLogoUrl(templateLogoUrl: string | null | undefined): string {
  if (templateLogoUrl && templateLogoUrl.trim()) return templateLogoUrl.trim();
  const env = process.env.EMAIL_BRAND_LOGO_URL;
  if (env && env.trim()) return env.trim();
  return DEFAULT_BRAND_LOGO_URL;
}

/** Build the HTML block for the brand-logo <img> tag, anchored top-right.
 *  Returns an empty string if the resolved URL is falsy (which only happens
 *  if someone explicitly sets `EMAIL_BRAND_LOGO_URL=""` and the per-template
 *  override is also empty). */
export function buildLogoBlock(templateLogoUrl: string | null | undefined): string {
  const url = resolveLogoUrl(templateLogoUrl);
  if (!url) return "";
  // 24px tall — visually equivalent to Plus Jakarta Sans 24px line-height.
  // Floated right with a small margin so body text wraps around it cleanly.
  return `<img src="${url}" alt="AI Salon" width="120" height="24" style="float:right;margin:0 0 8px 16px;border:0;outline:none;text-decoration:none;width:120px;height:24px;max-height:24px;"/>`;
}

// ----------------------------------------------------------------------------
// Template tokens
// ----------------------------------------------------------------------------

export type TemplateContext = {
  firstName: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  eventAddress: string;
  eventUrl: string;
  checkInCode: string;
  speakers: string;
  agenda: string;
  /** Tracking pixel URL — injected by worker before send. */
  openPixelUrl: string;
  /** Function that wraps a URL with the click-redirect. */
  wrapLink: (url: string) => string;
};

/** Build the TemplateContext from DB rows. */
export function buildContext(args: {
  event: Pick<Event, "title" | "startsAt" | "venue" | "address" | "slug">;
  rsvp: Pick<EventRsvp, "name" | "email" | "checkInCode">;
  speakers: Pick<Speaker, "name">[];
  agenda: Pick<EventAgendaItem, "title" | "startsAt">[];
  baseUrl: string;
  queueId: string;
}): TemplateContext {
  const { event, rsvp, speakers, agenda, baseUrl, queueId } = args;
  const firstName = (rsvp.name || rsvp.email.split("@")[0]).split(" ")[0];
  const eventDate = formatDate(event.startsAt);
  const eventUrl = `${baseUrl}/e/${event.slug}`;
  const openPixelUrl = `${baseUrl}/api/track/email-open?id=${queueId}`;

  return {
    firstName,
    eventTitle: event.title,
    eventDate,
    eventVenue: event.venue || "TBD",
    eventAddress: event.address || "",
    eventUrl,
    checkInCode: rsvp.checkInCode || "",
    speakers: speakers.map((s) => s.name).join(", "),
    agenda: agenda
      .map((a) => `• ${formatTime(a.startsAt)} — ${a.title}`)
      .join("\n"),
    openPixelUrl,
    wrapLink: (url: string) =>
      `${baseUrl}/api/track/email-click?id=${queueId}&target=${encodeURIComponent(url)}`,
  };
}

function formatDate(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Jerusalem",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Jerusalem",
  });
}

// ----------------------------------------------------------------------------
// Template rendering
// ----------------------------------------------------------------------------

/** Replace {{tokens}} in a template body and inject the open pixel + brand logo. */
export function renderTemplate(
  html: string,
  ctx: TemplateContext,
  opts?: { logoHtml?: string },
): string {
  let out = html
    // {{name}} and {{firstName}} are aliases — both resolve to the same value.
    .replace(/{{firstName}}/g, escapeHtml(ctx.firstName))
    .replace(/{{name}}/g, escapeHtml(ctx.firstName))
    .replace(/{{eventTitle}}/g, escapeHtml(ctx.eventTitle))
    .replace(/{{eventDate}}/g, escapeHtml(ctx.eventDate))
    .replace(/{{eventVenue}}/g, escapeHtml(ctx.eventVenue))
    .replace(/{{eventAddress}}/g, escapeHtml(ctx.eventAddress))
    .replace(/{{eventUrl}}/g, escapeHtml(ctx.eventUrl))
    .replace(/{{checkInCode}}/g, escapeHtml(ctx.checkInCode))
    .replace(/{{speakers}}/g, escapeHtml(ctx.speakers))
    .replace(/{{agenda}}/g, escapeHtml(ctx.agenda).replace(/\n/g, "<br/>"));

  // Inject the brand logo immediately after the opening <body> tag (or after
  // the first <div> if no <body>). The logo floats right; the email's first
  // heading wraps around it. We only inject if the template hasn't already
  // placed a logo manually (look for our marker `data-brand-logo`).
  if (opts?.logoHtml && !/data-brand-logo/.test(out)) {
    if (/<div[^>]*max-width:560px[^>]*>/i.test(out)) {
      // The SHELL wrapper uses a 560px inner div — inject right after it.
      out = out.replace(
        /(<div[^>]*max-width:560px[^>]*>)/i,
        `$1${opts.logoHtml}`,
      );
    } else if (/<body[^>]*>/i.test(out)) {
      out = out.replace(/(<body[^>]*>)/i, `$1${opts.logoHtml}`);
    } else {
      out = opts.logoHtml + out;
    }
  }

  // Wrap all href="http..." links with the click-redirect.
  // (Skip mailto: and tel: and already-wrapped links.)
  out = out.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_, url) => `href="${ctx.wrapLink(url)}"`,
  );

  // Inject the open-tracking pixel right before </body>. If no </body>,
  // append at the end.
  const pixel = `<img src="${ctx.openPixelUrl}" width="1" height="1" alt="" style="display:none;max-height:1px;max-width:1px;opacity:0;overflow:hidden;border:0;"/>`;
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${pixel}</body>`);
  } else {
    out = out + pixel;
  }

  return out;
}

/** Replace {{tokens}} in a subject line (no HTML escaping — subjects are plain text). */
export function renderSubject(subject: string, ctx: TemplateContext): string {
  return subject
    .replace(/{{firstName}}/g, ctx.firstName)
    .replace(/{{name}}/g, ctx.firstName)
    .replace(/{{eventTitle}}/g, ctx.eventTitle)
    .replace(/{{eventDate}}/g, ctx.eventDate)
    .replace(/{{eventVenue}}/g, ctx.eventVenue)
    .replace(/{{eventAddress}}/g, ctx.eventAddress)
    .replace(/{{eventUrl}}/g, ctx.eventUrl)
    .replace(/{{checkInCode}}/g, ctx.checkInCode)
    .replace(/{{speakers}}/g, ctx.speakers)
    .replace(/{{agenda}}/g, ctx.agenda);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ----------------------------------------------------------------------------
// Default templates (used by seed.ts)
// ----------------------------------------------------------------------------

/**
 * MINIMAL_SHELL — the default AI Salon email wrapper.
 *
 * Design spec (per Eze, 2026-07-02):
 *   - Plus Jakarta Sans web font (with -apple-system fallback)
 *   - 560px max-width, centered
 *   - 32px / 24px padding
 *   - 22px h1, 800 weight, #0a0a0a
 *   - 15px body, line-height 1.6, #444
 *   - 1px solid #eee <hr> separator
 *   - 12px footer in #999 with site link
 *
 * The shell pre-loads the Plus Jakarta Sans web font via Google Fonts
 * <link> for clients that support it (Apple Mail, iOS Mail, Thunderbird).
 * Gmail / Outlook will fall back to -apple-system / system-ui.
 */
const SHELL = (inner: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>AI Salon Tel Aviv</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="font-family:'Plus Jakarta Sans',-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0a0a0a;">
    ${inner}
    <hr style="margin:32px 0;border:none;border-top:1px solid #eee;"/>
    <p style="font-size:12px;color:#999;margin:0;line-height:1.5;">
      AI Salon Tel Aviv · Empowering AI Connections<br/>
      <a href="https://aisalon.massapro.com" style="color:#999;text-decoration:underline;">aisalon.massapro.com</a>
    </p>
  </div>
</body>
</html>`;

export const DEFAULT_TEMPLATES: Record<
  number,
  { name: string; subject: string; html: string }
> = {
  1: {
    name: "Awareness",
    subject: "You're in! Here's what to expect at {{eventTitle}}",
    html: SHELL(`
          <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;color:#0a0a0a;">You're in, {{name}}.</h1>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">
            We're thrilled to have you at <strong style="color:#0a0a0a;">{{eventTitle}}</strong>. Here's everything you need to know.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 8px;">
            <strong style="color:#0a0a0a;">When:</strong> {{eventDate}}<br/>
            <strong style="color:#0a0a0a;">Where:</strong> {{eventVenue}}<br/>
            <strong style="color:#0a0a0a;">Address:</strong> {{eventAddress}}<br/>
            <strong style="color:#0a0a0a;">Speakers:</strong> {{speakers}}
          </p>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">Agenda:</p>
          <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 24px;white-space:pre-wrap;">{{agenda}}</p>
          <a href="{{eventUrl}}" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View event page</a>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:24px 0 0;">
            — The AI Salon Tel Aviv team
          </p>
    `),
  },
  2: {
    name: "Reminder",
    subject: "Reminder: {{eventTitle}} is in 48 hours",
    html: SHELL(`
          <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;color:#0a0a0a;">See you in 48 hours, {{name}}.</h1>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">
            A quick reminder: <strong style="color:#0a0a0a;">{{eventTitle}}</strong> is happening on <strong style="color:#0a0a0a;">{{eventDate}}</strong> at <strong style="color:#0a0a0a;">{{eventVenue}}</strong>.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 24px;white-space:pre-wrap;">{{agenda}}</p>
          <a href="{{eventUrl}}" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Open event page</a>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:24px 0 0;">
            — The AI Salon Tel Aviv team
          </p>
    `),
  },
  3: {
    name: "Final Prep",
    subject: "Final prep for {{eventTitle}} — see you soon",
    html: SHELL(`
          <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;color:#0a0a0a;">Almost time, {{name}}.</h1>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">
            <strong style="color:#0a0a0a;">{{eventTitle}}</strong> starts in 4 hours. Here's your final checklist.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 8px;">
            <strong style="color:#0a0a0a;">Starts:</strong> {{eventDate}}<br/>
            <strong style="color:#0a0a0a;">Venue:</strong> {{eventVenue}}<br/>
            <strong style="color:#0a0a0a;">Address:</strong> {{eventAddress}}<br/>
            <strong style="color:#0a0a0a;">Check-in code:</strong> <span style="font-family:monospace;font-size:16px;font-weight:700;color:#FF005A;">{{checkInCode}}</span>
          </p>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 24px;">
            Show your check-in code at the door. Doors open 30 minutes before the start time.
          </p>
          <a href="{{eventUrl}}" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Open event page</a>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:24px 0 0;">
            — The AI Salon Tel Aviv team
          </p>
    `),
  },
  4: {
    name: "Day-Of",
    subject: "Starting now: {{eventTitle}}",
    html: SHELL(`
          <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;color:#0a0a0a;">It's starting, {{name}}.</h1>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">
            <strong style="color:#0a0a0a;">{{eventTitle}}</strong> is starting now at <strong style="color:#0a0a0a;">{{eventVenue}}</strong>.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 8px;">
            <strong style="color:#0a0a0a;">Check-in code:</strong> <span style="font-family:monospace;font-size:16px;font-weight:700;color:#FF005A;">{{checkInCode}}</span>
          </p>
          <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 24px;white-space:pre-wrap;">{{agenda}}</p>
          <a href="{{eventUrl}}" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Open event page</a>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:24px 0 0;">
            — The AI Salon Tel Aviv team
          </p>
    `),
  },
  5: {
    name: "Recap",
    subject: "Thanks for coming to {{eventTitle}}",
    html: SHELL(`
          <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;color:#0a0a0a;">Thanks for coming, {{name}}.</h1>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">
            What a night. We loved having you at <strong style="color:#0a0a0a;">{{eventTitle}}</strong>. Here's a quick recap and what's next.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 24px;">
            Photos, recordings, and speaker slides will be posted to the event page within a few days.
          </p>
          <a href="{{eventUrl}}" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View event page</a>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:24px 0 0;">
            See you at the next one — <a href="https://aisalon.massapro.com/events" style="color:#FF005A;text-decoration:underline;">browse upcoming events</a>.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:16px 0 0;">
            — The AI Salon Tel Aviv team
          </p>
    `),
  },
};

// ----------------------------------------------------------------------------
// No-check-in-code variant bodies
// (used when rsvp.checkInCode IS NULL on stages 3 & 4)
// ----------------------------------------------------------------------------

/**
 * NO_CODE_SHELL — variant wrapper used by stages 3 & 4 when the RSVP has no
 * check-in code yet. The body swaps the "your code is XXXX-XXXX" line for a
 * call-to-action: "Generate your check-in code" → links to the event page.
 * The wrapper explicitly tells the user the code is personal and
 * non-transferrable, mirroring the door-staffer warning copy.
 */
const NO_CODE_BODY = (eventTitle: string, eventDate: string, venue: string) => `
          <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;color:#0a0a0a;">You need your check-in code, {{name}}.</h1>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">
            <strong style="color:#0a0a0a;">${eventTitle}</strong> is happening on
            <strong style="color:#0a0a0a;">${eventDate}</strong> at
            <strong style="color:#0a0a0a;">${venue}</strong> — but you haven't generated your check-in code yet.
          </p>
          <div style="background:#FFF1F5;border-left:4px solid #FF005A;padding:14px 16px;margin:0 0 20px;border-radius:4px;">
            <p style="font-size:14px;line-height:1.55;color:#0a0a0a;margin:0 0 8px;">
              <strong>Your check-in code is personal and non-transferrable.</strong>
            </p>
            <p style="font-size:13px;line-height:1.55;color:#444;margin:0;">
              It identifies <em>you</em> at the door. Don't share it — if someone else
              uses your code, you'll be marked as already checked in and may be
              turned away. Generate it now, in 10 seconds, from the event page.
            </p>
          </div>
          <a href="{{eventUrl}}" style="display:inline-block;padding:14px 28px;background:#FF005A;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:700;">Generate my check-in code</a>
          <p style="font-size:13px;line-height:1.55;color:#888;margin:14px 0 0;">
            On the event page, tap <strong>"I'm here — Check in"</strong>. Your code
            will appear on screen — show it to door staff when you arrive.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:20px 0 0;">
            — The AI Salon Tel Aviv team
          </p>
`;

/**
 * Default no-code variant bodies for stages 3 (Final Prep) and 4 (Day-Of).
 * Seeded into `EmailStageTemplate.noCodeHtmlBody` + `noCodeSubject` by seed.ts.
 * Admins can override per-template in the editor.
 */
export const DEFAULT_NO_CODE_TEMPLATES: Record<
  number,
  { subject: string; html: (eventTitle: string, eventDate: string, venue: string) => string }
> = {
  3: {
    subject: "Action needed: generate your check-in code for {{eventTitle}}",
    html: (t, d, v) => SHELL(NO_CODE_BODY(t, d, v)),
  },
  4: {
    subject: "Starting now — get your check-in code for {{eventTitle}}",
    html: (t, d, v) => SHELL(NO_CODE_BODY(t, d, v)),
  },
};

/**
 * Default alt-subject lines for each stage. Seeded into
 * `EmailStageTemplate.altSubject` + `altNotOpenedHours` by seed.ts.
 *
 * The default behavior: if the primary send isn't opened within 24h
 * (stages 1-2) or 2h (stages 3-4) or 48h (stage 5), re-send the same body
 * with the alt subject. Admins can override per-template in the editor.
 */
export const DEFAULT_ALT_SUBJECTS: Record<
  number,
  { altSubject: string; altNotOpenedHours: number }
> = {
  1: { altSubject: "Don't miss {{eventTitle}} — opens in 10 days", altNotOpenedHours: 24 },
  2: { altSubject: "48h left — your seat at {{eventTitle}}", altNotOpenedHours: 12 },
  3: { altSubject: "Final 4h — check-in details for {{eventTitle}}", altNotOpenedHours: 2 },
  4: { altSubject: "We're starting — last chance to grab your seat", altNotOpenedHours: 1 },
  5: { altSubject: "One more thing about {{eventTitle}}", altNotOpenedHours: 48 },
};
