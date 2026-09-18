"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, ArrowRight, Loader2 } from "lucide-react";
import {
  JoinCommunityDialog,
  type JoinChapterInfo,
} from "@/components/community/join-community-dialog";

/**
 * JoinCommunityCtaCard — member-page (/events/[slug]) variant of the
 * join-to-register gate (user spec 2026-09-19).
 *
 * Rendered INSTEAD of the RSVP card when the signed-in user is not a
 * member of the event's community. Clicking opens the community join
 * form; after a successful join the page refreshes server-side so the
 * regular Register / Check-in card takes over.
 *
 * Variants mirror RsvpCheckInCard: "header" (compact, sidebar) and
 * "card" (full chrome, mobile strip).
 */
export function JoinCommunityCtaCard({
  chapter,
  variant = "card",
}: {
  chapter: JoinChapterInfo;
  variant?: "card" | "header";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const isHeader = variant === "header";

  return (
    <>
      <div
        className={
          isHeader
            ? "rounded-lg border-2 border-[#7C3AED]/25 bg-gradient-to-br from-[#7C3AED]/5 to-white p-3 space-y-2 text-center"
            : "rounded-xl border-2 border-[#7C3AED]/25 bg-gradient-to-br from-[#7C3AED]/5 to-white p-5 space-y-3"
        }
      >
        <div className={`flex items-center gap-2 text-[#7C3AED] ${isHeader ? "justify-center" : ""}`}>
          <Users className="h-4 w-4" />
          <span className="font-bold text-xs uppercase tracking-wider">
            Join {chapter.name} to register
          </span>
        </div>
        {!isHeader && (
          <p className="text-xs text-black/70 leading-relaxed">
            This event is hosted by the <strong>{chapter.name}</strong>{" "}
            community. Join (and fill in the short form) to unlock
            registration, the member directory, and all their events.
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#7C3AED] text-white font-semibold px-4 py-2.5 text-sm hover:bg-[#7C3AED]/90 ais-lift"
        >
          Join {chapter.name} <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <JoinCommunityDialog
        open={open}
        onOpenChange={setOpen}
        chapter={chapter}
        me={null}
        onJoined={() => {
          setOpen(false);
          // Refresh the server page — membership is now ACTIVE so the
          // regular RSVP card renders in place of this gate.
          router.refresh();
        }}
      />
    </>
  );
}

/** Small inline loader shown while the page refreshes after a join. */
export function JoinCommunityRefreshHint() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.65rem] text-black/50">
      <Loader2 className="h-3 w-3 animate-spin" /> Updating…
    </span>
  );
}
