import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import { SetPasswordForm } from "./set-password-form";

export const metadata = {
  title: "Set Your Password — AI Salon Tel Aviv",
  description: "Set a new password for your AI Salon Tel Aviv account.",
};

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
 * NOTE: A previous version of this page had a `mustSetPassword` gate
 * that redirected away users who didn't need to set a password. That
 * field was never added to the Prisma schema — the reference was dead
 * code that threw a Prisma validation error at runtime, causing
 * HTTP 500 on every visit to this page. The gate has been removed;
 * the page is now accessible to any signed-in user.
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
      onboardedAt: true,
      importSource: true,
    },
  });
  if (!me) {
    redirect("/login?callbackUrl=/set-password");
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
