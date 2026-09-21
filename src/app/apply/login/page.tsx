import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { headers } from "next/headers";
import { LoginForm } from "@/app/login/login-form";
import {
  resolveBrand,
  getEnvDefaultBrandSlug,
} from "@/lib/brand/resolve-brand";
import { BRANDS } from "@/lib/brand/brand-config";
import { BrandLogo, BrandGradientText } from "@/components/brand/brand-logo";
import type { Metadata } from "next";

/**
 * /apply/login — the dedicated login flow for community leads applying
 * to bring their brand to Coma.
 *
 * Distinct from /login (which is for members signing in to their
 * existing account). The apply login uses the same Google + email +
 * password mechanisms (LoginForm component), but:
 *   - Copy targets community builders, not members
 *   - On success, redirects to /apply/form (the application form)
 *   - The hero panel shows the apply value prop instead of the
 *     brand's login headline
 *
 * Signed-in users hitting this page are redirected straight to
 * /apply/form — they don't need to sign in again.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Sign in to apply",
    description:
      "Sign in (or create an account) to apply to bring your community to Coma.",
  };
}

export default async function ApplyLoginPage() {
  // Already signed in → skip to the application form.
  const session = await getServerSession(authOptions);
  if (session) redirect("/apply/form");

  // Resolve the brand from host (Coma on platform.joincoma.com).
  const h = await headers();
  const host = h.get("host");
  const brand = resolveBrand({
    urlBrandSlug: null,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  const coma = BRANDS.coma;

  return (
    <main
      className="min-h-screen grid md:grid-cols-2"
      style={{ ["--brand-primary" as string]: brand.primaryColor }}
    >
      {/* === LEFT — apply value prop panel === */}
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

        {/* Center: apply value prop */}
        <div className="relative z-10 text-white max-w-md">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 mb-4">
            For community builders
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-4 leading-tight">
            Apply to bring{" "}
            <BrandGradientText gradient="linear-gradient(90deg, #fff 0%, #fff8 100%)">
              your community
            </BrandGradientText>{" "}
            to {brand.displayName}
          </h1>
          <p className="text-base sm:text-lg text-white/90 leading-relaxed mb-6">
            Get your own brand on the platform — login page, emails,
            events, members, knowledge base — all configured to your
            branding. Skip fields; Coma defaults fill the gaps.
          </p>
          <ul className="space-y-2 text-sm text-white/80">
            <li className="flex items-start gap-2">
              <span className="text-white/60 mt-1">✓</span>
              <span>~10-minute application</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white/60 mt-1">✓</span>
              <span>Brand book, colors, mascot, slogan, logo</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white/60 mt-1">✓</span>
              <span>Reviewed within 2 business days</span>
            </li>
          </ul>
        </div>

        {/* Bottom: footer credit */}
        <div className="relative z-10 text-white/60 text-xs">
          {brand.footerCredit}
        </div>

        {/* Decorative orb in the brand's gradient */}
        <div
          className="absolute top-1/3 right-0 w-72 h-72 rounded-full blur-3xl opacity-30"
          style={{ background: brand.gradient }}
        />
      </section>

      {/* === RIGHT — sign-in/sign-up form === */}
      <section className="flex flex-col justify-center p-8 sm:p-12 bg-white">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-6">
            <p
              className="text-xs font-semibold uppercase tracking-[0.3em] mb-2"
              style={{ color: brand.secondaryColor }}
            >
              Apply to {brand.displayName}
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-black mb-2">
              Welcome, community builder
            </h2>
            <p className="text-sm text-black/70">
              Sign in to start your application. New here? Use the
              &ldquo;Sign up&rdquo; tab to create an account.
            </p>
          </div>

          <LoginForm
            callbackUrl="/apply/form"
            brandSlug={brand.slug}
            primaryColor={brand.primaryColor}
            accentColor={brand.accentColor}
            secondaryColor={brand.secondaryColor}
          />

          <p className="mt-6 text-xs text-black/60 leading-relaxed text-center">
            Already started an application? Sign in with the same email
            and we&apos;ll resume where you left off.
          </p>

          <div className="mt-4 pt-4 border-t border-black/10 text-center">
            <a
              href="/apply"
              className="text-xs font-semibold hover:underline"
              style={{ color: brand.primaryColor }}
            >
              ← Back to /apply
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
