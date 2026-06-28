"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface SalonProgress {
  // Set of question IDs the facilitator has marked as "discussed"
  discussed: Record<string, boolean>;
  // Free-form notes per question
  notes: Record<string, string>;
  // Per-area completion (user toggles when done with the area)
  areaDone: Record<string, boolean>;
  // The personalized vow (fill-in-the-blank)
  vowAction: string;
  vowPurpose: string;
  // Personal vow the user has chosen to commit to
  committed: boolean;
  // Tool-page state — slug-keyed
  toolTried: Record<string, boolean>;
  toolNotes: Record<string, string>;
}

const DEFAULT_PROGRESS: SalonProgress = {
  discussed: {},
  notes: {},
  areaDone: {},
  vowAction: "",
  vowPurpose: "",
  committed: false,
  toolTried: {},
  toolNotes: {},
};

interface SalonContextValue {
  progress: SalonProgress;
  hydrated: boolean;
  toggleDiscussed: (id: string) => void;
  setNote: (id: string, text: string) => void;
  toggleAreaDone: (id: string) => void;
  setVowAction: (v: string) => void;
  setVowPurpose: (v: string) => void;
  setCommitted: (v: boolean) => void;
  resetAll: () => void;
  toggleToolTried: (slug: string) => void;
  setToolNote: (slug: string, text: string) => void;
}

const SalonContext = createContext<SalonContextValue | null>(null);

export function useSalon() {
  const ctx = useContext(SalonContext);
  if (!ctx) throw new Error("useSalon must be used within <SalonProvider>");
  return ctx;
}

export function SalonProvider({ children }: { children: ReactNode }) {
  const [stored, setProgress, hydrated] = useLocalStorage<SalonProgress>(
    "ai-salon-progress-v1",
    DEFAULT_PROGRESS
  );

  // Merge defaults so old localStorage data (without toolTried/toolNotes)
  // doesn't crash when we try to read those fields.
  const progress: SalonProgress = useMemo(
    () => ({ ...DEFAULT_PROGRESS, ...stored }),
    [stored]
  );

  const toggleDiscussed = useCallback(
    (id: string) => {
      setProgress((prev) => ({
        ...prev,
        discussed: { ...prev.discussed, [id]: !prev.discussed[id] },
      }));
    },
    [setProgress]
  );

  const setNote = useCallback(
    (id: string, text: string) => {
      setProgress((prev) => ({ ...prev, notes: { ...prev.notes, [id]: text } }));
    },
    [setProgress]
  );

  const toggleAreaDone = useCallback(
    (id: string) => {
      setProgress((prev) => ({
        ...prev,
        areaDone: { ...prev.areaDone, [id]: !prev.areaDone[id] },
      }));
    },
    [setProgress]
  );

  const setVowAction = useCallback(
    (v: string) => setProgress((prev) => ({ ...prev, vowAction: v })),
    [setProgress]
  );
  const setVowPurpose = useCallback(
    (v: string) => setProgress((prev) => ({ ...prev, vowPurpose: v })),
    [setProgress]
  );
  const setCommitted = useCallback(
    (v: boolean) => setProgress((prev) => ({ ...prev, committed: v })),
    [setProgress]
  );
  const resetAll = useCallback(
    () => setProgress(DEFAULT_PROGRESS),
    [setProgress]
  );

  const toggleToolTried = useCallback(
    (slug: string) => {
      setProgress((prev) => ({
        ...prev,
        toolTried: { ...(prev.toolTried ?? {}), [slug]: !prev.toolTried?.[slug] },
      }));
    },
    [setProgress]
  );

  const setToolNote = useCallback(
    (slug: string, text: string) => {
      setProgress((prev) => ({
        ...prev,
        toolNotes: { ...(prev.toolNotes ?? {}), [slug]: text },
      }));
    },
    [setProgress]
  );

  const value = useMemo(
    () => ({
      progress,
      hydrated,
      toggleDiscussed,
      setNote,
      toggleAreaDone,
      setVowAction,
      setVowPurpose,
      setCommitted,
      resetAll,
      toggleToolTried,
      setToolNote,
    }),
    [
      progress,
      hydrated,
      toggleDiscussed,
      setNote,
      toggleAreaDone,
      setVowAction,
      setVowPurpose,
      setCommitted,
      resetAll,
      toggleToolTried,
      setToolNote,
    ]
  );

  return (
    <SalonContext.Provider value={value}>{children}</SalonContext.Provider>
  );
}
