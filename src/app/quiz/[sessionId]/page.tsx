import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { AppHeader } from "@/components/ais/app-header";
import { QuizPlayer } from "./quiz-player";
import {
  resolveBrand,
  getEnvDefaultBrandSlug,
} from "@/lib/brand/resolve-brand";
import type { BrandConfig } from "@/lib/brand/brand-config";

/**
 * /quiz/[sessionId] — the live quiz player.
 *
 * BRAND-AWARE BEHAVIOR:
 *   This route participates in the 4-layer brand resolution chain (URL
 *   ?brand= → host header → env → default), so:
 *
 *     - https://aisalon.massapro.com/quiz/<id>?brand=coma → Coma branding
 *     - https://coma.massapro.com/quiz/<id>               → Coma branding
 *     - https://aisalon.massapro.com/quiz/<id>            → AI Salon branding
 *
 *   The resolved brand is used for:
 *     - <metadata.title>  — "Flourishing Quiz — Coma Tel Aviv" (was hardcoded
 *                           "Flourishing Quiz — AI Salon")
 *     - Login redirect    — when an anonymous visitor hits this page, we
 *                           bounce them to /login?brand=<slug>&callbackUrl=...
 *                           so the login page renders in the correct brand
 *                           AND the post-login redirect lands back on the
 *                           same brand-scoped quiz URL.
 *     - QuizPlayer brand  — passed to <QuizPlayer brand={...}> so the player
 *                           UI uses brand accent colors (Coma amber #F5A623
 *                           instead of AIS pink #FF005A) for the icon, join
 *                           button, leaderboard "you" highlight, etc.
 *
 * BRAND VS CHAPTER:
 *   The quiz itself is a per-event artifact (a QuizSession belongs to one
 *   Event belongs to one Chapter belongs to one Country). Brand is a
 *   presentation-layer concern layered on top — a Coma-branded visitor
 *   sees the same quiz content as an AIS-branded visitor, just with
 *   Coma's accent color + wordmark in the chrome. The brand does not
 *   filter which quiz sessions are visible (that's still chapter-scoped
 *   via the event picker on /events).
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand: urlBrand } = await searchParams;
  const h = await headers();
  const host = h.get("host");
  const brand = resolveBrand({
    urlBrandSlug: urlBrand,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  const title = `Flourishing Quiz — ${brand.displayName}`;
  return {
    title,
    description: `Live multi-player quiz experience from ${brand.displayName}.`,
  };
}

export default async function QuizPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ brand?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { sessionId } = await params;
  const { brand: urlBrand } = await searchParams;

  // === 4-LAYER BRAND RESOLUTION ===
  // Per Brand-Field Platform Plan §2.5.1: URL → host → env → default.
  // We resolve once here and pass the BrandConfig down to the player.
  const h = await headers();
  const host = h.get("host");
  const brand: BrandConfig = resolveBrand({
    urlBrandSlug: urlBrand,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  if (!session?.user?.email) {
    // Preserve brand + the exact quiz URL on the login redirect so the
    // user lands back on the SAME brand-scoped quiz after signing in.
    // Without ?brand=, a Coma visitor would sign in and land on an
    // AIS-branded quiz page (the host-header chain still works on
    // aisalon.massapro.com, but explicit > implicit and it survives
    // redirects through /api/auth/callback).
    const callbackUrl = `/quiz/${sessionId}?brand=${brand.slug}`;
    const loginUrl = `/login?brand=${brand.slug}&callbackUrl=${encodeURIComponent(
      callbackUrl
    )}`;
    redirect(loginUrl);
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      photoUrl: true,
      image: true,
    },
  });
  if (!me) redirect(`/login?brand=${brand.slug}`);

  const quiz = await db.quizSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      status: true,
      questionTimeLimitSec: true,
      totalQuestions: true,
      currentQuestionIndex: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  if (!quiz) redirect(`/events?brand=${brand.slug}`);

  return (
    <>
      <AppHeader />
      <QuizPlayer
        initialSession={JSON.parse(JSON.stringify(quiz))}
        user={JSON.parse(JSON.stringify(me))}
        brand={{
          slug: brand.slug,
          displayName: brand.displayName,
          primaryColor: brand.primaryColor,
          accentColor: brand.accentColor,
          secondaryColor: brand.secondaryColor,
        }}
      />
    </>
  );
}
