import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { SiteFooter } from "@/components/ais/site-footer";
import { CommunityGrid } from "./community-grid";
import { getBrandConfig } from "@/lib/brand/brand-config";
import Link from "next/link";

export const metadata = { title: "Community — AI Salon" };

/** Default chapter name shown when the current user has no chapterId
 *  set (e.g. legacy accounts). The directory is scoped to the current
 *  user's brand + chapter, so this is only used for the header/footer
 *  copy personalization — never for the query itself. */
const DEFAULT_CHAPTER_NAME = "Tel Aviv";

/**
 * /community — member directory.
 *
 * Lists every onboarded, non-archived member of the SAME brand + chapter
 * as the signed-in user (per user spec: "Must only show the specific
 * brand and chapter related to the user, should not see any other
 * members in the community not related to the same brand and chapter").
 *
 * Auth gate: signed-in + onboarded members only. Anonymous visitors
 * are redirected to /login (the directory is members-only — unlike
 * /events which is public).
 */
export default async function CommunityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/community");
  }

  const meRow = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      importSource: true,
      onboardedAt: true,
      brandSlug: true,
      chapterId: true,
      chapter: { select: { name: true } },
    },
  });
  if (!meRow) redirect("/login?callbackUrl=/community");
  if (needsOnboarding(meRow)) redirect("/onboarding");

  // Brand + chapter resolution for the current user. brandSlug defaults
  // to AIS when null (legacy users). chapterId may be null for members
  // who haven't RSVP'd yet — in that case we filter by "chapterId is null"
  // which still scopes the directory to members of the same state
  // (i.e. other unaffiliated members of the same brand).
  const brand = getBrandConfig(meRow.brandSlug ?? "aisalon");
  const chapterName = meRow.chapter?.name ?? DEFAULT_CHAPTER_NAME;

  // Build the brand+chapter scope filter.
  //   - brandSlug: NULL legacy users are scoped together (treated as AIS).
  //     If the current user has brandSlug=null, we show other null/aisalon
  //     members. If brandSlug="coma", we show only coma members.
  //   - chapterId: same logic. null+null shown together; non-null scoped
  //     to that exact chapter.
  const isComa = meRow.brandSlug === "coma";
  const brandFilter = isComa
    ? { brandSlug: "coma" }
    : { OR: [{ brandSlug: null }, { brandSlug: "aisalon" }] };
  const chapterFilter = meRow.chapterId
    ? { chapterId: meRow.chapterId }
    : { chapterId: null };

  // Fetch every onboarded, non-archived member of the SAME brand +
  // chapter, EXCEPT the current user (you can't DM yourself — the API
  // would reject it anyway). We sort by name asc and push users with a
  // profile photo to the top so the grid feels populated even when many
  // members haven't uploaded a photo yet.
  const members = await db.user.findMany({
    where: {
      archivedAt: null,
      onboardedAt: { not: null },
      id: { not: meRow.id },
      ...brandFilter,
      ...chapterFilter,
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      photoUrl: true,
      title: true,
      company: true,
      companyUrl: true,
      bio: true,
      linkedinUrl: true,
      portfolioUrl: true,
      role: true,
      tags: { select: { id: true, label: true, color: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  // Sort: members with a profile photo first, then alphabetical by name.
  const sortedMembers = [...members].sort((a, b) => {
    const aHasPhoto = !!(a.photoUrl || a.image);
    const bHasPhoto = !!(b.photoUrl || b.image);
    if (aHasPhoto !== bHasPhoto) return aHasPhoto ? -1 : 1;
    return (a.name || a.email).localeCompare(b.name || b.email);
  });

  // Initial unread count for the DM dialog badge.
  const unreadCount = await db.conversationMessage.count({
    where: { recipientId: meRow.id, readAt: null },
  });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Page header */}
        <div className="mb-10">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            {brand.displayName} {chapterName}
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight">
            Meet the <span className="ais-gradient-text">community</span>
          </h1>
          <p className="mt-3 text-base text-black/80 max-w-2xl">
            Founders, builders, investors, and researchers building AI in {chapterName}.
            Click <span className="font-semibold">Contact</span> on any profile to start a private 1-on-1 chat.
          </p>
        </div>

        {sortedMembers.length === 0 ? (
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-12 text-center">
            <p className="text-sm text-black/60">
              No other community members in your {brand.displayName} {chapterName} chapter yet.
              Check back soon — new members join every week.
            </p>
            <Link
              href="/events"
              className="inline-flex items-center justify-center rounded-md bg-[#FF005A] text-white font-semibold px-5 py-2.5 text-sm hover:bg-[#D8004D] ais-lift mt-4"
            >
              Browse events →
            </Link>
          </div>
        ) : (
          <CommunityGrid
            members={sortedMembers.map((m) => ({
              ...m,
              // Tags need to be plain serializable objects (they already are,
              // but make the type explicit for the client boundary).
              tags: m.tags.map((t) => ({ id: t.id, label: t.label, color: t.color })),
            }))}
            currentUser={{
              id: meRow.id,
              name: meRow.name,
              role: meRow.role,
            }}
            initialUnreadCount={unreadCount}
          />
        )}

        {/* Member count footer */}
        {sortedMembers.length > 0 && (
          <div className="mt-10 text-center text-xs text-black/50">
            Showing {sortedMembers.length} member{sortedMembers.length === 1 ? "" : "s"} · {brand.displayName} {chapterName}
          </div>
        )}
      </main>
      <SiteFooter brandName={brand.displayName} chapterName={chapterName} />
    </div>
  );
}
