"use client";

import { useEffect, useState } from "react";
import { K_FAVICON, K_LOGIN_HERO, K_LOGIN_BANNER } from "@/lib/site-settings";

/**
 * Tagged-image resolution for the mockup editors.
 *
 * A mockup image field can be "linked" to one of the three site-wide
 * brand images (favicon / loginHero / loginBanner) instead of carrying
 * a hard-coded URL. When linked, the editor resolves the URL on mount
 * (and on window focus) by fetching /api/site-settings — so when the
 * Super Admin changes the favicon via /admin/images, every mockup
 * document that linked to "favicon" automatically picks up the new URL
 * on next render.
 *
 * USAGE in a mockup editor:
 *
 *   const settings = useTaggedImageSettings();
 *   const heroUrl = resolveTaggedImage(data.heroOverlay, settings);
 *
 * The mockup data shape gains an optional field:
 *
 *   type ImageSlot = {
 *     imageUrl: string;                  // the actual URL (always present)
 *     taggedImageKey?: "favicon" | "loginHero" | "loginBanner";
 *   };
 *
 * When `taggedImageKey` is set, `resolveTaggedImage` returns the live
 * site-setting URL instead of the stored `imageUrl` (the stored value
 * is kept as a fallback in case the settings fetch fails).
 *
 * When the admin picks a new image via the picker, `taggedImageKey` is
 * cleared (the slot is now bound to a specific URL).
 *
 * When the admin picks the favicon / loginHero / loginBanner FROM the
 * picker, we set `taggedImageKey` instead of `imageUrl` so the slot
 * stays linked to the brand image.
 */

export type TaggedImageKey = "favicon" | "loginHero" | "loginBanner";

export type TaggedImageSlot = {
  /** The stored URL (fallback when tag resolution fails). */
  imageUrl: string;
  /** When set, the editor resolves the URL from /api/site-settings. */
  taggedImageKey?: TaggedImageKey;
};

type PublicSettings = {
  favicon: string;
  loginHero: string;
  loginBanner: string;
};

const FALLBACK: PublicSettings = {
  favicon:
    "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393850874-uwkddr.webp",
  loginHero:
    "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782551370828-7rljev.jpg",
  loginBanner:
    "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393632010-jeorqc.png",
};

/**
 * Fetch /api/site-settings on mount + on window focus. Returns the
 * three public URLs. Falls back to FALLBACK if the fetch fails OR if
 * the API returns a "bad" URL (admin-only /api/admin/hidden-images/
 * path) — that way the mockup editor never shows a broken image even
 * if the DB row is somehow corrupted.
 */
export function useTaggedImageSettings(): PublicSettings {
  const [settings, setSettings] = useState<PublicSettings>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/site-settings", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Partial<PublicSettings>;
        if (cancelled) return;
        setSettings({
          favicon: goodOrFallback(json.favicon, FALLBACK.favicon),
          loginHero: goodOrFallback(json.loginHero, FALLBACK.loginHero),
          loginBanner: goodOrFallback(json.loginBanner, FALLBACK.loginBanner),
        });
      } catch {
        // keep fallback
      }
    }
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return settings;
}

/** Returns `value` if it's a public URL, otherwise `fallback`. */
function goodOrFallback(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback;
  if (value.includes("/api/admin/hidden-images/")) return fallback;
  if (value.startsWith("https://") || value.startsWith("http://")) return value;
  // Relative /images/ and /uploads/ paths are no longer the intended
  // brand assets post-V5.1 — fall back to the Vercel Blob URLs.
  return fallback;
}

/**
 * Resolve a tagged-image slot to its live URL.
 *
 *   - If `slot.taggedImageKey` is set, returns the matching setting.
 *   - Otherwise returns `slot.imageUrl`.
 *
 * Always falls back to `slot.imageUrl` if the tag is unknown or the
 * settings fetch hasn't completed yet.
 */
export function resolveTaggedImage(
  slot: TaggedImageSlot | undefined,
  settings: PublicSettings,
): string {
  if (!slot) return "";
  if (slot.taggedImageKey === K_FAVICON) return settings.favicon || slot.imageUrl;
  if (slot.taggedImageKey === K_LOGIN_HERO) return settings.loginHero || slot.imageUrl;
  if (slot.taggedImageKey === K_LOGIN_BANNER) return settings.loginBanner || slot.imageUrl;
  return slot.imageUrl;
}

/**
 * Human-readable label for the tag (shown in the form view next to
 * the image field so the admin can see it's linked to a brand image).
 */
export function taggedImageLabel(key?: TaggedImageKey): string | null {
  if (key === K_FAVICON) return "Linked to: Favicon";
  if (key === K_LOGIN_HERO) return "Linked to: Login hero";
  if (key === K_LOGIN_BANNER) return "Linked to: Login banner";
  return null;
}
