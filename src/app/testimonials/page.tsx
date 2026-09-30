import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding, needsSetPassword } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { SiteFooter } from "@/components/ais/site-footer";
import { TestimonialFeed } from "@/components/testimonials/testimonial-feed";
import type { EventOption, ChapterOption } from "@/components/testimonials/testimonial-form";
import { getBrandConfig } from "@/lib/brand/brand-config";
import { resolveBrandAssets } from "@/lib/brand/brand-assets-resolver";
import { BrandGradientText } from "@/components/brand/brand-logo";
import { MessageSquareHeart } from "lucide-react";

/**
 * BRAND-AWARE metadata (Phase 2): bare title — brand suffix comes from
 * the root layout's template ("Testimonials — Coma Tel Aviv" on Coma).
 */
export async function generateMetadata() {
  return { title: "Testimonials" };
}

/**
 * /testimonials — PUBLIC community testimonials feed.
 *
 * Reading is open to the world (no login required) so prospective members
 * and future chapter organizers can see what the community is saying.
 *
 * Posting, liking, and deleting still require a signed-in member session
 * — enforced server-side at the API layer (/api/testimonials POST and
 * /api/testimonials/[id]/like POST).
 *
 * For signed-in members, the form also offers 4 scopes:
 *   - 🌍 Community (no specific event)
 *   - 📍 About a specific event (user picks chapter → event)
 *   - 🎤 About a speaker (user picks chapter → event → speaker)
 *   - 🗓 About a session (user picks chapter → event → session)
 *
 * Chapter auto-recognition: the page reads the `?chapter=slug` URL query
 * param and pre-selects that chapter in the form's chapter picker. This
 * lets chapter landing pages (/c/[chapterSlug]) link here with their
 * chapter pre-selected.
 */
type SearchParams = { searchParams: Promise<{ chapter?: string }> };

export default async function TestimonialsPage({ searchParams }: SearchParams) {
  const { chapter: chapterSlugParam } = await searchParams;

  const session = await getServerSession(authOptions);
  let me: { id: string; role: string; brandSlug?: string | null; chapterId?: string | null; chapterName?: string | null } | null = null;
  if (session?.user?.email) {
    const u = await db.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        importSource: true,
        onboardedAt: true,
        brandSlug: true,
        chapterId: true,
        chapter: { select: { name: true } },
      },
    });
    if (u) {
      // For signed-in users, run the same onboarding gates as before so
      // they don't get stuck on the public feed with an unfinished profile.
      if (needsSetPassword(u)) redirect("/set-password");
      if (needsOnboarding(u)) redirect("/onboarding");
      me = {
        id: u.id,
        role: u.role,
        brandSlug: u.brandSlug,
        chapterId: u.chapterId,
        chapterName: u.chapter?.name ?? null,
      };
    }
  }

  const isAdmin = me?.role === "ADMIN";

  // BRAND RESOLUTION — used for the page header + footer copy. The
  // signed-in user's brandSlug drives the displayed brand; anonymous
  // visitors fall back to AIS (platform default).
  // DB-AWARE (2026-09-30): for new brands (cazhype, danone, ...),
  // resolve the DB brand row so we get the uploaded logo + palette.
  const staticBrand = getBrandConfig(me?.brandSlug ?? "aisalon");
  let brand = staticBrand;
  const userBrandSlug = me?.brandSlug;
  if (userBrandSlug && userBrandSlug !== "aisalon" && userBrandSlug !== "coma") {
    try {
      const dbBrand = await resolveBrandAssets(userBrandSlug);
      if (dbBrand.dbRowExists) {
        brand = {
          ...staticBrand,
          slug: dbBrand.slug as typeof staticBrand.slug,
          displayName: dbBrand.displayName,
          wordmark: dbBrand.slug,
          tagline: dbBrand.displayName,
          primaryColor: dbBrand.palette.primary,
          accentColor: dbBrand.palette.accent,
          secondaryColor: dbBrand.palette.secondary,
          gradient: dbBrand.palette.gradient,
          logo: dbBrand.assets.logoUrl || staticBrand.logo,
          heroBanner: dbBrand.assets.heroBannerUrl || staticBrand.heroBanner,
        };
      }
    } catch (err) {
      console.warn("[/testimonials] DB brand lookup failed:", err instanceof Error ? err.message : err);
    }
  }
  const chapterName = me?.chapterName ?? "Tel Aviv";

  // Fetch the events catalog only when there's a signed-in user (the form
  // is hidden for anonymous visitors, so the data isn't needed). Include
  // chapterId so the form can filter events by the picked chapter.
  let eventsCatalog: EventOption[] = [];
  // Fetch all active chapters (for the chapter picker). Needed for both
  // signed-in and anonymous visitors so we can validate the `?chapter=`
  // URL param and pass it through to the form.
  // BRAND SCOPING (2026-09-30): non-Coma signed-in users see only their
  // brand's chapters. AIS users also see legacy (brandId=null) chapters.
  const myBrandSlug = me?.brandSlug ?? null;
  const isComaUser = myBrandSlug === "coma";
  const isAisUser = myBrandSlug === "aisalon";
  const chapterWhere = me && !isComaUser
    ? isAisUser
      ? { isActive: true, OR: [{ brandId: null }, { brand: { slug: "aisalon" } }] }
      : { isActive: true, brand: { slug: myBrandSlug ?? "___NEVER___" } }
    : { isActive: true };
  const chapterRows = await db.chapter.findMany({
    where: chapterWhere,
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      country: { select: { code: true, flagEmoji: true } },
    },
    orderBy: [{ country: { name: "asc" } }, { name: "asc" }],
  });
  const chapters: ChapterOption[] = chapterRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    city: c.city,
    flagEmoji: c.country?.flagEmoji ?? null,
    code: c.country?.code ?? null,
  }));

  if (me) {
    const events = await db.event.findMany({
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        chapterId: true,
        speakers: {
          orderBy: { order: "asc" },
          select: { id: true, name: true, company: true, topic: true },
        },
        agenda: {
          orderBy: { startsAt: "asc" },
          select: { id: true, startsAt: true, title: true },
        },
      },
    });

    eventsCatalog = events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      chapterId: e.chapterId,
      speakers: e.speakers.map((s) => ({
        id: s.id,
        label: `${s.name}${s.company ? ` · ${s.company}` : ""}${s.topic ? ` — ${s.topic}` : ""}`,
      })),
      agendaItems: e.agenda.map((a) => {
        const time = new Date(a.startsAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Jerusalem",
        });
        return { id: a.id, label: `${time} · ${a.title}` };
      }),
    }));
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-2" style={{ color: brand.secondaryColor }}>
            <MessageSquareHeart className="inline h-3 w-3 mr-1" />
            {brand.displayName} {chapterName} · Testimonials
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            What people are <BrandGradientText gradient={brand.gradient}>saying</BrandGradientText>
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Real stories from our community about speakers, events, sessions,
            and the {brand.displayName} vibe. {me ? "Share your own — add a photo, pick a rating, and tell us what made it special." : "Sign in to share your own — add a photo, pick a rating, and tell us what made it special."}
          </p>
        </div>

        <TestimonialFeed
          meId={me?.id ?? ""}
          isAdmin={isAdmin}
          eventsCatalog={eventsCatalog}
          chapters={chapters}
          defaultChapterSlug={chapterSlugParam}
          defaultSort="recent"
          brandName={brand.displayName}
          brandSlug={brand.slug}
        />
      </main>

      <SiteFooter brandName={brand.displayName} chapterName={chapterName} tagline={brand.tagline} />
    </div>
  );
}
