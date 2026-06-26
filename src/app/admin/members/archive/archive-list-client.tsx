"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Archive as ArchiveIcon,
  RotateCcw,
  Search,
  Loader2,
  Mail,
  Building,
  Calendar,
  Shield,
} from "lucide-react";
import { roleBadgeClass, roleLabel, isSuperAdminEmail } from "@/lib/permissions";

type Archiver = {
  id: string;
  email: string;
  name: string | null;
};

type ArchivedMember = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  photoUrl: string | null;
  bio: string | null;
  company: string | null;
  mobile: string | null;
  interestedIn: string | null;
  profileCategories: string | null;
  appliedFor: string | null;
  importSource: string | null;
  importedAt: string | null;
  onboardedAt: string | null;
  role: string;
  createdAt: string;
  archivedAt: string;
  archivedBy: string | null;
  archiver: Archiver | null;
  tags: { id: string; label: string; color: string | null }[];
  _count: { images: number; speakers: number };
};

/**
 * ArchiveListClient
 * -----------------
 * Renders the archived members list with search + per-row Restore button.
 * Each row shows: avatar, name/email, company, mobile, archived-at + archiver,
 * tags, and a Restore button (which calls DELETE /api/admin/members/[id]/archive
 * to clear the archivedAt timestamp).
 *
 * The Restore button uses a window.confirm() to prevent accidental clicks —
 * restoring brings the member back to the active list immediately.
 */
export function ArchiveListClient({ members }: { members: ArchivedMember[] }) {
  const [search, setSearch] = React.useState("");
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return members;
    return members.filter((m) => {
      return (
        m.email.toLowerCase().includes(q) ||
        (m.name || "").toLowerCase().includes(q) ||
        (m.company || "").toLowerCase().includes(q) ||
        (m.archiver?.email || "").toLowerCase().includes(q) ||
        (m.archiver?.name || "").toLowerCase().includes(q)
      );
    });
  }, [members, search]);

  async function handleRestore(member: ArchivedMember) {
    const displayName = member.name || member.email;
    const ok = window.confirm(
      `Restore ${displayName}?\n\nThey will reappear in the main members list immediately.`
    );
    if (!ok) return;
    setRestoringId(member.id);
    const t = toast.loading(`Restoring ${displayName}…`);
    try {
      const res = await fetch(`/api/admin/members/${member.id}/archive`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      toast.success(`${displayName} restored to active members.`, { id: t });
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 8000 });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-black/30" />
        <input
          type="text"
          placeholder="Search archived members by name, email, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-black/15 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40"
        />
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <SummaryCard
          label="Archived"
          value={filtered.length}
          accent="bg-[#820A7D]/10 text-[#820A7D]"
        />
        <SummaryCard
          label="Imported (at archive time)"
          value={filtered.filter((m) => m.importSource).length}
          accent="bg-[#00E6FF]/20 text-[#007E72]"
        />
        <SummaryCard
          label="Self-registered"
          value={filtered.filter((m) => !m.importSource).length}
          accent="bg-[#007E72]/10 text-[#007E72]"
        />
        <SummaryCard
          label="With speaker links"
          value={filtered.filter((m) => m._count.speakers > 0).length}
          accent="bg-[#FF005A]/10 text-[#FF005A]"
        />
      </div>

      {/* Archived members table */}
      <div className="rounded-md border border-black/10 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] text-black/60 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-3 font-bold">Member</th>
              <th className="text-left px-4 py-3 font-bold hidden md:table-cell">
                Company
              </th>
              <th className="text-left px-4 py-3 font-bold hidden lg:table-cell">
                Archived
              </th>
              <th className="text-left px-4 py-3 font-bold hidden lg:table-cell">
                Archived by
              </th>
              <th className="text-left px-4 py-3 font-bold hidden md:table-cell">
                Role
              </th>
              <th className="text-right px-4 py-3 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr
                key={m.id}
                className="border-t border-black/5 hover:bg-black/[0.015]"
              >
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 flex-shrink-0 grayscale">
                      <AvatarImage
                        src={m.photoUrl || m.image || undefined}
                        alt={m.name || m.email}
                      />
                      <AvatarFallback className="bg-black/60 text-white text-xs font-bold">
                        {(m.name || m.email)
                          .split(/\s+|@/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase())
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-semibold text-black flex items-center gap-1.5">
                        {m.name || m.email.split("@")[0]}
                        <ArchiveIcon className="h-3 w-3 text-[#820A7D]" />
                      </div>
                      <div className="text-xs text-black/50 truncate max-w-[260px]">
                        {m.email}
                      </div>
                      {m.mobile && (
                        <div className="text-[0.65rem] text-black/40 mt-0.5">
                          {m.mobile}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell align-top text-black/70">
                  {m.company || <span className="text-black/30 italic">—</span>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell align-top text-xs text-black/60">
                  {m.archivedAt ? (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(m.archivedAt).toLocaleString()}
                    </div>
                  ) : (
                    <span className="text-black/30 italic">—</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell align-top text-xs text-black/60">
                  {m.archiver ? (
                    <div className="flex items-center gap-1">
                      <Shield className="h-3 w-3 text-[#820A7D]" />
                      <span>
                        {m.archiver.name || m.archiver.email}
                      </span>
                    </div>
                  ) : (
                    <span className="text-black/30 italic">—</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell align-top">
                  <span
                    className={`text-[0.65rem] font-bold uppercase px-1.5 py-0.5 rounded ${roleBadgeClass(m.role)}`}
                  >
                    {roleLabel(m.role)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right align-top">
                  <Button
                    size="sm"
                    className="bg-[#007E72] hover:bg-[#007E72]/90 text-white h-8"
                    onClick={() => handleRestore(m)}
                    disabled={restoringId === m.id}
                    title="Restore to active members list"
                  >
                    {restoringId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Restore
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-black/40 text-sm">
                  No archived members match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-black/10 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.6rem] font-bold uppercase tracking-widest text-black/40">
          {label}
        </span>
        <span
          className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold ${accent}`}
        >
          {value}
        </span>
      </div>
      <div className="mt-1 text-2xl font-extrabold text-black tabular-nums">
        {value}
      </div>
    </div>
  );
}

// Suppress unused-import warning for isSuperAdminEmail — kept for type
// completeness in case future restore-gating needs it.
void isSuperAdminEmail;
void Mail;
void Building;
