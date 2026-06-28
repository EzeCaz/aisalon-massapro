/**
 * Path prefix for AI Salon — AI & Human Flourishing microsite.
 *
 * This entire sub-app lives under /resources/ai-human-flourishing so the
 * existing aisalon.massapro.com site nav (AppHeader) stays on top, and
 * the AI Salon site-nav sits below it.
 *
 * Components in src/components/salon/ import this constant to build
 * internal links so the route prefix can change in one place.
 */
export const SALON_BASE = "/resources/ai-human-flourishing";

/** Helper: prefix a salon-internal path with the base. */
export function salonPath(path: string): string {
  if (!path.startsWith("/")) path = "/" + path;
  return `${SALON_BASE}${path}`;
}
