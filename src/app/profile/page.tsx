import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { ProfileEditor } from "./profile-editor";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/profile");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    include: { tags: true },
  });
  if (!me) redirect("/login");

  // Brand-new users must fill the intake form before they can edit their
  // profile — otherwise they'd land on a half-empty profile page and miss
  // the mobile / LinkedIn / interests fields the intake form collects.
  if (needsOnboarding(me)) redirect("/onboarding");

  // Serialize for client component
  const initial = {
    id: me.id,
    email: me.email,
    name: me.name,
    image: me.image,
    photoUrl: me.photoUrl,
    bio: me.bio,
    company: me.company,
    companyUrl: me.companyUrl,
    linkedinUrl: me.linkedinUrl,
    portfolioUrl: me.portfolioUrl,
    role: me.role,
    tags: me.tags.map((t) => ({ id: t.id, label: t.label, color: t.color })),
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            My Profile
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Edit your <span className="ais-gradient-text">community profile</span>
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            Tell fellow AI Salon Tel Aviv members who you are. Your photo, bio, company and
            links will be visible on your member card and any event photos you upload.
          </p>
        </div>

        <ProfileEditor initial={initial} />
      </main>
      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/40 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/60 underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              MassaPro
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
