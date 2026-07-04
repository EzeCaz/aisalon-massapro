import type { Metadata } from "next";
import { AppHeader } from "@/components/ais/app-header";
import { SalonFlourishingPage } from "./salon-flourishing-page";

export const metadata: Metadata = {
  title: "AI & Human Flourishing",
  description:
    "A global AI Salon conversation. Fourteen cities, six angles on human flourishing in the age of AI — Identity, Education, Work, Well-Being, Relationships, Creativity. Empowering AI connections.",
  openGraph: {
    title: "AI Salon — AI & Human Flourishing",
    description:
      "What does it mean to be human in the age of AI? Fourteen cities. Six angles. One conversation.",
    type: "website",
  },
};

/**
 * /resources/ai-human-flourishing — PUBLIC page (no auth required).
 *
 * This is the AI Salon "AI & Human Flourishing" microsite, integrated
 * into the aisalon.massapro.com site as a sub-app under /resources.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │ AppHeader (existing aisalon.massapro.com │  ← sticky top-0, z-40
 *   │  top nav: logo + Events + Admin + user)  │
 *   ├─────────────────────────────────────────┤
 *   │ SiteNav (salon microsite's section nav:  │  ← sticky top-16, z-30
 *   │  Home / Welcome / Map / Postures / etc.) │
 *   ├─────────────────────────────────────────┤
 *   │ Main content (hero, world map, areas,    │
 *   │  tools, vow generator, etc.)             │
 *   └─────────────────────────────────────────┘
 *
 * Auth: NONE — accessible publicly to anyone with the link. The existing
 * AppHeader shows "Sign in" + "Join the community" CTAs to anonymous
 * visitors (matches the public /e/[slug] page pattern).
 */
export default function SalonFlourishingRoute() {
  return (
    <>
      <AppHeader />
      <SalonFlourishingPage />
    </>
  );
}
