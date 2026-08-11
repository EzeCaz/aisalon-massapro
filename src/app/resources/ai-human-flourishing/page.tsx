import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
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
 * /resources/ai-human-flourishing — PUBLIC page (no auth required), BUT
 * restricted to AIS brand users.
 *
 * Per user spec: "/resources/ai-human-flourishing only visible to brand aisalon"
 *
 * Brand gate logic:
 *   - Anonymous visitors → allowed (the page is public; AIS is the
 *     platform default brand, so anonymous visitors on aisalon.massapro.com
 *     are AIS by default).
 *   - Signed-in AIS users (brandSlug = null or "aisalon") → allowed.
 *   - Signed-in Coma users (brandSlug = "coma") → redirected to /events.
 *     The AI & Human Flourishing microsite is an AI Salon program; Coma
 *     members shouldn't see it in their nav or be able to access it
 *     directly.
 *
 * The nav link is also hidden for Coma users in app-header.tsx (the
 * navLinks array doesn't currently filter by brand, but we add the
 * filter there separately). This page-level gate is the backstop —
 * even if a Coma user types the URL directly, they're redirected.
 */
export default async function SalonFlourishingRoute() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email) {
    try {
      const me = await db.user.findUnique({
        where: { email: session.user.email },
        select: { brandSlug: true },
      });
      if (me?.brandSlug === "coma") {
        // Coma members don't have access to the AI Salon "AI & Human
        // Flourishing" microsite — redirect to events.
        redirect("/events");
      }
    } catch {
      // If the brandSlug column is missing or the lookup fails, fall
      // through and render the page (defensive — same pattern as auth.ts
      // hotfix).
    }
  }

  return (
    <>
      <AppHeader />
      <SalonFlourishingPage />
    </>
  );
}
