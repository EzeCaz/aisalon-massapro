/**
 * Unified email renderer — the single source of truth for rendering an
 * email body + subject for send/preview.
 *
 * TSK-0074 (email unification Phase 2): merges the THREE previously
 * bifurcated render paths into one:
 *
 *   1. `src/lib/email-orchestrator/templates.ts:renderTemplate`
 *      — used by the flow worker + legacy stage worker + force-send route.
 *      Replaces tokens (camelCase only), injects brand logo (if provided),
 *      wraps all `href="http..."` links with the click-redirect, appends
 *      an open-tracking pixel before `</body>`. HTML-escapes token values.
 *
 *   2. `src/lib/email-campaign/render.ts:renderEmail`
 *      — used by the campaign cron + continue route. Replaces tokens
 *      (snake_case + camelCase), wraps `href` links, appends an open pixel
 *      + an unsubscribe footer.
 *
 *   3. INLINE regex replaces in
 *      `src/app/api/admin/email/campaigns/[id]/send/route.ts`
 *      — the live "Send Now" button. Replaced tokens (snake_case only),
 *      did NOT inject a logo, did NOT wrap links, did NOT add a tracking
 *      pixel. Was BROKEN (sent plain merged HTML with no tracking).
 *
 * This file replaces all three. The old functions (`renderTemplate` in
 * templates.ts and `renderEmail` in render.ts) are kept exported for
 * backward compat but now internally delegate to `renderUnifiedEmail`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Behavior of `renderUnifiedEmail`:
 *
 *   1. Replace tokens. Supports BOTH camelCase (`{{firstName}}`) AND
 *      snake_case (`{{first_name}}`) for backward compat with all
 *      historical templates. The full token set:
 *        {{firstName}}       {{first_name}}     → ctx.firstName
 *        {{name}}            {{full_name}}      → ctx.firstName (alias)
 *        {{email}}                               → ctx.email
 *        {{chapterName}}    {{chapter_name}}     → ctx.chapterName
 *        {{eventTitle}}                          → ctx.eventTitle
 *        {{eventDate}}                           → ctx.eventDate
 *        {{eventVenue}}                          → ctx.eventVenue
 *        {{eventAddress}}                        → ctx.eventAddress
 *        {{eventUrl}}                            → ctx.eventUrl
 *        {{myCodeUrl}}       {{event.myCodeUrl}} → ctx.myCodeUrl
 *        {{checkInCode}}                         → ctx.checkInCode
 *        {{speakers}}                            → ctx.speakers
 *        {{agenda}}                              → ctx.agenda (newlines → <br/>)
 *
 *   2. Inject brand logo (idempotent — only if `data-brand-logo` marker
 *      is not already present in the HTML and `logoHtml` is provided).
 *      LAYOUT: wraps the first `<h1>` in a two-column table (h1 left,
 *      logo right) so the logo sits exactly to the right of the heading
 *      text — matching the user's reference HTML. Falls back to a
 *      floated img after the SHELL wrapper / `<body>` when no `<h1>`
 *      is found.
 *
 *   3. Prepend mobile overrides (if `mobileOverridesHtml` is provided).
 *      The overrides are wrapped inside `<style>@media (max-width: 600px)
 *      { ... }</style>` and injected right after `<head>` (or at the
 *      start of the HTML if no `<head>` is present). Idempotent via
 *      `data-mobile-overrides` marker.
 *
 *   4. Click-wrap all `href="http..."` links (skip mailto:, tel:, and
 *      already-wrapped links containing `/api/email/click` or
 *      `/api/track/email-click`).
 *
 *   5. Append tracking pixel before `</body>` (or at the end). Uses
 *      `openPixelUrl` directly when provided (orchestrator path), or
 *      derives it from `(campaignId, trackToken, baseUrl)` (campaign path).
 *
 *   6. Append unsubscribe footer (the existing footer from
 *      `email-campaign/render.ts:appendTrackingPixel`). Only appended
 *      when `unsubscribeUrl` is provided (campaign path). Orchestrator
 *      sends (which use queue-row-based tracking, not campaign-based)
 *      do not pass an unsubscribe URL — no footer is added.
 *
 * Token escaping: HTML-escape all token values EXCEPT `agenda` (which
 * is allowed to contain `\n` → converted to `<br/>`) and `email`/
 * `eventUrl` (which are URLs that should not be escaped).
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * The merged context type. Superset of:
 *   - `TemplateContext` (orchestrator) — has wrapLink, openPixelUrl,
 *     speakers, agenda, checkInCode, myCodeUrl, etc.
 *   - `RenderInput`    (campaign)      — has email, recipient name, etc.
 *
 * All fields are optional so callers can pass a partial context (e.g.
 * test-send uses only firstName + email). The renderer gracefully
 * resolves missing tokens to empty strings.
 */
