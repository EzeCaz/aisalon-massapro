"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eye, RotateCcw } from "lucide-react";

/**
 * TSK-0057 — "View as" switcher for SUPER_ADMIN.
 *
 * Lets the Super Admin impersonate a (role, chapter) combo to preview
 * the platform from that perspective. The selection is stored in the
 * JWT session token (via /api/admin/view-as) and read by:
 *   - src/lib/auth.ts (jwt callback — persists viewAsRole/viewAsChapterId)
 *   - src/lib/permissions.ts (getUserScope + canSeeAdminNav honor the
 *     override values when the signed-in user is SUPER_ADMIN)
 *   - src/components/ais/app-header.tsx (renders the impersonated
 *     chapter's brand image + label)
 *
 * The switcher is desktop-only (mobile nav is too cramped). It renders
 * as a compact pill with an eye icon. When an impersonation is active,
 * the pill turns amber + shows the current (role, chapter) combo.
 *
 * SECURITY: This component is only rendered when the signed-in user is
 * SUPER_ADMIN (checked in app-header.tsx). The API route enforces the
 * same check server-side. Non-super-admins cannot set viewAs fields.
 */

type Chapter = {
  id: string;
  name: string;
  city: string | null;
  slug: string;
  country: { name: string; flagEmoji: string | null } | null;
};

type Props = {
  /** Current viewAsRole from the JWT, or null if not impersonating. */
  currentViewAsRole: string | null;
  /** Current viewAsChapterId from the JWT, or null if not impersonating. */
  currentViewAsChapterId: string | null;
};

const ROLE_OPTIONS = [
  { value: "MEMBER", label: "Member" },
  { value: "SPEAKER", label: "Speaker" },
  { value: "CO_HOST", label: "Co-Host" },
  { value: "CHAPTER_ORGANIZER", label: "Chapter Organizer" },
  { value: "ADMIN", label: "Admin (Country scope)" },
  { value: "SUPER_ADMIN", label: "Super Admin (Global)" },
] as const;

export function ViewAsSwitcher({ currentViewAsRole, currentViewAsChapterId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [loadingChapters, setLoadingChapters] = useState(false);

  const isActive = currentViewAsRole !== null || currentViewAsChapterId !== null;

  async function loadChapters() {
    if (chapters) return;
    setLoadingChapters(true);
    try {
      // TSK-0057: The existing /api/admin/chapters GET endpoint returns
      // all chapters for SUPER_ADMIN. The ViewAsSwitcher is only rendered
      // to SUPER_ADMIN, so this works. The response shape is
      // { chapters: [{ id, name, city, slug, country: { name, code, flagEmoji } }] }.
      const res = await fetch("/api/admin/chapters", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: Chapter[] = (data.chapters ?? []).map((c: { id: string; name: string; city: string | null; slug: string; country?: { name: string; flagEmoji: string | null } | null }) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        slug: c.slug,
        country: c.country
          ? { name: c.country.name, flagEmoji: c.country.flagEmoji }
          : null,
      }));
      setChapters(list);
    } catch (err) {
      console.error("[view-as] could not load chapters:", err);
      setChapters([]);
    } finally {
      setLoadingChapters(false);
    }
  }

  async function applyViewAs(role: string | null, chapterId: string | null) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/view-as", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, chapterId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("[view-as] set failed:", err);
          return;
        }
        setOpen(false);
        // Full reload so every server component re-reads the JWT.
        router.refresh();
        // Also hard-refresh the page so the JWT cookie change is picked
        // up by middleware + RSC. router.refresh() alone doesn't always
        // re-evaluate cookies in dev.
        window.location.reload();
      } catch (err) {
        console.error("[view-as] set threw:", err);
      }
    });
  }

  async function resetViewAs() {
    await applyViewAs(null, null);
  }

  const activeChapterName = chapters?.find((c) => c.id === currentViewAsChapterId)?.name ?? null;
  const activeRoleLabel = ROLE_OPTIONS.find((r) => r.value === currentViewAsRole)?.label ?? currentViewAsRole;

  return (
    <DropdownMenu open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) loadChapters();
    }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            isActive
              ? "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
              : "bg-black/5 text-black/70 hover:bg-black/10 border border-transparent"
          }`}
          title={isActive ? `Viewing as ${activeRoleLabel}${activeChapterName ? ` · ${activeChapterName}` : ""}` : "View as..."}
        >
          <Eye className="h-3.5 w-3.5" />
          {isActive ? (
            <span className="max-w-[160px] truncate">
              View: {activeRoleLabel}{activeChapterName ? ` · ${activeChapterName}` : ""}
            </span>
          ) : (
            <span>View as</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-black/60">
          View as role
        </DropdownMenuLabel>
        {ROLE_OPTIONS.map((r) => (
          <DropdownMenuItem
            key={r.value}
            onClick={() => applyViewAs(r.value, currentViewAsChapterId)}
            className={`cursor-pointer ${currentViewAsRole === r.value ? "bg-amber-50 font-semibold" : ""}`}
          >
            {r.label}
            {currentViewAsRole === r.value && <span className="ml-auto text-amber-600">●</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-black/60">
          View as chapter
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => applyViewAs(currentViewAsRole, null)}
          className={`cursor-pointer ${currentViewAsChapterId === null ? "bg-amber-50 font-semibold" : ""}`}
        >
          <em>None (own chapter)</em>
          {currentViewAsChapterId === null && <span className="ml-auto text-amber-600">●</span>}
        </DropdownMenuItem>
        {loadingChapters && (
          <div className="px-3 py-2 text-xs text-black/50">Loading chapters…</div>
        )}
        {chapters && chapters.length === 0 && (
          <div className="px-3 py-2 text-xs text-black/50">No chapters found.</div>
        )}
        {chapters?.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onClick={() => applyViewAs(currentViewAsRole, c.id)}
            className={`cursor-pointer ${currentViewAsChapterId === c.id ? "bg-amber-50 font-semibold" : ""}`}
          >
            <span className="mr-1">{c.country?.flagEmoji ?? "🏳️"}</span>
            {c.name}
            {c.city && <span className="ml-1 text-black/50">· {c.city}</span>}
            {currentViewAsChapterId === c.id && <span className="ml-auto text-amber-600">●</span>}
          </DropdownMenuItem>
        ))}
        {isActive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={resetViewAs}
              className="cursor-pointer text-[#FF005A] focus:text-[#FF005A] font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset to my real identity
            </DropdownMenuItem>
          </>
        )}
        {isPending && (
          <div className="px-3 py-2 text-xs text-black/50">Applying…</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
