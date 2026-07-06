"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Linkedin, MessageSquare, ExternalLink } from "lucide-react";
import { tagColor } from "@/lib/tags";

/**
 * MemberCard
 *
 * Single community member tile. Shows:
 *   - Profile picture (h-20 w-20 — larger than inbox avatar)
 *   - Name + optional title
 *   - Company (with link to companyUrl if set)
 *   - Tags (max 3 visible, +N overflow)
 *   - LinkedIn link (opens in new tab)
 *   - "Contact" button → opens 1-on-1 DM dialog
 *
 * The card itself is presentational — it calls onContact(member)
 * and the parent decides how to open the chat (in our case, via
 * the shared <MessagesDialog> in <CommunityGrid>).
 */

export type CommunityMember = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  photoUrl: string | null;
  title: string | null;
  company: string | null;
  companyUrl: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  role: string;
  tags: { id: string; label: string; color: string | null }[];
};

type Props = {
  member: CommunityMember;
  isSelf: boolean;
  onContact: (member: CommunityMember) => void;
};

function initialsOf(name: string | null, email: string) {
  return (name || email)
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function MemberCard({ member, isSelf, onContact }: Props) {
  const displayName = member.name || member.email.split("@")[0];
  const photo = member.photoUrl || member.image || undefined;

  return (
    <div className="group relative flex flex-col items-center text-center rounded-2xl border border-black/10 bg-white p-5 sm:p-6 transition-all hover:shadow-md hover:border-[#FF005A]/20 hover:-translate-y-0.5">
      {/* Profile picture */}
      <Avatar className="h-20 w-20 mb-3 ring-2 ring-black/5 group-hover:ring-[#FF005A]/30 transition">
        <AvatarImage src={photo} alt={displayName} />
        <AvatarFallback className="bg-gradient-to-br from-[#FF005A] to-[#820A7D] text-white text-xl font-bold">
          {initialsOf(member.name, member.email) || "?"}
        </AvatarFallback>
      </Avatar>

      {/* Name + title */}
      <h3 className="text-base font-bold text-black leading-tight">
        {displayName}
        {isSelf && (
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#FF005A]">
            (you)
          </span>
        )}
      </h3>
      {member.title && (
        <p className="text-xs text-black/60 mt-0.5">{member.title}</p>
      )}

      {/* Company (linkable) */}
      {member.company && (
        <div className="mt-1 text-sm text-black/80">
          {member.companyUrl ? (
            <a
              href={member.companyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[#FF005A] transition-colors"
            >
              {member.company}
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          ) : (
            <span>{member.company}</span>
          )}
        </div>
      )}

      {/* Tags */}
      {member.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {member.tags.slice(0, 3).map((t) => (
            <span
              key={t.id}
              className="ais-tag text-[10px]"
              style={{
                backgroundColor: `${t.color || tagColor(t.label)}20`,
                color: t.color || tagColor(t.label),
              }}
            >
              {t.label}
            </span>
          ))}
          {member.tags.length > 3 && (
            <span
              className="ais-tag text-[10px] bg-black/5 text-black/60"
              title={member.tags.slice(3).map((t) => t.label).join(", ")}
            >
              +{member.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Bio (truncated) */}
      {member.bio && (
        <p className="mt-3 text-xs text-black/60 line-clamp-2 leading-relaxed">
          {member.bio}
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 w-full">
        <Button
          onClick={() => onContact(member)}
          disabled={isSelf}
          className="flex-1 bg-[#FF005A] hover:bg-[#D8004D] text-white text-xs font-semibold h-9"
          size="sm"
        >
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
          Contact
        </Button>
        {member.linkedinUrl && (
          <a
            href={member.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/15 bg-white text-[#0A66C2] hover:bg-[#0A66C2] hover:text-white transition-colors"
            aria-label={`${displayName} on LinkedIn`}
            title="LinkedIn profile"
          >
            <Linkedin className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
