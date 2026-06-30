# Comprehensive Plan — UTM Generation, Dashboard Filter, Member Referral System, and Multi-Channel Tracking

**Platform:** AI Salon (`aisalon.massapro.com`) — Next.js 16 + Prisma + Vercel
**Reference doc:** `Affiliate UTM docs.txt` (describes the existing tracker pattern on `receptionist.massapro.com`)
**Status:** Draft v2 for approval — implementation has NOT started
**Changes from v1:** Added GA4 (`G-CC1EQ0L7L5`), Meta Pixel (`1324228136505577`), Google Tag Manager (`GTM-5BQ6MCJK`), and comprehensive conversion events catalog including `formcompleted` for onboarding

---

## 0. Critical Finding — Current State of AI Salon Codebase

The Affiliate UTM docs describe infrastructure that lives on `receptionist.massapro.com` and the external dashboard at `aff-massapro.space-z.ai`. The **AI Salon codebase is a separate Next.js app** and currently has:

- ❌ **No** GA4, Meta Pixel, or GTM loaded in `layout.tsx`
- ❌ **No** `massapro-affiliate-tracker.js` loaded
- ❌ **No** UTM capture anywhere (`utm`, `affId`, `Aff-Id` not referenced in `src/`)
- ❌ **No** `BackupTracker` library or `/api/track/*` endpoints
- ❌ **No** UTM columns on any Prisma model (`User`, `EventRsvp`, `EmailRecipient` etc. have no UTM fields)
- ❌ **No** conversion event tracking on onboarding, RSVP, signup, or contact forms
- ✅ Has `User.role` (`SUPER_ADMIN` | `ADMIN` | `CO_HOST` | `MEMBER`) — perfect for permission model
- ✅ Has admin dashboard at `/admin/dashboard` with event-dashboard subroute
- ✅ Has existing API patterns we can extend (`/api/admin/rsvps`, `/api/admin/members`)
- ✅ Has onboarding flow at `/onboarding` (where `formcompleted` will fire)

**Conclusion:** This is **greenfield** — port the tracking pattern from the doc INTO the AI Salon codebase, layer the three user-requested capabilities on top, and add the three external tracking channels (GA4 + Meta Pixel + GTM) per the user's specifications.

---

## 1. Understanding the Requests

| # | Request | What it means concretely |
|---|---------|--------------------------|
| 1 | Generate UTMs on every page + track users by UTM | Every page on the platform captures URL UTMs (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) and the affiliate ID (`Aff-Id` / `Aff Id` / `utm`), persists them across navigation, and fires a pageview event with full attribution. |
| 2 | UTM as dashboard filter parameter | Admin dashboard gains a reusable filter bar (source / medium / campaign / content / term / affId / date range). All existing analytics endpoints extended to accept these filters. New dedicated UTM analytics page. |
| 3 | Referral tracking system | Each member gets a unique referral code on signup. Share buttons on events / resources / blog / profile generate tagged URLs. Visits via referral links attributed to the referring member. Conversions (signup, RSVP, onboarding, etc.) recorded against the referrer. Member-facing "My Referrals" page. |
| 4 | **NEW:** Google Analytics 4 | Load gtag.js with property ID `G-CC1EQ0L7L5` on every page; fire GA4 events for all conversions. |
| 5 | **NEW:** Meta Pixel | Load Facebook Pixel with ID `1324228136505577` on every page; fire Meta events for all conversions. |
| 6 | **NEW:** Google Tag Manager | Load GTM container `GTM-5BQ6MCJK` on every page (head script + body noscript iframe); use GTM as the central tag manager. |
| 7 | **NEW:** Conversion events for each platform | Catalog of all conversion events (pageview, signup, RSVP, onboarding `formcompleted`, share, contact, etc.) fired across all 4 channels (GA4 + Meta + GTM dataLayer + local DB). |

---

## 2. Architecture — Four Layers on Top of GTM

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 0 — Tag Managers (loaded FIRST in <head>)                     │
│  • Google Tag Manager (GTM-5BQ6MCJK) — container script              │
│    - Loaded as high in <head> as possible                            │
│    - Body noscript iframe right after <body>                         │
│    - Manages dataLayer.push() for all custom events                  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Tracking Pixels (loaded after GTM, via Next.js Script)    │
│  • Google Analytics 4 (G-CC1EQ0L7L5) — gtag.js                       │
│  • Meta Pixel (1324228136505577) — fbevents.js                       │
│  • MassaPro Affiliate Tracker (optional — local fallback instead)   │
│  All 3 fire in parallel on every event — fire-and-forget             │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Universal UTM Context (every page, React-level)           │
│  • <UtmProvider> wraps app in layout.tsx                             │
│  • Reads URL UTMs once on mount (useState initializer — per doc)     │
│  • Resolves affId priority: Aff-Id > Aff Id > utm                    │
│  • Persists first-touch UTMs in cookie (30d, never overwritten)      │
│  • Persists last-touch UTMs in cookie (30d, updated each visit)      │
│  • Session ID in sessionStorage                                      │
│  • Fires pageview on every route change → all 4 channels             │
│  • Exposes useUtm() hook → { utmParams, affId, firstTouch, ... }    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — Member Referral System                                    │
│  • User.referralCode (unique, generated on signup)                   │
│  • <ShareButton> on events / resources / blog / profile              │
│  • Share URL: ...?Aff-Id=SAL-{userId}-{random6}                      │
│  • MemberShare table records each share action (who/what/where)      │
│  • ReferralConversion table records when referred visitor converts   │
│  • Member-facing /member/referrals page with stats + leaderboard     │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — Dashboard UTM Filter                                      │
│  • <UtmFilterBar> reusable component                                 │
│  • URL-synced filter state (shareable links)                         │
│  • All analytics APIs accept ?utm_source=&utm_medium=... params      │
│  • New /admin/analytics/utm page — top sources, campaigns, funnels   │
│  • New /admin/analytics/referrals page — member leaderboard          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tracking Channels — Concrete Implementation

