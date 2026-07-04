"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Search, Loader2, UserCircle, Check } from "lucide-react";

/**
 * SpeakerPickerModal — pick a Speaker row from the database.
 *
 * Calls GET /api/admin/speakers and shows a searchable list. Each row
 * displays the speaker's photo (Speaker.photoUrl, falling back to their
 * linked User.photoUrl, falling back to a gray avatar), name, role,
 * company, and the event they belong to. On select, calls onPick() with
 * the speaker's photo URL (or the user's profile picture when the
 * Speaker row's photoUrl is empty — per Task #4: "when a speaker is
 * selected, it must take the profile picture as Photo URL automatically").
 *
 * Also returns the speaker's name / title / company / bio via the
 * `onPickFull` callback so the parent form can auto-populate every
 * related field, not just the photo URL.
 */

export type DbSpeakerPick = {
  id: string;
  name: string;
  role?: string | null;
  company?: string | null;
  bio?: string | null;
  topic?: string | null;
  /** Speaker.photoUrl (explicit headshot set on the Speaker row). */
  photoUrl?: string | null;
  /** Linked User's profile picture — used as a fallback when photoUrl is empty. */
  userPhotoUrl?: string | null;
  /** Event title (for context in the picker list). */
  eventTitle?: string | null;
  /** Event slug (for filtering). */
  eventSlug?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Called with the resolved photo URL (Speaker.photoUrl || User.photoUrl || "").
   * The parent uses this to auto-populate the speaker row's Photo URL field.
   */
  onPick: (photoUrl: string) => void;
  /**
   * Optional: also returns the full DB speaker record so the parent can
   * auto-populate name / title / company / bio / sessionTitle.
   */
  onPickFull?: (speaker: DbSpeakerPick) => void;
  /** Optional filter: only show speakers from this event slug. */
  eventSlug?: string;
};

export function SpeakerPickerModal({
  open,
  onClose,
  onPick,
  onPickFull,
  eventSlug,
}: Props) {
  const [speakers, setSpeakers] = useState<DbSpeakerPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/admin/speakers", window.location.origin);
      if (eventSlug) url.searchParams.set("eventSlug", eventSlug);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load speakers (HTTP ${res.status})`);
      }
      const json = (await res.json()) as {
        speakers: Array<{
          id: string;
          name: string;
          role?: string | null;
          company?: string | null;
          bio?: string | null;
          topic?: string | null;
          photoUrl?: string | null;
          event?: { title?: string | null; slug?: string | null } | null;
          user?: { photoUrl?: string | null } | null;
        }>;
      };
      // De-duplicate by id (a speaker row exists per event, so the same
      // person might appear multiple times if they spoke at multiple
      // events). Keep the most recent (the API already sorts by event
      // startsAt desc, so the first occurrence is the most recent).
      const seen = new Set<string>();
      const list: DbSpeakerPick[] = [];
      for (const s of json.speakers) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        list.push({
          id: s.id,
          name: s.name,
          role: s.role,
          company: s.company,
          bio: s.bio,
          topic: s.topic,
          photoUrl: s.photoUrl,
          userPhotoUrl: s.user?.photoUrl ?? null,
          eventTitle: s.event?.title ?? null,
          eventSlug: s.event?.slug ?? null,
        });
      }
      setSpeakers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load speakers");
      setSpeakers([]);
    } finally {
      setLoading(false);
    }
  }, [eventSlug]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Close on ESC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus search on open.
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered =
    search.trim().length === 0
      ? speakers
      : speakers.filter((s) => {
          const q = search.toLowerCase();
          return (
            s.name.toLowerCase().includes(q) ||
            (s.company ?? "").toLowerCase().includes(q) ||
            (s.role ?? "").toLowerCase().includes(q) ||
            (s.eventTitle ?? "").toLowerCase().includes(q)
          );
        });

  if (!open) return null;

  function handleSelect(s: DbSpeakerPick) {
    // Photo URL priority: explicit Speaker.photoUrl → User.photoUrl → empty
    // (the parent will keep its current value if we pass empty).
    const photo =
      (s.photoUrl && s.photoUrl.trim()) ||
      (s.userPhotoUrl && s.userPhotoUrl.trim()) ||
      "";
    onPick(photo);
    onPickFull?.(s);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/10">
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-black/60" />
            <h2 className="text-base font-bold text-black">
              Pick a speaker from the database
            </h2>
            <span className="text-xs text-black/40">
              · {speakers.length} speakers · auto-fills photo + name + title + company + bio
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/50 hover:bg-black/5 hover:text-black"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-black/10 bg-black/[0.02]">
          <div className="flex items-center gap-1.5 rounded-md border border-black/15 bg-white px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-black/40" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, company, role, or event…"
              className="flex-1 bg-transparent outline-none text-sm text-black placeholder:text-black/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-[0.65rem] text-black/40 hover:text-black"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {error && (
            <div className="mb-3 rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 px-3 py-2 text-xs text-[#FF005A]">
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-32 text-black/40">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading speakers…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-black/40">
              <UserCircle className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">
                {search
                  ? `No speakers match "${search}".`
                  : "No speakers in the database yet."}
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((s) => {
                const photo =
                  (s.photoUrl && s.photoUrl.trim()) ||
                  (s.userPhotoUrl && s.userPhotoUrl.trim()) ||
                  "";
                const [title, roleCompany] = splitRole(s.role);
                const company = s.company?.trim() || roleCompany;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(s)}
                      className="w-full flex items-start gap-3 rounded-md border border-black/10 bg-white px-3 py-2 text-left hover:border-[#FF005A]/40 hover:bg-[#FF005A]/[0.03] transition"
                    >
                      {/* Photo thumbnail */}
                      <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden bg-black/10 border border-black/15">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo}
                            alt={s.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-black/30">
                            <UserCircle className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-black truncate">
                          {s.name}
                        </p>
                        {(title || company) && (
                          <p className="text-xs text-black/60 truncate">
                            {title}
                            {title && company ? " · " : ""}
                            {company}
                          </p>
                        )}
                        {s.eventTitle && (
                          <p className="text-[0.65rem] text-black/40 truncate mt-0.5">
                            Spoke at: {s.eventTitle}
                          </p>
                        )}
                      </div>
                      {/* Source badge */}
                      <div className="shrink-0 text-right">
                        <span
                          className={`inline-block rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ${
                            s.photoUrl
                              ? "bg-[#27C93F]/10 text-[#27C93F]"
                              : s.userPhotoUrl
                                ? "bg-[#0066FF]/10 text-[#0066FF]"
                                : "bg-black/5 text-black/40"
                          }`}
                        >
                          {s.photoUrl
                            ? "Speaker photo"
                            : s.userPhotoUrl
                              ? "Profile pic"
                              : "No photo"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-black/10 bg-black/[0.02] flex items-center justify-between text-xs text-black/50">
          <span>
            Clicking a speaker auto-fills the Photo URL (from their Speaker
            row, or their member profile picture as fallback) + name + title +
            company + bio.
          </span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
}

/** Split "AI Product Lead, Amdocs" → ["AI Product Lead", "Amdocs"]. */
function splitRole(role?: string | null): [string, string] {
  if (!role) return ["", ""];
  const idx = role.indexOf(",");
  if (idx === -1) return [role.trim(), ""];
  return [role.slice(0, idx).trim(), role.slice(idx + 1).trim()];
}
