import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { headers } from "next/headers";
import { LoginForm } from "./login-form";
import { getPublicSettings } from "@/lib/site-settings";
import { getEffectiveBrandImagesBySlug } from "@/lib/chapter-brand-images";
import Image from "next/image";
import {
  resolveBrand,
  getEnvDefaultBrandSlug,
} from "@/lib/brand/resolve-brand";
import type { BrandConfig } from "@/lib/brand/brand-config";
import { BrandLogo, BrandGradientText } from "@/components/brand/brand-logo";
import { resolveBrandAssets } from "@/lib/brand/brand-assets-resolver";

/**
 * /login — brand-aware login page.
 *
 * Per the Brand-Field Platform Plan §2.5.1 (Login URL Contract), the
 * brand shown to a visitor is resolved via a 4-layer chain:
 *
 *   1. URL `?brand=<slug>` parameter  — explicit override (sales demo mode)
 *   2. Request host header             — coma.massapro.com → coma,
 *      aisalon.massapro.com → aisalon
 *   3. User session `user.brandId`     — (not yet implemented)
 *   4. Environment variable            — BRAND_DEFAULT_SLUG, falls back
 *      to "aisalon" if unset
 *
 * Examples:
 *   - https://coma.massapro.com/login                    → Coma branding
 *   - https://aisalon.massapro.com/login                 → AI Salon branding
 *   - https://aisalon.massapro.com/login?brand=coma      → Coma branding (override)
 *   - https://coma.massapro.com/login?brand=google&chapterSlug=tlv
 *                                                        → Google branding (demo)
 *
 * CITY-AWARE HERO COPY (2026-09-19 user spec):
 *   - The city comes from the `?city=` URL param carried by invite links
 *     (e.g. /login?city=Berlin) — NO hard-coded city anywhere.
 *   - With a city, the H1 reads "The Coma home for community builders in
 *     Berlin." Without one it ends at the accent phrase ("...community
 *     builders.") — never a dangling "in".
 *   - The eyebrow is brand-only: "Coma community" / "AI Salon community".
 *
 * CHAPTER-SCOPED BEHAVIOR (images only):
 *   - /login?chapterSlug=<slug> loads that chapter's brand image
 *     overrides (stored in ChapterSetting). Copy is NOT chapter-driven.
 *
 * LOGIN PAGE SECTIONS (per user spec 2026-08-02, revised 2026-09-19):
 *   A. Eyebrow: <p class="text-[0.7rem] font-semibold uppercase
 *      tracking-[0.3em] text-[<accentColor>] mb-4">{Brand} community</p>
 *   B. Headline: <h1 class="text-4xl lg:text-5xl font-extrabold
 *      leading-[1.05] mb-5">The {Brand} community for <span class="ais-gradient-text">
 *      AI builders</span>{cityClause — " in Berlin." or "."}</h1>
 *
 * Both URLs are passed through `next/image` with `unoptimized` when
 * they're external Blob URLs, so they work without configuring
 * `next.config.js` `images.remotePatterns`.
 */

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ chapterSlug?: string; brand?: string; city?: string }>;
}) {
  const { chapterSlug: rawSlug, brand: urlBrand, city: cityParam } =
    await searchParams;

  // Resolve brand from URL + host + env (mirrors the page logic, but
  // metadata runs in a separate RSC pass so we re-resolve here).
  const h = await headers();
  const host = h.get("host");
  const staticBrand = resolveBrand({
    urlBrandSlug: urlBrand,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  // DB-AWARE OVERRIDE — same logic as the main LoginPage function. For
  // new brands created via /admin/brands (cazhype, ...), overlay the
  // DB row's displayName + heroBanner on top of the static config.
  let dbBrand: Awaited<ReturnType<typeof resolveBrandAssets>> | null = null;
  const requestedSlug = (urlBrand ?? "").trim().toLowerCase();
  if (requestedSlug && requestedSlug !== "aisalon" && requestedSlug !== "coma") {
    try {
      dbBrand = await resolveBrandAssets(requestedSlug);
      if (!dbBrand.dbRowExists) dbBrand = null;
    } catch (err) {
      console.warn("[/login metadata] DB brand lookup failed:", err instanceof Error ? err.message : err);
    }
  }
  const brand = dbBrand
    ? {
        ...staticBrand,
        slug: dbBrand.slug as typeof staticBrand.slug,
        displayName: dbBrand.displayName,
        heroBanner: dbBrand.assets.heroBannerUrl || staticBrand.heroBanner,
      }
    : staticBrand;

  const chapterSlug = rawSlug || brand.defaultChapterSlug;
  const settings = await getEffectiveBrandImagesBySlug(chapterSlug, brand.slug);
  // Hero image resolution chain (per BrandConfig.heroBanner doc):
  // BRAND IDENTITY TAKES PRECEDENCE — the brand-level hero banner is the
  // canonical visual for the brand, applied uniformly across all chapters
  // of that brand (a Coma user in Montreal sees the same Coma banner as a
  // Coma user anywhere else in that brand). Chapter DB overrides only kick
  // in when the brand has no heroBanner (e.g. AIS today, which still uses
  // per-chapter photos until a proper AIS brand hero is produced).
  //   1. Brand-level hero (`brand.heroBanner`) — Coma's transparent PNG
  //   2. Chapter DB override (`ChapterSetting.loginBanner`) — AIS only
  //   3. Hard-coded fallback `/images/falafel-meerkat.jpg`
  const bannerUrl =
    brand.heroBanner || settings.loginBanner || "/images/falafel-meerkat.jpg";

  // Metadata title is brand-only, plus the invite city when present.
  // No DB lookup, no hard-coded city (2026-09-19 spec).
  const city = (cityParam ?? "").trim();
  const brandDisplay = city
    ? `${brand.displayName} ${city}`
    : brand.displayName;
  const title = `Login — ${brandDisplay}`;
  return {
    title,
    description: `${brand.loginSubtitle}`,
    openGraph: {
      title,
      description: brand.loginSubtitle,
      images: [
        {
          url: bannerUrl,
          width: 1200,
          height: 630,
        alt: brandDisplay,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: brand.loginSubtitle,
      images: [bannerUrl],
    },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    chapterSlug?: string;
    brand?: string;
    callbackUrl?: string;
    city?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  if (session) redirect("/events");

  const {
    chapterSlug: rawSlug,
    brand: urlBrand,
    callbackUrl: callbackParam,
    city: cityParam,
  } = await searchParams;

  // === 4-LAYER BRAND RESOLUTION ===
  // Per Brand-Field Platform Plan §2.5.1: URL → host → user → env
  const h = await headers();
  const host = h.get("host");
  const staticBrand: BrandConfig = resolveBrand({
    urlBrandSlug: urlBrand,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  // ── DB-AWARE BRAND OVERRIDE (2026-09-30) ──────────────────────────────
  // The static `resolveBrand()` only knows about the two hardcoded brands
  // ("aisalon" + "coma"). For new brands created via /admin/brands
  // (cazhype, danone, hitechai, ...), it falls back to Coma's BrandConfig.
  // That means /login?brand=ch used to render Coma's branding even when
  // cazhype had uploaded its own logo + hero + palette via the onboarding
  // hub. This DB lookup overrides the static config when a Brand row
  // exists in the DB with the requested slug.
  //
  // Resolution chain (per asset):
  //   1. Brand DB row column (admin-uploaded via /onboarding/[slug])
  //   2. AIS hardcoded URL (only if the brand is "aisalon")
  //   3. Static BrandConfig (Coma fallback for unknown slugs)
  //
  // We coalesce into a `brand` object that mirrors the BrandConfig shape
  // so the rest of the page reads from a single source of truth.
  let dbBrand: Awaited<ReturnType<typeof resolveBrandAssets>> | null = null;
  const requestedSlug = (urlBrand ?? "").trim().toLowerCase();
  if (requestedSlug && requestedSlug !== "aisalon" && requestedSlug !== "coma") {
    try {
      dbBrand = await resolveBrandAssets(requestedSlug);
      // Only override if the DB row exists for the requested slug —
      // resolveBrandAssets always returns something (falls back to
      // Coma), but dbRowExists tells us whether the brand is real.
      if (!dbBrand.dbRowExists) dbBrand = null;
    } catch (err) {
      console.warn("[/login] DB brand lookup failed:", err instanceof Error ? err.message : err);
    }
  }

  // Build the effective brand object — start from the static config,
  // then overlay the DB-uploaded assets + palette + copy if available.
  const brand: BrandConfig = dbBrand
    ? {
        ...staticBrand,
        // Override identity fields from the DB row.
        slug: dbBrand.slug as BrandConfig["slug"],
        displayName: dbBrand.displayName,
        wordmark: dbBrand.slug, // DB brands use their slug as wordmark
        tagline: dbBrand.displayName, // DB brands don't have a separate tagline field
        primaryColor: dbBrand.palette.primary,
        accentColor: dbBrand.palette.accent,
        secondaryColor: dbBrand.palette.secondary,
        gradient: dbBrand.palette.gradient,
        // Override asset URLs from the DB row (admin-uploaded via
        // /onboarding/[slug]). When null in the DB, the resolver
        // already fell back to the appropriate default (Coma or AIS).
        heroBanner: dbBrand.assets.heroBannerUrl || staticBrand.heroBanner,
        favicon: dbBrand.assets.faviconUrl || staticBrand.favicon,
        logo: dbBrand.assets.logoUrl || staticBrand.logo,
        // Override login copy templates.
        loginEyebrowTemplate: dbBrand.loginCopy.eyebrow,
        loginHeadlineTemplate: dbBrand.loginCopy.headline,
        loginSubtitle: dbBrand.loginCopy.subtitle,
        loginFormHeading: dbBrand.loginCopy.formHeading,
        loginFormSubheadingTemplate: dbBrand.loginCopy.formSubheading,
        footerCredit: dbBrand.loginCopy.footerCredit,
      }
    : staticBrand;

  // Use the brand's default chapter when no chapterSlug is provided.
  const chapterSlug = rawSlug || brand.defaultChapterSlug;

  // Load effective brand images — chapter-scoped overrides take
  // precedence when chapterSlug is present. Brand-resolved globals:
  // "<key>@<brand>" → "<key>" → defaults (per-brand tabs at /admin/images).
  const settings = await getEffectiveBrandImagesBySlug(chapterSlug, brand.slug);
  // Hero image resolution chain — BRAND IDENTITY TAKES PRECEDENCE:
  //   1. Brand-level hero (`brand.heroBanner`) — Coma's transparent PNG
  //      banner (hosted on Vercel Blob). Applied uniformly across
  //      all chapters of that brand (a Coma user in Montreal sees the
  //      same Coma banner in every chapter of the brand).
  //   2. Chapter DB override (`ChapterSetting.loginHero`) — admin can
  //      upload a chapter-specific hero photo (e.g. a city skyline).
  //      Only kicks in when the brand has no heroBanner (e.g. AIS today).
  //   3. Hard-coded fallback `/images/falafel-meerkat.jpg` — legacy AIS
  //      mark, only fires when both tiers above are empty.
  const heroUrl =
    brand.heroBanner || settings.loginHero || "/images/falafel-meerkat.jpg";
  // The mark in the logo uses the admin-selected loginBanner brand
  // asset (falls back to the hardcoded falafel-meerkat.jpg if not set).
  const markUrl = settings.loginBanner || "/images/falafel-meerkat.jpg";

  // Is the hero an external URL (Vercel Blob) or a relative path?
  const heroIsExternal = heroUrl.startsWith("http");
  // Is this brand-level hero a transparent PNG that floats on the panel
  // (Coma), or a opaque photo that needs a card frame (AIS legacy)?
  // True whenever the brand declares a heroBanner — chapter overrides
  // cannot un-brand the page once a brand hero is set in code.
  const heroIsBrandBanner = Boolean(brand.heroBanner);

  const callbackUrl = callbackParam;

  // CITY from the invite URL (2026-09-19 spec) — the ONLY copy driver.
  // Invite links carry ?city=Berlin; with no city the hero copy ends at
  // the accent phrase (never a dangling "in" or a hard-coded city).
  const city = (cityParam ?? "").trim();
  const cityClause = city ? ` in ${city}.` : ".";

  // Resolve login copy templates → final strings. Eyebrow is brand-only
  // ("Coma community" / "AI Salon community"); the headline interpolates
  // {brandName} + {cityClause} (" in Berlin." / ".").
  const eyebrow = brand.loginEyebrowTemplate.replace(
    /\{brandName\}/g,
    brand.displayName
  );
  // Headline has {accentSpanOpen}{accentSpanClose} wrapping the highlighted phrase.
  // We split on those tokens and render the middle as a gradient span.
  const headlineParts = splitHeadlineTemplate(
    brand.loginHeadlineTemplate,
    brand.displayName,
    cityClause
  );

  return (
    <main
      className="min-h-screen grid md:grid-cols-2"
      style={{ ["--brand-primary" as string]: brand.primaryColor }}
    >
      {/* === LEFT — brand panel (dark with brand gradient orb) === */}
      <section
        className="relative hidden md:flex flex-col justify-between p-12 overflow-hidden"
        style={{ backgroundColor: brand.primaryColor }}
      >
        {/* Top-left: brand wordmark */}
        <div className="relative z-10 text-white">
          <BrandLogo
            wordmark={brand.wordmark}
            tagline={brand.tagline}
            variant="horizontal-tagline"
            color="white"
            className="text-[2.4rem]"
          />
        </div>

        {/* Center: dynamic brand hero image + chapter tagline */}
        <div className="relative z-10 text-white max-w-md">
          {heroIsBrandBanner ? (
            // Brand-level hero (transparent PNG, e.g. Coma's banner):
            // render unframed at full panel width so the artwork floats
            // directly on the brand-colored background. No card, no
            // border, no rounding — the image IS the banner.
            <div className="mb-8 relative w-full aspect-[3/2]">
              <Image
                src={heroUrl}
                alt={`${brand.displayName} — brand banner`}
                fill
                sizes="(max-width: 768px) 100vw, 480px"
                className="object-contain"
                priority
                unoptimized={heroIsExternal}
              />
            </div>
          ) : (
            // Chapter-scoped photo or legacy fallback: render as a square
            // card with subtle border (preserves the original AIS look).
            <div className="mb-6 relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden border border-white/10">
              <Image
                src={heroUrl}
                alt={
                  city
                    ? `${brand.displayName} ${city} — brand image`
                    : `${brand.displayName} — brand image`
                }
                fill
                sizes="(max-width: 768px) 240px, 320px"
                className="object-contain"
                priority
                unoptimized={heroIsExternal}
              />
            </div>
          )}
          {/* Eyebrow */}
          <p
            className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-4"
            style={{ color: brand.accentColor }}
          >
            {eyebrow}
          </p>
          {/* Headline with gradient-highlighted phrase */}
          <h1 className="text-4xl lg:text-5xl font-extrabold leading-[1.05] mb-5 text-white">
            {headlineParts.before}
            <BrandGradientText gradient={brand.gradient}>
              {headlineParts.accent}
            </BrandGradientText>
            {headlineParts.after}
          </h1>
          <p className="text-white/70 text-base leading-relaxed">
            {brand.loginSubtitle}
          </p>
        </div>

        {/* Bottom-left: footer credit */}
        <div className="relative z-10 text-white/50 text-xs">
          {brand.footerCredit}
        </div>

        {/* Decorative brand gradient orb */}
        <div
          aria-hidden
          className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full opacity-30 blur-3xl"
          style={{ background: brand.gradient }}
        />
      </section>

      {/* === RIGHT — login form (white) === */}
      <section className="flex flex-col justify-center p-8 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-sm mx-auto">
          {/* Mobile-only brand wordmark */}
          <div className="md:hidden mb-8 flex flex-col items-center text-center">
            <BrandLogo
              wordmark={brand.wordmark}
              tagline={brand.tagline}
              variant="horizontal-tagline"
              color="black"
              className="text-[1.6rem]"
            />
          </div>

          <h2 className="text-2xl font-extrabold text-black mb-1">
            {brand.loginFormHeading}
          </h2>
          <p className="text-sm text-black/80 mb-8">
            {brand.loginFormSubheadingTemplate.replace(
              /\{cityClause\}/g,
              cityClause
            )}
          </p>

          <LoginForm
            callbackUrl={callbackUrl ?? undefined}
            brandSlug={brand.slug}
            chapterSlug={chapterSlug}
            primaryColor={brand.primaryColor}
            accentColor={brand.accentColor}
            secondaryColor={brand.secondaryColor}
          />

          <p className="mt-8 text-xs text-black/80 leading-relaxed">
            By logging in you agree to the {brand.displayName} community
            guidelines. Only registered members can attend events.
          </p>
        </div>
      </section>
    </main>
  );
}

/**
 * Split a headline template into three parts: before, accent (gradient),
 * and after.
 *
 * Template format: "The {brandName} community for {accentSpanOpen}AI builders{accentSpanClose}{cityClause}"
 * Tokens:
 *   - {brandName}       — replaced with the brand display name
 *   - {accentSpanOpen}  — start of gradient-highlighted phrase
 *   - {accentSpanClose} — end of gradient-highlighted phrase
 *   - {cityClause}      — " in <city>." when ?city= is present, "." otherwise
 */
function splitHeadlineTemplate(
  template: string,
  brandName: string,
  cityClause: string
): { before: string; accent: string; after: string } {
  const withChapter = template
    .replace(/\{brandName\}/g, brandName)
    .replace(/\{cityClause\}/g, cityClause);
  const openIdx = withChapter.indexOf("{accentSpanOpen}");
  const closeIdx = withChapter.indexOf("{accentSpanClose}");

  if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) {
    // Malformed template — return the whole thing as "before"
    return { before: withChapter, accent: "", after: "" };
  }

  const before = withChapter.slice(0, openIdx);
  const accent = withChapter.slice(
    openIdx + "{accentSpanOpen}".length,
    closeIdx
  );
  const after = withChapter.slice(closeIdx + "{accentSpanClose}".length);

  return { before, accent, after };
}
