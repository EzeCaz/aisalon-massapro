"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Copy, Check, Share2, Users, MousePointerClick, UserPlus, Heart } from "lucide-react";
import { toast } from "sonner";

/**
 * ReferralShareCard — a compact card that lets a member share the current
 * page with their unique UTM referral tag appended.
 *
 * Used on /profile, /events and /events/[slug] (signed-in only). The URL
 * is built dynamically from the current pathname (via usePathname()) so
 * the shared link always matches the page the member is on:
 *
 *   - on /events                → share /events?utm_uid=…
 *   - on /events/ai-salon-human → share /events/ai-salon-human?utm_uid=…
 *   - on /profile               → share /profile?utm_uid=…
 *
 * The visible UI is intentionally simple: a friendly message + Share/Copy
 * buttons. The full URL is never shown (less clutter, same functionality).
 *
 * Stats (full variant only) are loaded via /api/me/referral-stats.
 */

type Props = {
  utmUid: string;
  /** Site base URL (e.g. https://aisalon.massapro.com). Used for SSR so
   * the share URL has a real origin before the client mounts. */
  siteUrl?: string;
  /** Compact mode = single row (for the events page hero). Full = card with stats (for /profile). */
  variant?: "compact" | "full";
};

type Stats = {
  visits: number;
  newVisitors: number;
  signups: number;
  rsvps: number;
};

export function ReferralShareCard({
  utmUid,
  siteUrl,
  variant = "full",
}: Props) {
  const pathname = usePathname();
  const [copied, setCopied] = React.useState(false);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(variant === "full");
  // Defer browser-only checks to after mount so SSR HTML matches the
  // first client render (avoids hydration mismatch warnings).
  // - canNativeShare: only true on browsers that expose navigator.share
  // - clientOrigin: window.location.origin captured after mount, so the
  //   share URL is stable between server & first client paint.
  const [canNativeShare, setCanNativeShare] = React.useState(false);
  const [clientOrigin, setClientOrigin] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
    setClientOrigin(typeof window !== "undefined" ? window.location.origin : null);
  }, []);

  // Use the prop if provided; otherwise fall back to the SSR-safe constant
  // on the server, and the captured client origin after mount.
  const origin =
    siteUrl || clientOrigin || "https://aisalon.massapro.com";
  // Always use the current pathname so the shared URL matches the page
  // the member is on. Fall back to "/events" if pathname is unexpectedly
  // empty (shouldn't happen in practice, but defensive).
  const sharePath = pathname || "/events";
  const shareUrl = React.useMemo(() => {
    const u = new URL(sharePath, origin);
    u.searchParams.set("utm_source", "member");
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_campaign", "aisalon");
    u.searchParams.set("utm_uid", utmUid);
    return u.toString();
  }, [origin, sharePath, utmUid]);

  // Load stats on mount (full variant only)
  React.useEffect(() => {
    if (variant !== "full") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/referral-stats", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Stats;
        if (!cancelled) setStats(data);
      } catch {
        // silent fail — stats are nice-to-have, not critical
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variant]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Referral link copied — share it to get credit for signups!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link. Long-press to copy manually.");
    }
  }

  async function nativeShare() {
    if (typeof navigator === "undefined" || !navigator.share) {
      copyLink();
      return;
    }
    try {
      await navigator.share({
        title: "AI Salon Tel Aviv",
        text: "Join me at AI Salon Tel Aviv — empowering AI connections.",
        url: shareUrl,
      });
    } catch {
      /* user dismissed — swallow */
    }
  }

  if (variant === "compact") {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-[#FF005A]/20 bg-gradient-to-r from-[#FF005A]/5 to-[#00E6FF]/5 px-3 py-2.5">
        <Heart className="h-4 w-4 text-[#FF005A] shrink-0 hidden sm:inline" />
        <p className="flex-1 text-xs font-semibold text-black/75 leading-snug">
          Our community is grateful for you, let&apos;s help others join us
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1 rounded-md bg-black text-white px-2.5 py-1 text-xs font-semibold hover:bg-black/90"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          {canNativeShare && (
            <button
              type="button"
              onClick={nativeShare}
              className="inline-flex items-center gap-1 rounded-md bg-[#FF005A] text-white px-2.5 py-1 text-xs font-semibold hover:bg-[#D8004D]"
            >
              <Share2 className="h-3 w-3" /> Share
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#FF005A]/20 bg-gradient-to-br from-[#FF005A]/5 to-[#00E6FF]/5 p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Heart className="h-5 w-5 text-[#FF005A]" />
        <h3 className="text-base font-extrabold text-black">Invite your network</h3>
      </div>
      <p className="text-sm text-black/70 mb-4 leading-relaxed">
        Our community is grateful for you, let&apos;s help others join us. Share this
        page — when someone signs up or registers via your link, you&apos;ll get the
        credit. Your impact shows below.
      </p>

      {/* Share + Copy buttons (URL is intentionally hidden — buttons do the work) */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-black text-white px-4 py-2.5 text-sm font-semibold hover:bg-black/90 ais-lift"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={nativeShare}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#FF005A] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#D8004D] ais-lift"
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Link clicks"
          value={statsLoading ? "…" : (stats?.visits ?? 0).toString()}
          color="#004F98"
        />
        <StatCard
          icon={<UserPlus className="h-4 w-4" />}
          label="Signups"
          value={statsLoading ? "…" : (stats?.signups ?? 0).toString()}
          color="#FF005A"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Event RSVPs"
          value={statsLoading ? "…" : (stats?.rsvps ?? 0).toString()}
          color="#00C2A8"
        />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-3 text-center">
      <div
        className="inline-flex items-center justify-center w-8 h-8 rounded-full mb-1.5"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="text-lg font-extrabold text-black leading-tight">{value}</div>
      <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-black/50 mt-0.5">
        {label}
      </div>
    </div>
  );
}
