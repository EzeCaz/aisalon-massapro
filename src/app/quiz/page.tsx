import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  resolveBrand,
  getEnvDefaultBrandSlug,
} from "@/lib/brand/resolve-brand";

/**
 * /quiz — top-level quiz route (no sessionId segment).
 *
 * WHY THIS EXISTS:
 *   The actual quiz player lives at /quiz/[sessionId] — it requires a
 *   specific QuizSession ID. Before this page was added, visiting /quiz
 *   (with no sessionId) returned a Next.js 404, because App Router only
 *   had /quiz/[sessionId]/page.tsx registered. That broke the Coma-
 *   branded flow on `aisalon.massapro.com/quiz?brand=coma` (and the
 *   AIS-branded flow on `aisalon.massapro.com/quiz` for that matter):
 *   the URL was simply not routed.
 *
 * WHAT THIS PAGE DOES:
 *   Members don't browse quizzes from a list — they reach a quiz by
 *   clicking the "Open quiz" link on an event's Quiz tab
 *   (src/app/events/[slug]/tabs/quiz-tab.tsx), which already points to
 *   /quiz/<sessionId>. So /quiz (no sessionId) has no natural member-
 *   facing content. Rather than invent a quiz-list page that doesn't
 *   exist elsewhere in the product, we redirect to /events, which is
 *   the canonical entry point for finding quizzes (each event card has
 *   a Quiz tab once the host creates a session for that event).
 *
 * BRAND PRESERVATION:
 *   The `?brand=` query parameter is forwarded to /events so a Coma
 *   visitor stays in the Coma experience after the redirect. Brand is
 *   also resolved via the host header (so coma.massapro.com/quiz lands
 *   on /events?brand=coma too).
 */
export default async function QuizIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand: urlBrand } = await searchParams;

  // Resolve brand via the 4-layer chain (URL → host → env → default).
  // We only need the slug here, not the full BrandConfig, since this
  // page just redirects. But we still use resolveBrand so the resolved
  // slug is normalized to a known brand (avoids forwarding garbage like
  // ?brand=evil to /events).
  const h = await headers();
  const host = h.get("host");
  const brand = resolveBrand({
    urlBrandSlug: urlBrand,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  // Preserve the brand slug on the redirect so /events renders the
  // correct brand. We always pass it (even for AIS) so /events can
  // avoid re-resolving from the host — explicit > implicit.
  redirect(`/events?brand=${brand.slug}`);
}
