"use client";

import { useEffect, useState } from "react";
import { useSalon } from "./salon-provider";
import { conversationAreas } from "@/lib/salon-data/salon-data";
import { Sparkles, X } from "lucide-react";

export function ProgressHud() {
  const { progress, hydrated } = useSalon();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const totalQs = conversationAreas.reduce(
    (acc, a) => acc + a.questions.length,
    0
  );
  const doneQs = conversationAreas.reduce(
    (acc, a) =>
      acc + a.questions.filter((q) => progress.discussed[q.id]).length,
    0
  );
  const pct = totalQs ? Math.round((doneQs / totalQs) * 100) : 0;
  const areasDone = conversationAreas.filter(
    (a) => progress.areaDone[a.id]
  ).length;

  useEffect(() => {
    if (!hydrated || dismissed) return;
    const onScroll = () => {
      const y = window.scrollY;
      const docH =
        document.documentElement.scrollHeight - window.innerHeight;
      const shouldShow = y > window.innerHeight * 0.6 && y < docH * 0.85;
      setVisible((prev) => (prev === shouldShow ? prev : shouldShow));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hydrated, dismissed]);

  if (!hydrated || dismissed || !visible) return null;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 salon-rise">
      <div className="relative rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl p-4 pr-9 max-w-[15rem]">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          aria-label="Hide progress"
        >
          <X className="size-3.5" />
        </button>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="size-3.5 text-pink" />
          <p className="tagline text-pink">Your Salon</p>
        </div>
        <p className="font-display text-2xl font-extrabold mb-1">
          <span className="brand-gradient-text">{pct}</span>
          <span className="text-base text-muted-foreground">%</span>
        </p>
        <div className="h-1 rounded-full bg-secondary overflow-hidden mb-2">
          <div
            className="h-full brand-gradient transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {doneQs}/{totalQs} questions · {areasDone}/6 areas
        </p>
      </div>
    </div>
  );
}
