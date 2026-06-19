"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { MEMBER_TAG_CATALOG, tagColor } from "@/lib/tags";
import { Shield, Search, Tag as TagIcon } from "lucide-react";

type Member = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  photoUrl?: string | null;
  bio?: string | null;
  company?: string | null;
  companyUrl?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  role: string;
  createdAt: string;
  tags: { id: string; label: string; color: string | null }[];
  _count: { images: number };
};

export function AdminMembersTable({ members }: { members: Member[] }) {
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    return (
      m.email.toLowerCase().includes(q) ||
      (m.name || "").toLowerCase().includes(q) ||
      m.tags.some((t) => t.label.toLowerCase().includes(q))
    );
  });

  async function saveTags(memberId: string, tags: string[]) {
    setPending(memberId);
    const t = toast.loading("Saving tags…");
    try {
      const res = await fetch(`/api/admin/members/${memberId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Tags updated", { id: t });
      // Refresh to reflect changes
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-black/30" />
        <Input
          placeholder="Search by name, email, or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Table */}
      <div className="border border-black/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-black/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Member</th>
                <th className="text-left px-4 py-3 font-bold hidden md:table-cell">Joined</th>
                <th className="text-left px-4 py-3 font-bold hidden sm:table-cell">Photos</th>
                <th className="text-left px-4 py-3 font-bold">Tags</th>
                <th className="text-right px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-black/5 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={m.photoUrl || m.image || undefined} alt={m.name || m.email} />
                        <AvatarFallback className="bg-black text-white text-xs font-bold">
                          {(m.name || m.email)
                            .split(/\s+|@/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase())
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-semibold text-black truncate flex items-center gap-1.5">
                          {m.name || m.email.split("@")[0]}
                          {m.role === "ADMIN" && (
                            <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-bold uppercase bg-[#FF005A] text-white px-1.5 py-0.5 rounded">
                              <Shield className="h-2.5 w-2.5" /> Admin
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-black/50 truncate">{m.email}</div>
                        {m.company && (
                          <div className="text-[10px] text-black/40 truncate mt-0.5">
                            {m.company}
                            {m.companyUrl && (
                              <a
                                href={m.companyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-[#004F98] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                ↗
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-black/60 text-xs hidden md:table-cell">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-black/60 text-xs hidden sm:table-cell">
                    {m._count.images}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[280px]">
                      {m.tags.length === 0 ? (
                        <span className="text-xs text-black/30 italic">No tags</span>
                      ) : (
                        m.tags.map((t) => (
                          <span
                            key={t.id}
                            className="ais-tag"
                            style={{
                              backgroundColor: `${t.color || tagColor(t.label)}20`,
                              color: t.color || tagColor(t.label),
                            }}
                          >
                            {t.label}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TagDialog
                      member={m}
                      pending={pending === m.id}
                      onSave={(tags) => saveTags(m.id, tags)}
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-black/40 text-sm">
                    No members match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TagDialog({
  member,
  pending,
  onSave,
}: {
  member: Member;
  pending: boolean;
  onSave: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(member.tags.map((t) => t.label))
  );

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelected(new Set(member.tags.map((t) => t.label)));
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-black/20">
          <TagIcon className="h-3.5 w-3.5 mr-1.5" /> Manage tags
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Manage tags · <span className="text-black/60">{member.name || member.email}</span>
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/60 -mt-2">
          Select one or more tags to assign to this member. Existing tags will be replaced.
        </p>
        <div className="space-y-1.5 max-h-80 overflow-y-auto ais-scroll">
          {MEMBER_TAG_CATALOG.map((t) => (
            <label
              key={t.label}
              className="flex items-start gap-3 p-2 rounded-md hover:bg-black/5 cursor-pointer"
            >
              <Checkbox
                checked={selected.has(t.label)}
                onCheckedChange={() => toggle(t.label)}
                style={{
                  backgroundColor: selected.has(t.label) ? t.color : undefined,
                  borderColor: t.color,
                }}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{t.label}</span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                    title={t.color}
                  />
                </div>
                {t.description && (
                  <div className="text-xs text-black/60">{t.description}</div>
                )}
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() => onSave(Array.from(selected))}
            className="bg-black hover:bg-black/90"
          >
            {pending ? "Saving…" : `Save ${selected.size} tag${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
