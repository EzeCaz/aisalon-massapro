import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import { SetPasswordForm } from "./set-password-form";
import { getEffectiveBrandImagesBySlug } from "@/lib/chapter-brand-images";

/** Default chapter slug when none is provided. Mirrors /login + /onboarding. */
const DEFAULT_CHAPTER_SLUG = "tel-aviv";

/**
 * Resolve the chapter to show on /set-password. Same priority order as
 * /onboarding: URL query param → user's chapterId → default Tel Aviv.
 * Returns `{ slug, name }` with the chapter's display name.
 */
async function resolveChapter(
  urlSlug: string | undefined,
  userChapterId: string | null | undefined
): Promise<{ slug: string; name: string }> {
  let slug = urlSlug || DEFAULT_CHAPTER_SLUG;

  if (!urlSlug && userChapterId) {
    try {
      const ch = await db.chapter.findUnique({
        where: { id: userChapterId },
        select: { slug: true, name: true },
      });
      if (ch) return { slug: ch.slug, name: ch.name };
    } catch {
      // DB unreachable — fall through.
    }
  }

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
 * /set-password — set or change password page.
 *
 * Auth gate:
 *   1. Not signed in  → redirect to /login?callbackUrl=/set-password
 *   2. Signed in but user row not found → redirect to /login
 *   3. Otherwise → render the form. The form itself handles both the
 *      "set first password" case (no passwordHash yet — Google-only or
 *      imported members) and the "change password" case (already has a
 *      passwordHash — requires current password verification).
 *
 * CHAPTER-SCOPED BEHAVIOR:
 *   - /set-password?chapterSlug=mtl renders the page with the Montreal
 *     chapter name + Montreal brand images. Same flow as /onboarding.
 *
 * NOTE: A previous version of this page had a `mustSetPassword` gate
 * that redirected away users who didn't need to set a password. That
 * field was never added to the Prisma schema — the reference was dead
 * code that threw a Prisma validation error at runtime, causing
 * HTTP 500 on every visit to this page. The gate has been removed;
 * the page is now accessible to any signed-in user.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ chapterSlug?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/set-password");
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      onboardedAt: true,
      importSource: true,
      chapterId: true,
    },
  });
  if (!me) {
    redirect("/login?callbackUrl=/set-password");
  }

  const { chapterSlug: urlSlug } = await searchParams;
  const { slug: chapterSlug, name: chapterName } = await resolveChapter(
    urlSlug,
    me.chapterId
  );

  // Load chapter-scoped brand images for the logo mark.
  const settings = await getEffectiveBrandImagesBySlug(chapterSlug);
  const markUrl = settings.loginBanner || "/images/falafel-meerkat.jpg";

  return (
    <main className="min-h-screen bg-white">
      {/* Brand header strip */}
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

      {/* Form card */}
      <section className="mx-auto max-w-md px-4 sm:px-6 lg:px-8 pt-12 pb-16">
        <div className="text-center mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Set your password
          </p>
          <h1 className="text-3xl font-extrabold text-black">
            Choose a <span className="ais-gradient-text">new password</span>
          </h1>
          <p className="mt-3 text-sm text-black/80">
            Your account is ready, but you need to set your own password before you can
            continue. This replaces the temporary one you used to sign in.
          </p>
        </div>

        <SetPasswordForm
          hasPassword={!!me.passwordHash}
          email={me.email}
          name={me.name}
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

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ chapterSlug?: string }>;
}) {
  const { chapterSlug: urlSlug } = await searchParams;
  const { name: chapterName } = await resolveChapter(urlSlug, null);
  return {
    title: `Set Your Password — AI Salon ${chapterName}`,
    description: `Set a new password for your AI Salon ${chapterName} account.`,
  };
}
