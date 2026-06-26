"use client";

import * as React from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * CoHostPicker — autocomplete search input for picking a platform member
 * to add as a co-host.
 *
 * Behavior:
 *   1. As the user types, we query /api/admin/members/search (debounced).
 *   2. Results appear in a dropdown, with avatar + name + email + company.
 *   3. Clicking a result calls onPick(user) and clears the input.
 *   4. If no result matches, the user can press Enter to submit the raw
 *      string as an email — the backend will resolve it (or fail with a
 *      helpful error like "User not found. Ask them to sign in first.").
 *
 * Props:
 *   eventId      — used to exclude users who are already co-hosts of this event
 *   onPick       — callback when a member is picked (user object)
 *   onPickByEmail — fallback for raw email submit (no autocomplete match)
 *   disabled     — true while the parent is processing an add
 */
type SearchResult = {
  id: string;
  email: string;
  name: string | null;
  photoUrl: string | null;
  image: string | null;
  company: string | null;
  role: string;
  onboardedAt: string | null;
};

export function CoHostPicker({
  eventId,
  onPick,
  onPickByEmail,
  disabled = false,
}: {
  eventId: string;
  onPick: (user: SearchResult) => void | Promise<void>;
  onPickByEmail: (email: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(-1);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = React.useRef(0);

  // Debounced search
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current;
      try {
        const url = `/api/admin/members/search?q=${encodeURIComponent(query.trim())}&limit=10&excludeEventId=${encodeURIComponent(eventId)}`;
        const res = await fetch(url);
        if (!res.ok) {
          if (reqId === requestIdRef.current) {
            setResults([]);
            setOpen(false);
          }
          return;
        }
        const data = await res.json();
        if (reqId === requestIdRef.current) {
          setResults(data.users || []);
          setOpen(true);
          setHighlightIndex(-1);
        }
      } catch (err) {
        console.error("CoHostPicker search error:", err);
        if (reqId === requestIdRef.current) {
          setResults([]);
          setOpen(false);
        }
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, eventId]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && open && results.length > 0) {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp" && open && results.length > 0) {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlightIndex >= 0 && highlightIndex < results.length) {
        // Picked from dropdown
        const user = results[highlightIndex];
        void onPick(user);
        setQuery("");
        setResults([]);
        setOpen(false);
        setHighlightIndex(-1);
      } else if (query.trim()) {
        // No dropdown selection — submit raw as email
        void onPickByEmail(query.trim());
        setQuery("");
        setResults([]);
        setOpen(false);
        setHighlightIndex(-1);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIndex(-1);
    }
  }

  async function handlePick(user: SearchResult) {
    await onPick(user);
    setQuery("");
    setResults([]);
    setOpen(false);
    setHighlightIndex(-1);
  }

  const inputCls =
    "w-full rounded-md border border-black/15 bg-white pl-9 pr-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-[#007E72] focus:outline-none focus:ring-1 focus:ring-[#007E72]/30";

  return (
    <div className="relative flex-1 min-w-[200px] max-w-md" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 pointer-events-none" />
        <Input
          type="text"
          placeholder="Search by name, email, or company…"
          className={inputCls}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          disabled={disabled}
          aria-label="Search members to add as co-host"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="cohost-picker-listbox"
          role="combobox"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-black/40" />
        )}
        {!loading && query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 hover:text-black/70"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          id="cohost-picker-listbox"
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-black/15 bg-white shadow-lg max-h-72 overflow-y-auto"
        >
          {results.length === 0 ? (
            <div className="p-3 text-xs text-black/50">
              {query.trim().length < 2
                ? "Type at least 2 characters to search."
                : `No members match "${query.trim()}". Press Enter to try the email directly.`}
            </div>
          ) : (
            <ul>
              {results.map((user, i) => (
                <li key={user.id} role="option" aria-selected={highlightIndex === i}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlightIndex(i)}
                    onClick={() => handlePick(user)}
                    className={`w-full flex items-center gap-2.5 p-2 text-left transition-colors ${
                      highlightIndex === i ? "bg-[#007E72]/10" : "hover:bg-black/5"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-black/5 flex-shrink-0">
                      {(user.photoUrl || user.image) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.photoUrl || user.image || ""}
                          alt={user.name || user.email}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-black truncate">
                        {user.name || "(no name)"}
                      </div>
                      <div className="text-xs text-black/50 truncate">{user.email}</div>
                      {user.company && (
                        <div className="text-[0.65rem] text-black/40 truncate">{user.company}</div>
                      )}
                    </div>
                    <span className="text-[0.55rem] font-bold uppercase tracking-wider text-black/40 px-1.5 py-0.5 rounded bg-black/5">
                      {user.role.replace("_", " ").toLowerCase()}
                    </span>
                  </button>
                </li>
              ))}
              {/* Footer hint */}
              <li className="p-2 text-[0.65rem] text-black/40 border-t border-black/5 bg-black/[0.02]">
                Press Enter to add the typed text as an email if no match above.
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export type { SearchResult as MemberSearchResult };
