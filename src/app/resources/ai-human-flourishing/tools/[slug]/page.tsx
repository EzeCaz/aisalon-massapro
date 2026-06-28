import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppHeader } from "@/components/ais/app-header";
import { SalonProvider } from "@/components/salon/salon-provider";
import { ToolNav } from "@/components/salon/tool-nav";
import { ToolDetail } from "@/components/salon/tool-detail";
import { tools, toolBySlug } from "@/lib/salon-data/tools-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return tools.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = toolBySlug(slug);
  if (!tool) return { title: "Tool not found — AI & Human Flourishing" };
  return {
    title: `${tool.name} — AI & Human Flourishing Tool`,
    description: tool.whatItIs,
    openGraph: {
      title: `${tool.name} — AI & Human Flourishing`,
      description: tool.whatItIs,
      type: "article",
    },
  };
}

/**
 * /resources/ai-human-flourishing/tools/[slug] — PUBLIC tool detail page.
 *
 * Static-rendered at build time for all 20 known tool slugs.
 * No auth required — accessible publicly.
 */
export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = toolBySlug(slug);
  if (!tool) notFound();

  return (
    <>
      <AppHeader />
      <SalonProvider>
        <ToolNav />
        <main className="min-h-screen">
          <ToolDetail tool={tool} />
        </main>
      </SalonProvider>
    </>
  );
}
