"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";

/**
 * Button that calls POST /api/admin/v7-seed to one-shot seed Country
 * "Israel" + Chapter "Tel Aviv" and backfill every existing NULL row.
 *
 * Shown to Super Admins on the /admin/chapters empty state. After
 * success, the page reloads so the world map + chapter tree render.
 */
export function SeedV7Button({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleClick() {
    if (
      !confirm(
        "This will create Country \"Israel\" + Chapter \"Tel Aviv\" and backfill " +
          "every existing member, event, RSVP, speaker, email, and referral row " +
          "to that scope. Super Admin accounts keep their global scope. Safe to " +
          "re-run (idempotent). Continue?"
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/v7-seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const updates = data.updates || {};
      const totalUpdates = Object.values(updates).reduce(
        (s: number, n) => s + (n as number),
        0
      );
      setResult(
        `Seeded ${data.country.name} + ${data.chapter.name}. ${totalUpdates} row(s) backfilled.`
      );
      // Reload after a short delay so the user can see the success message.
      setTimeout(() => router.refresh(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#00E6FF]/40 bg-[#00E6FF]/10 text-[#007E72] font-semibold px-2.5 py-1.5 text-xs hover:bg-[#00E6FF]/20 disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Seed Israel + Tel Aviv
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-[#820A7D] text-white font-semibold px-4 py-2 text-sm hover:bg-[#820A7D]/90 disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Seed Israel + Tel Aviv now
      </button>
      {error && (
        <p className="text-xs text-[#FF005A] flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
      {result && (
        <p className="text-xs text-[#007E72] flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {result}
        </p>
      )}
      <p className="text-xs text-black/60 max-w-md">
        Creates the default Country (Israel) + Chapter (Tel Aviv) and backfills
        every existing member, event, RSVP, speaker, email, and referral to
        that scope. Super Admin accounts stay global. Idempotent — safe to
        re-run.
      </p>
    </div>
  );
}