export type UnifiedRenderContext = {
  // Recipient
  firstName?: string;
  /** Alias for firstName — used by {{name}} and {{full_name}} tokens. */
  name?: string;
  email?: string;
  // Chapter
  chapterName?: string;
  // Event
  eventTitle?: string;
  eventDate?: string;
  eventVenue?: string;
  eventAddress?: string;
  eventUrl?: string;
  myCodeUrl?: string;
  checkInCode?: string;
  speakers?: string;
  agenda?: string;
  // Tracking — orchestrator path provides these directly
  openPixelUrl?: string;
  wrapLink?: (url: string) => string;
};

/**
 * Arguments for `renderUnifiedEmail`.
 *
 * Either `openPixelUrl` (orchestrator path) or `(campaignId, trackToken,
 * baseUrl)` (campaign path) must be provided for the tracking pixel.
 * If neither is provided, no tracking pixel is appended.
 *
 * Either `wrapLink` (orchestrator path) or `baseUrl` + `campaignId` +
 * `trackToken` (campaign path) must be provided for click-wrapping.
 * If neither is provided, links are not wrapped.
 *
 * `unsubscribeUrl` is optional — only the campaign path provides it.
 */
export type RenderUnifiedEmailArgs = {
  /** The raw HTML template body with {{tokens}}. */
  html: string;
  /** Token values to substitute. */
  ctx: UnifiedRenderContext;
  /** Optional pre-built logo <img> HTML block (orchestrator path). */
  logoHtml?: string;
  /** Optional mobile-only CSS/HTML — wrapped in `@media (max-width: 600px)`. */
  mobileOverridesHtml?: string;
  /**
   * Click-wrap function. If provided, every `href="http..."` link is
   * replaced with `href="${clickWrapFn(url)}"`. If absent, the renderer
   * falls back to building a campaign-style click URL from
   * `(campaignId, trackToken, baseUrl)`.
   */
  clickWrapFn?: (url: string) => string;
  /** Open-pixel URL. If absent, the renderer builds one from
   *  `(campaignId, trackToken, baseUrl)` if all three are provided. */
  openPixelUrl?: string;
  /** Unsubscribe URL — appended in the footer (campaign path only). */
  unsubscribeUrl?: string;
  /** Chapter display name — used in the unsubscribe footer text.
   *  Defaults to "Tel Aviv" for backward compat. */
  chapterName?: string;
  // Campaign-path fallbacks (used when clickWrapFn / openPixelUrl are absent)
  campaignId?: string;
  trackToken?: string;
  baseUrl?: string;
};

// ----------------------------------------------------------------------------
// Token replacement
// ----------------------------------------------------------------------------

/**
 * Replace all {{tokens}} in `text` using values from `ctx`.
 *
 * Supports BOTH camelCase (`{{firstName}}`) AND snake_case (`{{first_name}}`)
 * for backward compatibility with all historical templates.
 *
 * Token values are HTML-escaped EXCEPT:
 *   - `agenda` — its `\n` characters are converted to `<br/>` first, then
 *     the rest of the string is HTML-escaped (so agenda content stays
 *     line-broken but is still safe from XSS).
 *   - `email`, `eventUrl`, `myCodeUrl`, `openPixelUrl`, `wrapLink(url)` —
 *     URLs that should not be HTML-escaped (would break the URL).
 */
