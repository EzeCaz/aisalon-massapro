"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Users, CheckCircle2, Lock, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * JoinCommunityDialog — the "join the community" flow.
 *
 * PER USER SPEC 2026-09-19 (v2): the form is NO LONGER editable. All
 * details are PRE-FILLED from the user's profile (GET /api/profile),
 * displayed READ-ONLY with only PART of each personal value visible
 * (masked with ••• bullets, the same way password inputs hide text),
 * and the user simply confirms with a single "Join" button. The real
 * values are never sent from the client — the server copies them from
 * the signed-in user's profile record, so nothing can be tampered with.
 *
 * Shown whenever a signed-in user who is NOT a member of a community
 * clicks a join/register button that requires membership of that
 * community:
 *   - The "Register to event" button on a public event page
 *     (/e/[slug]) of a community they haven't joined.
 *   - The "Request to join" button on a community card in /communities.
 *
 * Submitting POSTs to /api/chapters/[slug]/membership. Joins are
 * auto-approved, so on success the caller's onJoined callback fires and
 * the parent can immediately continue the original action (e.g. RSVP).
 */

export type JoinChapterInfo = {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  /** IANA timezone (e.g. "Asia/Jerusalem", "America/Montreal"). Used
   *  by the public event page to format event times in the chapter's
   *  local timezone instead of a hardcoded default. */
  timezone?: string | null;
  brand?: { slug: string; displayName: string } | null;
  country?: { name: string; code: string; flagEmoji: string | null } | null;
};

type ProfilePrefill = {
  name: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
};

// ── PARTIAL-DISPLAY MASKING (password-style) ────────────────────────
// Show just enough of each personal value to confirm WHICH detail is
// being shared, never the full value. UI-only cosmetics — the server
// always stores the real profile data.

function maskText(v: string): string {
  const s = v.trim();
  if (!s) return "—";
  if (s.length <= 3) return `${s[0]}•••`;
  return `${s.slice(0, 3)}•••`;
}

function maskName(v: string): string {
  const s = v.trim();
  if (!s) return "—";
  const words = s.split(/\s+/);
  // Multi-word names keep the first word readable ("Eze •••").
  if (words.length > 1 && words[0].length >= 2) return `${words[0]} •••`;
  return maskText(s);
}

