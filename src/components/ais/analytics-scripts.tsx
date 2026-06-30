"use client";

import * as React from "react";
import { useCookieConsent } from "@/components/ais/cookie-consent-banner";

/**
 * AnalyticsScripts — injects GA4 and Meta Pixel scripts into <head>
 * ONLY after the user has clicked "Accept All" on the cookie consent
 * banner.
 *
 * Props:
 *   ga4MeasurementId — e.g. "G-XXXXXXXXXX" (empty string = GA4 disabled)
 *   metaPixelId      — e.g. "123456789012345" (empty string = Pixel disabled)
 *
 * Behavior:
 *   - On mount, reads the consent state from localStorage.
 *   - If consent is "all", injects the GA4 gtag.js script + Meta Pixel
 *     base code into <head> via next/script.
 *   - Listens for the `cookieConsentChanged` event. If the user later
 *     clicks "Accept All", the scripts are injected on demand. If they
 *     click "Essential only" after accepting, the page is reloaded
 *     (the only reliable way to STOP analytics scripts once loaded —
 *     GA4 and Meta Pixel don't expose a "stop" API).
 *   - If no IDs are configured (admin hasn't set them in /admin/images),
 *     this component renders nothing.
 *
 * Privacy:
 *   - GA4's gtag.js is loaded with `anonymize_ip: true` by default.
 *   - Meta Pixel's `fbq` is loaded with the standard init/track call.
 *   - Both scripts are deferred until consent → no tracking before
 *     the user opts in.
 */

type Props = {
  ga4MeasurementId?: string | null;
  metaPixelId?: string | null;
};

export function AnalyticsScripts({ ga4MeasurementId, metaPixelId }: Props) {
  const consent = useCookieConsent();
  const hasGa4 = !!ga4MeasurementId && /^G-[A-Z0-9]{6,}$/.test(ga4MeasurementId);
  const hasPixel = !!metaPixelId && /^\d{10,20}$/.test(metaPixelId);
  const [scriptsInjected, setScriptsInjected] = React.useState(false);

  // Watch for consent changes — if the user REVOKES consent ( clicks
  // "Essential only" after previously accepting ), reload the page so
  // the analytics scripts are removed.
  React.useEffect(() => {
    if (consent !== "all" && scriptsInjected) {
      // Force reload to strip GA4 + Pixel from the page
      window.location.reload();
    }
  }, [consent, scriptsInjected]);

  if (consent !== "all") return null;
  if (!hasGa4 && !hasPixel) return null;

  // Mark scripts as injected (so the revocation effect can detect changes)
  if (!scriptsInjected) {
    // Use a microtask to set state (avoid React warning about setState in render)
    Promise.resolve().then(() => setScriptsInjected(true));
  }

  return (
    <>
      {hasGa4 && (
        <>
          {/* GA4 gtag.js — async, in <head> via next/script (handled by React 18+ <script> with precedence) */}
          <script
            // @ts-expect-error — `precedence` is a React 19 feature, not in older types
            precedence="high"
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4MeasurementId}`}
          />
          <script
            // @ts-expect-error — `precedence` is a React 19 feature
            precedence="high"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('consent', 'update', {
                  'analytics_storage': 'granted',
                  'ad_storage': 'granted',
                  'ad_user_data': 'granted',
                  'ad_personalization': 'granted'
                });
                gtag('config', '${ga4MeasurementId}', {
                  anonymize_ip: true,
                  cookie_flags: 'SameSite=None;Secure'
                });
                console.log('[analytics] GA4 loaded: ${ga4MeasurementId}');
              `,
            }}
          />
        </>
      )}
      {hasPixel && (
        <script
          // @ts-expect-error — `precedence` is a React 19 feature
          precedence="high"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
              console.log('[analytics] Meta Pixel loaded: ${metaPixelId}');
            `,
          }}
        />
      )}
    </>
  );
}
