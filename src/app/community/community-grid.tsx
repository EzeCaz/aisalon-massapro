"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search, MessageSquare } from "lucide-react";
import { MemberCard, type CommunityMember } from "./member-card";
import { MessagesDialog } from "@/components/ais/messages-dialog";

/**
 * CommunityGrid
 *
 * Client component that renders the searchable grid of member cards
 * plus a single shared <MessagesDialog> instance. When a user clicks
 * "Contact" on any card, we stash the selected member in state and
 * open the dialog pre-targeted at that member's thread.
 *
 * The dialog stays mounted across all cards (rather than one per
 * card) so the WebSocket connection + conversation list state
 * persist between contacts.
 */

type CurrentUser = {
  id: string;
  name: string | null;
  role: string;
};

type Props = {
  members: CommunityMember[];
  currentUser: CurrentUser;
  initialUnreadCount: number;
};

export function CommunityGrid({
  members,
  currentUser,
  initialUnreadCount,
}: Props) {
  const [search, setSearch] = useState("");
  const [activeMember, setActiveMember] = useState<CommunityMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filter members by name, company, or tag label.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const haystack = [
        m.name || "",
        m.email || "",
        m.company || "",
        m.title || "",
        m.bio || "",
        ...m.tags.map((t) => t.label),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [members, search]);

  function handleContact(member: CommunityMember) {
    setActiveMember(member);
    setDialogOpen(true);
  }

  return (
    <>
      {/* Search bar */}
      <div className="mb-6 sticky top-16 z-20 -mx-4 px-4 py-3 bg-white/95 backdrop-blur border-b border-black/10 sm:mx-0 sm:px-0 sm:py-0 sm:border-0 sm:bg-transparent sm:backdrop-blur-none sm:static">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
          <Input
            placeholder={`Search ${members.length} members by name, company, or role…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 text-sm border-black/15"
          />
        </div>
        {search && (
          <p className="text-xs text-black/50 mt-2 pl-1">
            {filtered.length} of {members.length} members match &ldquo;{search}&rdquo;
          </p>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-black/10 bg-black/[0.02] p-12 text-center">
          <p className="text-sm text-black/60">
            No members match &ldquo;{search}&rdquo;. Try a different search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {filtered.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              isSelf={false}
              onContact={handleContact}
            />
          ))}
        </div>
      )}

      {/* Shared DM dialog — opened pre-targeted at the clicked member.
          One instance for the whole grid so WS state persists. */}
      <MessagesDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) {
            // Clear the active member shortly after close so the
            // dialog animation doesn't jump to "no partner" state.
            setTimeout(() => setActiveMember(null), 150);
          }
        }}
        userId={currentUser.id}
        userName={currentUser.name}
        userRole={currentUser.role}
        initialUnreadCount={initialUnreadCount}
        initialPartnerId={activeMember?.id ?? null}
        initialPartner={
          activeMember
            ? {
                id: activeMember.id,
                name: activeMember.name,
                email: activeMember.email,
                photoUrl: activeMember.photoUrl,
                image: activeMember.image,
                company: activeMember.company,
                bio: activeMember.bio,
                tags: activeMember.tags,
              }
            : null
        }
      />

      {/* Tiny floating hint badge — only shows when no member has been
          contacted yet. Removes itself once the user opens a chat. */}
      {!dialogOpen && !activeMember && (
        <div className="hidden lg:flex fixed bottom-4 right-4 z-30 items-center gap-2 rounded-full bg-black text-white text-xs px-3 py-1.5 shadow-lg ais-lift">
          <MessageSquare className="h-3.5 w-3.5" />
          Click Contact to start a chat
        </div>
      )}
    </>
  );
}