### 3.1 Google Tag Manager (GTM-5BQ6MCJK)

**Purpose:** Central tag manager. All other tags (GA4, Meta Pixel) CAN be loaded via GTM if you prefer, OR loaded directly via Next.js `<Script>` for redundancy. We'll use the **hybrid approach**: GTM loads first (manages dataLayer), GA4 + Meta Pixel loaded directly via Next.js `<Script>` (so they work even if GTM is blocked).

**Head script (as high as possible):**
```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-5BQ6MCJK');</script>
<!-- End Google Tag Manager -->
```

**Body noscript (immediately after `<body>`):**
```html
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5BQ6MCJK"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
```

**In Next.js:** Use `<Script id="gtm-head" strategy="beforeInteractive" />` in the root layout's `<head>`, and inject the noscript iframe directly into the `<body>`.

### 3.2 Google Analytics 4 (G-CC1EQ0L7L5)

**Head script:**
```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-CC1EQ0L7L5"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-CC1EQ0L7L5');
</script>
```

**In Next.js:** Use `<Script id="ga4-src" src="..." strategy="afterInteractive" />` + `<Script id="ga4-init" strategy="afterInteractive">` for the inline config.

**Note:** GA4 and GTM both push to `window.dataLayer`. This is intentional — they share the same dataLayer, and GTM picks up GA4's events.

### 3.3 Meta Pixel (1324228136505577)

**Head script:**
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
fbq('init', '1324228136505577');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1324228136505577&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->
```

**In Next.js:** Use `<Script id="meta-pixel" strategy="afterInteractive">` for the inline script. Add the noscript img inside the body noscript area.

### 3.4 Local Backup Tracker (Prisma DB)

Same pattern as the doc's `BackupTracker` but local to AI Salon's Prisma DB. This is our safety net — if any external channel fails, we still have the data locally for the dashboard.

**Endpoints:** `/api/track/{pageview,click,lead,event,purchase,status}` — all fire-and-forget from the client.

---

## 4. Conversion Events Catalog — What Fires Where

Every conversion event fires across **4 channels in parallel**: GA4, Meta Pixel, GTM dataLayer, and Local Backup Tracker. Below is the complete catalog.

### 4.1 Automatic Events (fired by trackers, no app code needed)

| Event | GA4 | Meta Pixel | GTM dataLayer | Local DB |
|-------|-----|------------|---------------|----------|
| Page view | `page_view` (auto) | `PageView` (auto on init) | `gtm.js` (auto) | `PageView` row |
| Session start | `session_start` (auto) | — | — | — |

### 4.2 Navigation / Engagement Events

| User Action | GA4 Event | Meta Event | GTM dataLayer Event | Local DB Event |
|-------------|-----------|------------|---------------------|----------------|
| Click CTA button (e.g. "RSVP", "Get Tickets") | `cta_click` | `trackCustom: 'CtaClick'` | `ctaClick` | `ClickEvent` (type=button_click) |
| Open lead form / RSVP modal | `lead_form_open` | `trackCustom: 'LeadFormOpen'` | `leadFormOpen` | `ClickEvent` (event_id=lead_form_open) |
| Scroll to section (e.g. agenda, speakers) | `scroll_to_section` | — | `scrollToSection` | `ClickEvent` (type=scroll) |
| Video play (event promo video) | `video_play` | — | `videoPlay` | `ClickEvent` (event_id=video_play) |
| Video complete | `video_complete` | — | `videoComplete` | `ClickEvent` (event_id=video_complete) |

### 4.3 Conversion Events (the critical ones)

| # | User Action | GA4 Event | Meta Event | GTM dataLayer | Local DB | Notes |
|---|-------------|-----------|------------|---------------|----------|-------|
| **C1** | Sign up (new user via /login email or Google) | `sign_up` | `track: 'CompleteRegistration'` | `signUp` | `TrackedLead` (status=Lead) | **Highest priority conversion** |
| **C2** | **Onboarding form completed** | `form_completed` | `trackCustom: 'FormCompleted'` | `formCompleted` | `TrackedLead` (status=Onboarded) + `ReferralConversion` (type=onboarding) | **User-requested explicit event** — fires after `/onboarding` form submit succeeds |
| **C3** | RSVP to event | `rsvp` | `track: 'Schedule'` (if calendar) OR `trackCustom: 'Rsvp'` | `rsvp` | `TrackedLead` (status=Booked) + `ReferralConversion` (type=rsvp) | One per event RSVP |
| **C4** | Check-in at event door | `event_checkin` | `trackCustom: 'EventCheckin'` | `eventCheckin` | `ClickEvent` (event_id=event_checkin) | In-person conversion |
| **C5** | Contact form submission | `contact_form` | `track: 'Lead'` | `contactForm` | `TrackedLead` (status=Contact) | If contact form exists |
| **C6** | Member share action | `share` | `trackCustom: 'Share'` | `share` | `MemberShare` row | Tracks when member shares content |
| **C7** | Resource download (PDF etc.) | `file_download` | `trackCustom: 'FileDownload'` | `fileDownload` | `ClickEvent` (event_id=file_download) | |
| **C8** | Speaker message sent | `speaker_message` | `trackCustom: 'SpeakerMessage'` | `speakerMessage` | `ClickEvent` (event_id=speaker_message) | Engagement with speaker |
| **C9** | Profile updated (first time) | `profile_completed` | `trackCustom: 'ProfileCompleted'` | `profileCompleted` | `TrackedLead` (status=ProfileCompleted) | Onboarding-adjacent |
| **C10** | Email link click (from campaign) | `email_click` | — | `emailClick` | `ClickEvent` (event_id=email_click) | Tracks email engagement |

### 4.4 E-commerce-style Events (Future-proofing — if paid events added later)

| User Action | GA4 Event | Meta Event | GTM dataLayer | Local DB |
|-------------|-----------|------------|---------------|----------|
| Begin checkout (paid event ticket) | `begin_checkout` | `track: 'InitiateCheckout'` | `beginCheckout` | `ClickEvent` (event_id=begin_checkout) |
| Add to cart (paid event) | `add_to_cart` | `track: 'AddToCart'` | `addToCart` | `ClickEvent` (event_id=add_to_cart) |
| Purchase (paid event ticket confirmed) | `purchase` | `track: 'Purchase'` | `purchase` | `TrackedLead` (status=Paying) |

### 4.5 `formcompleted` Event — Detailed Spec

This is the user's explicit request. Fires when a user completes the onboarding form at `/onboarding`.

**Trigger:** After successful `POST /api/user/onboarding` returns 200.

**Files to modify:**
- `src/app/onboarding/page.tsx` — after `setSubmitted(true)` or equivalent
- `src/app/api/user/onboarding/route.ts` — server-side fallback (also fires server-side event for cross-channel attribution)

**Code (client-side, after success):**
```typescript
// 1. GA4
gtag('event', 'form_completed', {
  event_category: 'engagement',
  event_label: 'Onboarding Form Completed',
  page_name: 'Onboarding',
  method: 'email_or_google',  // or however the user signed up
})

