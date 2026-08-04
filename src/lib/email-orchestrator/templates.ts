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
 *   {{myCodeUrl}}      — full URL to /e/{slug}/my-code (mobile-first check-in page)
 *   {{event.myCodeUrl}} — alias for {{myCodeUrl}} (dotted form)
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
import { renderUnifiedEmail, renderUnifiedSubject } from "@/lib/email/render-unified";
import { db } from "@/lib/db";
import { K_EMAIL_LOGO, DEFAULTS } from "@/lib/site-settings";
import { getChapterBrandImageOverrides } from "@/lib/chapter-brand-images";

// ----------------------------------------------------------------------------
// Brand logo (top-right of every email)
// ----------------------------------------------------------------------------

/** Default brand logo URL — the canonical AI Salon email logo.
 *  This is the LAST-RESORT fallback used only when:
 *    - the per-template `logoUrl` override is empty, AND
 *    - no global SiteSetting[emailLogo] has been picked by the Super Admin, AND
 *    - no chapter ChapterSetting[emailLogo] override applies, AND
 *    - the `EMAIL_BRAND_LOGO_URL` env var is unset.
 *
 *  In practice, the Super Admin picks the global email logo from the
 *  brand-image gallery (stored in SiteSetting[emailLogo], default seeded
 *  to the URL below). Per-template `logoUrl` is now ALWAYS cleared by
 *  the seed (so the global pick always wins — see seed.ts).
 *
 *  PER USER SPEC 2026-08-05: this is the user's chosen email logo —
 *  https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785868301722-nl1qnl.png
 *  Used top-right of every outgoing email at 150px wide with height:auto
 *  so the image's natural aspect ratio is preserved. */
export const DEFAULT_BRAND_LOGO_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785868301722-nl1qnl.png";

/** Resolve the brand logo URL with the fallback chain:
 *  per-template → resolved default (global/chapter/env) → hardcoded default.
 *
 *  `resolvedDefaultUrl` is the async-resolved default from
 *  `resolveEmailLogoDefault()` — it already encodes the chapter override →
 *  global SiteSetting → env var chain. When not provided (e.g. in the
 *  template editor preview, where we can't easily do an async DB lookup
 *  inside useMemo), we fall back to env var → hardcoded default. */
export function resolveLogoUrl(
  templateLogoUrl: string | null | undefined,
  resolvedDefaultUrl?: string,
): string {
  if (templateLogoUrl && templateLogoUrl.trim()) return templateLogoUrl.trim();
  if (resolvedDefaultUrl && resolvedDefaultUrl.trim()) return resolvedDefaultUrl.trim();
  const env = process.env.EMAIL_BRAND_LOGO_URL;
  if (env && env.trim()) return env.trim();
  return DEFAULT_BRAND_LOGO_URL;
}

/**
 * Async-resolve the default email brand logo URL for a given chapter
 * context. Implements the fallback chain:
 *
 *   1. ChapterSetting[chapterId, "emailLogo"]   ← chapter-specific override
 *   2. SiteSetting["emailLogo"]                  ← global Super-Admin pick
 *   3. EMAIL_BRAND_LOGO_URL env var
 *   4. DEFAULTS[K_EMAIL_LOGO] (seeded to the user's canonical email logo)
 *
 *  Call this ONCE per email send (it does up to 2 small DB reads) and pass
 *  the result to `buildLogoBlock()` as `resolvedDefaultUrl`. The per-template
 *  `logoUrl` override still wins over this default — `buildLogoBlock` handles
 *  that precedence internally.
 *
 *  Safe to call with `chapterId = null/undefined` — skips the chapter
 *  lookup and goes straight to the global default. This is the path used
 *  by campaign sends that aren't tied to a specific chapter.
 *
 *  Any DB error falls back to the env var → seeded default so a DB outage
 *  never blocks email sends. */
export async function resolveEmailLogoDefault(
  chapterId?: string | null,
): Promise<string> {
  // 1. Chapter-level override (only when a chapter context is provided)
  if (chapterId) {
    try {
      const overrides = await getChapterBrandImageOverrides(chapterId);
      const chapterLogo = overrides[K_EMAIL_LOGO];
      if (chapterLogo && chapterLogo.trim()) return chapterLogo.trim();
    } catch (err) {
      console.warn("[templates] could not read chapter email-logo override:", err);
    }
  }
  // 2. Global SiteSetting[emailLogo]
  try {
    const row = await db.siteSetting.findUnique({
      where: { key: K_EMAIL_LOGO },
      select: { value: true },
    });
    const globalLogo = row?.value;
    if (globalLogo && globalLogo.trim()) return globalLogo.trim();
  } catch (err) {
    console.warn("[templates] could not read global email-logo SiteSetting:", err);
  }
  // 3. Env var
  const env = process.env.EMAIL_BRAND_LOGO_URL;
  if (env && env.trim()) return env.trim();
  // 4. Seeded default (DEFAULTS[K_EMAIL_LOGO])
  return DEFAULTS[K_EMAIL_LOGO];
}

