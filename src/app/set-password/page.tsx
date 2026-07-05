import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import { SetPasswordForm } from "./set-password-form";

export const metadata = {
  title: "Set Your Password — AI Salon Tel Aviv",
  description: "Set a new password for your AI Salon Tel Aviv account.",
};

/**
 * /set-password — forced password reset page.
 *
 * Auth gate:
 *   1. Not signed in  → redirect to /login?callbackUrl=/set-password
 *   2. Signed in but mustSetPassword=false → redirect to /events
 *      (they don't need to be here)
 *   3. Signed in and mustSetPassword=true → render the form
 *
 * Brand-new users who haven't onboarded yet get redirected to /onboarding
 * FIRST (onboarding takes priority over password reset — we want them to
 * complete the intake form before they can use the platform, and the
 * password reset can happen after).
 *
 * Wait — actually if they were forced to reset their password, they should
 * do it BEFORE onboarding (otherwise they could be interrupted mid-flow).
 * Let me reverse: mustSetPassword takes priority over onboarding.
 */
export default async function SetPasswordPage() {
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
      mustSetPassword: true,
      onboardedAt: true,
      importSource: true,
    },
  });
  if (!me) {
    redirect("/login?callbackUrl=/set-password");
  }

  // If the user doesn't actually need to set a password, send them to
  // the right place (onboarding if they still need it, otherwise /events).
  if (!me.mustSetPassword) {
    if (needsOnboarding(me)) redirect("/onboarding");
    redirect("/events");
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Brand header strip */}
      <div className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <AiSalonLogoServer variant="horizontal-tagline" className="text-[1.05rem]" />
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-black/80">
            Tel Aviv Chapter
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
