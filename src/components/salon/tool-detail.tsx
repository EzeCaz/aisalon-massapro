"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  BookOpen,
  Compass,
  Pencil,
  Sparkles,
  Target,
  ListChecks,
  PlayCircle,
  ArrowUpRight,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSalon } from "./salon-provider";
import { getToolIcon } from "./tool-icons";
import { ToolDiagram, hasDiagram } from "./tool-diagrams";
import {
  tools,
  featuredTools,
  type SalonTool,
  toolAreas,
} from "@/lib/salon-data/tools-data";

interface ToolDetailProps {
  tool: SalonTool;
}

export function ToolDetail({ tool }: ToolDetailProps) {
  const { progress, hydrated, toggleToolTried, setToolNote } = useSalon();
  const [showNote, setShowNote] = useState(false);

  const accentVar = `var(--salon-${tool.accent})`;
  const accentTextClass = tool.accent === "cyan" ? "text-cyan" : "text-pink";
  const Icon = getToolIcon(tool.icon);

  const isTried = !!progress.toolTried[tool.slug];
  const noteText = progress.toolNotes[tool.slug] ?? "";

  // Prev / next tool — prefer the curated featured set; fall back to full list
  // so non-featured tools (e.g. Pocket Card, One-Line Vow) still navigate cleanly.
  const list = featuredTools.length > 0 ? featuredTools : tools;
  const idx = list.findIndex((t) => t.slug === tool.slug);
  const fallbackIdx = idx === -1 ? tools.findIndex((t) => t.slug === tool.slug) : -1;
  const navList = idx === -1 ? tools : list;
  const navIdx = idx === -1 ? fallbackIdx : idx;
  const prev = navList[(navIdx - 1 + navList.length) % navList.length];
  const next = navList[(navIdx + 1) % navList.length];

  // Related area — prefer featured siblings, fall back to all tools in area
  const area = toolAreas.find((a) => a.id === tool.areaId);
  const relatedTools = featuredTools
    .filter((t) => t.areaId === tool.areaId && t.slug !== tool.slug)
    .slice(0, 3);
  const relatedCount = relatedTools.length;
  const fallbackRelated =
    relatedCount > 0
      ? relatedTools
      : tools
          .filter((t) => t.areaId === tool.areaId && t.slug !== tool.slug)
          .slice(0, 3);

  return (
    <article className="salon-rise">
      {/* ============== HERO ============== */}
      <section
        className="relative px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32 pb-12 overflow-hidden"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${accentVar}, transparent 92%) 0%, transparent 100%)`,
        }}
      >
        {/* Decorative dots + gradient blobs */}
        <div aria-hidden className="absolute inset-0 dot-pattern opacity-40 pointer-events-none" />
        <div
          aria-hidden
          className="absolute top-12 -right-32 w-96 h-96 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{
            background: `radial-gradient(circle, color-mix(in oklab, ${accentVar}, transparent 60%) 0%, transparent 70%)`,
          }}
        />

        <div className="relative max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8">
            <Link href="/resources/ai-human-flourishing/#cover" className="hover:text-foreground transition-colors">
              AI Salon
            </Link>
            <span>/</span>
            <Link href="/resources/ai-human-flourishing/tools" className="hover:text-foreground transition-colors">
              Tools
            </Link>
            <span>/</span>
            <Link
              href={`/#areas`}
              className="hover:text-foreground transition-colors"
            >
              {tool.areaTitle}
            </Link>
          </nav>

          {/* Eyebrow row: chapter + area + duration */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border text-xs font-semibold"
              style={{ borderColor: `color-mix(in oklab, ${accentVar}, transparent 60%)` }}
            >
              <BookOpen className="size-3" style={{ color: accentVar }} />
              <span style={{ color: accentVar }}>{tool.chapter}</span>
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border text-xs"
              style={{ borderColor: `color-mix(in oklab, ${accentVar}, transparent 60%)` }}
            >
              <Compass className="size-3" style={{ color: accentVar }} />
              <span className="text-foreground/70">{tool.areaTitle}</span>
            </span>
            {tool.duration && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border border-border text-xs text-foreground/70">
                <Clock className="size-3" />
                {tool.duration}
              </span>
            )}
          </div>

          {/* Title + icon */}
          <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
            <div
              className="flex-none w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center text-white shadow-md brand-gradient"
              aria-hidden
            >
              <Icon className="size-10 sm:size-12" strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.02] tracking-tight mb-4">
                {tool.name}
              </h1>
              <p className="font-display text-base sm:text-lg text-foreground/60 italic leading-snug max-w-3xl">
                {tool.chapterLine}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============== BODY ============== */}
      <section className="px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.6fr_1fr] gap-10 lg:gap-14">
          {/* MAIN COLUMN */}
          <div className="space-y-12 min-w-0">
            {/* WHAT IT IS */}
            <SectionBlock
              eyebrow="What it is"
              icon={<Sparkles className="size-4" />}
              accentVar={accentVar}
            >
              <p className="text-lg sm:text-xl leading-relaxed text-foreground/85 drop-cap">
                {tool.whatItIs}
              </p>
            </SectionBlock>

            {/* WHERE TO USE */}
            <SectionBlock
              eyebrow="Where you would use it"
              icon={<Target className="size-4" />}
              accentVar={accentVar}
            >
              <ul className="grid sm:grid-cols-2 gap-3">
                {tool.whenToUse.map((w, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4"
                  >
                    <span
                      className="flex-none mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[0.7rem] font-bold font-mono"
                      style={{
                        background: `color-mix(in oklab, ${accentVar}, transparent 85%)`,
                        color: accentVar,
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="text-sm leading-relaxed text-foreground/80">{w}</p>
                  </li>
                ))}
              </ul>
            </SectionBlock>

            {/* THE TOOL — structured steps */}
            <SectionBlock
              eyebrow="The tool"
              icon={<ListChecks className="size-4" />}
              accentVar={accentVar}
              title={tool.toolIntro}
            >
              {tool.steps.length > 0 ? (
                <ol className="space-y-3">
                  {tool.steps.map((s, i) => (
                    <li
                      key={i}
                      className="relative rounded-xl border border-border bg-card/60 p-5 pl-6 overflow-hidden"
                    >
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{ background: accentVar }}
                      />
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                        <div className="flex items-center gap-2 flex-none sm:w-56">
                          <span
                            className="font-mono text-xs font-bold"
                            style={{ color: accentVar }}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <h4 className="font-display font-bold text-base leading-tight">
                            {s.label}
                          </h4>
                        </div>
                        <p className="text-sm sm:text-base leading-relaxed text-foreground/80 flex-1">
                          {s.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-base leading-relaxed text-foreground/80">
                  {tool.toolIntro}
                </p>
              )}
            </SectionBlock>

            {/* DIAGRAM — visual model of the tool (only for tools with one) */}
            {hasDiagram(tool.slug) && (
              <SectionBlock
                eyebrow="The model"
                icon={<Waypoints className="size-4" />}
                accentVar={accentVar}
                title="A picture of how it fits together"
              >
                <ToolDiagram slug={tool.slug} accentVar={accentVar} />
              </SectionBlock>
            )}

            {/* HOW TO USE IT */}
            <SectionBlock
              eyebrow="How to use it"
              icon={<PlayCircle className="size-4" />}
              accentVar={accentVar}
            >
              <div
                className="rounded-2xl p-6 border"
                style={{
                  borderColor: `color-mix(in oklab, ${accentVar}, transparent 70%)`,
                  background: `linear-gradient(135deg, color-mix(in oklab, ${accentVar}, transparent 94%) 0%, oklch(1 0 0) 100%)`,
                }}
              >
                <p className="text-base sm:text-lg leading-relaxed text-foreground/85">
                  {tool.howToUse}
                </p>
              </div>
            </SectionBlock>

            {/* TRY IT — interactive */}
            <SectionBlock
              eyebrow="Try it"
              icon={<Check className="size-4" />}
              accentVar={accentVar}
              title="Mark it run"
            >
              <div className="space-y-4">
                <button
                  onClick={() => toggleToolTried(tool.slug)}
                  disabled={!hydrated}
                  className={cn(
                    "inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all disabled:opacity-50",
                    isTried
                      ? "text-white shadow-md"
                      : "border border-border bg-card hover:bg-secondary"
                  )}
                  style={isTried ? { background: accentVar, borderColor: accentVar } : undefined}
                >
                  <Check className="size-4" />
                  {isTried ? "Practiced" : "Mark as practiced"}
                </button>

                {showNote ? (
                  <div>
                    <Textarea
                      value={noteText}
                      onChange={(e) => setToolNote(tool.slug, e.target.value)}
                      placeholder="What happened when you ran this? What surprised you? What would you change?"
                      className="min-h-[120px] bg-background/60"
                      autoFocus
                    />
                    <div className="flex justify-end mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setShowNote(false)}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNote(true)}
                    className="block text-xs text-muted-foreground hover:text-pink transition-colors"
                  >
                    <Pencil className="inline size-3 mr-1.5" />
                    {noteText ? "Edit your note" : "Add a reflection note"}
                  </button>
                )}
                {hydrated && noteText && !showNote && (
                  <p className="text-xs italic text-foreground/60 line-clamp-2">
                    “{noteText}”
                  </p>
                )}
              </div>
            </SectionBlock>
          </div>

          {/* SIDE COLUMN */}
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            {/* Jump-to-area */}
            {area && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="tagline text-[0.6rem] text-muted-foreground mb-2">
                  Conversation Area
                </p>
                <Link
                  href={`/#areas`}
                  className="block group"
                >
                  <h3 className="font-display font-bold text-lg leading-tight group-hover:text-pink transition-colors">
                    {area.title}
                    <ArrowUpRight className="inline size-4 ml-1 opacity-50 group-hover:opacity-100" />
                  </h3>
                  <p className="text-sm text-foreground/70 mt-1 leading-relaxed">
                    {area.blurb}
                  </p>
                </Link>
              </div>
            )}

            {/* Related tools */}
            {(relatedTools.length > 0 || fallbackRelated.length > 0) && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="tagline text-[0.6rem] text-muted-foreground mb-3">
                  Also in this area
                </p>
                <ul className="space-y-2">
                  {(relatedTools.length > 0 ? relatedTools : fallbackRelated).map((rt) => {
                    const RIcon = getToolIcon(rt.icon);
                    return (
                      <li key={rt.slug}>
                        <Link
                          href={`/resources/ai-human-flourishing/tools/${rt.slug}`}
                          className="flex items-start gap-3 rounded-lg p-2 -mx-2 hover:bg-secondary/60 transition-colors group"
                        >
                          <span
                            className="flex-none w-8 h-8 rounded-md flex items-center justify-center"
                            style={{
                              background: `color-mix(in oklab, var(--salon-${rt.accent}), transparent 88%)`,
                              color: `var(--salon-${rt.accent})`,
                            }}
                          >
                            <RIcon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-display font-semibold text-sm leading-tight group-hover:text-pink transition-colors">
                              {rt.name}
                            </p>
                            <p className="text-[0.7rem] text-muted-foreground mt-0.5">
                              {rt.chapter} · {rt.duration}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Attribution */}
            <div className="rounded-2xl border border-border bg-card p-5 text-xs text-foreground/70 leading-relaxed">
              <p className="font-display font-bold text-sm text-foreground mb-1">
                From the book
              </p>
              <p>
                Drawn from <em>AI and the Art of Being Human</em> by Jeff Abbott &
                Andrew Maynard.
              </p>
              <p className="mt-2 brand-gradient-text font-display font-bold text-sm">
                Go Be Human.
              </p>
            </div>
          </aside>
        </div>
      </section>

      {/* ============== PREV / NEXT ============== */}
      <section className="px-4 sm:px-6 lg:px-8 pb-16 border-t border-border/60 pt-12">
        <div className="max-w-6xl mx-auto grid sm:grid-cols-2 gap-4">
          <ToolCardLink tool={prev} label="Previous tool" dir="prev" />
          <ToolCardLink tool={next} label="Next tool" dir="next" />
        </div>
        <div className="max-w-6xl mx-auto mt-8 text-center">
          <Button asChild variant="outline" className="rounded-full gap-2">
            <Link href="/resources/ai-human-flourishing/tools">
              <LayoutGridIcon /> View all {featuredTools.length} tools
            </Link>
          </Button>
        </div>
      </section>
    </article>
  );
}

/** Small layout-grid icon — Lucide's LayoutGrid conflicts with our import scope. */
function LayoutGridIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

function SectionBlock({
  eyebrow,
  icon,
  title,
  children,
  accentVar,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  accentVar: string;
}) {
  return (
    <section>
      <header className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color: accentVar }}>{icon}</span>
          <p
            className="tagline text-[0.65rem] font-bold"
            style={{ color: accentVar }}
          >
            {eyebrow}
          </p>
        </div>
        {title && (
          <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
            {title}
          </h2>
        )}
      </header>
      {children}
    </section>
  );
}

function ToolCardLink({
  tool,
  label,
  dir,
}: {
  tool: SalonTool;
  label: string;
  dir: "prev" | "next";
}) {
  const accentVar = `var(--salon-${tool.accent})`;
  const Icon = getToolIcon(tool.icon);
  const isNext = dir === "next";
  return (
    <Link
      href={`/resources/ai-human-flourishing/tools/${tool.slug}`}
      className={cn(
        "group relative rounded-2xl border border-border bg-card p-5 hover:shadow-md transition-all overflow-hidden",
        isNext && "sm:text-right"
      )}
    >
      <span
        aria-hidden
        className="absolute top-0 left-0 right-0 h-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ background: accentVar }}
      />
      <div
        className={cn(
          "flex items-center gap-3 mb-2",
          isNext && "sm:flex-row-reverse"
        )}
      >
        <span
          className="flex-none w-9 h-9 rounded-md flex items-center justify-center"
          style={{
            background: `color-mix(in oklab, ${accentVar}, transparent 88%)`,
            color: accentVar,
          }}
        >
          <Icon className="size-4" />
        </span>
        <p className="tagline text-[0.6rem] text-muted-foreground">{label}</p>
      </div>
      <p className="font-display font-bold text-lg leading-tight group-hover:text-pink transition-colors">
        {tool.name}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {tool.chapter} · {tool.areaTitle}
      </p>
      <div
        className={cn(
          "mt-3 inline-flex items-center gap-1 text-xs",
          isNext && "sm:flex-row-reverse",
          "text-muted-foreground"
        )}
      >
        {isNext ? (
          <>
            <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
            <span className="group-hover:text-pink transition-colors">Open</span>
          </>
        ) : (
          <>
            <ArrowLeft className="size-3 group-hover:-translate-x-0.5 transition-transform" />
            <span className="group-hover:text-pink transition-colors">Open</span>
          </>
        )}
      </div>
    </Link>
  );
}
