import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ExternalLink, FolderOpen, FileText, Presentation } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Knowledge Base — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

/**
 * /admin/knowledge-base
 *
 * Curated resource library for chapter organizers. Visible to both
 * ADMIN and SUPER_ADMIN (gated by `members.view`, same as /admin).
 *
 * All resource URLs point to Google Drive / Docs assets owned by the
 * AI Salon Global team. If a link breaks, an admin should edit the
 * `resources` array below — no DB migration needed.
 *
 * Layout: header → 5 sections, each with a description and 1+ resource
 * cards. Each card has a title, optional description, and a button
 * that opens the asset in a new tab.
 */

type ResourceKind = "folder" | "doc" | "slides";

type Resource = {
  kind: ResourceKind;
  title: string;
  description?: string;
  url: string;
};

type Section = {
  index: number;
  title: string;
  intro: string;
  resources: Resource[];
};

const RESOURCES: Section[] = [
  {
    index: 1,
    title: "Branding and Templates",
    intro:
      "Here you can find all the AI Salon branding assets that you might need for posters, presentations and social media posts.",
    resources: [
      {
        kind: "folder",
        title: "Branding Assets",
        url: "https://drive.google.com/drive/folders/1iUQ_HR38VABOQ6CqW8UU5NsMmilIOylQ?usp=drive_link",
      },
    ],
  },
  {
    index: 2,
    title: "Marketing and Communication",
    intro:
      "AI Salon operates with a clear social media structure to ensure brand consistency, clarity, and the right kind of growth across all chapters. These resources explain how our social media works across every channel, what chapters can and cannot do, and how to get the most out of our shared presence.",
    resources: [
      {
        kind: "doc",
        title: "Social Media Handbook",
        url: "https://drive.google.com/file/d/1r2Iv5B1TXNoHvRRT7CBpSUPFOlO8UxM5/view",
      },
      {
        kind: "doc",
        title: "WhatsApp Guidelines",
        description:
          "WhatsApp is one of the communication tools many AI Salon chapters use to keep their community connected, informed, and engaged. Not every chapter uses a WhatsApp group; some prefer to rely on Luma updates, LinkedIn, or other local channels, and that's completely fine. If your chapter does use a WhatsApp group, or is thinking about starting one, these guidelines cover recommended content, moderation, and safety practices.",
        url: "https://drive.google.com/file/d/10Og0AgTQCsmlvvYX3khrD20Zv_zoz7bE/view",
      },
    ],
  },
  {
    index: 3,
    title: "Event Management",
    intro:
      "Practical guides and templates for planning, running, and growing chapter events with a consistent AI Salon experience.",
    resources: [
      {
        kind: "doc",
        title: "Chapter Formation Meeting Template",
        description:
          "A simple, repeatable outline for gathering potential co-organizers and shaping your local chapter. Use this if you are just starting the chapter and building your team.",
        url: "https://drive.google.com/file/d/1pYrT4hPV3QTLUlwfHM1IlJ5IoFQsPRAuDWHPqkaHkgg/view",
      },
      {
        kind: "doc",
        title: "Event Flow Guide",
        description:
          "While every AI Salon chapter reflects its local ecosystem and community, there are a few core ingredients that help create a recognizable AI Salon experience around the world. This document provides a recommended event flow that chapters can use as a starting point. The format is intentionally flexible and can be adapted to your local context, audience, and event objectives, while staying aligned with the core values, quality standards, and overall experience that define AI Salon.",
        url: "https://drive.google.com/file/d/1z0FwvEqHje50N-2w4kPW-O4IVYaMotMS/view",
      },
      {
        kind: "doc",
        title: "Venue Guidelines",
        description:
          "AI Salon events are designed to be high-quality, community-driven, and operationally manageable for local chapter teams, without requiring overly expensive or complex event production. The ideal venue is one that feels aligned with the AI, startup, innovation, or broader entrepreneurial ecosystem, such as coworking spaces, startup offices, innovation hubs, universities, or similar community-oriented environments. This document outlines key considerations when selecting a venue for your local AI Salon events.",
        url: "https://drive.google.com/file/d/184uXbwWfzQ5VP56B95cxRmk--IOr1auq/view",
      },
      {
        kind: "doc",
        title: "Volunteer Recruitment Guide",
        description:
          "A healthy chapter is built by a team, not a single organizer carrying everything alone. This guide is about how to recruit and onboard volunteers in a way that's sustainable, low-friction, and valuable for everyone involved.",
        url: "https://drive.google.com/file/d/1wl53C8INgDWqriOrtK8GmKeetaAI73PP/view",
      },
    ],
  },
  {
    index: 4,
    title: "Sponsorship",
    intro:
      "Resources to help chapters build sustainable sponsorship conversations and customize materials for local partners.",
    resources: [
      {
        kind: "doc",
        title: "Sponsorship Best Practices",
        description:
          "AI Salon chapters are designed to be self-sufficient. Sponsorship is the most effective way to cover the essentials so events can run consistently. This document covers why sponsorship matters, the principles we follow, who to approach, and the mistakes to avoid.",
        url: "https://drive.google.com/file/d/18RzV17YRGUbO6RoM8u3CfcpkJWgd2dSt/view",
      },
      {
        kind: "slides",
        title: "Sponsor Deck Template",
        description:
          "This is a template deck that you can customize for your chapter. It serves as a starting point for your own version. Feel free to make it your own. Replace the text, photos, team profiles, contact details, and packages to fit your chapter. To get started: download the deck, save it to your chapter's folder, and customize away.",
        url: "https://docs.google.com/presentation/d/1WdNOtrtMQmxmQnbpJoV7wRVlAVSHCssVSlhsKXeTYrc/edit?usp=sharing",
      },
    ],
  },
  {
    index: 5,
    title: "Chapter Governance",
    intro:
      "Guidance for building a sustainable chapter team with clear roles, responsibilities, and expectations.",
    resources: [
      {
        kind: "doc",
        title: "Chapter Roles and Expectations Guide",
        description:
          "A healthy AI Salon chapter is built on a small, committed team, not a single \"hero organizer.\" This document outlines the core team structure we recommend for every chapter, with clear roles and responsibilities. The goal is to make organizing sustainable, distribute the workload, and ensure the chapter can keep running consistently over time.",
        url: "https://drive.google.com/file/d/1p539KLeIcg6uCJc1Gw-Cnz3mpFacjTc5/view",
      },
    ],
  },
];

