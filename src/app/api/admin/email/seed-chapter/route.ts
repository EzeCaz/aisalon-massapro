import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth-guards";
import { getUserScope, canActOnChapter } from "@/lib/permissions";
import { getChapterCoreConfig, resolvePublicPathToUrl } from "@/lib/chapter-core";

/**
 * POST /api/admin/email/seed-chapter
 *
 * Clones all chapter-scoped email flows + audiences + campaigns from a
 * SOURCE chapter (default: Tel Aviv) into the TARGET chapter (the
 * admin's chapter, or a specific chapterId in the body).
 *
 * WHAT GETS CLONED:
 *   - EmailAudience rows where chapterId = source.chapterId
 *     (renamed to "<name> — <target chapter name>" to preserve uniqueness
 *     since EmailAudience.name is @unique)
 *   - EmailFlow rows where chapterId = source.chapterId
 *     (renamed similarly; all steps + audience links are cloned)
 *   - EmailCampaign rows where chapterId = source.chapterId
 *     (only DRAFT campaigns — SENT campaigns are historical and stay
 *     where they are; renamed + reset to DRAFT)
 *
 * WHAT DOES NOT GET CLONED:
 *   - EmailTemplate2 rows (chapterId=null globals are visible to everyone,
 *     so there's no need to duplicate them per chapter. Per the user spec:
 *     "email templates... stay as default template for all new chapters")
 *   - EmailQueue rows (per-recipient send history is not portable)
 *   - Chapter-specific logos / brand images ARE now applied from the
 *     chaptercore.md blueprint (TSK-0077). See "Apply chapter core
 *     defaults" section below.
 *
 * IDEMPOTENT:
 *   - Re-running the seed does NOT create duplicate clones. The endpoint
 *     checks if a clone with the same source-flow ID + target chapterId
 *     already exists (via a `clonedFrom` marker in the description) and
 *     skips if so.
 *
 * PERMISSION:
 *   - SUPER_ADMIN can seed any target chapter.
 *   - CHAPTER_ORGANIZER can seed their own chapter (target = their chapterId).
 *   - ADMIN (country-scoped) can seed any chapter in their country.
 *
 * BODY:
 *   { sourceChapterId?: string, targetChapterId?: string }
 *   - sourceChapterId: defaults to the Tel Aviv chapter (looked up by name)
 *   - targetChapterId: defaults to the admin's chapterId
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scope } = await getCurrentUser();
  if (!scope || scope.kind === "none") {
    return NextResponse.json(
      { error: "Your account has no chapter scope. Set your chapterId in /admin first." },
      { status: 403 },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ── Resolve source chapter (default: Tel Aviv) ────────────────────
  let sourceChapterId: string | undefined = body?.sourceChapterId;
  if (!sourceChapterId) {
    const tlv = await db.chapter.findFirst({
      where: {
        OR: [
          { slug: "tel-aviv" },
          { name: { contains: "Tel Aviv", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    sourceChapterId = tlv?.id;
  }
  if (!sourceChapterId) {
    return NextResponse.json(
      { error: "Source chapter (Tel Aviv) not found. Pass sourceChapterId in the body." },
      { status: 404 },
    );
  }

  // ── Resolve target chapter (default: admin's chapter) ────────────
  let targetChapterId: string | undefined =
    body?.targetChapterId ?? (scope.kind === "chapter" ? scope.chapterId : undefined);
  if (!targetChapterId) {
    return NextResponse.json(
      { error: "No target chapter specified and your account has no chapter scope." },
      { status: 400 },
    );
  }

  // Verify target chapter exists + caller can act on it.
  const targetChapter = await db.chapter.findUnique({
    where: { id: targetChapterId },
    select: { id: true, name: true, slug: true, countryId: true },
  });
  if (!targetChapter) {
    return NextResponse.json(
      { error: `Target chapter ${targetChapterId} not found.` },
      { status: 404 },
    );
  }
  if (!canActOnChapter(scope, targetChapterId)) {
    return NextResponse.json(
      { error: "You don't have permission to seed this chapter." },
      { status: 403 },
    );
  }

  // Don't seed into the same chapter (no-op).
  if (sourceChapterId === targetChapterId) {
    return NextResponse.json(
      { error: "Source and target chapters are the same — nothing to clone." },
      { status: 400 },
    );
  }

  // ── Clone audiences ──────────────────────────────────────────────
  // EmailAudience.name is @unique, so we suffix with the target chapter name.
  const sourceAudiences = await db.emailAudience.findMany({
    where: { chapterId: sourceChapterId },
  });
  const audienceIdMap = new Map<string, string>(); // oldId → newId
  let audiencesCloned = 0;
  let audiencesSkipped = 0;
  for (const a of sourceAudiences) {
    // Skip if a clone already exists (idempotency: marker in description).
    const existing = await db.emailAudience.findFirst({
      where: {
        chapterId: targetChapterId,
        description: { contains: `[cloned-from:${a.id}]` },
      },
      select: { id: true },
    });
    if (existing) {
      audienceIdMap.set(a.id, existing.id);
      audiencesSkipped++;
      continue;
    }
    const newAudience = await db.emailAudience.create({
      data: {
        name: `${a.name} — ${targetChapter.name}`,
        slug: a.slug ? `${a.slug}-${targetChapter.slug}` : null,
        description: `${a.description ?? ""} [cloned-from:${a.id}]`.trim(),
        kind: a.kind,
        emailsJson: a.emailsJson,
        filtersJson: a.filtersJson,
        isTest: a.isTest,
        chapterId: targetChapterId,
      },
    });
    audienceIdMap.set(a.id, newAudience.id);
    audiencesCloned++;
  }

  // ── Clone flows + their steps ────────────────────────────────────
  const sourceFlows = await db.emailFlow.findMany({
    where: { chapterId: sourceChapterId },
    include: { steps: true },
  });
  let flowsCloned = 0;
  let flowsSkipped = 0;
  for (const f of sourceFlows) {
    // Idempotency: check if a clone already exists.
    const existing = await db.emailFlow.findFirst({
      where: {
        chapterId: targetChapterId,
        description: { contains: `[cloned-from:${f.id}]` },
      },
      select: { id: true },
    });
    if (existing) {
      flowsSkipped++;
      continue;
    }
    const newFlow = await db.emailFlow.create({
      data: {
        name: `${f.name} — ${targetChapter.name}`,
        description: `${f.description ?? ""} [cloned-from:${f.id}]`.trim(),
        status: "DRAFT", // Always clone as DRAFT — admin activates manually.
        chapterId: targetChapterId,
        createdBy: admin.id,
      },
    });
    // Clone steps. templateId is NOT remapped — templates stay global
    // (chapterId=null) so the cloned steps can reference them directly.
    // audienceId IS remapped to the cloned audience in the target chapter.
    for (const step of f.steps) {
      await db.emailFlowStep.create({
        data: {
          flowId: newFlow.id,
          position: step.position,
          audienceId: step.audienceId
            ? audienceIdMap.get(step.audienceId) ?? null
            : null,
          triggerKind: step.triggerKind,
          triggerEventId: null, // Don't copy event triggers — they're source-chapter-specific.
          templateId: step.templateId,
          subjectVariantA: step.subjectVariantA,
          subjectVariantB: step.subjectVariantB,
          delayValue: step.delayValue,
          delayUnit: step.delayUnit,
        },
      });
    }
    flowsCloned++;
  }

  // ── Clone DRAFT campaigns ────────────────────────────────────────
  // We don't clone SENT campaigns — those are historical records tied to
  // their original recipients + queue rows. Only DRAFT campaigns are
  // portable (the admin can edit + send them to the new chapter's audience).
  const sourceCampaigns = await db.emailCampaign.findMany({
    where: {
      chapterId: sourceChapterId,
      status: "DRAFT",
    },
  });
  let campaignsCloned = 0;
  let campaignsSkipped = 0;
  for (const c of sourceCampaigns) {
    // Idempotency: check if a clone already exists.
    const existing = await db.emailCampaign.findFirst({
      where: {
        chapterId: targetChapterId,
        name: { contains: `[cloned-from:${c.id}]` },
      },
      select: { id: true },
    });
    if (existing) {
      campaignsSkipped++;
      continue;
    }
    await db.emailCampaign.create({
      data: {
        name: `${c.name} — ${targetChapter.name} [cloned-from:${c.id}]`,
        templateId: c.templateId, // Templates stay global — no remap needed.
        subjectSnapshot: c.subjectSnapshot,
        bodyHtmlSnapshot: c.bodyHtmlSnapshot,
        bodyTextSnapshot: c.bodyTextSnapshot,
        signatureHtmlSnapshot: c.signatureHtmlSnapshot,
        listSource: c.listSource,
        listConfigJson: c.listConfigJson,
        recipientCount: 0,
        status: "DRAFT",
        createdBy: admin.id,
        chapterId: targetChapterId,
      },
    });
    campaignsCloned++;
  }

  // ── Apply chapter core defaults (TSK-0077) ───────────────────────
  // Read the chaptercore.md blueprint + apply the default brand images
  // (favicon, loginHero, loginBanner, emailLogo, chapterHero) + chapter
  // settings (timezone, social URLs) to the target chapter.
  //
  // IDEMPOTENT: only sets values that are currently null/default — never
  // overwrites an existing non-default value. This means re-running seed
  // on a chapter that already has its own brand images won't clobber them.
  const chapterCoreResult = await applyChapterCoreDefaults(targetChapterId, admin.id);

  return NextResponse.json({
    ok: true,
    sourceChapterId,
    targetChapterId,
    targetChapterName: targetChapter.name,
    summary: {
      audiences: { cloned: audiencesCloned, skipped: audiencesSkipped },
      flows: { cloned: flowsCloned, skipped: flowsSkipped },
      campaigns: { cloned: campaignsCloned, skipped: campaignsSkipped },
      chapterCore: chapterCoreResult,
    },
    note:
      "Email templates were NOT cloned — they remain global (chapterId=null) and are visible to all chapters. " +
      "Brand images + chapter settings were applied from chaptercore.md (the default new chapter blueprint). " +
      "If you want a chapter-specific template variant, duplicate it from /admin/email/flows → Templates tab.",
  });
}

/**
 * Apply the chaptercore.md blueprint defaults to a chapter.
 *
 * For each brand image in the blueprint:
 *   - If it's a ChapterSetting key (favicon/loginHero/loginBanner/emailLogo):
 *     create a ChapterSetting row ONLY if one doesn't already exist.
 *   - If it's a Chapter column (heroImageUrl): set it ONLY if currently null.
 *
 * For chapter defaults (timezone, whatsappGroupUrl, linkedinUrl):
 *   - timezone: set only if currently the schema default ("Asia/Jerusalem")
 *   - whatsapp/linkedin: set only if currently null
 *
 * Returns a summary of what was applied vs skipped.
 */
