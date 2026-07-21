/**
 * scripts/set-montreal-hero.ts
 *
 * One-off admin script: set the Montreal chapter's heroImageUrl to the
 * brand asset the user provided.
 *
 *   https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1784630528181-xsnpz1.jpeg
 *
 * Also: as a safety net, normalize any existing chapter linkedinUrl /
 * whatsappGroupUrl rows that lack an http(s):// scheme. Without this,
 * the LinkedIn button on /c/[slug] would render as a relative path
 * (because the deployed code already normalizes at render time, but
 * the DB still stores the raw schemeless string the admin entered).
 *
 * Run with:
 *   bun run scripts/set-montreal-hero.ts
 *   # or
 *   npx tsx scripts/set-montreal-hero.ts
 *
 * Idempotent — safe to run multiple times. Only writes if the current
 * value differs from the target.
 */
import { PrismaClient } from "@prisma/client";

const MONTREAL_HERO_URL =
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1784630528181-xsnpz1.jpeg";

function normalizeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return `https://${trimmed}`;
}

async function main() {
  const db = new PrismaClient();
  try {
    // ---- 1. Find Montreal chapter(s) ----
    // Match by slug "montreal" (case-insensitive) OR by name containing
    // "Montreal". Logs every match so the admin can see what was updated.
    const candidates = await db.chapter.findMany({
      where: {
        OR: [
          { slug: { equals: "montreal", mode: "insensitive" } },
          { name: { contains: "Montreal", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, slug: true, heroImageUrl: true, linkedinUrl: true, whatsappGroupUrl: true },
    });

    if (candidates.length === 0) {
      console.warn(
        "[set-montreal-hero] No chapter with slug 'montreal' or name containing 'Montreal' was found."
      );
      console.warn("                   Skipping Montreal hero update.");
    } else {
      for (const c of candidates) {
        const target = MONTREAL_HERO_URL;
        if (c.heroImageUrl === target) {
          console.log(
            `[set-montreal-hero] ${c.name} (${c.slug}) — heroImageUrl already correct, skipping.`
          );
        } else {
          await db.chapter.update({
            where: { id: c.id },
            data: { heroImageUrl: target },
          });
          console.log(
            `[set-montreal-hero] ${c.name} (${c.slug}) — heroImageUrl updated:\n` +
              `   from: ${c.heroImageUrl ?? "(null)"}\n` +
              `   to:   ${target}`
          );
        }
      }
    }

    // ---- 2. Normalize schemeless URLs on ALL chapters ----
    // Defense-in-depth — the render layer already normalizes, but the DB
    // should also be clean so the bug doesn't resurface if someone
    // bypasses the API (e.g. direct DB edit).
    console.log("\n[set-montreal-hero] Scanning all chapters for schemeless URLs…");
    const all = await db.chapter.findMany({
      select: { id: true, name: true, slug: true, linkedinUrl: true, whatsappGroupUrl: true, heroImageUrl: true },
    });
    let fixed = 0;
    for (const c of all) {
      const patch: Record<string, string | null> = {};
      const ln = normalizeHttpUrl(c.linkedinUrl);
      const wa = normalizeHttpUrl(c.whatsappGroupUrl);
      const hi = normalizeHttpUrl(c.heroImageUrl);
      if (ln !== c.linkedinUrl) patch.linkedinUrl = ln;
      if (wa !== c.whatsappGroupUrl) patch.whatsappGroupUrl = wa;
      if (hi !== c.heroImageUrl) patch.heroImageUrl = hi;
      if (Object.keys(patch).length > 0) {
        await db.chapter.update({ where: { id: c.id }, data: patch });
        console.log(
          `[set-montreal-hero]   ${c.name} (${c.slug}) — normalized: ` +
            Object.keys(patch).join(", ")
        );
        fixed++;
      }
    }
    console.log(
      `[set-montreal-hero] Done. ${fixed} chapter(s) had schemeless URLs normalized.`
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[set-montreal-hero] FAILED:", err);
  process.exit(1);
});
