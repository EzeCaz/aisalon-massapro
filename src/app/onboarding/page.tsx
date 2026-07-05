import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding, INTERESTED_IN_OPTIONS, PROFILE_CATEGORIES_OPTIONS } from "@/lib/onboarding";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import { OnboardingForm } from "./onboarding-form";

export const metadata = {
  title: "Welcome — AI Salon Tel Aviv",
  description:
    "Be a part of the AI Salon Israel community. Fill out this quick form to connect with a global network of AI founders, technologists, and investors.",
};

/**
 * /onboarding — first-time intake form for brand-new users.
 *
 * Auth gate:
 *   1. Not signed in  → redirect to /login?callbackUrl=/onboarding
 *   2. Signed in but already onboarded (onboardedAt set, OR pre-imported
 *      via importSource) → redirect to /events (no need to fill the form)
 *   3. Signed in and needs onboarding → render the form
 */
export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/onboarding");
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) {
    redirect("/login?callbackUrl=/onboarding");
  }

  if (!needsOnboarding(me)) {
    redirect("/events");
  }

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
      {/* Brand header strip — Falafel Meerkat mark + chapter tagline */}
      <div className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <AiSalonLogoServer variant="horizontal-tagline" className="text-[1.05rem]" />
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-black/80">
            Tel Aviv Chapter
          </span>
        </div>
      </div>

      {/* Hero — AI Salon Tel Aviv title + the long welcome copy from
          the AI Salon TLV intake form (kept verbatim). */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-8 text-center">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-3">
          Welcome to the community
        </p>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight mb-4">
          AI Salon <span className="ais-gradient-text">Tel Aviv</span>
        </h1>
        <p className="text-lg sm:text-xl font-semibold text-black/80 mb-5">
          Be a part of the AI Salon Israel community!
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
        />
      </section>

      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
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
