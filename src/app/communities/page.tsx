import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { SiteFooter } from "@/components/ais/site-footer";
import { CommunitiesClient } from "./communities-client";
import { resolveBrandMetadata } from "@/lib/brand/brand-metadata";

/**
 * BRAND-AWARE metadata (Phase 2): bare title — brand suffix comes from
 * the root layout's template.
 */
export async function generateMetadata() {
  return { title: "Communities" };
}

/**
 * /communities — discover communities (chapters) to join.
 *
 * PER USER SPEC 2026-09-19:
 *   - Members of one community (e.g. AI Salon) canNOT see other
 *     communities' EVENTS, but they SHOULD see other communities around
 *     them — this page shows communities in the user's own city/country
 *     first ("Nearby"), then everywhere else — and lets them request to
 *     join. After joining they see that community's events and members.
 *   - Coma users (the parent platform) can see every event, but still
 *     must join a community before registering for its events — this
 *     page is where they find communities to join.
 *
 * Visibility rules:
 *   - Only ACTIVE chapters are listed.
 *   - Signed-in users get their country's chapters highlighted as
 *     "Nearby" plus their membership state on every card.
 *   - Anonymous visitors can browse; the join button routes to /login.
 */
export default async function CommunitiesPage() {
  const session = await getServerSession(authOptions);
  let me: {
    id: string;
    email: string;
    name: string | null;
    chapterId: string | null;
    countryId: string | null;
    primaryChapterSlug: string | null;
  } | null = null;

  if (session?.user?.email) {
    const meRow = await db.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        onboardedAt: true,
        chapterId: true,
        countryId: true,
        chapter: { select: { slug: true } },
      },
    });
    if (!meRow) redirect("/login?callbackUrl=/communities");
    if (needsOnboarding(meRow)) redirect("/onboarding");
    me = {
      id: meRow.id,
      email: meRow.email,
      name: meRow.name,
      chapterId: meRow.chapterId,
      countryId: meRow.countryId,
      primaryChapterSlug: meRow.chapter?.slug ?? null,
    };
  }

  // Load every active chapter with its brand + country + counts.
  const chapters = await db.chapter.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      heroImageUrl: true,
      country: { select: { name: true, code: true, flagEmoji: true } },
      brand: { select: { slug: true, displayName: true } },
      _count: {
        select: {
          users: true, // primary members (User.chapterId)
          members: true, // explicit memberships (ChapterMember rows)
          events: true,
        },
      },
    },
    orderBy: [{ country: { name: "asc" } }, { name: "asc" }],
  });

  // Upcoming (future) event counts per chapter — shown as "X upcoming
  // events" on the card. Counts only, so nothing about other
  // communities' events leaks before the user joins.
  const upcomingRows = await db.event.groupBy({
    by: ["chapterId"],
    where: {
      chapterId: { in: chapters.map((c) => c.id) },
      endsAt: { gte: new Date() },
    },
    _count: { _all: true },
  });
  const upcomingByChapter = new Map<string, number>(
    upcomingRows.map((r) => [r.chapterId as string, r._count._all])
  );

  // The signed-in user's explicit ACTIVE memberships.
  let memberChapterIds = new Set<string>();
  if (me) {
    const rows = await db.chapterMember.findMany({
      where: { userId: me.id, status: "ACTIVE" },
      select: { chapterId: true },
    });
    memberChapterIds = new Set(rows.map((r) => r.chapterId));
  }

  // Serialize for the client component.
  const all = chapters.map((c) => {
    const isPrimary = !!me && me.chapterId === c.id;
    const isMember =
      isPrimary || memberChapterIds.has(c.id);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      city: c.city,
      heroImageUrl: c.heroImageUrl,
      countryName: c.country.name,
      countryCode: c.country.code,
      countryFlag: c.country.flagEmoji,
      brandSlug: c.brand?.slug ?? null,
      brandName: c.brand?.displayName ?? null,
      memberCount: c._count.users + c._count.members,
      upcomingEvents: upcomingByChapter.get(c.id) ?? 0,
      isPrimary,
      isMember,
    };
  });

  // "Nearby" = chapters in the user's country (their primary chapter's
  // country when the user has no countryId). Signed-out users just get
  // one alphabetical list.
  let myCountryCode: string | null = null;
  if (me) {
    if (me.countryId) {
      const country = await db.country.findUnique({
        where: { id: me.countryId },
        select: { code: true },
      });
      myCountryCode = country?.code ?? null;
    }
    if (!myCountryCode && me.chapterId) {
      const ch = chapters.find((c) => c.id === me.chapterId);
      myCountryCode = ch?.country.code ?? null;
    }
  }

  const { brand, city } = await resolveBrandMetadata();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <CommunitiesClient
          communities={all}
          myCountryCode={myCountryCode}
          me={me ? { name: me.name, email: me.email } : null}
          brandName={brand.displayName}
        />
      </main>
      <SiteFooter brandName={brand.displayName} chapterName={city} />
    </div>
  );
}
