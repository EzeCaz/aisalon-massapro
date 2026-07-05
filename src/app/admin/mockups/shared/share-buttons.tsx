"use client";

import { useState, useCallback } from "react";
import {
  Linkedin,
  Facebook,
  Instagram,
  Send,
  Share2,
  MoreHorizontal,
} from "lucide-react";

/**
 * ShareButtons — renders social share buttons for the mockup PNG.
 *
 * Flow:
 *   1. User clicks "Share" → we first export the canvas to a PNG data URL
 *      via the provided `getPngDataUrl()` callback (returns a Promise<string>).
 *   2. We try the Web Share API (mobile / Safari) with `files: [File]`.
 *      If the user's platform supports image sharing, the native sheet
 *      appears with all installed apps (WhatsApp, Telegram, WeChat, etc.).
 *   3. If Web Share API isn't available or fails, we fall back to a row
 *      of platform-specific share buttons that open the platform's
 *      share URL in a new tab. The PNG is offered as a download first,
 *      since most platforms don't accept image uploads via URL alone.
 *
 * Platforms covered (per user spec):
 *   LinkedIn, WhatsApp, Facebook, Instagram, Telegram, TikTok, WeChat
 *
 * Notes:
 *   - Instagram + TikTok + WeChat do NOT support web share URLs — they
 *     only accept image uploads through their native apps. For these,
 *     we offer the PNG as a download + open the app's web home.
 *   - LinkedIn / Facebook / Telegram have proper share-URL endpoints.
 *   - WhatsApp has a share URL but only accepts text (the PNG is downloaded
 *     separately so the user can attach it manually).
 */

type Platform = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Build a share URL from the page URL + title. Undefined = no share URL. */
  buildShareUrl?: (pageUrl: string, title: string) => string;
  /** If true, we just download the PNG + open the platform's home (no share URL). */
  downloadOnly?: boolean;
  color: string;
};

const PLATFORMS: Platform[] = [
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    buildShareUrl: (u, t) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
    color: "#0A66C2",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: WhatsappIcon,
    buildShareUrl: (u, t) =>
      `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}`,
    color: "#25D366",
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    buildShareUrl: (u, t) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}&quote=${encodeURIComponent(t)}`,
    color: "#1877F2",
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    downloadOnly: true,
    color: "#E4405F",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: Send,
    buildShareUrl: (u, t) =>
      `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
    color: "#26A5E4",
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: TiktokIcon,
    downloadOnly: true,
    color: "#000000",
  },
  {
    id: "wechat",
    label: "WeChat",
    icon: WechatIcon,
    downloadOnly: true,
    color: "#07C160",
  },
];

type Props = {
  /** Returns the PNG data URL of the canvas to share. */
  getPngDataUrl: () => Promise<string>;
  /** Title text to include in share messages. */
  title: string;
  /** Optional URL to share (defaults to window.location.href). */
  shareUrl?: string;
  /** Filename to use when downloading the PNG. */
  filename?: string;
};

