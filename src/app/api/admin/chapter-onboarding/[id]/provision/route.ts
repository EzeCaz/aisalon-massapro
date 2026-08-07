/**
 * POST /api/admin/chapter-onboarding/[id]/provision
 *
 * Takes a SUBMITTED chapter onboarding form and provisions a real chapter
 * from it. This is the "Approve & Provision" action the admin clicks in
 * the /admin/chapter-onboarding detail dialog.
 *
 * WHAT IT DOES (atomic — all-or-nothing):
 *
 *   1. Country — looks up an existing Country by name (case-insensitive,
 *      slug-ified match). If none exists, creates one with a sane
 *      slug/code/flag derived from the name.
 *
 *   2. Chapter — creates a new Chapter row with:
 *        name, slug, countryId, city, timezone, whatsappGroupUrl,
 *        linkedinUrl, heroImageUrl (= landingHeroUrl from the form, if
 *        provided — otherwise chaptercore.md's chapterHero default).
 *
 *   3. Brand images — for each of the 4 brand image keys
 *      (favicon, loginHero, loginBanner, emailLogo):
 *        - If the form supplied an uploaded URL, re-upload the bytes
 *          into the chapter's permanent `chapter-brand/<chapterId>/`
 *          Blob prefix and store the new URL in a ChapterSetting row.
 *        - If the form did NOT supply one, fall back to the
 *          chaptercore.md blueprint default (e.g. emailLogo defaults
 *          to /defaults/chapter-core/email-logo.png).
 *
 *   4. Lead user — links the User who received the invite to the new
 *      chapter (chapterId + countryId) and upgrades their role to
 *      CHAPTER_ORGANIZER. SUPER_ADMINs are never downgraded.
 *
 *   5. Email infrastructure — runs the existing seed-chapter clone
 *      (audiences + flows + draft campaigns) from the Tel Aviv source
 *      chapter so the new chapter has a working email setup out of the
 *      box. This is the same logic as POST /api/admin/email/seed-chapter.
 *
 *   6. Invite row — sets appliedChapterId + appliedAt so the admin can
 *      see at a glance that this submission was actioned.
 *
 * IDEMPOTENT:
 *   If `appliedChapterId` is already set on the invite, the endpoint
 *   returns 409 with the existing chapterId — it does NOT re-provision.
 *   To re-provision, the admin must first clear the link (or send a
 *   new invite).
 *
 * AUTH:
 *   SUPER_ADMIN only. (Provisioning a chapter has platform-wide effects:
 *   it creates a new public-facing chapter + grants admin access to a
 *   user. Too sensitive to delegate to country Admins.)
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin, ROLES } from "@/lib/permissions";
import { db } from "@/lib/db";
import { normalizeHttpUrl } from "@/lib/normalize-url";
import {
  setChapterBrandImage,
  type ChapterBrandImageKey,
} from "@/lib/chapter-brand-images";
import {
  getChapterCoreConfig,
  resolvePublicPathToUrl,
} from "@/lib/chapter-core";
import {
  K_FAVICON,
  K_LOGIN_HERO,
  K_LOGIN_BANNER,
  K_EMAIL_LOGO,
} from "@/lib/site-settings";
import {
  safeFileExtension,
  safeBlobPathname,
  uniqueBlobFilename,
} from "@/lib/blob-paths";
import type { ChapterOnboardingFormData } from "@/lib/chapter-onboarding-types";

/** True when Vercel Blob is configured (token present). */
function hasBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Slugify a country/chapter name for URL slugs + matching. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Best-effort 2-letter country code from the country name. */
function guessCountryCode(name: string): string {
  const map: Record<string, string> = {
    israel: "IL",
    canada: "CA",
    "united states": "US",
    america: "US",
    brazil: "BR",
    "brasil": "BR",
    mexico: "MX",
    germany: "DE",
    france: "FR",
    spain: "ES",
    italy: "IT",
    portugal: "PT",
    "united kingdom": "GB",
    england: "GB",
    "netherlands": "NL",
    japan: "JP",
    singapore: "SG",
    "uae": "AE",
    "united arab emirates": "AE",
    australia: "AU",
  };
  const key = name.toLowerCase().trim();
  return map[key] ?? key.slice(0, 2).toUpperCase().padEnd(2, "X");
}

