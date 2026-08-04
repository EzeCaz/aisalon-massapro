/**
 * TSK-0060 — Global brand-image library.
 *
 * A curated list of brand-image URLs (hosted on Vercel Blob under the
 * `brand-assets/` prefix) that should be visible to ALL admins in the
 * /admin/images gallery — including ADMIN / CHAPTER_ORGANIZER /
 * CO_HOST, not just SUPER_ADMIN.
 *
 * Why this exists:
 *   - The Super Admin curates the brand-assets/ folder by uploading
 *     images. Chapter admins pick from this curated library to set
 *     their chapter's favicon / loginHero / loginBanner overrides.
 *   - Before TSK-0059, chapter admins saw EVERY image in brand-assets/
 *     (including test uploads, deprecated variants, etc.) — too noisy.
 *   - TSK-0059 filtered the gallery to only show the 3 currently-
 *     selected defaults + the chapter's own overrides. That was too
 *     restrictive — chapter admins had no way to PICK a new image
 *     for their chapter override because they couldn't see the
 *     options.
 *   - TSK-0060 (this file) introduces a curated "global library" that
 *     is always visible to chapter admins. The Super Admin can curate
 *     this list by editing the URLs below — it's a code-level config,
 *     not a runtime DB value, because the curation is a one-time
 *     decision per brand cycle.
 *
 * The URLs below are the canonical AI Salon brand assets (logos,
 * meerkat mascots, banner images) that every chapter should be able
 * to pick from when setting their chapter overrides.
 *
 * PER USER SPEC 2026-08-02: the 13 images listed by the user are
 * the initial global library. The Super Admin can add/remove URLs
 * here as the brand evolves.
 */

/**
 * The curated global brand-image library.
 *
 * These URLs are public Vercel Blob URLs — they are accessible to
 * anyone with the URL, regardless of auth. This constant is only
 * used to decide which images to SHOW in the /admin/images gallery
 * for non-super-admin callers; it does NOT affect access control
 * on the image bytes themselves.
 *
 * PER USER SPEC 2026-08-02 (corrected): the 3 canonical global
 * defaults (favicon, loginHero, loginBanner) are ALSO listed here
 * as a safety net — even if the Super Admin later changes the
 * selected default away from these canonical URLs, chapter admins
 * will still be able to see + pick them for their chapter overrides.
 */
export const GLOBAL_BRAND_LIBRARY_URLS: readonly string[] = [
  // --- Canonical global defaults (also auto-included by the filter
  // when they're the currently-selected default, but listed here
  // so they remain visible even if the default changes) ---
  // Global favicon (PER USER SPEC 2026-08-02)
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393850874-uwkddr.webp",
  // Global login hero (PER USER SPEC 2026-08-02)
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785654449284-sqq083.png",
  // Global hero banner (PER USER SPEC 2026-08-02, corrected)
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785668808200-0fdrda.png",
  // --- Additional curated brand library images (logos, mascots,
  // alternate banners) that chapter admins can pick from ---
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782594029026-zvxyvy.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782594043413-3dqork.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782594046759-11e840.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782594050362-rzgoqz.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782594053916-h6jjqc.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782594057714-395exp.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782594062611-wl6fta.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782929939712-mk2ecb.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782930012297-7qhk8m.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782940769382-r2twkn.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1783707737806-k0s0bs.png",
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785506059156-4chc96.png",
  // PER USER SPEC 2026-08-05: canonical email brand logo — the image the
  // user wants as the default top-right logo on every outgoing email.
  // Listed here so chapter admins can also pick it for their chapter-level
  // email-logo override.
  "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1785868301722-nl1qnl.png",
];

/**
 * Returns true if the given URL is part of the global brand library.
 * Used by /api/admin/brand-images to decide whether to include the
 * image in the gallery for non-super-admin callers.
 */
export function isGlobalBrandLibraryUrl(url: string): boolean {
  return (GLOBAL_BRAND_LIBRARY_URLS as readonly string[]).includes(url);
}