function ResourceIcon({ kind }: { kind: ResourceKind }) {
  if (kind === "folder") return <FolderOpen className="h-5 w-5" />;
  if (kind === "slides") return <Presentation className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

function resourceKindLabel(kind: ResourceKind): string {
  if (kind === "folder") return "Google Drive folder";
  if (kind === "slides") return "Google Slides deck";
  return "Google Doc / PDF";
}

export default async function KnowledgeBasePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/knowledge-base");
  }

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN status (same pattern as /admin + /admin/images)
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Visible to ADMIN + SUPER_ADMIN (same gate as /admin members table)
  if (!can(me.role, "members.view") && !isSuperAdminEmail(me.email)) {
    redirect("/events");
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        {/* Header */}
        <div className="mb-10">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Admin Resources
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            AI Salon Knowledge base
          </h1>
          <h2 className="mt-4 text-xl font-bold text-black/80">
            Chapter Resources
          </h2>
          <p className="mt-2 text-sm text-black/60 max-w-2xl leading-relaxed">
            Useful templates, guides, and shared materials from the AI Salon
            Global team. We&rsquo;ll keep adding more resources here over time.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-10">
          {RESOURCES.map((section) => (
            <section
              key={section.index}
              aria-labelledby={`section-${section.index}-title`}
              className="border-t border-black/10 pt-8"
            >
              <div className="flex items-start gap-4 mb-5">
                <div
                  aria-hidden
                  className="shrink-0 w-9 h-9 rounded-md bg-black text-white font-bold text-sm flex items-center justify-center"
                >
                  {section.index}
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    id={`section-${section.index}-title`}
                    className="text-xl sm:text-2xl font-extrabold text-black"
                  >
                    {section.title}
                  </h3>
                  <p className="mt-2 text-sm text-black/60 leading-relaxed max-w-3xl">
                    {section.intro}
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pl-0 sm:pl-13">
                {section.resources.map((resource) => (
                  <div
                    key={resource.url}
                    className="group flex flex-col rounded-lg border border-black/10 bg-white p-5 transition-colors hover:border-black/30 hover:bg-black/[0.02]"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-[#FF005A]/10 text-[#FF005A]">
                        <ResourceIcon kind={resource.kind} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-black text-base leading-snug">
                          {resource.title}
                        </h4>
                        <p className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-black/40">
                          {resourceKindLabel(resource.kind)}
                        </p>
                      </div>
                    </div>

                    {resource.description && (
                      <p className="text-sm text-black/60 leading-relaxed mb-4 flex-1">
                        {resource.description}
                      </p>
                    )}

                    <Link
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto inline-flex items-center justify-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2.5 text-sm hover:bg-black/90 transition-colors ais-lift"
                    >
                      Open {resource.kind === "folder" ? "folder" : "resource"}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-12 rounded-lg border border-[#00E6FF]/40 bg-[#00E6FF]/5 px-5 py-4">
          <p className="text-sm text-[#004F98] leading-relaxed">
            <strong>Missing a resource?</strong> Contact the AI Salon Global
            team to have it added to this Knowledge Base. Links are maintained
            in <code className="rounded bg-white/60 px-1.5 py-0.5 font-mono text-[0.85em]">src/app/admin/knowledge-base/page.tsx</code>{" "}
            — no database migration needed to update a URL.
          </p>
        </div>
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/40 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>Platform by MassaPro</span>
        </div>
      </footer>
    </div>
  );
}