export function replaceTokens(text: string, ctx: UnifiedRenderContext): string {
  const firstName = ctx.firstName ?? ctx.name ?? "";
  const fullName = ctx.name ?? ctx.firstName ?? "";
  const email = ctx.email ?? "";
  const chapter = ctx.chapterName && ctx.chapterName.trim() ? ctx.chapterName : "Tel Aviv";
  const eventTitle = ctx.eventTitle ?? "";
  const eventDate = ctx.eventDate ?? "";
  const eventVenue = ctx.eventVenue ?? "";
  const eventAddress = ctx.eventAddress ?? "";
  const eventUrl = ctx.eventUrl ?? "";
  const myCodeUrl = ctx.myCodeUrl ?? "";
  const checkInCode = ctx.checkInCode ?? "";
  const speakers = ctx.speakers ?? "";
  const agenda = ctx.agenda ?? "";

  // HTML-escape agenda newlines first → <br/>, then escape the rest.
  const agendaHtml = escapeHtml(agenda).replace(/\n/g, "<br/>");

  return text
    // camelCase tokens
    .replace(/{{firstName}}/g, escapeHtml(firstName))
    .replace(/{{name}}/g, escapeHtml(firstName))
    .replace(/{{email}}/g, escapeHtml(email))
    .replace(/{{chapterName}}/g, escapeHtml(chapter))
    .replace(/{{eventTitle}}/g, escapeHtml(eventTitle))
    .replace(/{{eventDate}}/g, escapeHtml(eventDate))
    .replace(/{{eventVenue}}/g, escapeHtml(eventVenue))
    .replace(/{{eventAddress}}/g, escapeHtml(eventAddress))
    .replace(/{{eventUrl}}/g, escapeHtml(eventUrl))
    .replace(/{{event\.myCodeUrl}}/g, escapeHtml(myCodeUrl))
    .replace(/{{myCodeUrl}}/g, escapeHtml(myCodeUrl))
    .replace(/{{checkInCode}}/g, escapeHtml(checkInCode))
    .replace(/{{speakers}}/g, escapeHtml(speakers))
    .replace(/{{agenda}}/g, agendaHtml)
    // snake_case tokens (backward compat with campaign-side templates)
    .replace(/\{\{\s*first_name\s*\}\}/g, escapeHtml(firstName))
    .replace(/\{\{\s*full_name\s*\}\}/g, escapeHtml(fullName))
    .replace(/\{\{\s*email\s*\}\}/g, escapeHtml(email))
    .replace(/\{\{\s*chapter_name\s*\}\}/g, escapeHtml(chapter))
    .replace(/\{\{\s*eventTitle\s*\}\}/g, escapeHtml(eventTitle))
    .replace(/\{\{\s*eventDate\s*\}\}/g, escapeHtml(eventDate))
    .replace(/\{\{\s*eventVenue\s*\}\}/g, escapeHtml(eventVenue))
    .replace(/\{\{\s*eventAddress\s*\}\}/g, escapeHtml(eventAddress))
    .replace(/\{\{\s*eventUrl\s*\}\}/g, escapeHtml(eventUrl))
    .replace(/\{\{\s*event\.myCodeUrl\s*\}\}/g, escapeHtml(myCodeUrl))
    .replace(/\{\{\s*myCodeUrl\s*\}\}/g, escapeHtml(myCodeUrl))
    .replace(/\{\{\s*checkInCode\s*\}\}/g, escapeHtml(checkInCode))
    .replace(/\{\{\s*speakers\s*\}\}/g, escapeHtml(speakers))
    .replace(/\{\{\s*agenda\s*\}\}/g, agendaHtml);
}

/**
 * Replace {{tokens}} in a subject line. Same token set as `replaceTokens`,
 * but NO HTML escaping (subjects are plain text). Newlines in `agenda`
 * are kept as-is (most subject lines don't use {{agenda}} anyway).
 */
export function renderUnifiedSubject(
  subject: string,
  ctx: UnifiedRenderContext,
): string {
  const firstName = ctx.firstName ?? ctx.name ?? "";
  const fullName = ctx.name ?? ctx.firstName ?? "";
  const email = ctx.email ?? "";
  const chapter = ctx.chapterName && ctx.chapterName.trim() ? ctx.chapterName : "Tel Aviv";
  const eventTitle = ctx.eventTitle ?? "";
  const eventDate = ctx.eventDate ?? "";
  const eventVenue = ctx.eventVenue ?? "";
  const eventAddress = ctx.eventAddress ?? "";
  const eventUrl = ctx.eventUrl ?? "";
  const myCodeUrl = ctx.myCodeUrl ?? "";
  const checkInCode = ctx.checkInCode ?? "";
  const speakers = ctx.speakers ?? "";
  const agenda = ctx.agenda ?? "";

  return subject
    .replace(/{{firstName}}/g, firstName)
    .replace(/{{name}}/g, firstName)
    .replace(/{{email}}/g, email)
    .replace(/{{chapterName}}/g, chapter)
    .replace(/{{eventTitle}}/g, eventTitle)
    .replace(/{{eventDate}}/g, eventDate)
    .replace(/{{eventVenue}}/g, eventVenue)
    .replace(/{{eventAddress}}/g, eventAddress)
    .replace(/{{eventUrl}}/g, eventUrl)
    .replace(/{{event\.myCodeUrl}}/g, myCodeUrl)
    .replace(/{{myCodeUrl}}/g, myCodeUrl)
    .replace(/{{checkInCode}}/g, checkInCode)
    .replace(/{{speakers}}/g, speakers)
    .replace(/{{agenda}}/g, agenda)
    .replace(/\{\{\s*first_name\s*\}\}/g, firstName)
    .replace(/\{\{\s*full_name\s*\}\}/g, fullName)
    .replace(/\{\{\s*email\s*\}\}/g, email)
    .replace(/\{\{\s*chapter_name\s*\}\}/g, chapter)
    .replace(/\{\{\s*eventTitle\s*\}\}/g, eventTitle)
    .replace(/\{\{\s*eventDate\s*\}\}/g, eventDate)
    .replace(/\{\{\s*eventVenue\s*\}\}/g, eventVenue)
    .replace(/\{\{\s*eventAddress\s*\}\}/g, eventAddress)
    .replace(/\{\{\s*eventUrl\s*\}\}/g, eventUrl)
    .replace(/\{\{\s*event\.myCodeUrl\s*\}\}/g, myCodeUrl)
    .replace(/\{\{\s*myCodeUrl\s*\}\}/g, myCodeUrl)
    .replace(/\{\{\s*checkInCode\s*\}\}/g, checkInCode)
    .replace(/\{\{\s*speakers\s*\}\}/g, speakers)
    .replace(/\{\{\s*agenda\s*\}\}/g, agenda);
}

