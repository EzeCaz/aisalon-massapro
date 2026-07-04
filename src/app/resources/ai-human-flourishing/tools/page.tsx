import type { Metadata } from "next";
import { AppHeader } from "@/components/ais/app-header";
import { SalonProvider } from "@/components/salon/salon-provider";
import { ToolsIndex } from "@/components/salon/tools-index";

export const metadata: Metadata = {
  title: "Tools — AI & Human Flourishing",
  description:
    "Twenty practitioner tools drawn from AI and the Art of Being Human — a 90-second scan, a 7-minute pause, a 30-day practice. Run them in the room or carry them into your week.",
  openGraph: {
    title: "Tools — AI & Human Flourishing",
    description:
      "Twenty practitioner tools drawn from AI and the Art of Being Human.",
    type: "website",
  },
};

/**
 * /resources/ai-human-flourishing/tools — PUBLIC page (no auth required).
 *
 * Same layout pattern as the parent route: AppHeader on top, then the
 * ToolsIndex content (which includes its own back-to-home + salon brand
 * lockup via <ToolNav> on tool detail pages, or via the in-page header
 * on the tools index itself).
 */
export default function ToolsRoute() {
  return (
    <>
      <AppHeader />
      <SalonProvider>
        <ToolsIndex />
      </SalonProvider>
    </>
  );
}
