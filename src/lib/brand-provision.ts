import { db } from "@/lib/db";
import { BRANDS, FALLBACK_DEFAULT_BRAND } from "@/lib/brand/brand-config";
import { resolveEmailBrandContext } from "@/lib/email-brand-context";
import type { BrandOnboardingFormData } from "@/lib/brand-onboarding-types";

/**
 * Provision a new Brand row from a brand-onboarding form submission.
 *
 * Skipped fields inherit from the platform default brand (Coma), so a
 * lead who skips the entire form still gets a working brand with
 * Coma's defaults — this is the "those items that are skipped, coma
 * will be the default brand" spec.
 *
 * The new brand row is created with `status = "ACTIVE"` (visible
 * immediately) and `parentBrandId = <coma.brandId>` (Coma is the root
 * of the brand hierarchy — every new brand is a child of Coma).
 *
 * Returns the created Brand row.
 *
 * This function does NOT update the BrandOnboardingInvite row — the
 * caller is responsible for stamping `appliedBrandId` + `appliedAt` on
 * the invite after this succeeds.
 */
export async function provisionBrandFromSubmission(opts: {
  submission: BrandOnboardingFormData;
  /** The Super Admin user who triggered the provision action. */
  appliedByUserId: string;
}): Promise<{ brandId: string; brandSlug: string }> {
  const { submission } = opts;
  const coma = BRANDS[FALLBACK_DEFAULT_BRAND]; // { slug: "coma", displayName: "Coma", ... }
  // Email context carries the fromName + contactEmail defaults.
  const comaEmail = resolveEmailBrandContext("coma");
  const comaRow = await db.brand.findFirst({
    where: { slug: coma.slug },
    select: { id: true },
  });
  if (!comaRow) {
    throw new Error(
      "provisionBrandFromSubmission: Coma brand row not found in DB — " +
        "the platform parent must exist before any child brand can be created."
    );
  }

  // Resolve all fields with Coma fallback for skipped ones.
  const slug = (submission.brandSlug || "").trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug)) {
    throw new Error(
      `provisionBrandFromSubmission: invalid brand slug "${slug}". ` +
        "Must be 2-40 lowercase letters/digits/hyphens."
    );
  }
  const displayName = (submission.brandName || "").trim();
  if (!displayName) {
    throw new Error("provisionBrandFromSubmission: brandName is required.");
  }
  const wordmark = (submission.wordmark || "").trim().toLowerCase() || displayName.toLowerCase();
  const tagline = (submission.tagline || "").trim() || coma.tagline;
  const primaryColor = (submission.primaryColor || "").trim() || coma.primaryColor;
  const secondaryColor = (submission.secondaryColor || "").trim() || coma.secondaryColor;
  const accentColor = (submission.accentColor || "").trim() || coma.accentColor;
  const gradient = (submission.gradient || "").trim() || coma.gradient;
  const heroBannerUrl = (submission.heroBannerUrl || "").trim() || null;
  const faviconUrl = (submission.faviconUrl || "").trim() || null;
  const logoUrl = (submission.logoUrl || "").trim() || null;
  const emailLogoUrl = (submission.emailLogoUrl || "").trim() || null;
  const loginEyebrowTemplate =
    (submission.loginEyebrowTemplate || "").trim() || coma.loginEyebrowTemplate;
  const loginHeadlineTemplate =
    (submission.loginHeadlineTemplate || "").trim() || coma.loginHeadlineTemplate;
  const loginSubtitle = (submission.loginSubtitle || "").trim() || coma.loginSubtitle;
  const loginFormHeading =
    (submission.loginFormHeading || "").trim() || `Welcome to ${displayName}`;
  const loginFormSubheadingTemplate =
    (submission.loginFormSubheadingTemplate || "").trim() || coma.loginFormSubheadingTemplate;
  const footerCredit =
    (submission.footerCredit || "").trim() ||
    `Platform by MassaPro · Powered by ${displayName}`;
  const emailFromName = (submission.emailFromName || "").trim() || comaEmail.fromName;
  const emailContactEmail = (submission.emailContactEmail || "").trim() || comaEmail.contactEmail;
  const apexDomain = (submission.apexDomain || "").trim() || "platform.joincoma.com";
  const domainArchitecture = submission.domainArchitecture || "single";

  // Slug uniqueness check — prevent accidental dupes.
  const existing = await db.brand.findUnique({ where: { slug }, select: { id: true } });
  if (existing) {
    throw new Error(
      `provisionBrandFromSubmission: brand slug "${slug}" is already in use. ` +
        "Pick a different slug and re-submit the form."
    );
  }

  const brand = await db.brand.create({
    data: {
      slug,
      displayName,
      wordmark,
      tagline,
      primaryColor,
      accentColor,
      secondaryColor,
      gradient,
      heroBannerUrl,
      faviconUrl,
      logoUrl,
      emailLogoUrl,
      loginEyebrowTemplate,
      loginHeadlineTemplate,
      loginSubtitle,
      loginFormHeading,
      loginFormSubheadingTemplate,
      footerCredit,
      emailFromName,
      emailContactEmail,
      domainArchitecture,
      apexDomain,
      appDomain: apexDomain, // single-architecture: app = apex
      status: "ACTIVE",
      onboardedAt: new Date(),
      parentBrandId: comaRow.id,
    },
    select: { id: true, slug: true },
  });

  return { brandId: brand.id, brandSlug: brand.slug };
}