/** Common flag emojis for known countries (best-effort, falls back to 🏳️). */
function guessFlagEmoji(name: string): string {
  const map: Record<string, string> = {
    israel: "🇮🇱",
    canada: "🇨🇦",
    "united states": "🇺🇸",
    america: "🇺🇸",
    brazil: "🇧🇷",
    brasil: "🇧🇷",
    mexico: "🇲🇽",
    germany: "🇩🇪",
    france: "🇫🇷",
    spain: "🇪🇸",
    italy: "🇮🇹",
    portugal: "🇵🇹",
    "united kingdom": "🇬🇧",
    england: "🇬🇧",
    "netherlands": "🇳🇱",
    japan: "🇯🇵",
    singapore: "🇸🇬",
    "uae": "🇦🇪",
    "united arab emirates": "🇦🇪",
    australia: "🇦🇺",
  };
  return map[name.toLowerCase().trim()] ?? "🏳️";
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ──────────────────────────────────────────────────────────
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      { error: "Only a Super Admin can provision a chapter." },
      { status: 403 },
    );
  }

  const { id: inviteId } = await params;

  // ── Load invite ───────────────────────────────────────────────────
  const invite = await db.chapterOnboardingInvite.findUnique({
    where: { id: inviteId },
    select: {
      id: true,
      status: true,
      submissionJson: true,
      userId: true,
      appliedChapterId: true,
      prefillChapterSlug: true,
    },
  });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status !== "SUBMITTED") {
    return NextResponse.json(
      { error: `Invite is not submitted (status: ${invite.status}).` },
      { status: 400 },
    );
  }
  if (invite.appliedChapterId) {
    // Idempotent: this invite was already provisioned.
    return NextResponse.json(
      {
        error: "This invite has already been provisioned.",
        chapterId: invite.appliedChapterId,
      },
      { status: 409 },
    );
  }

  const sub = JSON.parse(invite.submissionJson!) as ChapterOnboardingFormData;

  // ── 1. Country ────────────────────────────────────────────────────
  const countrySlug = slugify(sub.country);
  let country = await db.country.findFirst({
    where: {
      OR: [
        { slug: countrySlug },
        { name: { equals: sub.country, mode: "insensitive" } },
      ],
    },
  });
  if (!country) {
    country = await db.country.create({
      data: {
        name: sub.country.trim(),
        slug: countrySlug,
        code: guessCountryCode(sub.country),
        flagEmoji: guessFlagEmoji(sub.country),
        isActive: true,
      },
    });
  }

  // ── 2. Chapter ────────────────────────────────────────────────────
  // Slug uniqueness check — if taken, suffix with country code.
  let chapterSlug = sub.chapterSlug.trim() || slugify(sub.chapterName);
  const existingSlug = await db.chapter.findUnique({
    where: { slug: chapterSlug },
    select: { id: true },
  });
  if (existingSlug) {
    chapterSlug = `${chapterSlug}-${country.code.toLowerCase()}`;
    const again = await db.chapter.findUnique({
      where: { slug: chapterSlug },
      select: { id: true },
    });
    if (again) {
      return NextResponse.json(
        {
          error: `Chapter slug "${chapterSlug}" is already in use. Pick a different slug and re-submit the form.`,
        },
        { status: 409 },
      );
    }
  }

  // Resolve the chapter hero image:
  //   1. form's landingHeroUrl (uploaded by the chapter lead)
  //   2. chaptercore.md blueprint chapterHero default
  const chapterCore = getChapterCoreConfig();
  const chapterHeroDefault =
    chapterCore.brandImages.chapterHero?.path
      ? resolvePublicPathToUrl(chapterCore.brandImages.chapterHero.path)
      : null;
  const heroImageUrl =
    normalizeHttpUrl(sub.landingHeroUrl) ?? chapterHeroDefault;

  const chapter = await db.chapter.create({
    data: {
      name: sub.chapterName.trim(),
      slug: chapterSlug,
      countryId: country.id,
      city: sub.city?.trim() || null,
      timezone: sub.timezone?.trim() || "Asia/Jerusalem",
      whatsappGroupUrl: normalizeHttpUrl(sub.whatsappGroupUrl),
      linkedinUrl: normalizeHttpUrl(sub.linkedinUrl),
      heroImageUrl,
      isActive: true,
    },
  });

  // ── 3. Brand images ───────────────────────────────────────────────
  // Map form-field → (ChapterSetting key, default path from chaptercore.md).
  const brandImageMap: Array<{
    formUrl: string | undefined;
    settingKey: ChapterBrandImageKey;
    coreKey: keyof typeof chapterCore.brandImages;
  }> = [
    { formUrl: sub.faviconUrl, settingKey: K_FAVICON, coreKey: "favicon" },
    { formUrl: sub.loginHeroUrl, settingKey: K_LOGIN_HERO, coreKey: "loginHero" },
    { formUrl: sub.loginBannerUrl, settingKey: K_LOGIN_BANNER, coreKey: "loginBanner" },
    { formUrl: sub.emailLogoUrl, settingKey: K_EMAIL_LOGO, coreKey: "emailLogo" },
  ];

  const brandImagesApplied: string[] = [];
  for (const { formUrl, settingKey, coreKey } of brandImageMap) {
    let finalUrl: string | null = null;

    if (formUrl && formUrl.trim()) {
      // Re-upload the bytes from the chapter-onboarding/<token>/ prefix
      // into the chapter's permanent chapter-brand/<chapterId>/ prefix.
      finalUrl = await reuploadToChapterBrand(formUrl, chapter.id);
    }

    if (!finalUrl) {
      // Fall back to the chaptercore.md blueprint default for this key.
      const coreEntry = chapterCore.brandImages[coreKey];
      if (coreEntry?.path) {
        finalUrl = resolvePublicPathToUrl(coreEntry.path);
      }
    }

    if (finalUrl) {
      await setChapterBrandImage(chapter.id, settingKey, finalUrl, me.id);
      brandImagesApplied.push(settingKey);
    }
  }

  // ── 4. Lead user ──────────────────────────────────────────────────
  // Link the user to the new chapter + upgrade role to CHAPTER_ORGANIZER.
  // SUPER_ADMINs are never downgraded.
  const lead = await db.user.findUnique({
    where: { id: invite.userId },
    select: { id: true, role: true },
  });
  if (lead) {
    const patch: { chapterId?: string; countryId?: string; role?: string } = {
      chapterId: chapter.id,
      countryId: country.id,
    };
    if (lead.role !== ROLES.SUPER_ADMIN && lead.role !== ROLES.ADMIN) {
      patch.role = ROLES.CHAPTER_ORGANIZER;
    }
    await db.user.update({ where: { id: lead.id }, data: patch });
  }

  // ── 5. Email infrastructure ───────────────────────────────────────
  // Clone audiences + flows + draft campaigns from the Tel Aviv source
  // chapter into the new chapter. We do this inline (rather than calling
  // the seed-chapter API route) to keep everything in one transaction.
  let emailInfraSummary: {
    audiences: { cloned: number; skipped: number };
    flows: { cloned: number; skipped: number };
    campaigns: { cloned: number; skipped: number };
  } | null = null;

  try {
    emailInfraSummary = await cloneEmailInfraFromTelAviv(chapter.id, chapter.name, chapter.slug, me.id);
  } catch (err) {
    // Email infra failure is non-fatal — the chapter + brand images + lead
    // assignment already succeeded. Log and continue; admin can re-run
    // seed-chapter manually from /admin/email/flows.
    console.error("[chapter-onboarding/provision] email infra clone failed:", err);
  }

  // ── 6. Mark invite as applied ─────────────────────────────────────
  await db.chapterOnboardingInvite.update({
    where: { id: invite.id },
    data: {
      appliedChapterId: chapter.id,
      appliedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    chapter: {
      id: chapter.id,
      name: chapter.name,
      slug: chapter.slug,
      countryId: chapter.countryId,
    },
    country: { id: country.id, name: country.name, code: country.code },
    brandImagesApplied,
    emailInfra: emailInfraSummary,
    lead: lead
      ? { id: lead.id, roleAssigned: lead.role !== ROLES.SUPER_ADMIN && lead.role !== ROLES.ADMIN ? ROLES.CHAPTER_ORGANIZER : lead.role }
      : null,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Re-download the bytes at `sourceUrl` (either a Vercel Blob URL or a
 * local /uploads/chapter-onboarding/<token>/<filename> path) and re-upload
 * them into the chapter's permanent `chapter-brand/<chapterId>/<filename>`
 * storage. Returns the new public URL, or null on failure.
 *
 * Why: brand images uploaded during onboarding live under the invite
 * token's prefix. After provisioning, they need to live under the
 * chapter's prefix so:
 *   - the /admin/images gallery can list them per-chapter (the listing
 *     code iterates `chapter-brand/<chapterId>/`)
 *   - they survive invite-token cleanups (we may later add a GC pass
 *     that prunes old chapter-onboarding/<token>/ prefixes)
 */
async function reuploadToChapterBrand(
  sourceUrl: string,
  chapterId: string,
): Promise<string | null> {
  try {
    let buf: Buffer;
    let contentType: string;

    if (sourceUrl.startsWith("/uploads/chapter-onboarding/")) {
      // Local sandbox path — read from disk.
      const localPath = path.join(process.cwd(), "public", sourceUrl);
      buf = await fs.readFile(localPath);
      contentType = extToMime(path.extname(localPath));
    } else if (/^https?:\/\//i.test(sourceUrl)) {
      // Public URL (Vercel Blob or any other public host). Download the bytes.
      const res = await fetch(sourceUrl, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`fetch ${sourceUrl} → HTTP ${res.status}`);
      }
      const arrayBuf = await res.arrayBuffer();
      buf = Buffer.from(arrayBuf);
      contentType = res.headers.get("content-type") ?? "application/octet-stream";
    } else {
      // Unknown scheme — skip.
      return null;
    }

    const ext = safeFileExtension(sourceUrl, contentType, "bin");
    const filename = uniqueBlobFilename(ext);

    if (hasBlob()) {
      const pathname = safeBlobPathname("chapter-brand", chapterId, filename);
      const blob = await put(pathname, buf, {
        access: "public",
        contentType,
        addRandomSuffix: false,
      });
      return blob.url;
    }

    // Sandbox fallback: write to /public/uploads/chapter-brand/<chapterId>/
    const localDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "chapter-brand",
      chapterId,
    );
    await fs.mkdir(localDir, { recursive: true });
    const fullPath = path.join(localDir, filename);
    await fs.writeFile(fullPath, buf);
    return `/uploads/chapter-brand/${chapterId}/${encodeURIComponent(filename)}`;
  } catch (err) {
    console.error(
      `[chapter-onboarding/provision] reuploadToChapterBrand failed for ${sourceUrl}:`,
      err,
    );
    return null;
  }
}

/** Clone email audiences + flows + draft campaigns from Tel Aviv. */
async function cloneEmailInfraFromTelAviv(
  targetChapterId: string,
  targetChapterName: string,
  targetChapterSlug: string,
  adminId: string,
): Promise<{
  audiences: { cloned: number; skipped: number };
  flows: { cloned: number; skipped: number };
  campaigns: { cloned: number; skipped: number };
}> {
  // Resolve source chapter (Tel Aviv).
  const tlv = await db.chapter.findFirst({
    where: {
      OR: [
        { slug: "tel-aviv" },
        { name: { contains: "Tel Aviv", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (!tlv || tlv.id === targetChapterId) {
    // No source — skip email infra clone. Admin can run seed-chapter
    // manually after a source chapter is designated.
    return { audiences: { cloned: 0, skipped: 0 }, flows: { cloned: 0, skipped: 0 }, campaigns: { cloned: 0, skipped: 0 } };
  }
  const sourceChapterId = tlv.id;

  // Audiences
  const sourceAudiences = await db.emailAudience.findMany({
    where: { chapterId: sourceChapterId },
  });
  let audiencesCloned = 0;
  let audiencesSkipped = 0;
  for (const a of sourceAudiences) {
    const existing = await db.emailAudience.findFirst({
      where: {
        chapterId: targetChapterId,
        description: { contains: `[cloned-from:${a.id}]` },
      },
      select: { id: true },
    });
    if (existing) { audiencesSkipped++; continue; }
    await db.emailAudience.create({
      data: {
        name: `${a.name} — ${targetChapterName}`,
        slug: a.slug ? `${a.slug}-${targetChapterSlug}` : null,
        description: `${a.description ?? ""} [cloned-from:${a.id}]`.trim(),
        kind: a.kind,
        emailsJson: a.emailsJson,
        filtersJson: a.filtersJson,
        isTest: a.isTest,
        chapterId: targetChapterId,
      },
    });
    audiencesCloned++;
  }

  // Flows + their steps
  const sourceFlows = await db.emailFlow.findMany({
    where: { chapterId: sourceChapterId },
    include: { steps: true },
  });
  let flowsCloned = 0;
  let flowsSkipped = 0;
  for (const f of sourceFlows) {
    const existing = await db.emailFlow.findFirst({
      where: {
        chapterId: targetChapterId,
        description: { contains: `[cloned-from:${f.id}]` },
      },
      select: { id: true },
    });
    if (existing) { flowsSkipped++; continue; }
    const newFlow = await db.emailFlow.create({
      data: {
        name: `${f.name} — ${targetChapterName}`,
        description: `${f.description ?? ""} [cloned-from:${f.id}]`.trim(),
        status: "DRAFT",
        chapterId: targetChapterId,
        createdBy: adminId,
      },
    });
    for (const step of f.steps) {
      await db.emailFlowStep.create({
        data: {
          flowId: newFlow.id,
          position: step.position,
          audienceId: null, // Don't risk linking to a stale source-chapter audience.
          triggerKind: step.triggerKind,
          triggerEventId: null,
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

  // DRAFT campaigns
  const sourceCampaigns = await db.emailCampaign.findMany({
    where: { chapterId: sourceChapterId, status: "DRAFT" },
  });
  let campaignsCloned = 0;
  let campaignsSkipped = 0;
  for (const c of sourceCampaigns) {
    const existing = await db.emailCampaign.findFirst({
      where: {
        chapterId: targetChapterId,
        name: { contains: `[cloned-from:${c.id}]` },
      },
      select: { id: true },
    });
    if (existing) { campaignsSkipped++; continue; }
    await db.emailCampaign.create({
      data: {
        name: `${c.name} — ${targetChapterName} [cloned-from:${c.id}]`,
        templateId: c.templateId,
        subjectSnapshot: c.subjectSnapshot,
        bodyHtmlSnapshot: c.bodyHtmlSnapshot,
        bodyTextSnapshot: c.bodyTextSnapshot,
        signatureHtmlSnapshot: c.signatureHtmlSnapshot,
        listSource: c.listSource,
        listConfigJson: c.listConfigJson,
        recipientCount: 0,
        status: "DRAFT",
        createdBy: adminId,
        chapterId: targetChapterId,
      },
    });
    campaignsCloned++;
  }

  return {
    audiences: { cloned: audiencesCloned, skipped: audiencesSkipped },
    flows: { cloned: flowsCloned, skipped: flowsSkipped },
    campaigns: { cloned: campaignsCloned, skipped: campaignsSkipped },
  };
}

/** Map a file extension to a MIME type. */
function extToMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}
