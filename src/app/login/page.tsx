import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { headers } from "next/headers";
import { LoginForm } from "./login-form";
import { getPublicSettings } from "@/lib/site-settings";
import { getEffectiveBrandImagesBySlug } from "@/lib/chapter-brand-images";
import { db } from "@/lib/db";
import Image from "next/image";
import {
  resolveBrand,
  getEnvDefaultBrandSlug,
} from "@/lib/brand/resolve-brand";
import type { BrandConfig } from "@/lib/brand/brand-config";
import { BrandLogo, BrandGradientText } from "@/components/brand/brand-logo";

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
 * CHAPTER-SCOPED BEHAVIOR:
 *   - /login with no `?chapterSlug=` defaults to the brand's home chapter
 *     (Tel Aviv for both AIS and Coma).
 *   - /login?chapterSlug=<slug> loads that chapter's brand image
 *     overrides (stored in ChapterSetting) and renders the chapter's
 *     name in the H1 + eyebrow text.
 *
 * LOGIN PAGE SECTIONS (per user spec 2026-08-02):
 *   A. Eyebrow: <p class="text-[0.7rem] font-semibold uppercase
 *      tracking-[0.3em] text-[<accentColor>] mb-4">{Chapter_name} Chapter</p>
 *   B. Headline: <h1 class="text-4xl lg:text-5xl font-extrabold
 *      leading-[1.05] mb-5">The community for <span class="ais-gradient-text">
 *      AI builders</span> in {Chapter_name}.</h1>
 *
 * Both URLs are passed through `next/image` with `unoptimized` when
 * they're external Blob URLs, so they work without configuring
 * `next.config.js` `images.remotePatterns`.
 */

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ chapterSlug?: string; brand?: string }>;
}) {
  const { chapterSlug: rawSlug, brand: urlBrand } = await searchParams;

  // Resolve brand from URL + host + env (mirrors the page logic, but
  // metadata runs in a separate RSC pass so we re-resolve here).
  const h = await headers();
  const host = h.get("host");
  const brand = resolveBrand({
    urlBrandSlug: urlBrand,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  const chapterSlug = rawSlug || brand.defaultChapterSlug;
  const settings = await getEffectiveBrandImagesBySlug(chapterSlug);
  // Hero image resolution chain (per BrandConfig.heroBanner doc):
  //   1. Chapter DB override (`ChapterSetting.loginBanner`)
  //   2. Brand-level hero (`brand.heroBanner`)
  //   3. Hard-coded fallback
  const bannerUrl =
    settings.loginBanner || brand.heroBanner || "/images/falafel-meerkat.jpg";

  // Look up the chapter name for the metadata title.
  let chapterName = "Tel Aviv";
  try {
    const chapter = await db.chapter.findUnique({
      where: { slug: chapterSlug },
      select: { name: true },
    });
    if (chapter) chapterName = chapter.name;
  } catch {
    // DB unreachable — keep default "Tel Aviv".
  }

  const title = `Login — ${brand.displayName} ${chapterName}`;
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
          alt: `${brand.displayName} ${chapterName}`,
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
  }>;
}) {
  const session = await getServerSession(authOptions);
  if (session) redirect("/events");

  const { chapterSlug: rawSlug, brand: urlBrand, callbackUrl: callbackParam } =
    await searchParams;

  // === 4-LAYER BRAND RESOLUTION ===
  // Per Brand-Field Platform Plan §2.5.1: URL → host → user → env
  const h = await headers();
  const host = h.get("host");
  const brand: BrandConfig = resolveBrand({
    urlBrandSlug: urlBrand,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  // Use the brand's default chapter when no chapterSlug is provided.
  const chapterSlug = rawSlug || brand.defaultChapterSlug;

  // Load effective brand images — chapter-scoped overrides take
  // precedence when chapterSlug is present.
  const settings = await getEffectiveBrandImagesBySlug(chapterSlug);
  // Hero image resolution chain (per BrandConfig.heroBanner doc):
  //   1. Chapter DB override (`ChapterSetting.loginHero`) — admin can
  //      upload a chapter-specific hero photo (e.g. a Tel Aviv skyline).
  //   2. Brand-level hero (`brand.heroBanner`) — Coma's transparent PNG
  //      banner at /brand/coma/coma-hero.png.
  //   3. Hard-coded fallback `/images/falafel-meerkat.jpg` — legacy AIS
  //      mark, only fires when both tiers above are empty.
  const heroUrl =
    settings.loginHero || brand.heroBanner || "/images/falafel-meerkat.jpg";
  // The mark in the logo uses the admin-selected loginBanner brand
  // asset (falls back to the hardcoded falafel-meerkat.jpg if not set).
  const markUrl = settings.loginBanner || "/images/falafel-meerkat.jpg";

  // Is the hero an external URL (Vercel Blob) or a relative path?
  const heroIsExternal = heroUrl.startsWith("http");
  // Is this brand-level hero a transparent PNG that floats on the panel
  // (Coma), or a opaque photo that needs a card frame (AIS legacy)?
  // We detect by checking if the hero resolves to a brand-level asset.
  const heroIsBrandBanner = Boolean(brand.heroBanner) && !settings.loginHero;

  const callbackUrl = callbackParam;

  // Look up the chapter name from the DB. Fall back to a humanized
  // version of the slug (e.g. "mtl" → "Mtl") if the chapter doesn't
  // exist or the DB is unreachable.
  let chapterName = chapterSlug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  try {
    const chapter = await db.chapter.findUnique({
      where: { slug: chapterSlug },
      select: { name: true },
    });
    if (chapter) chapterName = chapter.name;
  } catch {
    // DB unreachable — keep the humanized slug.
  }

  // Resolve login copy templates → final strings with chapter name interpolated.
  const eyebrow = brand.loginEyebrowTemplate.replace(
    "{chapterName}",
    chapterName
  );
  // Headline has {accentSpanOpen}{accentSpanClose} wrapping the highlighted phrase.
  // We split on those tokens and render the middle as a gradient span.
  const headlineParts = splitHeadlineTemplate(
    brand.loginHeadlineTemplate,
    chapterName
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
                alt={`${brand.displayName} ${chapterName} — brand image`}
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
              "{chapterName}",
              chapterName
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
 * Template format: "The community for {accentSpanOpen}AI builders{accentSpanClose} in {chapterName}."
 * Tokens:
 *   - {accentSpanOpen}  — start of gradient-highlighted phrase
 *   - {accentSpanClose} — end of gradient-highlighted phrase
 *   - {chapterName}     — replaced with the chapter display name
 */
function splitHeadlineTemplate(
  template: string,
  chapterName: string
): { before: string; accent: string; after: string } {
  const withChapter = template.replace("{chapterName}", chapterName);
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
