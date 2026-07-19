"use client";

/**
 * <BulkAssignScopeDialog />
 * ──────────────────────────
 * Reusable bulk-assign-scope dialog. Used by the bulk-action bars on
 * the Members, Speakers, Registrants, and Events admin pages.
 *
 * Lets a Super Admin (or country Admin within their own country) pick a
 * country + chapter and apply it to N selected records in one shot.
 *
 * Props:
 *   - entityType: "members" | "registrants" | "events" | "speakers"
 *   - selectedIds: string[]         — the IDs to update
 *   - onClear: () => void           — called after a successful apply
 *                                     (so the parent can clear its selection)
 *
 * It fetches the available countries + chapters from /api/admin/chapters/for-assign
 * on mount (same source as EditMemberDialog).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Globe2, MapPin, Loader2, Plus, X } from "lucide-react";

export type BulkAssignEntityType = "members" | "registrants" | "events" | "speakers";

type AssignCountry = {
  id: string;
  name: string;
  code: string;
  flagEmoji?: string | null;
  isActive?: boolean;
};

type AssignChapter = {
  id: string;
  name: string;
  slug?: string;
  countryId: string;
  city?: string | null;
  isActive?: boolean;
};

const ENTITY_LABELS: Record<BulkAssignEntityType, { singular: string; plural: string; idField: string; endpoint: string }> = {
  members: { singular: "member", plural: "members", idField: "userIds", endpoint: "/api/admin/members/bulk-assign-scope" },
  registrants: { singular: "registrant", plural: "registrants", idField: "rsvpIds", endpoint: "/api/admin/registrants/bulk-assign-scope" },
  events: { singular: "event", plural: "events", idField: "eventIds", endpoint: "/api/admin/events/bulk-assign-scope" },
  speakers: { singular: "speaker", plural: "speakers", idField: "speakerIds", endpoint: "/api/admin/speakers/bulk-assign-scope" },
};

export function BulkAssignScopeDialog({
  entityType,
  selectedIds,
  onClear,
  trigger,
  open,
  onOpenChange,
}: {
  entityType: BulkAssignEntityType;
  selectedIds: string[];
  onClear?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const labels = ENTITY_LABELS[entityType];

  // Controlled-vs-uncontrolled open state
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [countries, setCountries] = useState<AssignCountry[]>([]);
  const [chapters, setChapters] = useState<AssignChapter[]>([]);
  const [countryId, setCountryId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [pending, setPending] = useState(false);

  // Cross-chapter flag — only relevant for events
  const [isCrossChapter, setIsCrossChapter] = useState<boolean>(false);

  // ---- Inline "Create new country" ----
  const [showCreateCountry, setShowCreateCountry] = useState(false);
  const [newCountryName, setNewCountryName] = useState("");
  const [newCountryCode, setNewCountryCode] = useState("");
  const [newCountryFlag, setNewCountryFlag] = useState("");
  const [creatingCountry, setCreatingCountry] = useState(false);

  // ---- Inline "Create new chapter" ----
  const [showCreateChapter, setShowCreateChapter] = useState(false);
  const [newChapterName, setNewChapterName] = useState("");
  const [newChapterCity, setNewChapterCity] = useState("");
  const [creatingChapter, setCreatingChapter] = useState(false);

  // Fetch countries + chapters once on mount.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/chapters/for-assign");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCountries(data.countries ?? []);
          setChapters(data.chapters ?? []);
        }
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Reset form state when the dialog closes.
  useEffect(() => {
    if (!isOpen) {
      setCountryId("");
      setChapterId("");
      setIsCrossChapter(false);
      setShowCreateCountry(false);
      setShowCreateChapter(false);
      setNewCountryName("");
      setNewCountryCode("");
      setNewCountryFlag("");
      setNewChapterName("");
      setNewChapterCity("");
    }
  }, [isOpen]);

  const filteredChapters = countryId ? chapters.filter((c) => c.countryId === countryId) : [];

  async function handleCreateCountry() {
    const name = newCountryName.trim();
    const code = newCountryCode.trim().toUpperCase();
    if (!name) return toast.error("Country name is required");
    if (code.length !== 2) return toast.error("Country code must be 2 letters");
    setCreatingCountry(true);
    const t = toast.loading(`Creating country "${name}"…`);
    try {
      const res = await fetch("/api/admin/countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, flagEmoji: newCountryFlag.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const refRes = await fetch("/api/admin/chapters/for-assign");
      if (refRes.ok) {
        const refData = await refRes.json();
        setCountries(refData.countries ?? []);
        setChapters(refData.chapters ?? []);
      }
      setCountryId(data.country.id);
      setChapterId("");
      setShowCreateCountry(false);
      setNewCountryName("");
      setNewCountryCode("");
      setNewCountryFlag("");
      toast.success(`Country "${name}" created`, { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setCreatingCountry(false);
    }
  }

  async function handleCreateChapter() {
    const name = newChapterName.trim();
    if (!name) return toast.error("Chapter name is required");
    if (!countryId) return toast.error("Select a country first");
    setCreatingChapter(true);
    const t = toast.loading(`Creating chapter "${name}"…`);
    try {
      const res = await fetch("/api/admin/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, countryId, city: newChapterCity.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const refRes = await fetch("/api/admin/chapters/for-assign");
      if (refRes.ok) {
        const refData = await refRes.json();
        setCountries(refData.countries ?? []);
        setChapters(refData.chapters ?? []);
      }
      setChapterId(data.chapter.id);
      setShowCreateChapter(false);
      setNewChapterName("");
      setNewChapterCity("");
      toast.success(`Chapter "${name}" created`, { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setCreatingChapter(false);
    }
  }

  async function handleApply() {
    if (selectedIds.length === 0) {
      toast.error("No rows selected");
      return;
    }
    if (!countryId && !chapterId) {
      // Allow "clear scope" only when both are empty AND the user explicitly confirms.
      // For safety, we require at least one of them.
      toast.error("Pick a country (and optionally a chapter) to assign. Use 'Clear' button to clear scope.");
      return;
    }

    setPending(true);
    const t = toast.loading(`Assigning scope to ${selectedIds.length} ${selectedIds.length === 1 ? labels.singular : labels.plural}…`);

    try {
      const payload: Record<string, unknown> = {
        [labels.idField]: selectedIds,
        countryId: countryId || null,
        chapterId: chapterId || null,
      };
      if (entityType === "events") payload.isCrossChapter = isCrossChapter;

      const res = await fetch(labels.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated: number = data.updated ?? 0;
      const cName = countries.find((c) => c.id === countryId)?.name ?? "(no country)";
      const chName = chapterId ? chapters.find((c) => c.id === chapterId)?.name ?? "" : "(no chapter)";
      toast.success(`Scope applied to ${updated} ${updated === 1 ? labels.singular : labels.plural} → ${cName} / ${chName}`, { id: t });
      setOpen(false);
      onClear?.();
      // Reload to refresh the data.
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setPending(false);
    }
  }

  async function handleClearScope() {
    if (selectedIds.length === 0) {
      toast.error("No rows selected");
      return;
    }
    setPending(true);
    const t = toast.loading(`Clearing scope on ${selectedIds.length} ${selectedIds.length === 1 ? labels.singular : labels.plural}…`);
    try {
      const payload: Record<string, unknown> = {
        [labels.idField]: selectedIds,
        countryId: null,
        chapterId: null,
      };
      const res = await fetch(labels.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated: number = data.updated ?? 0;
      toast.success(`Scope cleared on ${updated} ${updated === 1 ? labels.singular : labels.plural}`, { id: t });
      setOpen(false);
      onClear?.();
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setPending(false);
    }
  }

  const defaultTrigger = (
    <Button size="sm" variant="outline" className="border-[#820A7D] text-[#820A7D] h-7">
      <Globe2 className="h-3.5 w-3.5 mr-1" /> Bulk assign scope
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : <DialogTrigger asChild>{defaultTrigger}</DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Bulk assign scope — {selectedIds.length} {selectedIds.length === 1 ? labels.singular : labels.plural}
          </DialogTitle>
        </DialogHeader>

        {countries.length === 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No countries exist yet. Use the &quot;Create new country&quot; button below to add one
            (e.g. <strong>Israel</strong>).
          </div>
        ) : null}

        <p className="text-xs text-black/70 -mt-2">
          Pick a country (and optionally a chapter) to apply to all selected {labels.plural}.
          Existing scope will be overwritten.
        </p>

        {/* Country selector */}
        <div>
          <label className="block text-xs font-semibold text-black/80 mb-1 flex items-center gap-1">
            <Globe2 className="h-3 w-3" />
            Country
            <button
              type="button"
              onClick={() => setShowCreateCountry((v) => !v)}
              className="ml-auto text-[0.6rem] font-bold uppercase tracking-wide text-[#820A7D] hover:text-[#820A7D]/80 flex items-center gap-0.5"
            >
              <Plus className="h-3 w-3" />
              {showCreateCountry ? "Cancel" : "Create new"}
            </button>
          </label>
          <select
            value={countryId}
            onChange={(e) => {
              const newId = e.target.value;
              setCountryId(newId);
              if (chapterId) {
                const ch = chapters.find((c) => c.id === chapterId);
                if (ch && ch.countryId !== newId) setChapterId("");
              }
            }}
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40"
          >
            <option value="">— Select a country —</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.flagEmoji ?? ""} {c.name} ({c.code})
              </option>
            ))}
          </select>

          {showCreateCountry && (
            <div className="mt-2 rounded-md border border-[#820A7D]/30 bg-white p-2.5 space-y-2">
              <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#820A7D]">
                Create a new country
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Name (e.g. Israel)"
                  value={newCountryName}
                  onChange={(e) => setNewCountryName(e.target.value)}
                  className="rounded border border-black/15 px-2 py-1.5 text-xs"
                />
                <input
                  type="text"
                  placeholder="Code (e.g. IL)"
                  maxLength={2}
                  value={newCountryCode}
                  onChange={(e) => setNewCountryCode(e.target.value)}
                  className="rounded border border-black/15 px-2 py-1.5 text-xs uppercase"
                />
              </div>
              <input
                type="text"
                placeholder="Flag emoji (e.g. 🇮🇱) — optional"
                value={newCountryFlag}
                onChange={(e) => setNewCountryFlag(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1.5 text-xs"
              />
              <Button
                type="button"
                size="sm"
                disabled={creatingCountry}
                onClick={handleCreateCountry}
                className="bg-[#820A7D] hover:bg-[#820A7D]/90 text-white h-7 text-xs w-full"
              >
                {creatingCountry ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Creating…</>
                ) : (
                  <><Plus className="h-3 w-3 mr-1" /> Create country</>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Chapter selector */}
        <div>
          <label className="block text-xs font-semibold text-black/80 mb-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Chapter / City
            <button
              type="button"
              disabled={!countryId}
              onClick={() => setShowCreateChapter((v) => !v)}
              className={`ml-auto text-[0.6rem] font-bold uppercase tracking-wide flex items-center gap-0.5 ${
                countryId ? "text-[#820A7D] hover:text-[#820A7D]/80" : "text-black/30 cursor-not-allowed"
              }`}
            >
              <Plus className="h-3 w-3" />
              {showCreateChapter ? "Cancel" : "Create new"}
            </button>
          </label>
          <select
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            disabled={!countryId}
            className={`w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#820A7D]/40 ${
              !countryId ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <option value="">
              {countryId ? "— No chapter (country-wide) —" : "— Select a country first —"}
            </option>
            {filteredChapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.city ? ` — ${c.city}` : ""}
                {!c.isActive ? " (inactive)" : ""}
              </option>
            ))}
          </select>

          {showCreateChapter && countryId && (
            <div className="mt-2 rounded-md border border-[#820A7D]/30 bg-white p-2.5 space-y-2">
              <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#820A7D]">
                Create a new chapter in{" "}
                {countries.find((c) => c.id === countryId)?.name ?? "selected country"}
              </div>
              <input
                type="text"
                placeholder="Chapter name (e.g. Tel Aviv)"
                value={newChapterName}
                onChange={(e) => setNewChapterName(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="City (optional, e.g. Tel Aviv-Yafo)"
                value={newChapterCity}
                onChange={(e) => setNewChapterCity(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1.5 text-xs"
              />
              <Button
                type="button"
                size="sm"
                disabled={creatingChapter}
                onClick={handleCreateChapter}
                className="bg-[#820A7D] hover:bg-[#820A7D]/90 text-white h-7 text-xs w-full"
              >
                {creatingChapter ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Creating…</>
                ) : (
                  <><Plus className="h-3 w-3 mr-1" /> Create chapter</>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Cross-chapter flag (events only) */}
        {entityType === "events" && (
          <label className="flex items-center gap-2 text-xs text-black/80">
            <input
              type="checkbox"
              checked={isCrossChapter}
              onChange={(e) => setIsCrossChapter(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span>
              Mark as <strong>cross-chapter event</strong> (visible in all chapters
              of this country — Super Admin only)
            </span>
          </label>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={handleClearScope}
            className="text-[#FF005A] border-[#FF005A] hover:bg-[#FF005A]/5"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear scope
          </Button>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending || (!countryId && !chapterId)}
            onClick={handleApply}
            className="bg-[#820A7D] hover:bg-[#820A7D]/90 text-white"
          >
            {pending ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Applying…</>
            ) : (
              <><Globe2 className="h-4 w-4 mr-1.5" /> Apply to {selectedIds.length} {selectedIds.length === 1 ? labels.singular : labels.plural}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
