"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Persisted state in localStorage with JSON serialization.
 * Safe for SSR — returns initialValue on first render, syncs after mount.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [stored, setStored] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount. We intentionally call setState
  // here because localStorage is a client-only API and we must defer the
  // read until after hydration to avoid SSR mismatches.
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStored(JSON.parse(item) as T);
      }
    } catch {
      // ignore parse errors
    }
    setHydrated(true);
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStored((prev) => {
        const next =
          typeof value === "function"
            ? (value as (p: T) => T)(prev)
            : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // storage full or unavailable
        }
        return next;
      });
    },
    [key]
  );

  return [stored, setValue, hydrated];
}
