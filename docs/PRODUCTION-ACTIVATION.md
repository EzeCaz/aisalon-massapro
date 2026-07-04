# Production Activation Guide — Email + Analytics

This guide walks you through activating the email flow system, Gmail
sending, GA4, and Meta CAPI on Vercel production.

All env vars below should be set in **Vercel → Project → Settings →
Environment Variables**. After setting them, trigger a redeploy.

---

## Phase 1 — Email (Gmail API)

### 1.1 Create a Google Cloud project

1. Go to https://console.cloud.google.com/
2. Create a new project: `aisalon-email`
3. Note the project ID — you'll need it for support tickets if Google throttles you.

### 1.2 Enable Gmail API

1. APIs & Services → Library → search "Gmail API" → Enable.
2. APIs & Services → OAuth consent screen:
   - User type: **Internal** (for Workspace) or **External** (for personal Gmail).
   - App name: `AI Salon Email`
   - Support email: `aisalon@massapro.com`
   - Authorized domains: `massapro.com`
   - Scopes: add `https://www.googleapis.com/auth/gmail.send`
   - For External: add `aisalon@massapro.com` as a Test User.

### 1.3 Create OAuth credentials

1. APIs & Services → Credentials → Create Credentials → OAuth client ID.
2. Application type: **Web application**.
3. Authorized redirect URIs:
   - `https://aisalon.massapro.com/api/auth/callback/google` (for NextAuth)
   - `https://aisalon.massapro.com/api/oauth/gmail/callback` (for the one-time refresh-token flow)
4. Save. Note the **Client ID** and **Client Secret**.

### 1.4 Obtain a refresh token (one-time)

The Gmail API needs an OAuth **refresh token** for the `aisalon@massapro.com`
account. This is a one-time setup — the refresh token persists indefinitely
(until the user explicitly revokes access).

Easiest method: use the OAuth 2.0 Playground.

1. Go to https://developers.google.com/oauthplayground/
2. Click the gear icon (top-right) → check "Use your own OAuth credentials".
3. Paste your Client ID + Client Secret.
4. In the left panel, scroll to "Gmail API v1" → select `https://mail.google.com/` scope (full Gmail access).
   - OR select `https://www.googleapis.com/auth/gmail.send` for send-only.
5. Click "Authorize APIs" → sign in as `aisalon@massapro.com` → consent.
6. Click "Exchange authorization code for tokens".
7. Note the **Refresh token** — it starts with `1//` and is ~80 chars.

### 1.5 Set Vercel env vars

In Vercel, set these env vars (Project → Settings → Environment Variables):

| Name | Value | Environments |
|---|---|---|
| `EMAIL_PROVIDER` | `gmail` | Production (and Preview if you want to test real sends) |
| `EMAIL_FROM` | `AI Salon Tel Aviv <aisalon@massapro.com>` | Production |
| `GOOGLE_CLIENT_ID` | (from step 1.3) | All environments |
| `GOOGLE_CLIENT_SECRET` | (from step 1.3) | All environments |
| `GOOGLE_REFRESH_TOKEN` | (from step 1.4) | Production only |

After setting, **redeploy** for the env vars to take effect.

### 1.6 Quota & limits

- **Workspace free tier:** 2,000 emails/day per user.
- **Per-user send rate:** 250 emails/second (way more than we need).
- Our typical load: 200 RSVPs × 5 emails/flow = 1,000 sends/event. Well within quota.
- The sender has built-in retry with exponential backoff on 429 (rate limit).

### 1.7 Verify

After redeploy, hit the worker endpoint:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://aisalon.massapro.com/api/email-orchestrator/run
```

Response should include `flowResult.sent > 0` if there are queued RSVPs.
Check Gmail → Sent folder for `aisalon@massapro.com` to confirm real sends.

---

## Phase 2 — Google Analytics 4

### 2.1 Create GA4 property

1. Go to https://analytics.google.com/
2. Admin → Create Property → "AI Salon Tel Aviv"
3. Business objectives: "Generate leads"
4. Data stream: Web → `https://aisalon.massapro.com`
5. Note the **Measurement ID** (format: `G-XXXXXXXXXX`).

### 2.2 Generate API secret

1. In GA4 → Admin → Data Streams → your web stream → Measurement Protocol API secrets.
2. Create a new secret. Note the value (format: `abc123...`, ~30 chars).

