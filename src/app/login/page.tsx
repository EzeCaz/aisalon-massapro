import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import { getPublicSettings } from "@/lib/site-settings";
import { getEffectiveBrandImagesBySlug } from "@/lib/chapter-brand-images";
import { db } from "@/lib/db";
import Image from "next/image";

/**
 * /login
 *
 * Server-rendered. Pulls the current `loginHero` and `loginBanner` URLs
 * from the SiteSetting table (admin-managed via /admin/images) and uses
 * them as the hero image in the brand panel and the OG/Twitter preview
 * image respectively. Falls back to the hardcoded defaults if the DB is
 * unreachable or no selection has been made yet.
 *
 * CHAPTER-SCOPED BEHAVIOR (PER USER SPEC 2026-08-02):
 *   - /login with no `?chapterSlug=` defaults to the Tel Aviv chapter
 *     (the original AI Salon chapter). The H1, eyebrow, hero image,
 *     banner, and metadata all reflect the Tel Aviv chapter.
 *   - /login?chapterSlug=<slug> loads that chapter's brand image
 *     overrides (stored in ChapterSetting) and renders the chapter's
 *     name in the H1 + eyebrow text.
 *   - Per user spec section 3: "for each chapter there should be a login
 *     page like currently this is for tel aviv
 *     https://aisalon.massapro.com/login so montreal should be
 *     https://aisalon.massapro.com/login?chapterSlug=mtl"
 *
 * LOGIN PAGE SECTIONS (PER USER SPEC 2026-08-02):
 *   A. Eyebrow: <p class="text-[0.7rem] font-semibold uppercase
 *      tracking-[0.3em] text-[#00E6FF] mb-4">{Chapter_name} Chapter</p>
 *   B. Headline: <h1 class="text-4xl lg:text-5xl font-extrabold
 *      leading-[1.05] mb-5">The community for <span class="ais-gradient-text">
 *      AI builders</span> in {Chapter_name}.</h1>
 *
 * Both URLs are passed through `next/image` with `unoptimized` when
 * they're external Blob URLs, so they work without configuring
 * `next.config.js` `images.remotePatterns`.
 */

/** Default chapter slug when none is provided in the URL. PER USER SPEC
 *  2026-08-02: "/login" with no chapterSlug should behave like Tel Aviv. */
