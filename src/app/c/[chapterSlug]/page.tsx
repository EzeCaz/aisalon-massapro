import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ChapterLandingClient } from "./chapter-landing-client";
import { resolveChapterImages } from "@/lib/chapter-settings";
import type { Metadata } from "next";

/**
 * /c/[chapterSlug] — PUBLIC chapter landing + registration page.
 *
 * This is the per-chapter registration URL. Anyone visiting this page can:
 *   - See chapter info (name, city, country, upcoming events)
 *   - Sign up for an account pre-tagged to this chapter
 *
 * The signup form POSTs to /api/auth/signup with `chapterSlug` in the body,
 * which causes the new user to be created with countryId + chapterId
 * already set — no admin intervention required.
 *
 * Auth: NONE required to view.
 *
 * Image resolution (per /admin/images redesign):
 *   - favicon, loginHero, loginBanner each resolve to the chapter-specific
 *     value if set, otherwise the global SiteSetting value, otherwise the
 *     hardcoded default. See resolveChapterImages() in lib/chapter-settings.ts.
 *   - loginHero is used as the chapter "profile" image rendered inside the
 *     hero section of the landing page (replacing the gradient-only hero).
 *   - loginBanner is used as the OG / Twitter share image.
 *   - favicon is exported via generateMetadata().
 */

type Params = { params: Promise<{ chapterSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { chapterSlug } = await params;
  const chapter = await db.chapter.findUnique({
    where: { slug: chapterSlug },
    select: {
      name: true,
      city: true,
      country: { select: { name: true, flagEmoji: true } },
    },
  });
  if (!chapter) return { title: "Chapter — AI Salon" };

  // Resolve chapter-specific favicon + login banner (with global fallback).
  const full = await db.chapter.findUnique({
    where: { slug: chapterSlug },
    select: { id: true },
  });
  const images = full ? await resolveChapterImages(full.id) : null;
  const favicon = images?.favicon;
  const bannerUrl = images?.loginBanner;

  const title = `AI Salon ${chapter.name}`;
  const description = `Join the AI Salon ${chapter.name} chapter${
    chapter.city ? ` in ${chapter.city}` : ""
  }. Sign up to register for upcoming events and connect with the local AI community.`;
  return {
    title: `${title} — AI Salon`,
    description,
    icons: favicon ? [{ url: favicon, type: "image/x-icon" }] : undefined,
    openGraph: {
      title,
      description,
      type: "website",
      ...(bannerUrl ? { images: [{ url: bannerUrl }] } : {}),
    },
    twitter: {
      card: "summary",
      title,
      description,
      ...(bannerUrl ? { images: [bannerUrl] } : {}),
    },
  };
}

export default async function ChapterLandingPage({ params }: Params) {
  const { chapterSlug } = await params;
  const chapter = await db.chapter.findUnique({
    where: { slug: chapterSlug },
    include: {
      country: {
        select: { id: true, name: true, code: true, flagEmoji: true },
      },
      events: {
        where: {
          // Only show future events (or events from the last 24h in
          // case of timezone edge cases).
          startsAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { startsAt: "asc" },
        take: 5,
        select: {
          id: true,
          slug: true,
          title: true,
          subtitle: true,
          startsAt: true,
          endsAt: true,
          venue: true,
          city: true,
          mainImage: { select: { fileUrl: true } },
          _count: { select: { rsvps: true } },
        },
      },
      _count: { select: { users: true, events: true } },
    },
  });

  if (!chapter || !chapter.country) {
    notFound();
  }

  if (!chapter.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-bold text-black">Chapter not active</h1>
          <p className="text-sm text-black/70">
            The <strong>{chapter.name}</strong> chapter is not currently
            accepting new members. Please check back later or contact the
            site admin.
          </p>
        </div>
      </div>
    );
  }

  // Resolve chapter-scoped image settings (favicon / loginHero / loginBanner).
  // Falls back to global / hardcoded defaults — never throws.
  const images = await resolveChapterImages(chapter.id);

  // Serialize dates for client component
  const serialized = {
    id: chapter.id,
    name: chapter.name,
    slug: chapter.slug,
    city: chapter.city,
    timezone: chapter.timezone,
    whatsappGroupUrl: chapter.whatsappGroupUrl,
    linkedinUrl: chapter.linkedinUrl,
    country: chapter.country,
    memberCount: chapter._count.users,
    eventCount: chapter._count.events,
    heroImageUrl: images.loginHero,
    faviconUrl: images.favicon,
    loginBannerUrl: images.loginBanner,
    hasChapterOverride: images.hasChapterOverride,
    events: chapter.events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      subtitle: e.subtitle,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      venue: e.venue,
      city: e.city,
      mainImageUrl: e.mainImage?.fileUrl ?? null,
      rsvpCount: e._count.rsvps,
    })),
  };

  return <ChapterLandingClient chapter={serialized} />;
}