export function ShareButtons({
  getPngDataUrl,
  title,
  shareUrl,
  filename = "mockup.png",
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShareClick = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const pngDataUrl = await getPngDataUrl();
      // Convert data URL → Blob → File for the Web Share API
      const blob = await (await fetch(pngDataUrl)).blob();
      const file = new File([blob], filename, { type: "image/png" });
      const pageUrl = shareUrl ?? (typeof window !== "undefined" ? window.location.href : "");
      const shareData: ShareData = {
        title,
        text: title,
        url: pageUrl,
      };
      // Try Web Share API with files (mobile only — desktop browsers usually
      // don't support sharing files via navigator.share yet)
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] })) {
        shareData.files = [file];
        await navigator.share(shareData);
        setBusy(false);
        return;
      }
      // Fallback: show the platform buttons
      setOpen(true);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // user cancelled — silent
      } else {
        setError(err instanceof Error ? err.message : "Share failed");
        setOpen(true); // fall back to platform buttons
      }
    } finally {
      setBusy(false);
    }
  }, [getPngDataUrl, title, shareUrl, filename]);

  async function handlePlatformClick(platform: Platform) {
    setError(null);
    setBusy(true);
    try {
      const pageUrl = shareUrl ?? (typeof window !== "undefined" ? window.location.href : "");

      if (platform.buildShareUrl) {
        // For platforms with proper share URLs (LinkedIn, WhatsApp, Facebook,
        // Telegram): just open the share URL. Do NOT auto-download the PNG —
        // the user clicked Share, not Download. The share URL contains the
        // page URL + title, which is what these platforms actually accept.
        window.open(platform.buildShareUrl(pageUrl, title), "_blank", "noopener,noreferrer");
      } else if (platform.downloadOnly) {
        // For platforms that don't support web share URLs (Instagram, TikTok,
        // WeChat): we MUST download the PNG first so the user can manually
        // attach it in the platform's composer. There's no other way.
        const pngDataUrl = await getPngDataUrl();
        const link = document.createElement("a");
        link.download = filename;
        link.href = pngDataUrl;
        link.click();

        const homes: Record<string, string> = {
          instagram: "https://www.instagram.com/",
          tiktok: "https://www.tiktok.com/upload",
          wechat: "https://www.wechat.com/",
        };
        const home = homes[platform.id];
        if (home) window.open(home, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleShareClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#820A7D] text-white font-semibold px-3 py-1.5 text-xs hover:bg-[#820A7D]/90 disabled:opacity-50"
        title="Share to social platforms"
      >
        <Share2 className="h-3.5 w-3.5" />
        {busy ? "Preparing…" : "Share"}
      </button>

      {error && (
        <p className="mt-1 text-[0.65rem] text-red-600">{error}</p>
      )}

      {open && (
        <div className="absolute z-50 mt-1 right-0 rounded-lg border border-black/15 bg-white shadow-xl p-2 min-w-[280px]">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-[0.7rem] font-bold text-black uppercase tracking-wider">
              Share to
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-black/80 hover:text-black"
              aria-label="Close share menu"
            >
              ×
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {PLATFORMS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handlePlatformClick(p)}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-black hover:bg-black/5 disabled:opacity-50"
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: p.color }} />
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 px-2 text-[0.6rem] text-black/50 leading-relaxed">
            LinkedIn / WhatsApp / Facebook / Telegram open a share URL with
            the page link + title (no download). Instagram / TikTok / WeChat
            don&rsquo;t support web share URLs — for those, the PNG downloads
            first so you can attach it manually in their composer.
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Inline icon components for platforms lucide doesn't cover ----

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.13c-.24.68-1.42 1.31-1.95 1.36-.5.05-1.13.07-1.83-.11-.42-.13-.96-.31-1.65-.61-2.92-1.26-4.83-4.19-4.98-4.39-.14-.2-1.19-1.58-1.19-3.02 0-1.44.76-2.14 1.02-2.44.27-.3.58-.37.78-.37.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.81 1.99.88 2.13.07.14.12.31.02.5-.09.2-.14.31-.28.48-.14.17-.29.37-.41.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.81.87-1.08.18-.28.36-.23.61-.14.25.09 1.6.76 1.88.89.28.14.47.21.54.32.07.12.07.66-.17 1.34z" />
    </svg>
  );
}

function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .57.04.84.13V9.41a6.33 6.33 0 0 0-.84-.05A6.34 6.34 0 0 0 5 20.73a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.73z" />
    </svg>
  );
}

function WechatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8.69 4C4.62 4 1.33 6.72 1.33 10.07c0 1.92 1.02 3.65 2.62 4.83L3.4 17l2.45-1.23c.86.27 1.78.42 2.74.42h.32a6.7 6.7 0 0 1-.27-1.86c0-3.07 2.79-5.56 6.23-5.56h.32C14.7 6.13 11.97 4 8.69 4zm-2.7 3.3a1.01 1.01 0 1 1 0 2.02 1.01 1.01 0 0 1 0-2.02zm5.4 0a1.01 1.01 0 1 1 0 2.02 1.01 1.01 0 0 1 0-2.02zm3.41 4.21c-2.83 0-5.13 2.07-5.13 4.62 0 2.55 2.3 4.62 5.13 4.62.79 0 1.54-.16 2.21-.45l1.9.95-.52-1.55c1.27-.93 2.08-2.3 2.08-3.82 0-2.55-2.3-4.62-5.13-4.62h-.54zm-1.62 1.95a.83.83 0 1 1 0 1.66.83.83 0 0 1 0-1.66zm3.32 0a.83.83 0 1 1 0 1.66.83.83 0 0 1 0-1.66z" />
    </svg>
  );
}
