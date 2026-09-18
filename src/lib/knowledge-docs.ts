/**
 * Knowledge-docs helpers — DB-backed, per-brand knowledge base.
 *
 * PER USER SPEC 2026-09-19: the knowledge base must be SEPARATED per
 * brand ("all templates mockups and emails, have a separation for coma
 * platform users and aisalon user, as everything should be different")
 * and Super Admins must be able to change the content and URL of each
 * doc — so the previous hard-coded RESOURCES array in
 * /admin/knowledge-base/page.tsx now lives in the KnowledgeDoc table.
 *
 * SEEDING: the legacy AI Salon resource list (Google Drive links) is
 * auto-seeded into brandSlug="aisalon" the first time it's read (idempotent
 * — guarded by a count check, so it only ever runs when the table has no
 * AIS docs). The Coma brand starts EMPTY — the Super Admin adds Coma's own
 * docs from the admin UI.
 */
import { db } from "@/lib/db";

export type KnowledgeDocRecord = {
  id: string;
  brandSlug: string;
  section: string;
  sectionIntro: string | null;
  sectionOrder: number;
  title: string;
  description: string | null;
  url: string;
  kind: string; // "folder" | "doc" | "slides"
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
};

/** The legacy AI Salon resource list (previously hard-coded in the page). */
const LEGACY_AIS_SEED: Array<{
  section: string;
  sectionIntro: string | null;
  sectionOrder: number;
  docs: Array<{
    title: string;
    description?: string;
    url: string;
    kind: string;
    sortOrder: number;
  }>;
}> = [
  {
    section: "Branding and Templates",
    sectionIntro:
      "Here you can find all the AI Salon branding assets that you might need for posters, presentations and social media posts.",
    sectionOrder: 1,
    docs: [
      {
        title: "Branding Assets",
        url: "https://drive.google.com/drive/folders/1iUQ_HR38VABOQ6CqW8UU5NsMmilIOylQ?usp=drive_link",
        kind: "folder",
        sortOrder: 0,
      },
    ],
  },
  {
    section: "Marketing and Communication",
    sectionIntro:
      "AI Salon operates with a clear social media structure to ensure brand consistency, clarity, and the right kind of growth across all chapters. These resources explain how our social media works across every channel, what chapters can and cannot do, and how to get the most out of our shared presence.",
    sectionOrder: 2,
    docs: [
      {
        title: "Social Media Handbook",
        url: "https://drive.google.com/file/d/1r2Iv5B1TXNoHvRRT7CBpSUPFOlO8UxM5/view",
        kind: "doc",
        sortOrder: 0,
      },
      {
        title: "WhatsApp Guidelines",
        description:
          "WhatsApp is one of the communication tools many AI Salon chapters use to keep their community connected, informed, and engaged. Not every chapter uses a WhatsApp group; some prefer to rely on Luma updates, LinkedIn, or other local channels, and that's completely fine. If your chapter does use a WhatsApp group, or is thinking about starting one, these guidelines cover recommended content, moderation, and safety practices.",
        url: "https://drive.google.com/file/d/10Og0AgTQCsmlvvYX3khrD20Zv_zoz7bE/view",
        kind: "doc",
        sortOrder: 1,
      },
    ],
  },
  {
    section: "Event Management",
    sectionIntro:
      "Practical guides and templates for planning, running, and growing chapter events with a consistent AI Salon experience.",
    sectionOrder: 3,
    docs: [
      {
        title: "Chapter Formation Meeting Template",
        description:
          "A simple, repeatable outline for gathering potential co-organizers and shaping your local chapter. Use this if you are just starting the chapter and building your team.",
        url: "https://drive.google.com/file/d/1pYrT4hPV3QTLUlwfHM1IlJ5IoFQsPRAuDWHPqkaHkgg/view",
        kind: "doc",
        sortOrder: 0,
      },
      {
        title: "Event Flow Guide",
        description:
          "While every AI Salon chapter reflects its local ecosystem and community, there are a few core ingredients that help create a recognizable AI Salon experience around the world. This document provides a recommended event flow that chapters can use as a starting point. The format is intentionally flexible and can be adapted to your local context, audience, and event objectives, while staying aligned with the core values, quality standards, and overall experience that define AI Salon.",
        url: "https://drive.google.com/file/d/1z0FwvEqHje50N-2w4kPW-O4IVYaMotMS/view",
        kind: "doc",
        sortOrder: 1,
      },
      {
        title: "Venue Guidelines",
        description:
          "AI Salon events are designed to be high-quality, community-driven, and operationally manageable for local chapter teams, without requiring overly expensive or complex event production. The ideal venue is one that feels aligned with the AI, startup, innovation, or broader entrepreneurial ecosystem, such as coworking spaces, startup offices, innovation hubs, universities, or similar community-oriented environments. This document outlines key considerations when selecting a venue for your local AI Salon events.",
        url: "https://drive.google.com/file/d/184uXbwWfzQ5VP56B95cxRmk--IOr1auq/view",
        kind: "doc",
        sortOrder: 2,
      },
      {
        title: "Volunteer Recruitment Guide",
        description:
          "A healthy chapter is built by a team, not a single organizer carrying everything alone. This guide is about how to recruit and onboard volunteers in a way that's sustainable, low-friction, and valuable for everyone involved.",
        url: "https://drive.google.com/file/d/1wl53C8INgDWqriOrtK8GmKeetaAI73PP/view",
        kind: "doc",
        sortOrder: 3,
      },
    ],
  },
  {
    section: "Sponsorship",
    sectionIntro:
      "Resources to help chapters build sustainable sponsorship conversations and customize materials for local partners.",
    sectionOrder: 4,
    docs: [
      {
        title: "Sponsorship Best Practices",
        description:
          "AI Salon chapters are designed to be self-sufficient. Sponsorship is the most effective way to cover the essentials so events can run consistently. This document covers why sponsorship matters, the principles we follow, who to approach, and the mistakes to avoid.",
        url: "https://drive.google.com/file/d/18RzV17YRGUbO6RoM8u3CfcpkJWgd2dSt/view",
        kind: "doc",
        sortOrder: 0,
      },
      {
        title: "Sponsor Deck Template",
        description:
          "This is a template deck that you can customize for your chapter. It serves as a starting point for your own version. Feel free to make it your own. Replace the text, photos, team profiles, contact details, and packages to fit your chapter. To get started: download the deck, save it to your chapter's folder, and customize away.",
        url: "https://docs.google.com/presentation/d/1WdNOtrtMQmxmQnbpJoV7wRVlAVSHCssVSlhsKXeTYrc/edit?usp=sharing",
        kind: "slides",
        sortOrder: 1,
      },
    ],
  },
  {
    section: "Chapter Governance",
    sectionIntro:
      "Guidance for building a sustainable chapter team with clear roles, responsibilities, and expectations.",
    sectionOrder: 5,
    docs: [
      {
        title: "Chapter Roles and Expectations Guide",
        description:
          'A healthy AI Salon chapter is built on a small, committed team, not a single "hero organizer." This document outlines the core team structure we recommend for every chapter, with clear roles and responsibilities. The goal is to make organizing sustainable, distribute the workload, and ensure the chapter can keep running consistently over time.',
        url: "https://drive.google.com/file/d/1p539KLeIcg6uCJc1Gw-Cnz3mpFacjTc5/view",
        kind: "doc",
        sortOrder: 0,
      },
    ],
  },
];

