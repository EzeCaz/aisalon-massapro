"use client";

import { ArrowDown, Sparkles, Globe2 } from "lucide-react";
import { BrandLogo } from "./brand-logo";

const themes = [
  "Identity & Purpose",
  "Education & Development",
  "Work & Economic Life",
  "Well-Being & Mental Health",
  "Relationships & Community",
  "Creativity & Culture",
];

export function Hero() {
  const scrollToWelcome = () => {
    document.getElementById("welcome")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      id="cover"
      className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-20 pb-12 overflow-hidden"
    >
      {/* Background: brand gradient + low-poly dots */}
      <div
        aria-hidden
        className="absolute inset-0 brand-gradient opacity-[0.04]"
      />
      <div
        aria-hidden
        className="absolute inset-0 dot-pattern opacity-50"
      />
      {/* Big geometric accent shapes (meerkat-low-poly vibe) */}
      <div
        aria-hidden
        className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(0.82 0.16 200 / 0.4) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(0.65 0.27 0 / 0.35) 0%, transparent 70%)",
        }}
      />
      {/* Diagonal slash decoration */}
      <div
        aria-hidden
        className="absolute top-0 right-0 w-[40%] h-full opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(135deg, transparent 49%, oklch(0.65 0.27 0) 49%, oklch(0.65 0.27 0) 51%, transparent 51%)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative max-w-5xl mx-auto text-center salon-rise">
        {/* Brand mark + tagline */}
        <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-card border border-border mb-8 shadow-sm">
          <BrandLogo size="sm" />
          <span className="font-display text-sm font-bold lowercase">
            aisalon
          </span>
          <span className="w-px h-3 bg-border" />
          <span className="tagline text-[0.6rem] text-muted-foreground">
            Empowering AI Connections
          </span>
        </div>

        {/* Title */}
        <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold leading-[0.95] tracking-tight mb-6">
          AI &amp;{" "}
          <span className="brand-gradient-text">Human</span>
          <br />
          Flourishing
        </h1>

        {/* Subtitle */}
        <p className="font-display text-base sm:text-lg md:text-xl text-foreground/70 max-w-2xl mx-auto mb-3 leading-relaxed">
          A Facilitator&apos;s Field Guide for Chapter Conversations
        </p>
        <p className="font-display text-xl sm:text-2xl md:text-3xl font-semibold leading-snug max-w-3xl mx-auto mb-10">
          What does it mean to be human{" "}
          <span className="brand-gradient-text">in the age of AI?</span>
        </p>

        {/* Foundational quote */}
        <blockquote className="max-w-3xl mx-auto mb-12">
          <p className="font-display text-lg sm:text-xl md:text-2xl leading-snug text-foreground/80 italic">
            &ldquo;Not what can AI do — but{" "}
            <span className="text-pink not-italic font-semibold">
              who are we becoming
            </span>{" "}
            while it does it?&rdquo;
          </p>
        </blockquote>

        {/* Theme pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-12 max-w-3xl mx-auto">
          {themes.map((t, i) => (
            <span
              key={t}
              className="px-3 py-1 text-xs sm:text-sm rounded-full border bg-card/80 backdrop-blur-sm text-foreground/80"
              style={{
                borderColor:
                  i % 2 === 0 ? "oklch(0.82 0.16 200 / 0.4)" : "oklch(0.65 0.27 0 / 0.4)",
              }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
          <button
            onClick={scrollToWelcome}
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-full brand-gradient text-white font-semibold hover:opacity-90 transition-opacity text-sm shadow-lg"
          >
            <Sparkles className="size-4" />
            Begin the Conversation
            <ArrowDown className="size-4 group-hover:translate-y-0.5 transition-transform" />
          </button>
          <button
            onClick={() =>
              document.getElementById("map")?.scrollIntoView({ behavior: "smooth" })
            }
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border hover:border-pink hover:text-pink transition-colors text-sm font-medium"
          >
            <Globe2 className="size-4" />
            See the Global Map
          </button>
        </div>

        {/* Footer attribution */}
        <div className="tagline space-y-1 text-muted-foreground">
          <p>Grounded in AI and the Art of Being Human</p>
          <p className="text-foreground/60 normal-case tracking-normal text-xs">
            by Jeff Abbott &amp; Andrew Maynard
          </p>
          <p className="pt-2 brand-gradient-text normal-case tracking-normal font-display font-bold text-sm">
            Go Be Human.
          </p>
        </div>
      </div>
    </section>
  );
}