/** Build the HTML for the brand-logo <img> tag.
 *  Returns an empty string if the resolved URL is falsy (which only happens
 *  if someone explicitly sets `EMAIL_BRAND_LOGO_URL=""` and the per-template
 *  override is also empty), OR if `logoHidden` is true (admin unchecked the
 *  "Show logo" box in the template editor — the logo URL is preserved so
 *  toggling back on restores the previously-configured logo without needing
 *  to re-upload or re-paste the URL).
 *
 *  The logo is rendered at a fixed 160px width with `height:auto` so the
 *  image's natural aspect ratio is preserved — this prevents the vertical
 *  squishing that happened with the previous forced `height:40px` style
 *  (which stretched any image wider than 4:1 into a squished 4:1 box).
 *
 *  We omit the `height` HTML attribute intentionally: most email clients
 *  (Gmail, Apple Mail, Yahoo, all mobile clients) will then compute the
 *  height proportionally from the intrinsic image dimensions, giving a
 *  correctly-proportioned render. The inline `height:auto` reinforces this
 *  for clients that honor inline styles over HTML attributes.
 *
 *  NOTE: this returns a MINIMAL img (no float, no margin). The actual
 *  LAYOUT — two-column table with the logo on the right of the <h1>, OR
 *  floated img as a fallback — is decided by `injectLogo()` in
 *  `render-unified.ts`, which has access to the full HTML context and
 *  can find the <h1> to wrap. This separation lets the table layout
 *  place the logo EXACTLY to the right of the heading text (matching
 *  the user's reference HTML), instead of the old float:right approach
 *  which could push the logo above the text when the heading was short. */
export function buildLogoBlock(
  templateLogoUrl: string | null | undefined,
  logoHidden?: boolean,
  resolvedDefaultUrl?: string,
): string {
  // Admin explicitly disabled the logo for this template — skip injection
  // entirely (don't even resolve the URL).
  if (logoHidden) return "";
  const url = resolveLogoUrl(templateLogoUrl, resolvedDefaultUrl);
  if (!url) return "";
  return `<img src="${url}" alt="AI Salon" width="150" style="width:150px;height:auto;display:block;border:0;outline:none;text-decoration:none;"/>`;
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
  /** Mobile-first /e/<slug>/my-code page — shows the user's check-in code. */
  myCodeUrl: string;
  checkInCode: string;
  speakers: string;
  agenda: string;
  /** Chapter display name — used for the {{chapter_name}} merge token in
   *  email templates (e.g. "— The AI Salon {{chapter_name}} team").
   *  Defaults to "Tel Aviv" when not provided, preserving backward compat
   *  with the original hardcoded templates. */
  chapterName: string;
  /** Tracking pixel URL — injected by worker before send. */
  openPixelUrl: string;
  /** Function that wraps a URL with the click-redirect. */
  wrapLink: (url: string) => string;
};

/** Build the TemplateContext from DB rows.
 *
 *  `chapterName` is optional and defaults to "Tel Aviv" (the original AI
 *  Salon chapter) for backward compatibility. Callers that have the event's
 *  chapter loaded should pass it in so the {{chapter_name}} merge token
 *  resolves to the correct chapter display name. */
