import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding, INTERESTED_IN_OPTIONS, PROFILE_CATEGORIES_OPTIONS } from "@/lib/onboarding";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import { OnboardingForm } from "./onboarding-form";
import { getEffectiveBrandImagesBySlug } from "@/lib/chapter-brand-images";

/** Default chapter slug when none is provided. Mirrors /login behaviour. */
const DEFAULT_CHAPTER_SLUG = "tel-aviv";

/**
 * Resolve the chapter to show on /onboarding.
 *
 * Priority:
 *   1. `?chapterSlug=` URL query param (e.g. user clicked "login with mtl"
 *      and got redirected here after auth).
 *   2. The signed-in user's `chapterId` — set by an admin or by a previous
 *      chapter-onboarding flow. Useful for returning users who somehow
 *      re-land on /onboarding.
 *   3. DEFAULT_CHAPTER_SLUG ("tel-aviv") — the original AI Salon chapter,
 *      used as the platform-wide fallback.
 *
 * Returns `{ slug, name }` where `name` is the chapter's display name
 * (e.g. "Tel Aviv", "Montreal") — falls back to a humanized version of
 * the slug if the chapter row doesn't exist.
 */
async function resolveChapter(
  urlSlug: string | undefined,
  userChapterId: string | null | undefined
): Promise<{ slug: string; name: string }> {
  let slug = urlSlug || DEFAULT_CHAPTER_SLUG;

  // If no URL slug but the user has a chapterId, look up its slug.
  if (!urlSlug && userChapterId) {
    try {
      const ch = await db.chapter.findUnique({
        where: { id: userChapterId },
        select: { slug: true, name: true },
      });
      if (ch) {
        return { slug: ch.slug, name: ch.name };
      }
    } catch {
      // DB unreachable — fall through to slug-only lookup below.
    }
  }

  // Look up the chapter by slug to get its display name.
  let name = slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  try {
    const ch = await db.chapter.findUnique({
      where: { slug },
      select: { name: true },
    });
    if (ch) name = ch.name;
  } catch {
    // DB unreachable — keep the humanized slug.
  }

  return { slug, name };
}

/**
 * /onboarding — first-time intake form for brand-new users.
 *
 * Auth gate:
 *   1. Not signed in  → redirect to /login?callbackUrl=/onboarding
 *   2. Signed in but already onboarded (onboardedAt set, OR pre-imported
 *      via importSource) → redirect to /events (no need to fill the form)
 *   3. Signed in and needs onboarding → render the form
 *
 * CHAPTER-SCOPED BEHAVIOR:
 *   - /onboarding?chapterSlug=mtl renders the page with the Montreal
 *     chapter name + Montreal brand images (hero/banner/logo mark).
 *   - /onboarding with no query param falls back to the user's chapterId
 *     (if set), otherwise to the Tel Aviv chapter (DEFAULT_CHAPTER_SLUG).
 *   - This mirrors the /login?chapterSlug= behaviour so the chapter
 *     context is preserved through the entire login → onboarding flow.
 */
export async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ chapterSlug?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/onboarding");
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      company: true,
      mobile: true,
      linkedinUrl: true,
      bio: true,
      title: true,
      chapterId: true,
      importSource: true,
      onboardedAt: true,
    },
  });
  if (!me) {
    redirect("/login?callbackUrl=/onboarding");
  }

  if (!needsOnboarding(me)) {
    redirect("/events");
  }

  const { chapterSlug: urlSlug } = await searchParams;
  const { slug: chapterSlug, name: chapterName } = await resolveChapter(
    urlSlug,
    me.chapterId
  );

  // Load chapter-scoped brand images. loginBanner is used as the meerkat
  // mark in the logo (per /login page convention). Falls back to the
  // global SiteSetting value, then to /images/falafel-meerkat.jpg.
  const settings = await getEffectiveBrandImagesBySlug(chapterSlug);
  const markUrl = settings.loginBanner || "/images/falafel-meerkat.jpg";

  // Pre-fill what we already know about the user (name from signup,
  // email from the session) so they don't have to retype it.
  const initial = {
    name: me.name || "",
    email: me.email,
    company: me.company || "",
    mobile: me.mobile || "",
    linkedinUrl: me.linkedinUrl || "",
    bio: me.bio || "",
    title: me.title || "",
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Brand header strip — chapter mark + chapter tagline */}
      <div className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <AiSalonLogoServer
            variant="horizontal-tagline"
            className="text-[1.05rem]"
            markSrc={markUrl}
          />
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-black/80">
            {chapterName} Chapter
          </span>
        </div>
      </div>

      {/* Hero — AI Salon {chapterName} title + welcome copy. */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-8 text-center">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-3">
          Welcome to the community
        </p>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight mb-4">
          AI Salon <span className="ais-gradient-text">{chapterName}</span>
        </h1>
        <p className="text-lg sm:text-xl font-semibold text-black/80 mb-5">
          Be a part of the AI Salon {chapterName} community!
        </p>
        <div className="space-y-4 text-sm sm:text-base text-black/70 leading-relaxed max-w-2xl mx-auto">
          <p>
            Whether you&rsquo;re a thought leader interested in sharing your insights as a
            guest speaker or a venue host eager to support innovative AI events,
            we&rsquo;d love to hear from you and generate value to our community worldwide.
          </p>
          <p>
            Fill out this quick form to connect with a global network of AI founders,
            technologists, and investors while contributing to the future of AI innovation,
            and let&rsquo;s spread your message and help the community learn from your experience.
          </p>
          <p className="font-semibold text-black">
            It&rsquo;s time to generate a meaningful impact in the AI ecosystem together!
          </p>
        </div>
      </section>

      {/* Form card */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pb-16">
        <OnboardingForm
          initial={initial}
          interestedInOptions={[...INTERESTED_IN_OPTIONS]}
          profileCategoriesOptions={[...PROFILE_CATEGORIES_OPTIONS]}
          chapterName={chapterName}
          chapterSlug={chapterSlug}
        />
      </section>

      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>
            © {new Date().getFullYear()} AI Salon {chapterName} · Empowering AI Connections
          </span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/80 underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              MassaPro
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}

/** Metadata is generated dynamically so the browser tab + OG cards show
 *  the correct chapter name. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ chapterSlug?: string }>;
}) {
  const { chapterSlug: urlSlug } = await searchParams;
  const { name: chapterName } = await resolveChapter(urlSlug, null);
  return {
    title: `Welcome — AI Salon ${chapterName}`,
    description: `Be a part of the AI Salon ${chapterName} community. Fill out this quick form to connect with a global network of AI founders, technologists, and investors.`,
  };
}
