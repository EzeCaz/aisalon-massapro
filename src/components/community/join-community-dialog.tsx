"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Users, CheckCircle2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * JoinCommunityDialog — the "join the community + fill the community form"
 * flow (user spec 2026-09-19).
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
  brand?: { slug: string; displayName: string } | null;
  country?: { name: string; code: string; flagEmoji: string | null } | null;
};

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
  /** Signed-in user for prefill (name + email are not editable here). */
  me: { name: string | null; email: string } | null;
  /** Called after a successful join (chapter slug + form payload). */
  onJoined?: (chapter: JoinChapterInfo) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [linkedinUrl, setLinkedinUrl] = React.useState("");
  const [whyJoin, setWhyJoin] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  // Reset the form each time the dialog opens for a (possibly different)
  // community, and prefill from the user's profile where we can.
  React.useEffect(() => {
    if (open) {
      setDone(false);
      setWhyJoin("");
      setTitle("");
      setCompany("");
      setLinkedinUrl("");
    }
  }, [open, chapter?.slug]);

  if (!chapter) return null;

  const cityLabel = chapter.city ? ` · ${chapter.city}` : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chapter) return;
    if (!whyJoin.trim()) {
      toast.error("Please tell the community why you'd like to join.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/chapters/${encodeURIComponent(chapter.slug)}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          company: company.trim() || undefined,
          linkedinUrl: linkedinUrl.trim() || undefined,
          whyJoin: whyJoin.trim(),
        }),
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
                  Fill in the community form to join. After joining you&apos;ll
                  be able to see all community members and register for
                  events.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
                {me && (
                  <div className="rounded-md bg-black/[0.03] border border-black/10 px-3 py-2.5 text-xs text-black/80 space-y-0.5">
                    <div>
                      <span className="font-semibold">{me.name || "You"}</span>{" "}
                      <span className="text-black/50">({me.email})</span>
                    </div>
                    <div className="text-black/50">
                      Joining as this account.
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-black/80">
                      Role / title
                    </span>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Founder, engineer, investor…"
                      className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/20"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-black/80">
                      Company
                    </span>
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Company or org"
                      className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/20"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold text-black/80">
                    LinkedIn or portfolio{" "}
                    <span className="font-normal text-black/40">(optional)</span>
                  </span>
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                    className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/20"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-black/80">
                    Why do you want to join {chapter.name}?
                  </span>
                  <textarea
                    value={whyJoin}
                    onChange={(e) => setWhyJoin(e.target.value)}
                    rows={3}
                    required
                    placeholder="Tell the organizers a bit about yourself and what you're looking for…"
                    className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
                  />
                </label>

                <button
                  type="submit"
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
                  Your submission is shared with the community organizers.
                  Membership is free.
                </p>
              </form>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