// 2. Meta Pixel
fbq('trackCustom', 'FormCompleted', {
  page_name: 'Onboarding',
  source: 'onboarding_form',
})

// 3. GTM dataLayer
window.dataLayer = window.dataLayer || []
window.dataLayer.push({
  event: 'formCompleted',
  pageName: 'Onboarding',
  source: 'onboarding_form',
  timestamp: new Date().toISOString(),
})

// 4. Local Backup Tracker
BackupTracker.trackLead({
  name: `${user.name}`,
  email: user.email,
  phone: user.mobile,
  company: user.company,
  planType: 'Member',
  // UTMs auto-attached from cookies
})

// 5. Referral conversion (if affId present)
if (affId?.startsWith('SAL-')) {
  await recordConversion({
    referringUserId: (await resolveReferral(affId))?.id,
    conversionType: 'onboarding',
    conversionRef: user.id,
    affId,
    utmSnapshot: utmParams,
    sessionId,
    referredEmail: user.email,
    referredUserId: user.id,
  })
}
```

**Verification:**
- GA4 DebugView shows `form_completed` event with params
- Meta Pixel Helper browser extension shows `FormCompleted` custom event
- GTM Preview mode shows `formCompleted` dataLayer push
- `TrackedLead` row created in Prisma DB with `initialStatus='Onboarded'`
- `ReferralConversion` row created if visitor arrived via member referral link

---

## 5. Phase Breakdown — 7 Waves

### Wave 0 — Discovery (½ day, in-progress)

- [x] Survey AI Salon codebase (done — see section 0)
- [x] Confirm external tracking IDs (done — see section 3)
- [ ] Confirm decisions (see section 8)
- [ ] Identify all forms that need conversion tracking:
  - `/onboarding` form → `formcompleted` event
  - RSVP form (public event page) → `rsvp` event
  - Signup form (`/login` email signup) → `sign_up` event
  - Contact form (if exists) → `contact_form` event
  - Speaker message form → `speaker_message` event
- [ ] Identify all CTAs that need `cta_click` events
- [ ] Identify all admin dashboard pages that should gain the UTM filter bar

### Wave 1 — Foundation: Tag Managers + Tracking Pixels + UTM Context (3 days)

**Goal:** Load GTM, GA4, Meta Pixel globally; capture UTMs on every page; fire pageviews; create `/api/track/*` endpoints.

**Files to create:**
- `src/lib/tracking/tracking-ids.ts` — central constants:
  ```typescript
  export const GTM_ID = 'GTM-5BQ6MCJK'
  export const GA4_ID = 'G-CC1EQ0L7L5'
  export const META_PIXEL_ID = '1324228136505577'
  ```
- `src/lib/tracking/gtm.ts` — `pushToDataLayer(event)` helper
- `src/lib/tracking/ga4.ts` — `trackGa4Event(eventName, params)` typed wrapper
- `src/lib/tracking/meta-pixel.ts` — `trackMetaEvent(eventName, params)` typed wrapper
- `src/lib/tracking/backup-tracker.ts` — local fallback (mirrors doc §10), writes to `/api/track/*`
- `src/lib/tracking/track-event.ts` — **unified `trackEvent(name, params)`** that fires to ALL 4 channels in parallel
- `src/lib/tracking/utm-context.tsx` — `<UtmProvider>` + `useUtm()` hook
- `src/lib/tracking/utm-types.ts` — `UtmParams`, `AffIdResolution` types
- `src/lib/tracking/utm-link-helper.ts` — `appendUtmsToUrl()`, `buildShareUrl()`
- `src/lib/tracking/use-pageview-tracker.ts` — fires pageview on route change
- `src/lib/tracking/safe-call.ts` — `safeTrackCall()` wrapper (per doc §12.3, expanded for all channels)
- `src/app/api/track/pageview/route.ts` — POST endpoint
- `src/app/api/track/click/route.ts` — POST endpoint
- `src/app/api/track/lead/route.ts` — POST endpoint
- `src/app/api/track/event/route.ts` — POST + GET (1x1 GIF) endpoints
- `src/app/api/track/purchase/route.ts` — POST endpoint (future-proofing)
- `src/app/api/track/status/route.ts` — PUT endpoint (future-proofing)
- `src/components/tracking/cookie-consent-banner.tsx` — GDPR banner (loads before trackers)

**Files to modify:**
- `src/app/layout.tsx` — load GTM (beforeInteractive), GA4 + Meta Pixel (afterInteractive), wrap children with `<UtmProvider>`, add `<CookieConsentBanner>`, inject GTM noscript iframe
- `prisma/schema.prisma` — add new models (see section 6)

**Prisma models to add (Wave 1):**
```prisma
model PageView {
  id            String   @id @default(cuid())
  sessionId     String
  affId         String?
  pageUrl       String
  pagePath      String
  referrer      String?
  userAgent     String?
  ipAddress     String?
  utmSource     String?
  utmMedium     String?
  utmCampaign   String?
  utmContent    String?
  utmTerm       String?
  ftUtmSource   String?  // first-touch
  ftUtmMedium   String?
  ftUtmCampaign String?
  ftUtmContent  String?
  ftUtmTerm     String?
  createdAt     DateTime @default(now())

  @@index([createdAt])
  @@index([affId])
  @@index([utmSource, utmMedium])
  @@index([sessionId])
}

model ClickEvent {
  id            String   @id @default(cuid())
  sessionId     String
  affId         String?
  eventType     String   // "pageview" | "button_click" | "funnel_step" | "scroll" | "video"
  eventId       String?  // e.g. "btn_get_now", "video_complete"
  pageUrl       String
  metadata      Json?
  utmSource     String?
  utmMedium     String?
  utmCampaign   String?
  createdAt     DateTime @default(now())

  @@index([createdAt])
  @@index([affId])
  @@index([eventType])
}

model TrackedLead {
  id            String   @id @default(cuid())
  sessionId     String
  affId         String?
  name          String
  email         String?
  phone         String?
  company       String?
  planType      String?
  initialStatus String?  // "Lead" | "Onboarded" | "Booked" | "Contact" | "Paying" | "ProfileCompleted"
  conversionType String? // "signup" | "onboarding" | "rsvp" | "contact" | "purchase" | "profile"
  conversionRef  String? // ID of the converted entity (User.id, EventRsvp.id, etc.)
  utmSource     String?
  utmMedium     String?
  utmCampaign   String?
  utmContent    String?
  utmTerm       String?
  ftUtmSource   String?
  ftUtmMedium   String?
  ftUtmCampaign String?
  ftUtmContent  String?
  ftUtmTerm     String?
  createdAt     DateTime @default(now())

  @@index([createdAt])
  @@index([affId])
  @@index([email])
  @@index([conversionType])
}
```

**Test plan (Wave 1):**
1. Visit `/?utm_source=facebook&utm_medium=paid_social&utm_campaign=test#1`
2. Verify GTM, GA4, Meta Pixel all load (DevTools → Network)
3. Verify cookie `massapro_ft` set with first-touch UTMs
4. Verify `PageView` row created in DB
5. Verify GA4 Realtime shows active user
6. Verify Meta Pixel Helper shows `PageView` event
7. Verify GTM Preview mode shows `gtm.js` and `page_view`
8. Navigate to `/events/ai-salon-human` — verify new `PageView` row, same `sessionId`, last-touch UTMs updated
9. Verify `massapro_ft` cookie unchanged after second navigation

### Wave 2 — Conversion Event Wiring (2 days)

**Goal:** Wire every conversion event from Section 4 catalog into the actual codebase.

**Files to modify (per conversion):**

| Conversion | File | Action |
|------------|------|--------|
| C1: Sign up | `src/app/api/auth/signup/route.ts` + signup page | Call `trackEvent('sign_up', {...})` after success |
| **C2: formcompleted (onboarding)** | `src/app/onboarding/page.tsx` + `src/app/api/user/onboarding/route.ts` | Call `trackEvent('form_completed', {...})` after success — see section 4.5 for detailed code |
| C3: RSVP | Public RSVP API route + RSVP UI component | Call `trackEvent('rsvp', {...})` after success |
| C4: Check-in | `src/app/api/admin/check-in/lookup/route.ts` + check-in UI | Call `trackEvent('event_checkin', {...})` after success |
| C5: Contact | Contact form API (if exists) | Call `trackEvent('contact_form', {...})` after success |
| C6: Share | `src/app/api/member/share/route.ts` (created in Wave 3) | Call `trackEvent('share', {...})` |
| C7: Resource download | Download endpoint | Call `trackEvent('file_download', {...})` |
| C8: Speaker message | `src/app/api/speakers/[id]/messages/route.ts` | Call `trackEvent('speaker_message', {...})` |
| C9: Profile completed | Profile update endpoint | Call `trackEvent('profile_completed', {...})` |
| C10: Email click | Existing email tracking endpoint | Call `trackEvent('email_click', {...})` |

**Pattern (every conversion):**
```typescript
// After successful operation:
await trackEvent('form_completed', {
  // Standard params (auto-attached):
  page_name: 'Onboarding',
  // Custom params:
  method: 'email',
  user_id: user.id,
  // UTMs auto-attached by trackEvent() helper
})
// trackEvent() fires to all 4 channels in parallel (fire-and-forget)
```

**`trackEvent()` unified helper signature:**
```typescript
async function trackEvent(
  name: string,
  params?: Record<string, any>,
  options?: {
    serverSide?: boolean   // if true, also fires server-side via /api/track/event
    skipChannels?: ('ga4' | 'meta' | 'gtm' | 'local')[]
  }
): Promise<void>
```

### Wave 3 — Member Referral System (3 days)

**Goal:** Each member has a referral code; share buttons everywhere; conversions attributed.

**Prisma models to add:**
```prisma
model User {
  // ... existing fields
  referralCode        String?   @unique  // "SAL-{base36id}-{random6}"
  referralCodeSetAt    DateTime?
  shares               MemberShare[]
  referrals            ReferralConversion[] @relation("ReferringMember")
}

model MemberShare {
  id            String   @id @default(cuid())
  userId        String   // member who shared
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  contentType   String   // "event" | "resource" | "blog" | "profile" | "page"
  contentSlug   String   // e.g. "ai-salon-human"
  shareUrl      String   // full URL with affId appended
  platform      String?  // "twitter" | "linkedin" | "whatsapp" | "email" | "copy"
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime @default(now())

  @@index([userId, createdAt])
  @@index([contentSlug, contentType])
  @@index([createdAt])
}

model ReferralConversion {
  id                String   @id @default(cuid())
  referringUserId   String   // member whose code was used
  referringUser     User     @relation("ReferringMember", fields: [referringUserId], references: [id], onDelete: Cascade)
  referredEmail     String?  // visitor email (if known)
  referredUserId    String?  // user id if they signed up
  conversionType    String   // "signup" | "onboarding" | "rsvp" | "event_join" | "resource_download" | "contact" | "profile"
  conversionRef     String?  // ID of converted entity (e.g. EventRsvp.id, User.id)
  affId             String   // the code used (e.g. "SAL-1A-X7K2MP")
  utmSnapshot       Json?    // full UTM snapshot at conversion
  sessionId         String?
  createdAt         DateTime @default(now())

  @@unique([referringUserId, conversionType, conversionRef])  // prevent dupes
  @@index([referringUserId, createdAt])
  @@index([affId])
  @@index([conversionType])
}
```

**Files to create:**
- `src/lib/referral/generate-code.ts` — `generateReferralCode(userId)` → `SAL-{base36(userId)}-{random6}`
- `src/lib/referral/resolve-referral.ts` — `resolveReferral(affId)` → User | null
- `src/lib/referral/record-conversion.ts` — `recordConversion({ affId, type, ref, email, userId, utm })`
- `src/components/share/share-button.tsx` — reusable share button (copy/Twitter/LinkedIn/WhatsApp/Email)
- `src/components/share/share-menu.tsx` — dropdown with platform options
- `src/app/api/member/share/route.ts` — POST records a share action
- `src/app/api/member/shares/route.ts` — GET lists user's shares (paginated)
- `src/app/api/member/referrals/route.ts` — GET lists user's referral conversions
- `src/app/api/member/referral-code/route.ts` — GET returns current user's code (auto-generates if missing)
- `src/app/member/referrals/page.tsx` — member-facing "My Referrals" dashboard

**Files to modify:**
- `src/app/api/auth/signup/route.ts` — generate referral code on signup; if `affId` present, record `ReferralConversion` (type=signup)
- `src/app/api/user/onboarding/route.ts` — if `affId` present, record `ReferralConversion` (type=onboarding) — fires alongside `formcompleted` event
- `src/app/api/admin/rsvps/route.ts` (and the public RSVP endpoint) — record `ReferralConversion` (type=rsvp) when affId present
- `src/app/events/[slug]/page.tsx` — add `<ShareButton>` to event header
- `src/app/resources/[slug]/page.tsx` (or equivalent) — add `<ShareButton>`
- All blog post pages (if exist) — add `<ShareButton>`
- Member profile page — add `<ShareButton>` (share profile)

**ShareButton UX:**
- Dropdown button with share icon
- Click → modal/popover with:
  - Pre-filled share URL (with member's referral code)
  - Copy button + toast confirmation
  - Direct share buttons: Twitter/X, LinkedIn, WhatsApp, Email (mailto)
  - "Track this share" — automatically fires `POST /api/member/share` + `trackEvent('share', {...})`
- For logged-out visitors: button becomes "Login to share & track referrals"

### Wave 4 — UTM Dashboard Filter (2 days)

**Goal:** Admin can filter all analytics by UTM dimensions; new dedicated UTM analytics pages.

**Files to create:**
- `src/components/admin/utm-filter-bar.tsx` — reusable filter component
- `src/components/admin/utm-filter-bar-state.ts` — URL-synced state hook
- `src/lib/admin/utm-filter.ts` — `buildUtmWhereClause(searchParams)`, `getDistinctUtmValues(field)`
- `src/app/admin/analytics/utm/page.tsx` — UTM analytics dashboard
- `src/app/admin/analytics/referrals/page.tsx` — referral analytics dashboard
- `src/app/api/admin/analytics/utm-summary/route.ts` — aggregated UTM stats
- `src/app/api/admin/analytics/referral-summary/route.ts` — aggregated referral stats
- `src/app/api/admin/analytics/distinct-utm/route.ts` — for filter dropdown population
- `src/app/api/admin/analytics/conversions/route.ts` — aggregated conversion funnel (per channel + per UTM)

**Files to modify:**
- Existing `/api/admin/rsvps` — accept `?utm_source=&utm_medium=...` params
- Existing `/api/admin/members` — accept UTM filter params (filter members by their referral source)
- Existing admin dashboard pages — add `<UtmFilterBar>` at top

**UtmFilterBar features:**
- Multi-select dropdowns for `utm_source`, `utm_medium`, `utm_campaign` (populated from DB distinct values)
- Single-select for `utm_content`, `utm_term`
- AffId picker (searchable: shows member referral codes + external affiliates)
- Date range picker
- "Apply" / "Reset" / "Save view" buttons
- URL-synced state so filter views are shareable
- "Copy filtered URL" button for sharing a filtered view with another admin

**New `/admin/analytics/utm` page shows:**
- Top sources (bar chart — visitors / signups / RSVPs per source)
- Top campaigns (bar chart)
- Source → Medium → Campaign treemap or sunburst
- Conversion funnel by source (visits → signups → onboarding → RSVPs → check-ins)
- Raw event log table with UTM columns + export to CSV

**New `/admin/analytics/referrals` page shows:**
- Top referring members (table — shares / visits / conversions / conversion rate)
- Top shared content (table — shares / clicks / conversions per piece of content)
- Share platform breakdown (pie chart — Twitter vs LinkedIn vs Email vs Copy)
- Recent conversions feed (real-time list of referral conversions)
- Member referral code lookup (admin can manually look up a code → see who it belongs to)

**New `/admin/analytics/conversions` page shows:**
- Conversion funnel (visits → signups → onboarding → RSVPs → check-ins)
- Conversion rate by channel (GA4 vs Meta vs referral)
- Conversion rate by UTM source/medium
- Conversion timeline (last 30 days)

### Wave 5 — Polish + Cookie Banner + Tests (1 day)

- Cookie consent banner (legal compliance — we're setting 30-day tracking cookies)
- Banner must load BEFORE tracker scripts
- Visitor can accept all / reject all / customize (analytics only, marketing only)
- If rejected: tracker still loads but doesn't set long-term cookies (session-only)
- E2E test: full referral funnel (member shares → visitor clicks → visitor signs up + completes onboarding → `formcompleted` fires → conversion recorded → member sees it in /member/referrals)
- Performance test: pageview tracking doesn't slow down navigation (Lighthouse check)
- DB size monitoring: PageView table will grow fast — add 90-day TTL scheduled cleanup (Vercel cron)

### Wave 6 — Deploy + Backup (½ day)

- Run migration on production DB
- Deploy to Vercel
- Smoke test on production (visit with test UTMs, verify all 4 channels fire)
- Run `scripts/make-milestone-backup.sh` for V5.14 milestone
- Push to origin/main + GitHub release

---

## 6. Prisma Schema Changes Summary

### New models (5)
- `PageView` — every page load with full UTM attribution
- `ClickEvent` — every button click, scroll, video event
- `TrackedLead` — every conversion (signup, onboarding, RSVP, etc.)
- `MemberShare` — every share action by a member
- `ReferralConversion` — every conversion attributed to a referrer

### Modified models (1)
- `User` — add `referralCode String? @unique` + `referralCodeSetAt DateTime?` + relations to `MemberShare[]` and `ReferralConversion[]`

---

## 7. File Inventory Summary

### New files (count: ~35)
| Path | Purpose |
|------|---------|
| `src/lib/tracking/tracking-ids.ts` | Central constants (GTM_ID, GA4_ID, META_PIXEL_ID) |
| `src/lib/tracking/gtm.ts` | `pushToDataLayer(event)` helper |
| `src/lib/tracking/ga4.ts` | `trackGa4Event(eventName, params)` typed wrapper |
| `src/lib/tracking/meta-pixel.ts` | `trackMetaEvent(eventName, params)` typed wrapper |
| `src/lib/tracking/backup-tracker.ts` | Local fallback tracker |
| `src/lib/tracking/track-event.ts` | **Unified `trackEvent(name, params)` — fires to all 4 channels** |
| `src/lib/tracking/utm-context.tsx` | Universal UTM context provider |
| `src/lib/tracking/utm-types.ts` | Types |
| `src/lib/tracking/utm-link-helper.ts` | URL helpers |
| `src/lib/tracking/use-pageview-tracker.ts` | Pageview hook |
| `src/lib/tracking/safe-call.ts` | Safe wrapper |
| `src/lib/referral/generate-code.ts` | Referral code generator |
| `src/lib/referral/resolve-referral.ts` | affId → User lookup |
| `src/lib/referral/record-conversion.ts` | Conversion recorder |
| `src/components/tracking/cookie-consent-banner.tsx` | GDPR cookie banner |
| `src/components/share/share-button.tsx` | Share button |
| `src/components/share/share-menu.tsx` | Share dropdown |
| `src/components/admin/utm-filter-bar.tsx` | Admin filter UI |
| `src/components/admin/utm-filter-bar-state.ts` | URL-synced filter state |
| `src/lib/admin/utm-filter.ts` | Query helpers |
| `src/app/api/track/pageview/route.ts` | Tracking endpoint |
| `src/app/api/track/click/route.ts` | Tracking endpoint |
| `src/app/api/track/lead/route.ts` | Tracking endpoint |
| `src/app/api/track/event/route.ts` | Tracking endpoint |
| `src/app/api/track/purchase/route.ts` | Tracking endpoint (future) |
| `src/app/api/track/status/route.ts` | Tracking endpoint (future) |
| `src/app/api/member/share/route.ts` | Share action recorder |
| `src/app/api/member/shares/route.ts` | List user's shares |
| `src/app/api/member/referrals/route.ts` | List user's referrals |
| `src/app/api/member/referral-code/route.ts` | Get/generate code |
| `src/app/api/admin/analytics/utm-summary/route.ts` | Aggregated UTM stats |
| `src/app/api/admin/analytics/referral-summary/route.ts` | Aggregated referral stats |
| `src/app/api/admin/analytics/conversions/route.ts` | Conversion funnel |
| `src/app/api/admin/analytics/distinct-utm/route.ts` | Filter dropdown data |
| `src/app/member/referrals/page.tsx` | Member dashboard |
| `src/app/admin/analytics/utm/page.tsx` | Admin UTM analytics |
| `src/app/admin/analytics/referrals/page.tsx` | Admin referral analytics |
| `src/app/admin/analytics/conversions/page.tsx` | Admin conversion funnel |

### Modified files (count: ~15)
| Path | Change |
|------|--------|
| `src/app/layout.tsx` | Load GTM (beforeInteractive), GA4 + Meta Pixel (afterInteractive), wrap with UtmProvider, add CookieConsentBanner, inject GTM noscript iframe |
| `prisma/schema.prisma` | Add PageView, ClickEvent, TrackedLead, MemberShare, ReferralConversion models; add `referralCode` to User |
| `src/app/api/auth/signup/route.ts` | Generate referral code; record signup conversion; fire `sign_up` event |
| `src/app/api/user/onboarding/route.ts` | Fire `form_completed` event; record onboarding referral conversion |
| `src/app/onboarding/page.tsx` | Fire `form_completed` event client-side after success |
| `src/app/api/admin/rsvps/route.ts` | Accept UTM filters; record RSVP conversion |
| Public RSVP / contact endpoints | Spread UTMs + record conversions |
| `src/app/events/[slug]/page.tsx` | Add ShareButton |
| `src/app/resources/[slug]/page.tsx` | Add ShareButton |
| Existing admin dashboard pages | Add UtmFilterBar |
| Speaker message endpoint | Fire `speaker_message` event |
| Check-in endpoint | Fire `event_checkin` event |

---

## 8. Decisions Needed Before Implementation

Please confirm/clarify each — my recommendation in **bold**:

### D1. MassaPro Affiliate Tracker (external `aff-massapro.space-z.ai`)
- (a) Use the external tracker script + dashboard (per the doc)
- (b) **Skip external tracker — local-only** (Prisma DB + GA4 + Meta + GTM is enough)
- (c) Hybrid: use external tracker for affiliate IDs, local DB for member referrals

**Recommendation: (b) local-only** — simpler, no external dep, full control. The doc's pattern is replicated locally. We can integrate with `aff-massapro.space-z.ai` later if cross-property attribution becomes important.

### D2. Referral code format
- (a) `SAL-{userIdBase36}-{random6}` (e.g. `SAL-1A-X7K2MP`) — opaque, non-guessable
- (b) `SAL-{userSlug}` (e.g. `SAL-john-smith`) — readable, but exposes username
- (c) `MP-SAL-{userId}-{random6}` — aligns with doc's `MP-XXX-001` convention

**Recommendation: (a)** — opaque codes protect privacy and prevent enumeration attacks.

### D3. Rewards / gamification
- (a) Just track counts (no rewards)
- (b) **Points system + badges** (e.g. "Ambassador" badge for 10 referrals)
- (c) Real commission (like the external affiliate system — needs payment integration)

**Recommendation: (b)** for v1 — gamification drives engagement without financial complexity.

### D4. Scope of share buttons
- (a) Events only
- (b) **Events + resources + blog posts + member profiles**
- (c) Every page on the platform

**Recommendation: (b)** — covers the main shareable surfaces. Universal share button on every page (option c) is overkill and clutters UI.

### D5. Dashboard filter placement
- (a) New dedicated `/admin/analytics/utm` page only
- (b) Filter bar on existing dashboard pages only
- (c) **Both** — dedicated UTM page + filter bar on existing pages

**Recommendation: (c)** — gives admins both broad analytics and per-page filtering.

### D6. Cookie consent
- (a) **Add cookie banner** (GDPR / Israeli privacy law compliance)
- (b) Skip banner — assume implicit consent

**Recommendation: (a)** — we're setting 30-day tracking cookies; legal compliance is required.

### D7. Pageview tracking volume
- (a) Fire on every page view (could be 10k+/day for active community)
- (b) **Fire on every page view + 90-day TTL archival job**
- (c) Sample (e.g. fire on 50% of pageviews)

**Recommendation: (b)** — full fidelity + automated cleanup keeps DB manageable.

### D8. Notify referring member on conversion
- (a) Email notification
- (b) In-app notification only
- (c) **Both email + in-app**
- (d) No notification

**Recommendation: (c)** — drives engagement by closing the feedback loop.

### D9. Public vs private referrals
- (a) **Referral counts visible on member profile** (e.g. "Referred 5 members")
- (b) Referral activity private (only visible to the member + admins)

**Recommendation: (a)** — public counts add social proof and gamification. Detailed referral list (who specifically) stays private.

### D10. Backfill existing users
- (a) **Auto-generate referral codes for all existing users via migration script**
- (b) Generate on first login only (lazy)

**Recommendation: (a)** — every member can share immediately after deploy.

### D11. **NEW:** Load GA4 + Meta Pixel via GTM, or directly?
- (a) **Load directly via Next.js `<Script>`** — works even if GTM is blocked; simpler debugging
- (b) Load via GTM container config — single source of truth, but requires GTM UI setup

**Recommendation: (a)** — direct loading is more resilient and doesn't require GTM dashboard configuration. GTM is still loaded (for future tags + dataLayer management) but isn't a single point of failure.

### D12. **NEW:** Server-side conversion tracking (CAPI)?
- (a) **Client-side only for v1** — simpler, fires all 4 channels from browser
- (b) Add server-side CAI (Conversions API) for Meta + GA4 Measurement Protocol — more accurate, survives ad blockers, but more complex

**Recommendation: (a) for v1, (b) for v2** — get the foundation working first, then add server-side as an enhancement. Note: the local `BackupTracker` already gives us server-side data for the dashboard, so we have a safety net.

---

## 9. Risk + Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DB bloat from PageView tracking | High | Medium | 90-day TTL scheduled cleanup job (Vercel cron) |
| Cookie banner blocks tracker → lost data | Medium | High | Load tracker after consent; default to "analytics only" for logged-in members |
| Members spamming share links for gamification | Medium | Low | Rate-limit share API (10/min/user); leaderboard weights conversion rate, not raw share count |
| Referral code collision | Low | Low | Use cuid-based random suffix; retry on unique constraint violation |
| External tracker scripts (GA4/Meta/GTM) fail to load | Medium | Low | Backup tracker (local) catches all events as fallback |
| Existing user backfill runs slow | Low | Low | Migration script batches 1000 users at a time |
| Performance: pageview fires block navigation | Low | High | Fire-and-forget with `keepalive: true`; never `await` on tracking calls |
| PII in URL UTMs (e.g. email in utm_campaign) | Low | Medium | Sanitize UTM values server-side; never log raw PII |
| `formcompleted` event lost if user closes tab during onboarding submit | Medium | Medium | Fire event client-side immediately + server-side fallback in API route |
| Ad blockers prevent GA4/Meta from loading | High | Medium | Local backup tracker catches all events; dashboard uses local data as primary source |

---

## 10. Implementation Order — Dependency Graph

```
Wave 0 (Discovery) ──► Wave 1 (Foundation: GTM + GA4 + Meta + UTM context + /api/track/*)
                                │
                                ├──► Wave 2 (Conversion Event Wiring — including formcompleted)
                                │          │
                                │          └──► Wave 3 (Member Referral System) ──┐
                                │                                                    │
                                └──► Wave 4 (Dashboard Filter) ─────────────────────┤
                                                                                     │
                                                                                     └──► Wave 5 (Polish + Cookie Banner + Tests)
                                                                                                │
                                                                                                └──► Wave 6 (Deploy + Backup)
```

**Total estimated effort: ~11-12 days of focused work**, broken into 7 waves (up from 9-10 in v1 due to added GTM + multi-channel conversion event wiring).

---

## 11. Testing Strategy

### Per-Wave Tests
- **Wave 1:** Visit any page with UTMs → verify all 4 channels load (DevTools Network); verify DB row created; check cookies; verify GA4 Realtime + Meta Pixel Helper + GTM Preview mode
- **Wave 2:** Submit onboarding form → verify `formcompleted` fires on all 4 channels (GA4 DebugView, Meta Pixel Helper, GTM Preview, local DB row); verify referral conversion recorded if affId present
- **Wave 3:** Logged-in member clicks Share → verify URL contains their code; visit share URL → verify attribution; sign up via share URL → verify ReferralConversion row created
- **Wave 4:** Apply UTM filter → verify URL changes; reload → verify filter persists; share filtered URL with another admin → verify same filter applied
- **Wave 5:** Cookie banner accept/reject → verify tracker respects choice; performance test (Lighthouse) → verify no significant regression; E2E full funnel test

### Test URLs (mirrors doc §11, adapted for AI Salon)
```
# Full UTM + Affiliate
https://aisalon.massapro.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=spring_launch&utm_content=hero_cta&utm_term=ai+salon&Aff-Id=SAL-1A-X7K2MP

# Affiliate only
https://aisalon.massapro.com/events/ai-salon-human?Aff-Id=SAL-1A-X7K2MP

# UTMs only (no affiliate)
https://aisalon.massapro.com/resources/ai-human-flourishing?utm_source=google&utm_medium=cpc&utm_campaign=brand_search

# Organic (no params)
https://aisalon.massapro.com/
```

### Conversion Event Verification Checklist
For each conversion event in Section 4 catalog, verify:
- [ ] GA4 DebugView shows the event with correct params
- [ ] Meta Pixel Helper shows the event
- [ ] GTM Preview mode shows the dataLayer push
- [ ] Local DB row created (TrackedLead or ClickEvent)
- [ ] (If referral) ReferralConversion row created
- [ ] (If applicable) Email notification sent to referring member

---

## 12. Open Questions

1. Does the AI Salon platform have a **blog** section? (Mentioned in scope — need to verify)
2. Is there an existing **cookie banner** component we should reuse, or build new?
3. Should referral conversions trigger **email notifications immediately**, or batched daily?
4. Should we add a **leaderboard** to the public site (top referrers this month), or keep private to admin?
5. Should **archived members** keep their referral codes (so old links still work), or invalidate them?
6. **NEW:** Should we configure GTM container in the GTM dashboard to also fire GA4/Meta (D11), or rely solely on direct Next.js `<Script>` loading?
7. **NEW:** For the `formcompleted` event — should it fire BEFORE or AFTER the API response? (Recommendation: AFTER, so we only track successful submissions)
8. **NEW:** Should we add a server-side conversion API (CAPI) for Meta + GA4 Measurement Protocol in v1 (D12), or wait for v2?

---

## 13. Awaiting Approval

Before I start implementation, please confirm:

- ✅ Plan structure v2 (or request changes)
- ✅ Decisions **D1–D12** (or just say "go with recommendations")
- ✅ Wave order (or request parallelization where possible)
- ✅ Answers to the 8 open questions in section 12
- ✅ Confirmation that ~11-12 days of effort is acceptable for this scope (or tell me to descope)

Once approved, I'll start with **Wave 0 completion (final discovery) → Wave 1 (foundation)** and proceed sequentially through the dependency graph.

---

## 14. Change Log

### v2 (current) — Added tracking channels
- Added Google Tag Manager (`GTM-5BQ6MCJK`) — Wave 1
- Added Google Analytics 4 (`G-CC1EQ0L7L5`) — Wave 1
- Added Meta Pixel (`1324228136505577`) — Wave 1
- Added **Conversion Events Catalog** (Section 4) — 10 conversion events across 4 channels
- Added `formcompleted` event spec for onboarding (Section 4.5)
- Added unified `trackEvent()` helper that fires to all 4 channels in parallel
- Added Wave 2 (Conversion Event Wiring) as a dedicated phase
- Added 2 new decisions (D11: GTM loading strategy, D12: Server-side CAPI)
- Added 3 new open questions (Q6, Q7, Q8)
- Updated file inventory (35 new files, up from 30)
- Updated effort estimate (11-12 days, up from 9-10)

### v1 (initial)
- Original plan with 3 layers (UTM context, referral system, dashboard filter)
- 10 decisions (D1–D10)
- 5 open questions
- 9-10 day effort estimate