function maskEmail(v: string): string {
  const s = v.trim();
  const at = s.indexOf("@");
  if (at <= 0) return maskText(s);
  const local = s.slice(0, at);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}•••${s.slice(at)}`; // "ez•••@cazhype.com"
}

function maskUrl(v: string): string {
  const s = v.trim();
  if (!s) return "—";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return `${u.hostname}/•••`; // "linkedin.com/•••"
  } catch {
    return maskText(s);
  }
}

export function JoinCommunityDialog({
  open,
  onOpenChange,
  chapter,
  me,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: JoinChapterInfo | null;
  /** Fallback identity if the profile fetch fails (name + email only). */
  me: { name: string | null; email: string } | null;
  /** Called after a successful join. */
  onJoined?: (chapter: JoinChapterInfo) => void;
}) {
  const [profile, setProfile] = React.useState<ProfilePrefill | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  // Each time the dialog opens, refresh the profile prefill from the
  // server (the user may have updated it since).
  React.useEffect(() => {
    if (!open) return;
    setDone(false);
    setProfile(null);
    setProfileLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { user?: ProfilePrefill };
          if (!cancelled && data?.user) setProfile(data.user);
        }
      } catch {
        // Fall back to the `me` prop below — dialog still works.
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, chapter?.slug]);

  if (!chapter) return null;

  const cityLabel = chapter.city ? ` · ${chapter.city}` : "";

  // Display identity: prefer the fetched profile, fall back to `me`.
  const name = profile?.name ?? me?.name ?? null;
  const email = profile?.email ?? me?.email ?? null;
  const title = profile?.title ?? null;
  const company = profile?.company ?? null;
  const linkUrl = profile?.linkedinUrl ?? profile?.portfolioUrl ?? null;

  const detailRows: { label: string; value: string }[] = [
    ...(name ? [{ label: "Name", value: maskName(name) }] : []),
    ...(email ? [{ label: "Email", value: maskEmail(email) }] : []),
    ...(title ? [{ label: "Role / title", value: maskText(title) }] : []),
    ...(company ? [{ label: "Company", value: maskText(company) }] : []),
    ...(linkUrl ? [{ label: "LinkedIn", value: maskUrl(linkUrl) }] : []),
  ];

  async function handleJoin() {
    if (!chapter) return;
    setSubmitting(true);
    try {
      // No payload: the server copies the details from the profile —
      // nothing here can be edited or forged.
      const res = await fetch(`/api/chapters/${encodeURIComponent(chapter.slug)}/membership`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || `Could not join (HTTP ${res.status}).`);
        return;
      }
      setDone(true);
      toast.success(
        data?.alreadyMember
          ? `You're already a member of ${chapter.name}.`
          : `Welcome to ${chapter.name}! You can now see the community members and join events.`
      );
      onJoined?.(chapter);
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl p-0 overflow-hidden bg-white">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#FF005A] via-[#7C3AED] to-[#00E6FF]" />
        <div className="p-6">
          {done ? (
            <div className="text-center py-4 space-y-3">
              <CheckCircle2 className="h-10 w-10 text-[#007E72] mx-auto" />
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-xl font-extrabold text-black">
                  You&apos;re in!
                </DialogTitle>
                <DialogDescription className="text-sm text-black/70">
                  You joined <strong>{chapter.name}</strong>
                  {cityLabel}. You can now see all community members and
                  register for their events.
                </DialogDescription>
              </DialogHeader>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="mt-2 w-full rounded-md bg-black text-white font-semibold px-4 py-2.5 text-sm hover:bg-black/90"
              >
                Continue
              </button>
            </div>
          ) : (
            <>
              <DialogHeader className="space-y-1.5">
                <div className="flex items-center gap-2 text-[#FF005A]">
                  <Users className="h-4 w-4" />
                  <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em]">
                    Join the community
                  </span>
                </div>
                <DialogTitle className="text-xl font-extrabold text-black">
                  {chapter.name}
                  <span className="text-black/50 font-bold">{cityLabel}</span>
                </DialogTitle>
                <DialogDescription className="text-sm text-black/70 leading-relaxed">
                  Your details come straight from your profile — nothing to
                  fill in. After joining you&apos;ll be able to see all
                  community members and register for events.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-5 space-y-3">
                {profileLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-md bg-black/[0.03] border border-black/10 px-3 py-6 text-sm text-black/50">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading your
                    details…
                  </div>
                ) : detailRows.length > 0 ? (
                  <div className="rounded-md border border-black/10 divide-y divide-black/[0.06] overflow-hidden">
                    {detailRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 bg-black/[0.02]"
                      >
                        <span className="text-xs font-semibold text-black/60">
                          {row.label}
                        </span>
                        <span
                          className="text-xs font-mono text-black/80 tracking-wide select-none"
                          aria-label={`${row.label} (hidden for privacy)`}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md bg-black/[0.03] border border-black/10 px-3 py-4 text-xs text-black/60 text-center">
                    We&apos;ll share your account details with the community
                    organizers.
                  </div>
                )}

                <div className="flex items-center justify-center gap-1.5 text-[0.65rem] text-black/50">
                  <Lock className="h-3 w-3" />
                  Details are from your profile and can&apos;t be changed
                  here. Update them anytime in your profile.
                </div>

                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-3 text-sm hover:bg-[#FF005A]/90 disabled:opacity-50 ais-lift"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Joining…
                    </>
                  ) : (
                    <>
                      Join {chapter.name} <ExternalLink className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
                <p className="text-[0.65rem] text-black/50 text-center leading-relaxed">
                  Membership is free.
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
