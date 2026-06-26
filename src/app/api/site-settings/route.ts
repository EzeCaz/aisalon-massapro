import { NextResponse } from "next/server";
import { getPublicSettings } from "@/lib/site-settings";

/**
 * GET /api/site-settings
 *
 * PUBLIC endpoint (no auth required). Returns the current site-level
 * settings that are safe to expose to anyone — currently:
 *
 *   - favicon      (URL string)
 *   - loginHero    (URL string)
 *   - loginBanner  (URL string)
 *
 * Used by:
 *   - layout.tsx generateMetadata()  → to set <link rel="icon">
 *   - login/page.tsx                 → to set the hero + banner <Image src>
 *
 * Returns the DEFAULTS (from src/lib/site-settings.ts) if the DB is
 * unreachable or the SiteSetting table doesn't exist yet, so the page
 * always renders even on a fresh DB.
 *
 * Caching: 5 minutes at the CDN level (s-maxage=300) + 1 second in the
 * browser (max-age=1). The settings change rarely; the short browser TTL
 * lets a hard refresh pick up an admin's change quickly.
 */
export async function GET() {
  const settings = await getPublicSettings();
  return NextResponse.json(settings, {
    headers: {
      "Cache-Control": "public, s-maxage=300, max-age=1, stale-while-revalidate=600",
    },
  });
}
