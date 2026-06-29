"use client";

import {
  readerToConvenerIntro,
  commitmentLadder,
} from "@/lib/salon-data/salon-data";
import { useSalon } from "./salon-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  RotateCcw,
  Hourglass,
  CalendarDays,
  CalendarClock,
  Heart,
} from "lucide-react";

const ladderIcons = [Hourglass, CalendarDays, CalendarClock];

export function ReaderToConvener() {
  const {
    progress,
    hydrated,
    setVowAction,
    setVowPurpose,
    setCommitted,
    resetAll,
  } = useSalon();

  const vowReady = progress.vowAction.trim() && progress.vowPurpose.trim();

  return (
    <section
      id="convener"
      className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-secondary/40 border-y border-border"
    >
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <p className="tagline text-pink mb-3">From Reader to Convener</p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4">
            The light we{" "}
            <span className="brand-gradient-text">make together</span>
          </h2>
          <p className="text-base sm:text-lg text-foreground/75 leading-relaxed max-w-2xl mx-auto">
            {readerToConvenerIntro}
          </p>
        </div>

        {/* Vow Generator */}
        <div className="rounded-3xl border border-border bg-card p-6 sm:p-10 mb-12 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20 blur-3xl"
            style={{ background: "var(--salon-pink)" }}
          />
          <div
            aria-hidden
            className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full opacity-15 blur-3xl"
            style={{ background: "var(--salon-cyan)" }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="size-4 text-pink" />
              <p className="tagline text-pink">The One-Line Vow</p>
            </div>
            <h3 className="font-display text-2xl sm:text-3xl font-bold mb-2">
              Make it yours.
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-2xl leading-relaxed">
              Specific enough to guide a daily choice; open enough to evolve. Say
              it out loud, to three people who&apos;ll hold you to it.
            </p>

            <div className="rounded-2xl bg-secondary/60 border border-border p-5 sm:p-7 mb-6">
              <p className="font-display text-lg sm:text-xl md:text-2xl font-medium leading-relaxed">
                &ldquo;I will use AI to{" "}
                <VowInput
                  value={progress.vowAction}
                  onChange={setVowAction}
                  placeholder="write more, judge less"
                  hydrated={hydrated}
                />{" "}
                so that{" "}
                <VowInput
                  value={progress.vowPurpose}
                  onChange={setVowPurpose}
                  placeholder="my voice stays mine"
                  hydrated={hydrated}
                />
                .&rdquo;
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!vowReady}
                onClick={() => setCommitted(!progress.committed)}
                className="gap-2 brand-gradient text-white border-transparent hover:opacity-90"
                style={
                  !vowReady || progress.committed
                    ? {}
                    : {
                        background:
                          "linear-gradient(120deg, var(--salon-cyan) 0%, var(--salon-pink) 100%)",
                      }
                }
              >
                <CheckCircle2 className="size-4" />
                {progress.committed ? "Vow committed" : "Commit to this vow"}
              </Button>
              {progress.committed && (
                <p className="text-sm text-pink italic font-display">
                  Say it aloud — to three people who&apos;ll hold you to it.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Commitment Ladder */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <p className="tagline text-pink mb-2">
              Close Any Session With the Commitment Ladder
            </p>
            <h3 className="font-display text-2xl sm:text-3xl font-bold">
              Three rungs, three horizons
            </h3>
            <p className="text-xs text-muted-foreground mt-1">(Ch. 13)</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
            {commitmentLadder.map((rung, i) => {
              const Icon = ladderIcons[i] ?? Hourglass;
              const isCyan = i % 2 === 0;
              return (
                <article
                  key={i}
                  className="relative rounded-2xl border border-border bg-card p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isCyan ? "bg-cyan/15" : "bg-pink/15"
                      }`}
                    >
                      <Icon
                        className={`size-5 ${isCyan ? "text-cyan" : "text-pink"}`}
                      />
                    </div>
                    <span
                      className={`tagline text-[0.55rem] font-bold ${
                        isCyan ? "text-cyan" : "text-pink"
                      }`}
                    >
                      Step 0{i + 1}
                    </span>
                  </div>
                  <h4 className="font-display text-lg font-bold mb-2">
                    {rung.timeframe}
                  </h4>
                  <p className="text-sm text-foreground/75 leading-relaxed">
                    {rung.body}
                  </p>
                  {i < commitmentLadder.length - 1 && (
                    <div
                      aria-hidden
                      className="hidden sm:block absolute top-1/2 -right-3 w-6 h-px bg-border"
                    />
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {/* Reset */}
        {hydrated && (
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    "Reset all your progress — discussed questions, notes, and vow?"
                  )
                ) {
                  resetAll();
                }
              }}
              className="text-muted-foreground hover:text-destructive gap-2"
            >
              <RotateCcw className="size-3.5" />
              Reset all progress
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function VowInput({
  value,
  onChange,
  placeholder,
  hydrated,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hydrated: boolean;
}) {
  if (!hydrated) {
    return (
      <span className="inline-block min-w-[10rem] sm:min-w-[14rem] h-7 align-middle rounded-md bg-secondary/60 animate-pulse" />
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="inline-flex h-9 w-[10rem] sm:w-[14rem] mx-1 align-middle bg-background/80 border-pink/40 focus-visible:border-pink focus-visible:ring-pink/20 font-medium"
      aria-label={placeholder}
    />
  );
}