/**
 * Idempotently seed the legacy AIS knowledge base (only when the AIS
 * brand has zero docs). Safe to call from every read path.
 */
export async function ensureKnowledgeSeed(): Promise<void> {
  try {
    const count = await db.knowledgeDoc.count({ where: { brandSlug: "aisalon" } });
    if (count > 0) return;
    const rows = LEGACY_AIS_SEED.flatMap((section) =>
      section.docs.map((d) => ({
        brandSlug: "aisalon",
        section: section.section,
        sectionIntro: section.sectionIntro,
        sectionOrder: section.sectionOrder,
        title: d.title,
        description: d.description ?? null,
        url: d.url,
        kind: d.kind,
        sortOrder: d.sortOrder,
        isActive: true,
      }))
    );
    await db.knowledgeDoc.createMany({ data: rows, skipDuplicates: true });
  } catch (err) {
    // Never break the page on seeding failure (e.g. fresh DB without the
    // table yet) — the page falls back to an empty list.
    console.warn("[knowledge-docs] seed failed:", err);
  }
}

/** Load a brand's docs ordered by section then in-section order. */
export async function getKnowledgeDocs(
  brandSlug: string
): Promise<KnowledgeDocRecord[]> {
  const rows = await db.knowledgeDoc.findMany({
    where: { brandSlug },
    orderBy: [{ sectionOrder: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    brandSlug: r.brandSlug,
    section: r.section,
    sectionIntro: r.sectionIntro,
    sectionOrder: r.sectionOrder,
    title: r.title,
    description: r.description,
    url: r.url,
    kind: r.kind,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
