"use client";

import { fourPostures } from "@/lib/salon-data/salon-data";
import { Compass } from "lucide-react";

// Alternate cyan / pink for visual rhythm
const postureStyles = [
  { bg: "bg-cyan/8", border: "border-cyan/30", dot: "bg-cyan", text: "text-cyan" },
  { bg: "bg-pink/8", border: "border-pink/30", dot: "bg-pink", text: "text-pink" },
  { bg: "bg-cyan/8", border: "border-cyan/30", dot: "bg-cyan", text: "text-cyan" },
  { bg: "bg-pink/8", border: "border-pink/30", dot: "bg-pink", text: "text-pink" },
];

export function FourPostures() {
  return (
    <section
      id="postures"
      className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-secondary/40 border-y border-border"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card mb-4">
            <Compass className="size-3.5 text-pink" />
            <span className="tagline text-[0.65rem] text-muted-foreground">
              Your Compass for Every Theme
            </span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4">
            The <span className="brand-gradient-text">Four Postures</span>
          </h2>
          <p className="text-base sm:text-lg text-foreground/70 max-w-2xl mx-auto leading-relaxed">
            Bring these four stances into every conversation. They keep the room
            honest — and human.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {fourPostures.map((p, i) => {
            const s = postureStyles[i];
            return (
              <article
                key={p.name}
                className={`group relative rounded-2xl border ${s.border} ${s.bg} p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-1`}
              >
                <div className="flex items-baseline justify-between mb-4">
                  <span className={`tagline text-[0.6rem] ${s.text} font-bold`}>
                    0{i + 1}
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                </div>
                <h3 className="font-display text-2xl font-bold mb-3">{p.name}</h3>
                <p className="text-sm text-foreground/75 leading-relaxed">
                  {p.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