async function applyChapterCoreDefaults(
  chapterId: string,
  _adminId: string
): Promise<{
  brandImages: { applied: string[]; skipped: string[] };
  chapterFields: { applied: string[]; skipped: string[] };
}> {
  const config = getChapterCoreConfig();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

  const brandImagesApplied: string[] = [];
  const brandImagesSkipped: string[] = [];
  const chapterFieldsApplied: string[] = [];
  const chapterFieldsSkipped: string[] = [];

  // ── 1. Brand images stored as ChapterSetting rows ────────────────
  // Only create a row if one doesn't already exist for this key —
  // never overwrite an existing override.
  const settingEntries = Object.entries(config.brandImages).filter(
    ([, img]) => img.chapterSettingKey
  );
  for (const [key, img] of settingEntries) {
    if (!img.chapterSettingKey) continue;
    const existing = await db.chapterSetting.findUnique({
      where: {
        chapterId_key: { chapterId, key: img.chapterSettingKey },
      },
      select: { id: true },
    });
    if (existing) {
      brandImagesSkipped.push(key);
      continue;
    }
    const url = resolvePublicPathToUrl(img.path);
    await db.chapterSetting.create({
      data: {
        chapterId,
        key: img.chapterSettingKey,
        value: url,
      },
    });
    brandImagesApplied.push(key);
  }

  // ── 2. Brand images stored on the Chapter row (heroImageUrl) ─────
  // Only set if currently null — don't clobber an existing hero.
  const chapterFieldEntries = Object.entries(config.brandImages).filter(
    ([, img]) => img.chapterField
  );
  if (chapterFieldEntries.length > 0) {
    const chapter = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { heroImageUrl: true, timezone: true, whatsappGroupUrl: true, linkedinUrl: true },
    });
    if (chapter) {
      const patch: Record<string, string | null> = {};

      for (const [key, img] of chapterFieldEntries) {
        if (!img.chapterField) continue;
        const currentValue = (chapter as Record<string, unknown>)[img.chapterField] as string | null;
        if (currentValue) {
          chapterFieldsSkipped.push(key);
          continue;
        }
        patch[img.chapterField] = resolvePublicPathToUrl(img.path);
        chapterFieldsApplied.push(key);
      }

      // ── 3. Chapter defaults (timezone, social URLs) ──────────────
      // Only set if currently the schema default or null.
      if (config.defaults.timezone && chapter.timezone === "Asia/Jerusalem") {
        patch.timezone = config.defaults.timezone;
        chapterFieldsApplied.push("timezone");
      } else if (config.defaults.timezone) {
        chapterFieldsSkipped.push("timezone");
      }
      if (config.defaults.whatsappGroupUrl && !chapter.whatsappGroupUrl) {
        patch.whatsappGroupUrl = config.defaults.whatsappGroupUrl;
        chapterFieldsApplied.push("whatsappGroupUrl");
      } else if (config.defaults.whatsappGroupUrl !== undefined) {
        chapterFieldsSkipped.push("whatsappGroupUrl");
      }
      if (config.defaults.linkedinUrl && !chapter.linkedinUrl) {
        patch.linkedinUrl = config.defaults.linkedinUrl;
        chapterFieldsApplied.push("linkedinUrl");
      } else if (config.defaults.linkedinUrl !== undefined) {
        chapterFieldsSkipped.push("linkedinUrl");
      }

      if (Object.keys(patch).length > 0) {
        await db.chapter.update({ where: { id: chapterId }, data: patch });
      }
    }
  }

  // Suppress unused-var warning for origin (kept for future use — e.g.
  // if we need to log the resolved origin for debugging).
  void origin;

  return {
    brandImages: { applied: brandImagesApplied, skipped: brandImagesSkipped },
    chapterFields: { applied: chapterFieldsApplied, skipped: chapterFieldsSkipped },
  };
}
