"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Search, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolNav } from "./tool-nav";
import { getToolIcon } from "./tool-icons";
import { useSalon } from "./salon-provider";
import {
  featuredTools,
  featuredToolsByArea,
  toolAreas,
} from "@/lib/salon-data/tools-data";

export function ToolsIndex() {
  const [activeArea, setActiveArea] = useState<string>("all");
  const [query, setQuery] = useState("");
  const { progress, hydrated } = useSalon();

  // The /tools page shows the curated 12-tool featured set in editorial order.
  // Area filters and search apply on top of that set.
  const baseList =
    activeArea === "all"
      ? featuredTools
      : featuredToolsByArea(activeArea);

  const filtered = baseList.filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.whatItIs.toLowerCase().includes(q) ||
      t.toolIntro.toLowerCase().includes(q) ||
      t.steps.some((s) => s.label.toLowerCase().includes(q))
    );
  });

  const triedCount = hydrated
    ? featuredTools.filter((t) => progress.toolTried[t.slug]).length
    : 0;

  return (
    <>
      <ToolNav />
      <main className="min-h-screen">
        {/* HERO */}
        <section className="relative px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32 pb-10 overflow-hidden">
          <div aria-hidden className="absolute inset-0 dot-pattern opacity-40 pointer-events-none" />
          <div
            aria-hidden
            className="absolute top-12 -left-32 w-96 h-96 rounded-full opacity-25 blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, oklch(0.82 0.16 200 / 0.4) 0%, transparent 70%)",
            }}
          />
          <div
            aria-hidden
            className="absolute bottom-0 -right-32 w-96 h-96 rounded-full opacity-25 blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, oklch(0.65 0.27 0 / 0.35) 0%, transparent 70%)",
            }}
          />
          <div className="relative max-w-6xl mx-auto">
            <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8">
              <Link href="/resources/ai-human-flourishing/#cover" className="hover:text-foreground transition-colors">
                AI Salon
              </Link>
              <span>/</span>
              <span className="text-foreground">Tools</span>
            </nav>
            <p className="tagline text-pink mb-3">Toolkit</p>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.02] tracking-tight mb-5">
              Twelve tools,{" "}
              <span className="brand-gradient-text">one practice.</span>
            </h1>
            <p className="font-display text-lg sm:text-xl text-foreground/70 leading-relaxed max-w-3xl">
              The twelve practitioner tools that anchor the six conversation areas —
              drawn from <em>AI and the Art of Being Human</em>. A 90-second scan, a
              7-minute pause, a 30-day practice. Run them in the room or carry them
              into your week.
            </p>

            {/* Progress strip */}
            {hydrated && triedCount > 0 && (
              <div className="mt-6 inline-flex items-center gap-3 px-4 py-2 rounded-full bg-card border border-border text-sm">
                <span className="inline-block w-2 h-2 rounded-full brand-gradient" />
                <span className="text-foreground/80">
                  You&apos;ve practiced{" "}
                  <strong className="text-foreground">{triedCount}</strong> of{" "}
                  {featuredTools.length} tools
                </span>
                <div className="w-24 h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full brand-gradient transition-all duration-500"
                    style={{ width: `${(triedCount / featuredTools.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CONTROLS */}
        <section className="px-4 sm:px-6 lg:px-8 pb-6">
          <div className="max-w-6xl mx-auto">
            {/* Search */}
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools by name, purpose, or step…"
                className="w-full pl-10 pr-4 py-3 rounded-full border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-cyan/50 focus:border-cyan/40 transition-all"
              />
            </div>

            {/* Area filter chips — counts reflect featured tools only */}
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={activeArea === "all"}
                onClick={() => setActiveArea("all")}
                label="All tools"
                count={featuredTools.length}
              />
              {toolAreas.map((a) => {
                const count = featuredToolsByArea(a.id).length;
                if (count === 0) return null;
                return (
                  <FilterChip
                    key={a.id}
                    active={activeArea === a.id}
                    onClick={() => setActiveArea(a.id)}
                    label={a.title}
                    count={count}
                    accent={a.accent}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* GRID */}
        <section className="px-4 sm:px-6 lg:px-8 pb-20">
          <div className="max-w-6xl mx-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-20 text-foreground/60">
                <p className="font-display text-xl mb-2">No tools match that.</p>
                <p>Try a different search or clear the filter.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {filtered.map((t) => {
                  const accentVar = `var(--salon-${t.accent})`;
                  const Icon = getToolIcon(t.icon);
                  const isTried = hydrated && !!progress.toolTried[t.slug];
                  return (
                    <Link
                      key={t.slug}
                      href={`/resources/ai-human-flourishing/tools/${t.slug}`}
                      className="group relative rounded-2xl border border-border bg-card p-6 hover:shadow-lg transition-all overflow-hidden salon-rise"
                    >
                      <span
                        aria-hidden
                        className="absolute -top-px left-6 right-6 h-px opacity-60 group-hover:opacity-100 transition-opacity"
                        style={{ background: accentVar }}
                      />
                      <div className="flex items-start justify-between mb-4">
                        <span
                          className="flex-none w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{
                            background: `color-mix(in oklab, ${accentVar}, transparent 86%)`,
                            color: accentVar,
                          }}
                        >
                          <Icon className="size-5" />
                        </span>
                        {isTried && (
                          <span
                            className="inline-flex items-center gap-1 text-[0.6rem] font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ background: accentVar }}
                          >
                            ✓ Practiced
                          </span>
                        )}
                      </div>
                      <h3 className="font-display font-bold text-lg leading-tight mb-1 group-hover:text-pink transition-colors">
                        {t.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        {t.chapter} · {t.areaTitle}
                        {t.duration ? ` · ${t.duration}` : ""}
                      </p>
                      <p className="text-sm text-foreground/70 leading-relaxed line-clamp-3">
                        {t.whatItIs}
                      </p>
                      <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-foreground/60 group-hover:text-pink transition-colors">
                        <Wrench className="size-3" />
                        Open tool
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Bottom back link */}
            <div className="mt-16 text-center">
              <Link
                href="/resources/ai-human-flourishing/#cover"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-pink transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                Back to AI Salon
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  accent?: "cyan" | "pink";
}) {
  const accentVar = accent ? `var(--salon-${accent})` : "var(--salon-cyan)";
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-sm transition-all",
        active
          ? "text-white border-transparent shadow-sm"
          : "border-border bg-card text-foreground/70 hover:text-foreground hover:border-foreground/20"
      )}
      style={active ? { background: accentVar, borderColor: accentVar } : undefined}
    >
      {label}
      <span
        className={cn(
          "text-[0.65rem] font-mono font-bold",
          active ? "text-white/80" : "text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}