### 2.3 Set Vercel env vars

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | `G-XXXXXXXXXX` | All (public, used by browser-side gtag) |
| `GA4_MEASUREMENT_ID` | `G-XXXXXXXXXX` | All (server-side, used by Measurement Protocol) |
| `GA4_API_SECRET` | (from step 2.2) | Production only |

### 2.4 Install the GA4 browser snippet

The GTM install (Phase 3) handles the browser-side page views. If you
want GA4 directly (without GTM), add this to `src/app/layout.tsx`:

```tsx
import Script from "next/script";

// In the <head>:
<Script id="ga4-base" strategy="afterInteractive">{`
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID}', {
    send_page_view: true
  });
`}</Script>
<Script
  strategy="afterInteractive"
  src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID}`}
/>
```

### 2.5 Verify

After deploy, trigger an RSVP. Then check GA4 → Realtime → you should
see a `rsvp_submit` event within ~30 seconds.

For server-side events (email open, click), check GA4 → Realtime →
"event_count" for `email_open` and `email_click`.

---

## Phase 3 — Google Tag Manager (optional but recommended)

GTM centralizes all marketing tags in one container. Use it if you
plan to add more tags later (Hotjar, LinkedIn Insight, etc.).

### 3.1 Create GTM container

1. Go to https://tagmanager.google.com/
2. Create Account → "AI Salon" → Web container "aisalon-massapro-prod".
3. Note the **Container ID** (format: `GTM-XXXXXXX`).

### 3.2 Set Vercel env var

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | `GTM-XXXXXXX` | All (public) |

### 3.3 Install the GTM snippet

Add to `src/app/layout.tsx`:

```tsx
import Script from "next/script";

// In <head>:
<Script id="gtm-base" strategy="afterInteractive">{`
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_ID}');
`}</Script>

// Right after <body> opens:
<Script id="gtm-noscript" strategy="beforeInteractive">{`
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID}"
  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
`}</Script>
```

### 3.4 Configure tags in GTM

In the GTM UI:

1. **Variables** → New → "GA4 Measurement ID" → Constant → `G-XXXXXXXXXX`.
2. **Triggers**:
   - `page_view` → All Pages
   - `rsvp_submit` → Custom Event → Event name = `rsvp_submit`
   - `door_checkin` → Custom Event → Event name = `door_checkin`
   - `attended` → Custom Event → Event name = `attended`
3. **Tags**:
   - GA4 Configuration → measurement ID variable → trigger: All Pages
   - GA4 Event: RSVP → event name `rsvp_submit` → trigger: rsvp_submit
   - GA4 Event: Door Check-in → event name `door_checkin` → trigger: door_checkin
4. Submit → Publish.

### 3.5 Fire custom events from the app

In your RSVP / check-in / attendance code, push to dataLayer:

```ts
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: "rsvp_submit",
  event_id: rsvp.id,
  event_slug: event.slug,
});
```

This is in addition to the server-side `/api/track/event` call — both fire
with the same `event_id` for dedup.

---

## Phase 4 — Meta Pixel + Conversions API

### 4.1 Create Meta Pixel

1. Go to https://business.facebook.com/ → Events Manager.
2. Data Sources → Add → Web → Connect Manually.
3. Name: "AI Salon Tel Aviv Pixel" → Create.
4. Note the **Pixel ID** (numeric, ~15 digits).

### 4.2 Generate Conversions API access token

1. In Events Manager → Settings → Conversions API → "Set up manually".
2. Click "Generate access token". Note the token (starts with `EAA...`, ~200 chars).
3. **Optional but recommended:** Set up event deduplication. The code
   already passes `event_id` for dedup.

### 4.3 Set Vercel env vars

| Name | Value | Environments |
|---|---|---|
| `META_PIXEL_ID` | (from step 4.1) | All (public, used by browser pixel) |
| `META_ACCESS_TOKEN` | (from step 4.2) | Production only |
| `META_TEST_EVENT_CODE` | `TESTXXXXX` | Preview only (for staging tests; remove in prod) |

### 4.4 Install the Meta Pixel (browser-side)

If using GTM, add a Custom HTML tag with the pixel base code:

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${process.env.NEXT_PUBLIC_META_PIXEL_ID}');
fbq('track', 'PageView');
</script>
```

Trigger: All Pages.

Without GTM, add the same code to `src/app/layout.tsx` via `<Script>`.

### 4.5 Server-side CAPI events

The codebase already handles this. When `/api/track/event` is called:

