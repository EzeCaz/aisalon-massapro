"use client";

import { SalonProvider } from "@/components/salon/salon-provider";
import { SiteNav } from "@/components/salon/site-nav";
import { Hero } from "@/components/salon/hero";
import { SpeakerBanner } from "@/components/salon/speaker-banner";
import { WorldMap } from "@/components/salon/world-map";
import { HowToHost } from "@/components/salon/how-to-host";
import { FourPostures } from "@/components/salon/four-postures";
import { ConversationAreas } from "@/components/salon/conversation-areas";
import { ReaderToConvener } from "@/components/salon/reader-to-convener";
import { QuickReference } from "@/components/salon/quick-reference";
import { ProgressHud } from "@/components/salon/progress-hud";

/**
 * Client component that renders the AI Salon microsite.
 *
 * Wrapped in <SalonProvider> so localStorage-backed state (vow,
 * toolTried, toolNotes, areaDone) is available to all salon components.
 *
 * The <SiteNav> sits BELOW the existing <AppHeader> (server component
 * rendered by the parent route). It's positioned sticky top-16 so it
 * sticks below the AppHeader (which is sticky top-0, h-16).
 *
 * Original AI Salon site-nav was `fixed top-0` (assumed to be the only
 * top nav on the page). We've adapted it to `sticky top-16` so it sits
 * below the aisalon.massapro.com nav bar — per the integration spec.
 */
export function SalonFlourishingPage() {
  return (
    <SalonProvider>
      <div className="min-h-screen flex flex-col">
        <SiteNav />
        <main className="flex-1">
          <Hero />
          <SpeakerBanner />
          <WorldMap />
          <HowToHost />
          <FourPostures />
          <ConversationAreas />
          <QuickReference />
          <ReaderToConvener />
        </main>
        <ProgressHud />
      </div>
    </SalonProvider>
  );
}