// ----------------------------------------------------------------------------
// Logo injection
// ----------------------------------------------------------------------------

/**
 * Inject the brand-logo HTML block into the email.
 *
 * Idempotent: if the HTML already contains the `data-brand-logo` marker,
 * no injection happens (so calling this twice on the same HTML is safe).
 *
 * LAYOUT — three strategies, tried in order:
 *
 *   1. (PREFERRED — new layout per Eze 2026-08-05) Wrap the branding block
 *      (`<div data-brand-header>aisalon</div>` + two `<br>` line breaks +
 *      the first `<h1>`) in a two-column table:
 *        <table data-brand-logo>
 *          <tr>
 *            <td valign="top">  ← branding + br/br + h1 (left column, fluid width)
 *            <td valign="top" width="150" align="right">  ← logo img (right column, fixed 150px)
 *          </tr>
 *        </table>
 *      This places the logo EXACTLY to the right of the "aisalon" branding
 *      text, both top-aligned on the same horizontal line — matching the
 *      user's reference HTML layout. The h1 sits below the branding with
 *      the two `<br>` line breaks, and the body paragraph flows directly
 *      below the h1.
 *
 *   2. (LEGACY — for templates without data-brand-header) Wrap just the
 *      first `<h1>...</h1>` in a two-column table (h1 left, logo right).
 *      Used for custom templates that have an h1 but no branding block.
 *
 *   3. (FALLBACK) If no `<h1>` is found, insert the logo img with
 *      `float:right;margin:0 0 8px 16px;` added inline, right after the
 *      SHELL wrapper `<div style="max-width:560px...">` (or after `<body>`,
 *      or at the start of the HTML). This preserves the old behavior for
 *      templates that don't start with an `<h1>` (e.g. custom templates
 *      that begin with a `<p>` or `<div>`).
 *
 * The `data-brand-logo` marker is placed on the `<table>` (strategies 1+2)
 * or the `<img>` (strategy 3) so subsequent calls detect either and skip.
 */