1. Builds the Meta CAPI payload with SHA-256 hashed PII.
2. POSTs to `https://graph.facebook.com/v18.0/{META_PIXEL_ID}/events`.
3. Includes `event_id` for browser/server dedup.
4. If `META_TEST_EVENT_CODE` is set, includes `test_event_code` so events
   show up in Events Manager → Test Events (no real ad attribution).

### 4.6 Verify

1. In Events Manager → Test Events tab.
2. Set `META_TEST_EVENT_CODE` in Vercel Preview env.
3. Trigger an RSVP on the preview URL.
4. You should see `Lead` events arrive within ~5 seconds, marked as
   "Server" (CAPI) and "Browser" (pixel) — both with the same `event_id`.
5. Once verified, remove `META_TEST_EVENT_CODE` from Production env.

### 4.7 Set event ordering

In Events Manager → Settings → Event Setup → "Event ordering":

1. Purchase (highest priority)
2. CompleteRegistration (door check-in / attended)
3. Lead (RSVP)
4. EmailClick
5. EmailOpen (lowest priority)

This tells Meta which events to optimize ad campaigns for.

---

## Phase 5 — Identity stitching & GDPR

### 5.1 Identity hashing

All PII sent to Meta is SHA-256 hashed + lowercased client-side (in
`meta-capi.ts → buildMetaPayload`). Fields hashed:

- `em` (email) — required
- `fn` (first name) — optional
- `ln` (last name) — optional
- `ph` (phone) — optional, digits only
- `ct` (city) — optional
- `country` — optional, 2-letter ISO code
- `external_id` — same hash as email (used for cross-device matching)

### 5.2 Consent mode v2 (GDPR)

If you serve EU users, you MUST gate tracking on consent. Recommended:

1. Install a CMP (Cookiebot, OneTrust, Termly).
2. In GTM, enable Consent Mode v2 (Admin → Container → Consent settings).
3. Map CMP consent states to GTM consent types: `ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`.
4. Pass consent state to GA4 + Meta:
   - GA4: pass `consent` field in `sendGA4Event` (already supported).
   - Meta: pixel uses `fbq('consent', 'revoke')` until consent granted.

### 5.3 Unsubscribe link

Every email template (5 default templates in `templates.ts`) includes a
footer with `aisalon.massapro.com` link. Add a real unsubscribe link:

```html
<a href="https://aisalon.massapro.com/unsubscribe?email={{email}}">Unsubscribe</a>
```

Then build a `/unsubscribe` page that:
1. Takes `email` query param.
2. Shows "Unsubscribe from AI Salon Tel Aviv?" → Confirm button.
3. On confirm, sets `User.unsubscribedAt = now()` and excludes that user
   from future flow runs (modify `flow-worker.ts → processSendRun` to
   check `unsubscribedAt` and halt the run).

---

## Phase 6 — Cron (Vercel)

The `vercel.json` already declares:

```json
{ "crons": [
  { "path": "/api/email-orchestrator/run", "schedule": "* * * * *" }
] }
```

Vercel free tier: cron jobs run at most once per day on the Hobby plan.
**Upgrade to Pro** ($20/mo) for per-minute cron. Without Pro, the worker
runs once daily at 9 AM UTC — emails will be delayed up to 24h.

Verify cron is firing:

```bash
# Vercel dashboard → your project → Functions → Cron Jobs tab.
# Should show "Last invoked" within the last minute on Pro plan.
```

---

## Quick checklist

- [ ] Gmail: OAuth consent screen configured for `aisalon@massapro.com`
- [ ] Gmail: Refresh token obtained and set as `GOOGLE_REFRESH_TOKEN`
- [ ] Gmail: `EMAIL_PROVIDER=gmail` set on Production
- [ ] GA4: Property created, `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` set
- [ ] GA4: Browser snippet installed (directly or via GTM)
- [ ] GTM (optional): Container created, `NEXT_PUBLIC_GTM_ID` set
- [ ] Meta: Pixel created, `META_PIXEL_ID` set
- [ ] Meta: CAPI access token generated, `META_ACCESS_TOKEN` set
- [ ] Meta: `META_TEST_EVENT_CODE` set on Preview for testing
- [ ] Vercel: Redeployed after setting all env vars
- [ ] Vercel: Upgraded to Pro for per-minute cron
- [ ] Verify: RSVP triggers Lead event in GA4 + Meta Test Events
- [ ] Verify: Door check-in triggers CompleteRegistration
- [ ] Verify: Email send fires EmailOpen + EmailClick in Meta Events Manager
- [ ] GDPR: Unsubscribe page built + linked from email footer
- [ ] GDPR: Consent mode v2 enabled (if serving EU users)
