"use client";

import { founderNote, founder, salonElements, salonPractices } from "@/lib/salon-data/salon-data";
import { Quote, Users, Heart } from "lucide-react";

const practiceIcons = [Users, Quote, Heart];

export function HowToHost() {
  return (
    <section id="host" className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mb-14 text-center max-w-3xl mx-auto">
          <p className="tagline text-pink mb-3">How to Host This Conversation</p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4">
            A note from the{" "}
            <span className="brand-gradient-text">founder&apos;s desk</span>
          </h2>
        </div>

        {/* Founder's letter — editorial layout */}
        <article className="grid md:grid-cols-[1fr_2fr] gap-8 mb-20">
          <aside className="md:sticky md:top-24 md:self-start">
            <div className="rounded-2xl border border-border bg-card p-6 relative overflow-hidden">
              <div
                aria-hidden
                className="absolute top-0 right-0 w-24 h-24 brand-gradient opacity-10 rounded-bl-full"
              />
              <div className="flex items-center gap-3 mb-4 relative">
                <div
                  className="w-12 h-12 rounded-full brand-gradient flex items-center justify-center font-display text-lg font-bold text-white"
                >
                  JA
                </div>
                <div>
                  <p className="font-display font-bold text-sm">{founder.name}</p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {founder.role}
                  </p>
                </div>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground relative">
                <p className="flex items-start gap-2">
                  <span className="text-pink">·</span>
                  <span>Main Street, not Wall Street</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-pink">·</span>
                  <span>Care is a competitive edge</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-pink">·</span>
                  <span>Three people is enough</span>
                </p>
              </div>
            </div>
          </aside>

          <div className="prose prose-lg max-w-none">
            {founderNote.split("\n\n").map((para, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? "font-display text-lg sm:text-xl leading-relaxed text-foreground/90 mb-5 drop-cap"
                    : "text-base sm:text-lg leading-relaxed text-foreground/80 mb-5"
                }
              >
                {para}
              </p>
            ))}
          </div>
        </article>

        {/* How each theme page works + Three things */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* How each theme page works */}
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-10"
              style={{ background: "var(--salon-cyan)" }}
            />
            <h3 className="font-display text-xl sm:text-2xl font-bold mb-2 relative">
              How each theme page works
            </h3>
            <p className="text-sm text-muted-foreground mb-6 relative">
              Pick one area, or run all six as a series. Each is built for
              45–90 minutes with a circle of three to thirty.
            </p>
            <ol className="space-y-3 relative">
              {salonElements.map((el, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-none mt-0.5 w-6 h-6 rounded-full brand-gradient text-white text-xs font-bold flex items-center justify-center font-display">
                    {i + 1}
                  </span>
                  <span className="text-sm sm:text-base text-foreground/80 leading-relaxed">
                    {el}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Three things that make a salon work */}
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-10"
              style={{ background: "var(--salon-pink)" }}
            />
            <h3 className="font-display text-xl sm:text-2xl font-bold mb-2 relative">
              Three things that make a salon work
            </h3>
            <p className="text-sm text-muted-foreground mb-6 relative">
              The smallest viable community is three people. You don&apos;t need
              thirty.
            </p>
            <div className="space-y-5 relative">
              {salonPractices.map((p, i) => {
                const Icon = practiceIcons[i] ?? Users;
                const isCyan = i % 2 === 0;
                return (
                  <div key={i} className="flex gap-4">
                    <div
                      className={`flex-none w-10 h-10 rounded-xl flex items-center justify-center ${
                        isCyan ? "bg-cyan/15" : "bg-pink/15"
                      }`}
                    >
                      <Icon
                        className={`size-5 ${isCyan ? "text-cyan" : "text-pink"}`}
                      />
                    </div>
                    <div>
                      <p className="font-display font-bold text-sm sm:text-base mb-1">
                        {p.title}
                      </p>
                      <p className="text-sm text-foreground/70 leading-relaxed">
                        {p.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