export function injectLogo(html: string, logoHtml: string | undefined): string {
  if (!logoHtml) return html;
  // Idempotency: don't double-inject.
  if (/data-brand-logo/.test(html)) return html;

  // ── Strategy 1: wrap branding block + first <h1> in a two-column table ─
  // Match the pattern: <div data-brand-header ...>...</div> (optional
  // whitespace) <br><br> (optional whitespace) <h1 ...>...</h1>. The
  // branding div is identified by the `data-brand-header` attribute that
  // the new SHELL adds. Uses [\s\S] for dotall match because . doesn't
  // match newlines in JS regex.
  const brandingH1Match = html.match(
    /<div[^>]*data-brand-header[^>]*>[\s\S]*?<\/div>\s*<br\s*\/?\>\s*<br\s*\/?\>\s*<h1[^>]*>[\s\S]*?<\/h1>/i,
  );
  if (brandingH1Match && brandingH1Match.index !== undefined) {
    const block = brandingH1Match[0];
    // Build the two-column table wrapper. cellpadding=0 + cellspacing=0 +
    // border=0 + border-collapse:collapse strips all default table spacing
    // so the branding/h1 and logo sit flush. valign="top" on both cells
    // ensures top alignment — the logo's top edge aligns with the
    // "aisalon" branding div's top edge. The right cell has a fixed width
    // of 150px (matching the user's reference HTML) + align="right" so
    // the logo sticks to the right edge of the email body.
    const tableWrapper =
      `<table data-brand-logo width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">` +
      `<tr>` +
      `<td valign="top" style="vertical-align:top;">${block}</td>` +
      `<td valign="top" width="150" align="right" style="vertical-align:top;width:150px;text-align:right;">${logoHtml}</td>` +
      `</tr>` +
      `</table>`;
    // Replace just the matched branding+br/br+h1 block with the wrapped
    // version. Using string slicing (not str.replace) to avoid regex
    // special-character issues in the block content.
    return (
      html.slice(0, brandingH1Match.index) +
      tableWrapper +
      html.slice(brandingH1Match.index + block.length)
    );
  }

  // ── Strategy 2 (legacy): wrap just the first <h1> in a two-column table ─
  // Used when the template has an h1 but no data-brand-header div (e.g.
  // custom templates that don't use the standard SHELL).
  const h1Match = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i);
  if (h1Match && h1Match.index !== undefined) {
    const h1Block = h1Match[0];
    const tableWrapper =
      `<table data-brand-logo width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">` +
      `<tr>` +
      `<td valign="top" style="vertical-align:top;">${h1Block}</td>` +
      `<td valign="top" width="160" align="right" style="vertical-align:top;width:160px;text-align:right;">${logoHtml}</td>` +
      `</tr>` +
      `</table>`;
    return (
      html.slice(0, h1Match.index) +
      tableWrapper +
      html.slice(h1Match.index + h1Block.length)
    );
  }

  // ── Strategy 3 (fallback): floated img after SHELL / body ──────────────
  // No <h1> found — fall back to the old float:right behavior so the logo
  // still appears at the top-right of the email. We add float:right +
  // margin inline to the img's style attribute (buildLogoBlock produces a
  // minimal img without these, since the preferred table layout doesn't
  // need them).
  const floatedImg = logoHtml.replace(
    /style="([^"]*)"/i,
    (_m, styles: string) =>
      `style="float:right;margin:0 0 8px 16px;${styles}"`,
  );
  // Tag with the marker for idempotency detection.
  const tagged = floatedImg.replace(/<img /, '<img data-brand-logo ');

  if (/<div[^>]*max-width:560px[^>]*>/i.test(html)) {
    return html.replace(
      /(<div[^>]*max-width:560px[^>]*>)/i,
      `$1${tagged}`,
    );
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1${tagged}`);
  }
  return tagged + html;
}

// ----------------------------------------------------------------------------
// Mobile overrides injection
// ----------------------------------------------------------------------------

/**
 * Inject the mobile-only overrides CSS block.
 *
 * The `mobileOverridesHtml` content is wrapped inside
 * `<style>@media (max-width: 600px) { ... }</style>` and prepended right
 * after `<head>` (or at the start of the HTML if no `<head>` is present).
 *
 * Idempotent: if the HTML already contains the `data-mobile-overrides`
 * marker, no injection happens.
 */
export function injectMobileOverrides(
  html: string,
  mobileOverridesHtml: string | undefined,
): string {
  if (!mobileOverridesHtml || !mobileOverridesHtml.trim()) return html;
  if (/data-mobile-overrides/.test(html)) return html;

  const styleBlock = `<style data-mobile-overrides>@media (max-width: 600px) { ${mobileOverridesHtml} }</style>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${styleBlock}`);
  }
  return styleBlock + html;
}

// ----------------------------------------------------------------------------
// Click-wrap
// ----------------------------------------------------------------------------

/**
 * Wrap all `href="http..."` links with the click-redirect.
 *
 * Skips:
 *   - mailto: and tel: links (not http(s))
 *   - already-wrapped links (containing `/api/email/click` or
 *     `/api/track/email-click`)
 *
 * If `clickWrapFn` is provided (orchestrator path), it's used directly.
 * Otherwise, if `(campaignId, trackToken, baseUrl)` are all provided
 * (campaign path), a campaign-style click URL is built:
 *   `${baseUrl}/api/email/click?t=${trackToken}&c=${campaignId}&u=${base64url(url)}`
 *
 * If neither is provided, the HTML is returned unchanged (no click-wrap).
 */
export function clickWrapLinks(
  html: string,
  args: {
    clickWrapFn?: (url: string) => string;
    campaignId?: string;
    trackToken?: string;
    baseUrl?: string;
  },
): string {
  const { clickWrapFn, campaignId, trackToken, baseUrl } = args;

  // Determine which wrap function to use.
  let wrap: ((url: string) => string) | undefined = clickWrapFn;
  if (!wrap && campaignId && trackToken && baseUrl) {
    wrap = (url: string) => {
      const encoded = Buffer.from(url, "utf8").toString("base64url");
      return `${baseUrl}/api/email/click?t=${trackToken}&c=${campaignId}&u=${encoded}`;
    };
  }
  if (!wrap) return html;

  return html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url: string) => {
      // Skip already-wrapped links.
      if (url.includes("/api/email/click")) return match;
      if (url.includes("/api/track/email-click")) return match;
      return `href="${wrap!(url)}"`;
    },
  );
}

// ----------------------------------------------------------------------------
// Tracking pixel + unsubscribe footer
// ----------------------------------------------------------------------------

/**
 * Append the open-tracking pixel + (optionally) the unsubscribe footer.
 *
 * The pixel is `<img src="${pixelUrl}" width="1" height="1" .../>` injected
 * right before `</body>` (or at the end if no `</body>`).
 *
 * The footer is the existing campaign-style unsubscribe footer with the
 * chapter name. Only appended when `unsubscribeUrl` is provided.
 *
 * `pixelUrl` resolution:
 *   - If `openPixelUrl` is provided (orchestrator path), use it.
 *   - Else if `(campaignId, trackToken, baseUrl)` are all provided
 *     (campaign path), build `${baseUrl}/api/email/open?t=${trackToken}&c=${campaignId}`.
 *   - Else: no pixel is appended.
 */
export function appendTrackingAndFooter(
  html: string,
  args: {
    openPixelUrl?: string;
    campaignId?: string;
    trackToken?: string;
    baseUrl?: string;
    unsubscribeUrl?: string;
    chapterName?: string;
  },
): string {
  const {
    openPixelUrl,
    campaignId,
    trackToken,
    baseUrl,
    unsubscribeUrl,
    chapterName,
  } = args;

  // Resolve pixel URL.
  let pixelUrl: string | undefined = openPixelUrl;
  if (!pixelUrl && campaignId && trackToken && baseUrl) {
    pixelUrl = `${baseUrl}/api/email/open?t=${trackToken}&c=${campaignId}`;
  }

  const chapter = chapterName && chapterName.trim() ? chapterName : "Tel Aviv";

  // Build the footer block (pixel + optional unsubscribe).
  const footerParts: string[] = [];
  if (unsubscribeUrl) {
    footerParts.push(
      `<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">`,
      `  <p style="margin: 0 0 8px;">You received this email because you are a member of AI Salon ${escapeHtml(chapter)}.</p>`,
      `  <p style="margin: 0;"><a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe</a></p>`,
      `</div>`,
    );
  }
  if (pixelUrl) {
    footerParts.push(
      `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none; visibility:hidden; position:absolute; left:-9999px;" />`,
    );
  }
  if (footerParts.length === 0) return html;

  const footer = `\n${footerParts.join("\n")}\n`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${html}${footer}`;
}

// ----------------------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------------------

/**
 * Render an email HTML body using the unified pipeline.
 *
 * See the file-level docstring for the full algorithm.
 */
export function renderUnifiedEmail(args: RenderUnifiedEmailArgs): string {
  const {
    html,
    ctx,
    logoHtml,
    mobileOverridesHtml,
    clickWrapFn,
    openPixelUrl,
    unsubscribeUrl,
    chapterName,
    campaignId,
    trackToken,
    baseUrl,
  } = args;

  // 1. Replace tokens.
  let out = replaceTokens(html, ctx);

  // 2. Inject brand logo (idempotent).
  out = injectLogo(out, logoHtml);

  // 3. Inject mobile overrides (idempotent).
  out = injectMobileOverrides(out, mobileOverridesHtml);

  // 4. Click-wrap all http(s) links.
  out = clickWrapLinks(out, { clickWrapFn, campaignId, trackToken, baseUrl });

  // 5. Append tracking pixel + optional unsubscribe footer.
  out = appendTrackingAndFooter(out, {
    openPixelUrl,
    campaignId,
    trackToken,
    baseUrl,
    unsubscribeUrl,
    chapterName: chapterName ?? ctx.chapterName,
  });

  return out;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