export function buildContext(args: {
  event: Pick<Event, "title" | "startsAt" | "venue" | "address" | "slug">;
  rsvp: Pick<EventRsvp, "name" | "email" | "checkInCode">;
  speakers: Pick<Speaker, "name">[];
  agenda: Pick<EventAgendaItem, "title" | "startsAt">[];
  baseUrl: string;
  queueId: string;
  /** Optional chapter display name — used for the {{chapter_name}} merge
   *  token. Defaults to "Tel Aviv" when not provided. */
  chapterName?: string;
}): TemplateContext {
  const { event, rsvp, speakers, agenda, baseUrl, queueId } = args;
  const firstName = (rsvp.name || rsvp.email.split("@")[0]).split(" ")[0];
  const eventDate = formatDate(event.startsAt);
  const eventUrl = `${baseUrl}/e/${event.slug}`;
  const myCodeUrl = `${eventUrl}/my-code`;
  const openPixelUrl = `${baseUrl}/api/track/email-open?id=${queueId}`;

  return {
    firstName,
    eventTitle: event.title,
    eventDate,
    eventVenue: event.venue || "TBD",
    eventAddress: event.address || "",
    eventUrl,
    myCodeUrl,
    checkInCode: rsvp.checkInCode || "",
    speakers: speakers.map((s) => s.name).join(", "),
    agenda: agenda
      .map((a) => `• ${formatTime(a.startsAt)} — ${a.title}`)
      .join("\n"),
    chapterName: args.chapterName ?? "Tel Aviv",
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

/** Replace {{tokens}} in a template body and inject the open pixel + brand logo.
 *
 *  Supported chapter tokens:
 *    {{chapter_name}}   — chapter display name (snake_case, user-facing)
 *    {{chapterName}}    — same value (camelCase, for parity with other tokens)
 *
 *  TSK-0074: now delegates to the unified renderer at
 *  `src/lib/email/render-unified.ts:renderUnifiedEmail`. The unified
 *  renderer merges the three previously-bifurcated render paths into one
 *  and adds support for: (a) BOTH camelCase + snake_case tokens, (b) the
 *  new `mobileOverridesHtml` field (appended inside a `@media (max-width:
 *  600px)` block), (c) idempotent logo + mobile-override injection
 *  (safe to call twice on the same HTML), (d) skip already-wrapped links
 *  (so re-rendering a template doesn't double-wrap).
 *
 *  The signature + behavior are preserved for backward compat with all
 *  existing callers (worker.ts, flow-worker.ts, force-send-stage route). */
export function renderTemplate(
  html: string,
  ctx: TemplateContext,
  opts?: { logoHtml?: string },
): string {
  // Delegate to the unified renderer. The orchestrator's TemplateContext
  // is a superset of UnifiedRenderContext (it has `wrapLink` and
  // `openPixelUrl` which the unified renderer uses for click-wrap + pixel).
  return renderUnifiedEmail({
    html,
    ctx,
    logoHtml: opts?.logoHtml,
    clickWrapFn: ctx.wrapLink,
    openPixelUrl: ctx.openPixelUrl,
    chapterName: ctx.chapterName,
  });
}

/** Replace {{tokens}} in a subject line (no HTML escaping — subjects are plain text).
 *
 *  TSK-0074: now delegates to `renderUnifiedSubject` in the unified renderer.
 *  Supports both camelCase + snake_case tokens (the legacy version only
 *  supported camelCase). For templates that don't use snake_case tokens,
 *  the behavior is identical. */
export function renderSubject(subject: string, ctx: TemplateContext): string {
  return renderUnifiedSubject(subject, ctx);
}

// ----------------------------------------------------------------------------
// Default templates (used by seed.ts)
// ----------------------------------------------------------------------------

/**
 * MINIMAL_SHELL — the default AI Salon email wrapper.
 *
 * Design spec (per Eze, 2026-08-05):
 *   - Plus Jakarta Sans web font (with -apple-system fallback)
 *   - 600px outer container, 560px content column, centered
 *   - 20px outer padding (was 32px/24px — tighter per user's reference HTML)
 *   - Top-left: "aisalon" branding (24px, weight 700, margin-bottom 10px)
 *   - Two <br> line breaks below branding
 *   - 22px h1, 800 weight, color #0a0a0a (template may override color)
 *   - Top-right: brand logo image (150px wide, top-aligned with branding)
 *     - Achieved via a two-column table: left = branding + h1, right = logo
 *     - The table is injected by `injectLogo()` in render-unified.ts
 *     - `data-brand-logo` marker on the table for idempotency
 *   - 15px body, line-height 1.6, #444
 *   - 1px solid #000 <hr> separator (40px margin-top per user spec)
 *   - 12px footer in #999 with site link
 *
 * The branding block (`<div>aisalon</div><br><br>`) + ALL the inner body
 * content (h1 + paragraphs + CTA + sign-off) — everything UP TO the `<hr>`
 * footer separator — is wrapped together in a two-column table by
 * `injectLogo()`. The `data-brand-content-end` attribute on the `<hr>` is
 * the marker that tells `injectLogo()` where the body content ends.
 *
 * Why wrap the ENTIRE body (not just the h1)? If we only wrap branding +
 * h1, the table row's height is `max(branding+h1 height, logo height)`.
 * Since the logo is typically ~150px tall and the h1 is only ~30px, the
 * row stretches to ~150px, leaving a ~120px gap between the h1 and the
 * body paragraph below. By wrapping the ENTIRE body, the body paragraphs
 * flow naturally inside the LEFT cell, directly below the h1 — while the
 * logo sits in the RIGHT cell, top-aligned with the branding. The body
 * never appears "below the logo" — it appears BESIDE the logo, in the
 * left column. The logo is always top-right, always visible (in its own
 * cell), and never overlapped by text.
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
  <title>AI Salon {{chapter_name}}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="font-family:'Plus Jakarta Sans',-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0a0a0a;">
    <div data-brand-header style="font-weight:700;font-size:24px;margin-bottom:10px;">aisalon</div>
    <br><br>
    ${inner}
    <hr data-brand-content-end style="margin:32px 0;border:none;border-top:1px solid #000;"/>
    <p style="font-size:12px;color:#999;margin:0;line-height:1.5;">
      AI Salon {{chapter_name}} · Empowering AI Connections<br/>
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
            — The AI Salon {{chapter_name}} team
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
            — The AI Salon {{chapter_name}} team
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
            — The AI Salon {{chapter_name}} team
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
            — The AI Salon {{chapter_name}} team
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
            — The AI Salon {{chapter_name}} team
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
            — The AI Salon {{chapter_name}} team
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