const DEFAULT_CHAPTER_SLUG = "tel-aviv";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ chapterSlug?: string }>;
}) {
  const { chapterSlug: rawSlug } = await searchParams;
  const chapterSlug = rawSlug || DEFAULT_CHAPTER_SLUG;
  const settings = await getEffectiveBrandImagesBySlug(chapterSlug);
  const bannerUrl = settings.loginBanner || "/images/falafel-meerkat.jpg";

  // Look up the chapter name for the metadata title. Fall back to a
  // humanized version of the slug if the chapter doesn't exist.
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

  const title = `Login — AI Salon ${chapterName}`;
  return {
    title,
    description: `Log in to AI Salon ${chapterName} — the community for AI builders, founders, CMOs and investors in ${chapterName}.`,
    openGraph: {
      title,
      description: `Log in to AI Salon ${chapterName} — the community for AI builders in ${chapterName}.`,
      images: [{ url: bannerUrl, width: 1200, height: 630, alt: `AI Salon ${chapterName}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: `Log in to AI Salon ${chapterName} — the community for AI builders in ${chapterName}.`,
      images: [bannerUrl],
    },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ chapterSlug?: string; callbackUrl?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session) redirect("/events");

  const { chapterSlug: rawSlug, callbackUrl: callbackParam } = await searchParams;

  // PER USER SPEC 2026-08-02: default to Tel Aviv when no chapterSlug is
  // provided. This preserves the original behaviour where /login was the
  // Tel Aviv login page.
  const chapterSlug = rawSlug || DEFAULT_CHAPTER_SLUG;

  // Load effective brand images — chapter-scoped overrides take
  // precedence when chapterSlug is present.
  const settings = await getEffectiveBrandImagesBySlug(chapterSlug);
  const heroUrl = settings.loginHero || "/images/falafel-meerkat.jpg";
  // The meerkat mark in the logo uses the admin-selected loginBanner brand
  // asset (falls back to the hardcoded falafel-meerkat.jpg if not set).
  const markUrl = settings.loginBanner || "/images/falafel-meerkat.jpg";

  // Is the hero an external URL (Vercel Blob) or a relative path?
  const heroIsExternal = heroUrl.startsWith("http");

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

  return (
    <main className="min-h-screen grid md:grid-cols-2">
      {/* Left — brand panel (black with AIS GRADIENT polyhedron motif) */}
      <section className="relative hidden md:flex flex-col justify-between p-12 ais-poly-bg overflow-hidden">
        {/* Top-left: stacked aisalon logo with Falafel Meerkat mark (white) */}
        <div className="relative z-10 text-white">
          <AiSalonLogoServer variant="horizontal-tagline" color="white" className="text-[2.4rem]" markSrc={markUrl} />
        </div>

        {/* Center: dynamic brand hero image + chapter tagline */}
        <div className="relative z-10 text-white max-w-md">
          <div className="mb-6 relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden border border-white/10">
            <Image
              src={heroUrl}
              alt={`AI Salon ${chapterName} — brand image`}
              fill
              sizes="(max-width: 768px) 240px, 320px"
              className="object-contain"
              priority
              unoptimized={heroIsExternal}
            />
          </div>
          {/* PER USER SPEC 2026-08-02 (Section A): chapter eyebrow.
              Uses the chapter's display name (e.g. "Tel Aviv", "Montreal"). */}
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#00E6FF] mb-4">
            {chapterName} Chapter
          </p>
          {/* PER USER SPEC 2026-08-02 (Section B): chapter headline.
              "The community for AI builders in {Chapter_name}." */}
          <h1 className="text-4xl lg:text-5xl font-extrabold leading-[1.05] mb-5">
            The community for <span className="ais-gradient-text">AI builders</span> in {chapterName}.
          </h1>
          <p className="text-white/70 text-base leading-relaxed">
            Log in to access events, upload photos from our gatherings, browse the shared
            slideshow, and connect with fellow founders, CMOs, investors and AI builders.
          </p>
        </div>

        {/* Bottom-left: MassaPro credit */}
        <div className="relative z-10 text-white/50 text-xs">
          Platform by{" "}
          <a
            href="https://massapro.com"
            className="text-white/80 underline-offset-4 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            MassaPro
          </a>{" "}
          · Powered by AI Salon
        </div>

        {/* Decorative AIS GRADIENT orb */}
        <div
          aria-hidden
          className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "conic-gradient(from 180deg at 50% 50%, #FF005A, #820A7D, #004F98, #00E6FF, #FF005A)",
          }}
        />
      </section>

      {/* Right — login form (white) */}
      <section className="flex flex-col justify-center p-8 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-sm mx-auto">
          {/* Mobile-only logo with Falafel Meerkat mark.
              NOTE: We deliberately use variant="horizontal" (no built-in
              tagline) and render ONE combined subtitle line below —
              "Empowering AI Connections in {ChapterName}" — so the slogan is
              shown exactly once on mobile (previous version duplicated it
              between the logo tagline and the subtitle). */}
          <div className="md:hidden mb-8 flex flex-col items-center text-center">
            <AiSalonLogoServer variant="horizontal" color="black" className="text-[1.6rem]" markSrc={markUrl} />
            <div className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-black/80">
              Empowering AI Connections in {chapterName}
            </div>
          </div>

          <h2 className="text-2xl font-extrabold text-black mb-1">Welcome</h2>
          <p className="text-sm text-black/80 mb-8">
            Sign in with Google, or use your email and password to access the AI
            Salon {chapterName} community.
          </p>

          <LoginForm callbackUrl={callbackUrl ?? undefined} />

          <p className="mt-8 text-xs text-black/80 leading-relaxed">
            By logging in you agree to the AI Salon community guidelines. Only registered
            members can attend events.
          </p>
        </div>
      </section>
    </main>
  );
}
