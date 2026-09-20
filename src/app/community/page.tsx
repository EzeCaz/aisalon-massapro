import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { SiteFooter } from "@/components/ais/site-footer";
import { CommunityGrid } from "./community-grid";
import { getBrandConfig } from "@/lib/brand/brand-config";
import { listJoinedChapterIds } from "@/lib/membership";
import { Flag } from "@/components/flag";
import { BrandGradientText } from "@/components/brand/brand-logo";
import Link from "next/link";

/**
 * BRAND-AWARE metadata (Phase 2): bare title — brand suffix comes from
 * the root layout's template ("Community — Coma Tel Aviv" on Coma).
 */
export async function generateMetadata() {
  return { title: "Community" };
}

/**
 * /community — member directory.
 *
 * PER USER SPEC 2026-09-19: a user can only see the members of a
 * community AFTER joining it. The directory therefore shows a chapter
 * switcher limited to:
 *   - the user's PRIMARY chapter (User.chapterId — implicit membership), and
 *   - every chapter with an ACTIVE ChapterMember row (joined via
 *     /communities or the event-page join gate).
 *
 * Members listed for the selected community are every onboarded,
 * non-archived user whose PRIMARY chapter is that community OR who holds
 * an ACTIVE membership row for it (so directory-joined members appear
 * even though their User.chapterId still points at their home chapter).
 *
 * Auth gate: signed-in + onboarded members only. Anonymous visitors
 * are redirected to /login (the directory is members-only — unlike
 * /events which is public).
 */
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ chapter?: string }>;
}) {
  const { chapter: chapterSlugParam } = await searchParams;
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
      chapter: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!meRow) redirect("/login?callbackUrl=/community");
  if (needsOnboarding(meRow)) redirect("/onboarding");

  const brand = getBrandConfig(meRow.brandSlug ?? "aisalon");

  // ── Joined communities (the ONLY ones whose members are visible) ─────
  const joinedChapterIds = await listJoinedChapterIds(meRow.id, meRow.chapterId);
  const joinedChapters = await db.chapter.findMany({
    where: { id: { in: joinedChapterIds }, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      country: { select: { code: true, flagEmoji: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  // Selected community: ?chapter=<slug> when it's in the allowed set,
  // otherwise the user's primary chapter; null when the user has neither
  // (empty state with a join CTA below).
  const selectedChapter =
    (chapterSlugParam
      ? joinedChapters.find((c) => c.slug === chapterSlugParam)
      : undefined) ??
    joinedChapters.find((c) => c.id === meRow.chapterId) ??
    joinedChapters[0] ??
    null;
  const chapterName = selectedChapter?.name ?? "your communities";

  // ── Members of the selected community ────────────────────────────────
  // A user counts as a member of the selected community when EITHER their
  // primary chapter matches OR they hold an ACTIVE ChapterMember row.
  let sortedMembers: Array<{
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    photoUrl: string | null;
    title: string | null;
    company: string | null;
    companyUrl: string | null;
    bio: string | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
    role: string;
    tags: { id: string; label: string; color: string | null }[];
  }> = [];

  if (selectedChapter) {
    const members = await db.user.findMany({
      where: {
        archivedAt: null,
        onboardedAt: { not: null },
        id: { not: meRow.id },
        OR: [
          { chapterId: selectedChapter.id },
          {
            chapterMemberships: {
              some: { chapterId: selectedChapter.id, status: "ACTIVE" },
            },
          },
        ],
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
    sortedMembers = [...members].sort((a, b) => {
      const aHasPhoto = !!(a.photoUrl || a.image);
      const bHasPhoto = !!(b.photoUrl || b.image);
      if (aHasPhoto !== bHasPhoto) return aHasPhoto ? -1 : 1;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }

  // Initial unread count for the DM dialog badge.
  const unreadCount = await db.conversationMessage.count({
    where: { recipientId: meRow.id, readAt: null },
  });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Page header */}
        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-2" style={{ color: brand.secondaryColor }}>
            {brand.displayName} {chapterName}
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight">
            Meet the <BrandGradientText gradient={brand.gradient}>community</BrandGradientText>
          </h1>
          <p className="mt-3 text-base text-black/80 max-w-2xl">
            Founders, builders, investors, and researchers in {chapterName}.
            Click <span className="font-semibold">Contact</span> on any profile to start a private 1-on-1 chat.
          </p>
        </div>

        {/* Chapter switcher — limited to communities the user has joined.
            Members of communities the user has NOT joined are never
            browsable (user spec 2026-09-19). */}
        {joinedChapters.length > 1 && (
          <nav aria-label="Your communities" className="mb-8 flex flex-wrap gap-2">
            {joinedChapters.map((c) => {
              const active = selectedChapter?.id === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/community?chapter=${encodeURIComponent(c.slug)}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-black text-white border-black"
                      : "bg-white text-black/80 border-black/15 hover:border-black/40"
                  }`}
                >
                  {c.country.flagEmoji ? (
                    <Flag code={c.country.code} flagEmoji={c.country.flagEmoji} />
                  ) : null}
                  {c.name}
                  {c.id === meRow.chapterId && (
                    <span className={active ? "text-white/60" : "text-black/40"}>· home</span>
                  )}
                </Link>
              );
            })}
          </nav>
        )}

        {!selectedChapter ? (
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-12 text-center">
            <p className="text-sm text-black/60">
              You haven&apos;t joined a community yet. Find communities in your
              city and request to join to see their members.
            </p>
            <Link
              href="/communities"
              className="inline-flex items-center justify-center rounded-md bg-[#FF005A] text-white font-semibold px-5 py-2.5 text-sm hover:bg-[#D8004D] ais-lift mt-4"
            >
              Discover communities →
            </Link>
          </div>
        ) : sortedMembers.length === 0 ? (
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-12 text-center">
            <p className="text-sm text-black/60">
              No other members in {brand.displayName} {chapterName} yet.
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
      <SiteFooter brandName={brand.displayName} chapterName={chapterName} tagline={brand.tagline} />
    </div>
  );
}
