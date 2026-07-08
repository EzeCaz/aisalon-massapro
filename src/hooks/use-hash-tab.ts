"use client";

import * as React from "react";

/**
 * useHashTab — sync a Radix Tabs (or any tab-like UI) value to the URL hash.
 *
 * Why:
 *   Plain `useState` tabs aren't shareable: you can't deep-link someone
 *   to "the quiz tab on event X". This hook reads the hash on mount, falls
 *   back to `defaultValue` if it's empty/invalid, and updates the hash
 *   whenever the user clicks a tab — so the URL becomes the source of
 *   truth and `#quiz` works as a deep link.
 *
 * Usage:
 *   const [tab, setTab] = useHashTab("agenda", [
 *     "agenda", "overview", "photos", "quiz",
 *   ]);
 *   <Tabs value={tab} onValueChange={setTab}>...</Tabs>
 *
 * Behavior:
 *   - On mount: reads `location.hash`, strips the leading `#`, validates
 *     against `allowed`. If valid → use it. If not → use `defaultValue`
 *     (and rewrite the hash to empty so the URL stays clean).
 *   - On tab click: writes `location.hash = "#" + value` (no scroll — we
 *     use `history.replaceState` when the value matches the default, to
 *     avoid leaving stray `#agenda` fragments lying around).
 *   - On browser back/forward (`hashchange` event): re-reads the hash and
 *     updates state, so the tab follows the URL.
 *   - SSR-safe: returns `defaultValue` during the initial render to avoid
 *     hydration mismatches; the real value is resolved in `useEffect`.
 *
 * Notes:
 *   - The hash is NOT prefixed (e.g. `#quiz`, not `#tab-quiz`). This
 *     keeps URLs short and human-readable. If two tab groups exist on
 *     the same page (rare here), give them different `allowed` value
 *     sets — the first match wins.
 *   - We deliberately don't scroll to any element with `id="quiz"` —
 *     Radix Tabs doesn't render such an element by default, and even
 *     if it did, the scroll would be jarring on tab switch.
 */

export function useHashTab(
  defaultValue: string,
  allowed: string[],
): [string, (value: string) => void] {
  const [value, setValue] = React.useState<string>(defaultValue);

  // Resolve initial value from hash on mount, and subscribe to hashchange.
  React.useEffect(() => {
    const readHash = (): string => {
      if (typeof window === "undefined") return defaultValue;
      const raw = window.location.hash.replace(/^#/, "");
      // Decode in case someone copy-pasted a URL-encoded fragment.
      const decoded = (() => {
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      })();
      if (decoded && allowed.includes(decoded)) return decoded;
      return defaultValue;
    };

    // Apply the initial read.
    const initial = readHash();
    if (initial !== value) setValue(initial);

    // Keep state in sync with hash changes (browser back/forward, manual
    // hash edit, or another tab group on the same page).
    const onHashChange = () => {
      const next = readHash();
      setValue((prev) => (prev !== next ? next : prev));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue, allowed.join("|")]);

  // Setter that also writes the hash.
  const setTab = React.useCallback(
    (next: string) => {
      setValue(next);
      if (typeof window === "undefined") return;
      // Use replaceState for the default tab (no fragment in URL) and
      // pushState-equivalent (assigning location.hash) for others, so
      // back-button goes back to the previous tab, not the previous page.
      if (next === defaultValue) {
        // Strip the hash without adding a history entry.
        const url =
          window.location.pathname + window.location.search + window.location.hash;
        const cleanUrl = window.location.pathname + window.location.search;
        if (url !== cleanUrl) {
          window.history.replaceState(null, "", cleanUrl);
        }
      } else {
        if (window.location.hash !== `#${next}`) {
          window.location.hash = `#${next}`;
        }
      }
    },
    [defaultValue],
  );

  return [value, setTab];
}
