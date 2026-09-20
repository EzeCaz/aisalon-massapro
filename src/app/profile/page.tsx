import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { ProfileEditor } from "./profile-editor";
import { InterestedLocationsEditor } from "./interested-locations-editor";
import { ReferralShareCard } from "@/components/ais/referral-share-card";
import { getBrandConfig } from "@/lib/brand/brand-config";
import { BrandGradientText } from "@/components/brand/brand-logo";

export const metadata = { title: "My Profile" };

/** Default chapter name shown when the user has no chapterId set
 *  (e.g. legacy accounts, or brand-new accounts pre-onboarding). */
const DEFAULT_CHAPTER_NAME = "Tel Aviv";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/profile");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    include: { tags: true, chapter: { select: { name: true } } },
  });
  if (!me) redirect("/login");

  // Chapter display name — falls back to "Tel Aviv" for legacy users
  // without a chapterId, matching the original platform-wide default.
  const chapterName = me.chapter?.name ?? DEFAULT_CHAPTER_NAME;

  // BRAND-AWARE (Phase 3): resolve the member's brand so profile copy +
  // footer reflect Coma for Coma members and AIS for AIS members.
  const brand = getBrandConfig(
    (me as { brandSlug?: string | null }).brandSlug ?? "aisalon"
  );

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

  // Phase 3 (2026-09-19): interested locations + countries for the picker.
  const [interestedLocations, countries] = await Promise.all([
    db.userInterestedLocation.findMany({
      where: { userId: me.id },
      include: {
        country: { select: { id: true, name: true, code: true, flagEmoji: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.country.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, flagEmoji: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-2" style={{ color: brand.secondaryColor }}>
            My Profile
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Edit your <BrandGradientText gradient={brand.gradient}>community profile</BrandGradientText>
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Tell fellow {brand.displayName} {chapterName} members who you are. Your photo, bio, company and
            links will be visible on your member card and any event photos you upload.
          </p>
        </div>

        <ProfileEditor initial={initial} />

        {/* Phase 3 (2026-09-19): interested-locations editor */}
        <div className="mt-8">
          <InterestedLocationsEditor
            countries={countries.map((c) => ({
              id: c.id,
              name: c.name,
              code: c.code,
              flagEmoji: c.flagEmoji,
            }))}
            initial={interestedLocations.map((l) => ({
              id: l.id,
              countryId: l.countryId,
              country: l.country
                ? {
                    id: l.country.id,
                    name: l.country.name,
                    code: l.country.code,
                    flagEmoji: l.country.flagEmoji,
                  }
                : null,
              city: l.city,
              region: l.region,
            }))}
            accentColor={brand.secondaryColor}
          />
        </div>

        {/* Referral program — show the member their unique share link
            + their stats (visits, signups, RSVPs they've driven).
            Only shown if the member has a utmUid (all post-V5.18 users
            do; pre-existing users were backfilled by the script). */}
        {me.utmUid && (
          <div className="mt-8">
            <ReferralShareCard
              utmUid={me.utmUid}
              variant="full"
              brandName={`${brand.displayName} ${chapterName}`}
              brandTagline={brand.tagline.charAt(0).toLowerCase() + brand.tagline.slice(1)}
              brandSlug={brand.slug}
            />
          </div>
        )}
      </main>
      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} {brand.displayName} {chapterName} · {brand.tagline}</span>
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
    </div>
  );
}
