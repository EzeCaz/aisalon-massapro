"use client";

import { Heart, Sparkles, Globe2 } from "lucide-react";

const sixAngles = [
  {
    n: "01",
    title: "Identity & Purpose",
    body: "How we define ourselves when machines can do much of what we do.",
  },
  {
    n: "02",
    title: "Education & Development",
    body: "Preparing people, especially youth, to thrive alongside AI.",
  },
  {
    n: "03",
    title: "Work & Economic Life",
    body: "The future of human labor, creativity, and economic value.",
  },
  {
    n: "04",
    title: "Well-being & Mental Health",
    body: "Managing anxiety, meaning, and resilience in the age of AI.",
  },
  {
    n: "05",
    title: "Relationships & Community",
    body: "Trust, empathy, and human connection in an AI-mediated world.",
  },
  {
    n: "06",
    title: "Creativity & Culture",
    body: "Art, expression, and cultural meaning when machines create.",
  },
];

export function SpeakerBanner() {
  return (
    <section
      id="welcome"
      className="relative py-20 sm:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden"
    >
      {/* Decorative low-poly background */}
      <div
        aria-hidden
        className="absolute inset-0 dot-pattern opacity-40 pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(0.65 0.27 0 / 0.35) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(0.82 0.16 200 / 0.35) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Thank-you banner for panelists & speakers */}
        <div className="rounded-3xl brand-gradient p-8 sm:p-12 mb-16 angular-clip relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 80%, white 1px, transparent 1px)",
              backgroundSize: "24px 24px, 32px 32px",
            }}
          />
          <div className="relative text-white">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm mb-6">
              <Heart className="size-3.5" />
              <span className="tagline text-[0.65rem]">To Our Global Salon</span>
            </div>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.05] mb-5 max-w-3xl">
              Thank you to every panelist and speaker lighting up the AI Salon.
            </h2>
            <p className="text-base sm:text-lg leading-relaxed text-white/90 max-w-3xl">
              From Amsterdam to Sydney, from researchers and founders to
              artists and educators — you are the voices turning a global
              campaign into a living conversation. Your willingness to sit in
              the room, ask the harder question, and stay human while the
              machines get faster is what makes this Salon worth gathering for.
              This field guide is yours. Use it well.
            </p>
          </div>
        </div>

        {/* Topic intro */}
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-16 items-start mb-16">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card mb-4">
              <Sparkles className="size-3.5 text-pink" />
              <span className="tagline text-[0.65rem] text-muted-foreground">
                The Conversation
              </span>
            </div>
            <h3 className="font-display text-3xl sm:text-4xl font-bold leading-tight mb-4">
              AI &amp; Human Flourishing:{" "}
              <span className="brand-gradient-text">
                What does it mean to be human in the age of AI?
              </span>
            </h3>
            <p className="text-base sm:text-lg leading-relaxed text-foreground/75 mb-4">
              The AI Salon doesn&apos;t lead with &ldquo;what can AI do?&rdquo;
              We lead with the quieter, harder question:{" "}
              <em>who are we becoming while it does it</em> — and what will we
              choose to remain?
            </p>
            <p className="text-base leading-relaxed text-foreground/75">
              Every city in this global campaign gathers around the same six
              angles. Each panel, each circle, each late-night hallway
              conversation picks the angle that resonates most in that place —
              the one the room cannot leave alone. Below, the six. Find yours.
            </p>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 relative overflow-hidden">
              <div
                aria-hidden
                className="absolute top-0 right-0 w-32 h-32 brand-gradient opacity-10 rounded-bl-full"
              />
              <div className="flex items-center gap-2 mb-5">
                <Globe2 className="size-5 text-cyan" />
                <p className="tagline text-muted-foreground">
                  Six Angles · One Question
                </p>
              </div>
              <p className="font-display text-xl font-semibold mb-4 leading-snug">
                The angle that resonates most in your city is the door. Walk
                through it — the other five are still in the room.
              </p>
              <p className="text-sm text-foreground/70 leading-relaxed mb-4">
                A Salon isn&apos;t a lecture. It&apos;s three or more people
                willing to sit with a question that doesn&apos;t resolve.
                The facilitator&apos;s job is not to answer — it&apos;s to keep
                the room honest, curious, and human.
              </p>
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border">
                <Stat label="Cities" value="14" />
                <Stat label="Angles" value="6" />
                <Stat label="Question" value="1" />
              </div>
            </div>
          </div>
        </div>

        {/* The six angles — visual grid */}
        <div>
          <div className="text-center mb-8">
            <p className="tagline text-pink mb-2">The Six Angles</p>
            <h3 className="font-display text-2xl sm:text-3xl font-bold">
              Find the one that resonates most in your city.
            </h3>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sixAngles.map((a, i) => (
              <article
                key={a.n}
                className="group relative rounded-2xl border border-border bg-card p-6 hover:border-pink/40 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between mb-3">
                  <span
                    className="font-display text-3xl font-bold brand-gradient-text"
                  >
                    {a.n}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full mt-2"
                    style={{
                      background:
                        i % 2 === 0 ? "var(--salon-cyan)" : "var(--salon-pink)",
                    }}
                  />
                </div>
                <h4 className="font-display text-base font-bold mb-1.5 leading-tight">
                  {a.title}
                </h4>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {a.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-2xl font-bold brand-gradient-text">
        {value}
      </p>
      <p className="tagline text-[0.55rem] text-muted-foreground mt-1">
        {label}
      </p>
    </div>
  );
}
