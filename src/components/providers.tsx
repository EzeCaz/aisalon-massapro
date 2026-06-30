"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, Suspense } from "react";
import { UtmProvider } from "@/lib/tracking/utm-context";
import {
  CookieConsentBanner,
  loadConsentFromCookie,
} from "@/components/tracking/cookie-consent-banner";
import type { ConsentState } from "@/lib/tracking/tracking-ids";

/**
 * Inner component that has access to the NextAuth session (so we can
 * pass the user ID to UtmProvider for user-scoped tracking).
 *
 * Wrapped in <Suspense> because UtmProvider calls useSearchParams(),
 * which Next.js 15 requires to be inside a Suspense boundary when
 * used at the layout level (otherwise static prerender bails out).
 */
function TrackingLayer({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id as string | undefined;

  const [consent, setConsent] = useState<ConsentState | null>(null);
  useEffect(() => {
    setConsent(loadConsentFromCookie());
  }, []);

  return (
    <Suspense fallback={null}>
      <UtmProvider userId={userId}>
        {children}
        <CookieConsentBanner consent={consent} onConsentChange={setConsent} />
      </UtmProvider>
    </Suspense>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      })
  );
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <QueryClientProvider client={qc}>
          <TrackingLayer>{children}</TrackingLayer>
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
