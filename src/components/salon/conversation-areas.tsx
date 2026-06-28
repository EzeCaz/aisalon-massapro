"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  conversationAreas,
  type ConversationArea,
} from "@/lib/salon-data/salon-data";
import { useSalon } from "./salon-provider";
import {
  BookOpen,
  Users,
  Wrench,
  Quote as QuoteIcon,
  Check,
  ChevronDown,
  Pencil,
  FlaskConical,
  Briefcase,
  Lightbulb,
  CircleDot,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Alternate cyan/pink accent per area for visual rhythm
const areaAccent = [
  "cyan", "pink", "cyan", "pink", "cyan", "pink",
];

export function ConversationAreas() {
  const [activeIdx, setActiveIdx] = useState(0);
  const { progress, hydrated } = useSalon();
  const area = conversationAreas[activeIdx];
  const accent = areaAccent[activeIdx];

  const areaProgress = useMemo(() => {
    return conversationAreas.map((a) => {
      const total = a.questions.length;
      const done = a.questions.filter(
        (q) => progress.discussed[q.id]
      ).length;
      return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
    });
  }, [progress.discussed]);

  return (
    <section
      id="areas"
      className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <p className="tagline text-pink mb-3">Six Conversation Areas</p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4">
            Pick an area.{" "}
            <span className="brand-gradient-text">Open the room.</span>
          </h2>
          <p className="text-base sm:text-lg text-foreground/70 max-w-2xl mx-auto leading-relaxed">
            Each area is a complete 45–90 minute salon. Mark questions as
            discussed, jot notes, and complete the one-line vow. Your progress
            saves automatically.
          </p>
        </div>

        {/* Area tab selector */}
        <div className="mb-10">
          {/* Desktop tabs */}
          <div className="hidden md:grid grid-cols-6 gap-2">
            {conversationAreas.map((a, i) => {
              const ap = areaProgress[i];
              const isActive = i === activeIdx;
              const acc = areaAccent[i];
              return (
                <button
                  key={a.id}
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    "group relative rounded-xl border p-4 text-left transition-all",
                    isActive
                      ? `border-${acc} bg-card shadow-md`
                      : "border-border bg-card/50 hover:bg-card hover:border-foreground/20"
                  )}
                  style={
                    isActive
                      ? { borderColor: `var(--salon-${acc})` }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="font-mono text-xs font-bold"
                      style={{
                        color: isActive
                          ? `var(--salon-${acc})`
                          : "var(--muted-foreground)",
                      }}
                    >
                      {a.number}
                    </span>
                    {hydrated && ap.done > 0 && (
                      <span className="text-[0.65rem] text-muted-foreground">
                        {ap.done}/{ap.total}
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "font-display text-sm font-bold leading-tight",
                      isActive ? "text-foreground" : "text-foreground/70"
                    )}
                  >
                    {a.title}
                  </p>
                  {/* Progress bar */}
                  <div className="mt-3 h-0.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-500 brand-gradient"
                      style={{ width: `${ap.pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Mobile horizontal scroll row */}
          <div className="md:hidden -mx-4 px-4 overflow-x-auto brand-scroll pb-2">
            <div className="flex gap-2 min-w-min">
              {conversationAreas.map((a, i) => {
                const ap = areaProgress[i];
                const isActive = i === activeIdx;
                const acc = areaAccent[i];
                return (
                  <button
                    key={a.id}
                    onClick={() => setActiveIdx(i)}
                    className={cn(
                      "flex-none rounded-xl border px-4 py-2.5 text-left transition-all min-w-[140px]",
                      isActive
                        ? "bg-card shadow-md"
                        : "border-border bg-card/50"
                    )}
                    style={
                      isActive
                        ? { borderColor: `var(--salon-${acc})` }
                        : undefined
                    }
                  >
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span
                        className="text-xs font-mono font-bold"
                        style={{
                          color: isActive
                            ? `var(--salon-${acc})`
                            : "var(--muted-foreground)",
                        }}
                      >
                        {a.number}
                      </span>
                      {hydrated && ap.done > 0 && (
                        <span className="text-[0.6rem] text-muted-foreground">
                          {ap.done}/{ap.total}
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        "font-display text-xs font-bold leading-tight",
                        isActive ? "text-foreground" : "text-foreground/70"
                      )}
                    >
                      {a.title}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Render active area */}
        <ConversationAreaDetail
          key={area.id}
          area={area}
          accent={accent}
          progress={progress}
          hydrated={hydrated}
        />
      </div>
    </section>
  );
}

function ConversationAreaDetail({
  area,
  accent,
  progress,
  hydrated,
}: {
  area: ConversationArea;
  accent: string;
  progress: ReturnType<typeof useSalon>["progress"];
  hydrated: boolean;
}) {
  const { toggleDiscussed, setNote, toggleAreaDone } = useSalon();
  const discussedCount = area.questions.filter(
    (q) => progress.discussed[q.id]
  ).length;
  const areaComplete = !!progress.areaDone[area.id];

  const accentVar = `var(--salon-${accent})`;
  const accentTextClass = accent === "cyan" ? "text-cyan" : "text-pink";

  return (
    <article className="salon-rise">
      {/* Area header */}
      <header className="mb-10 grid lg:grid-cols-[auto_1fr] gap-6 items-start">
        <div
          className="flex-none w-20 h-20 sm:w-24 sm:h-24 rounded-2xl brand-gradient flex items-center justify-center text-white shadow-md"
        >
          <span className="font-display text-3xl sm:text-4xl font-extrabold">
            {area.number}
          </span>
        </div>
        <div>
          <h3 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-3">
            {area.title}
          </h3>
          <p className="font-display text-lg sm:text-xl text-foreground/80 italic leading-snug max-w-3xl">
            {area.framing}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {hydrated && (
              <span
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-secondary text-foreground/70"
              >
                <CircleDot
                  className="size-3"
                  style={{ color: accentVar }}
                />
                {discussedCount}/{area.questions.length} questions discussed
              </span>
            )}
            <Button
              variant={areaComplete ? "default" : "outline"}
              size="sm"
              onClick={() => toggleAreaDone(area.id)}
              className="text-xs"
              style={
                areaComplete
                  ? {
                      background: accentVar,
                      borderColor: accentVar,
                      color: "white",
                    }
                  : undefined
              }
            >
              {areaComplete ? (
                <>
                  <Check className="size-3.5 mr-1.5" /> Area complete
                </>
              ) : (
                "Mark area complete"
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-8 lg:gap-12">
        {/* Main column: quotes, questions, vow */}
        <div className="space-y-10">
          {/* Read-aloud quotes */}
          <Block
            icon={<BookOpen className="size-4" />}
            eyebrow="Open the Room — Read Aloud"
            title="Set the temperature"
            accent={accent}
          >
            <div className="space-y-5">
              {area.quotes.map((q, i) => (
                <figure
                  key={i}
                  className="relative pl-8 sm:pl-10 py-2 border-l-4"
                  style={{ borderColor: accentVar }}
                >
                  <span
                    className="absolute -left-1 top-0 font-display text-5xl leading-none opacity-30"
                    style={{ color: accentVar }}
                    aria-hidden
                  >
                    &ldquo;
                  </span>
                  <blockquote className="font-display text-lg sm:text-xl md:text-2xl font-medium leading-snug text-foreground/90 mb-2">
                    {q.text}
                  </blockquote>
                  <figcaption className="tagline text-muted-foreground">
                    {q.source}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Block>

          {/* Questions */}
          <Block
            icon={<Users className="size-4" />}
            eyebrow="Questions to Put on the Table"
            title="Pick three. Don't rush."
            accent={accent}
          >
            <ol className="space-y-3">
              {area.questions.map((q, i) => {
                const isDone = !!progress.discussed[q.id];
                const isField = q.text.startsWith("FROM THE FIELD:");
                const qText = isField
                  ? q.text.slice("FROM THE FIELD:".length).trim()
                  : q.text;
                return (
                  <li
                    key={q.id}
                    className={cn(
                      "group rounded-xl border transition-all",
                      isDone
                        ? "border-cyan/40 bg-cyan/5"
                        : "border-border bg-card/50 hover:bg-card hover:border-foreground/20"
                    )}
                  >
                    <div className="flex gap-3 p-4">
                      <button
                        onClick={() => toggleDiscussed(q.id)}
                        className={cn(
                          "flex-none mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                          isDone
                            ? "brand-gradient border-transparent text-white"
                            : "border-foreground/30 hover:border-cyan"
                        )}
                        aria-label={
                          isDone ? "Mark as not discussed" : "Mark as discussed"
                        }
                      >
                        {isDone && <Check className="size-3.5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span
                            className={cn(
                              "font-mono text-xs font-bold",
                              isDone ? "text-cyan" : "text-muted-foreground"
                            )}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {isField && (
                            <span className="tagline text-[0.55rem] text-pink">
                              From the Field
                            </span>
                          )}
                        </div>
                        <p
                          className={cn(
                            "text-sm sm:text-base leading-relaxed",
                            isDone
                              ? "text-foreground/60 line-through decoration-cyan/40"
                              : "text-foreground/85"
                          )}
                        >
                          {qText}
                        </p>
                        <QuestionNotes
                          id={q.id}
                          value={progress.notes[q.id] ?? ""}
                          onChange={(v) => setNote(q.id, v)}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Block>

          {/* One-line vow */}
          <Block
            icon={<QuoteIcon className="size-4" />}
            eyebrow="One-Line Vow"
            title="Something to carry out the door"
            accent={accent}
          >
            <div
              className="rounded-xl p-6 border relative overflow-hidden"
              style={{
                borderColor: accentVar,
                background: `linear-gradient(135deg, oklch(0.97 0.02 200) 0%, oklch(0.98 0.005 0) 100%)`,
              }}
            >
              <div
                aria-hidden
                className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-15"
                style={{ background: accentVar }}
              />
              <p className="font-display text-lg sm:text-xl md:text-2xl italic font-medium leading-snug relative">
                &ldquo;{area.vow}&rdquo;
              </p>
            </div>
          </Block>
        </div>

        {/* Side column: stories, tools, facilitator note */}
        <aside className="space-y-8">
          {/* Stories */}
          <Block
            icon={<BookOpen className="size-4" />}
            eyebrow="Stories to Anchor It"
            title="From the book"
            accent={accent}
            compact
          >
            <p className="text-sm leading-relaxed text-foreground/80">
              {area.stories}
            </p>
          </Block>

          {/* Field notes (Work area only) */}
          {area.fieldNotes && "lab" in area.fieldNotes && (
            <Block
              icon={<Briefcase className="size-4" />}
              eyebrow="Field Notes"
              title="Two voices in the room"
              accent={accent}
              compact
            >
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-card/60 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase className="size-3.5 text-cyan" />
                    <p className="tagline text-cyan">From the bench</p>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {area.fieldNotes.bench}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card/60 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FlaskConical className="size-3.5 text-pink" />
                    <p className="tagline text-pink">From the lab</p>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {area.fieldNotes.lab}
                  </p>
                </div>
              </div>
            </Block>
          )}

          {/* Facilitator note (Well-being area) */}
          {area.facilitatorNote && (
            <Block
              icon={<Lightbulb className="size-4" />}
              eyebrow="A Facilitator's Note"
              title="Hold space, gently"
              accent={accent}
              compact
            >
              <p className="text-sm leading-relaxed text-foreground/80">
                {area.facilitatorNote}
              </p>
            </Block>
          )}

          {/* Tools */}
          <Block
            icon={<Wrench className="size-4" />}
            eyebrow="Tools to Facilitate"
            title="Run it in the room"
            accent={accent}
            compact
          >
            <Accordion type="single" collapsible className="space-y-3">
              {area.tools.map((t, i) => (
                <AccordionItem
                  key={i}
                  value={`tool-${i}`}
                  className="rounded-lg border border-border bg-card/60 px-4"
                >
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex-1 text-left pr-2">
                      <div className="flex items-center gap-1.5">
                        <p className="font-display text-base font-bold leading-tight inline">
                          {t.name}
                        </p>
                        {t.toolSlug && (
                          <Link
                            href={`/resources/ai-human-flourishing/tools/${t.toolSlug}`}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Open the full ${t.name} tool guide`}
                            className="inline-flex items-center justify-center w-5 h-5 rounded text-foreground/40 hover:text-pink hover:bg-secondary/60 transition-colors flex-none"
                          >
                            <ArrowUpRight className="size-3.5" />
                          </Link>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.source}
                        {t.duration ? ` · ${t.duration}` : ""}
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pt-1">
                    <p className="text-sm text-foreground/80 leading-relaxed mb-3">
                      {t.description}
                    </p>
                    <div
                      className="rounded-md p-3"
                      style={{
                        background: `color-mix(in oklab, ${accentVar}, transparent 88%)`,
                      }}
                    >
                      <p
                        className="tagline mb-1.5 flex items-center gap-1.5"
                        style={{ color: accentVar }}
                      >
                        <ChevronDown className="size-3" />
                        Run it {t.duration ? `(${t.duration})` : ""}
                      </p>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        {t.recipe}
                      </p>
                    </div>
                    {t.toolSlug && (
                      <Link
                        href={`/resources/ai-human-flourishing/tools/${t.toolSlug}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/70 hover:text-pink transition-colors group/link"
                      >
                        <Wrench className="size-3" />
                        Open the full tool guide
                        <ArrowUpRight className="size-3 opacity-50 group-hover/link:opacity-100 group-hover/link:text-pink transition-opacity" />
                      </Link>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Block>
        </aside>
      </div>
    </article>
  );
}

function Block({
  icon,
  eyebrow,
  title,
  children,
  compact,
  accent,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  compact?: boolean;
  accent: string;
}) {
  const accentVar = `var(--salon-${accent})`;
  return (
    <section>
      <header className="mb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span style={{ color: accentVar }}>{icon}</span>
          <p
            className="tagline text-[0.65rem] font-bold"
            style={{ color: accentVar }}
          >
            {eyebrow}
          </p>
        </div>
        <h3
          className={cn(
            "font-display font-bold leading-tight",
            compact ? "text-lg" : "text-xl sm:text-2xl"
          )}
        >
          {title}
        </h3>
      </header>
      {children}
    </section>
  );
}

function QuestionNotes({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-pink transition-colors"
      >
        <Pencil className="size-3" />
        {value ? "Edit note" : "Add a note"}
      </button>
    );
  }

  return (
    <div className="mt-3">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Jot a thought, a name, a follow-up…"
        className="text-sm min-h-[80px] bg-background/60"
        autoFocus
      />
      <div className="flex justify-end mt-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={() => setOpen(false)}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
