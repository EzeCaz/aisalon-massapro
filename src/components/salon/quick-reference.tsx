"use client";

import Link from "next/link";
import { conversationAreas } from "@/lib/salon-data/salon-data";
import { Download, ExternalLink, ArrowUp, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "./brand-logo";

export function QuickReference() {
  const scrollTop = () =>
    window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <section
      id="reference"
      className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <p className="tagline text-pink mb-3">Practical Tools</p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4">
            Six areas,{" "}
            <span className="brand-gradient-text">twelve tools</span>
          </h2>
          <p className="text-base sm:text-lg text-foreground/70 leading-relaxed max-w-2xl mx-auto">
            Every tool drawn from <em>AI and the Art of Being Human</em> — Jeff
            Abbott &amp; Andrew Maynard. Tap any tool name to open its full
            interactive guide.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {conversationAreas.map((a, i) => {
            const isCyan = i % 2 === 0;
            const accentVar = isCyan
              ? "var(--salon-cyan)"
              : "var(--salon-pink)";
            return (
              <article
                key={a.id}
                className="group relative rounded-2xl border border-border bg-card p-6 hover:shadow-lg transition-all"
              >
                <div
                  aria-hidden
                  className="absolute -top-px left-6 right-6 h-px opacity-60 group-hover:opacity-100 transition-opacity"
                  style={{ background: accentVar }}
                />
                <div className="flex items-baseline justify-between mb-3">
                  <span
                    className="font-display text-2xl font-extrabold"
                    style={{ color: accentVar }}
                  >
                    {a.number}
                  </span>
                  <span className="tagline text-[0.55rem] text-muted-foreground">
                    Area
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold mb-3 leading-tight">
                  {a.title}
                </h3>
                <ul className="space-y-2">
                  {a.tools.map((t, j) =>
                    t.toolSlug ? (
                      <li key={j}>
                        <Link
                          href={`/resources/ai-human-flourishing/tools/${t.toolSlug}`}
                          className="text-sm text-foreground/75 leading-snug flex items-start gap-2 rounded-md p-1 -mx-1 hover:bg-secondary/60 transition-colors group/tool"
                        >
                          <span
                            className="mt-1.5 w-1 h-1 rounded-full flex-none"
                            style={{ background: accentVar }}
                          />
                          <span className="flex-1">
                            <span className="font-semibold text-foreground group-hover/tool:text-pink transition-colors inline-flex items-center gap-1">
                              {t.name}
                              <ArrowUpRight className="size-3 opacity-40 group-hover/tool:opacity-100 group-hover/tool:text-pink transition-opacity" />
                            </span>
                            <span className="text-xs text-muted-foreground ml-1.5">
                              {t.source}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ) : (
                      <li
                        key={j}
                        className="text-sm text-foreground/75 leading-snug flex items-start gap-2"
                      >
                        <span
                          className="mt-1.5 w-1 h-1 rounded-full flex-none"
                          style={{ background: accentVar }}
                        />
                        <span>
                          <span className="font-semibold text-foreground">
                            {t.name}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1.5">
                            {t.source}
                          </span>
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </article>
            );
          })}
        </div>

        {/* See all tools CTA */}
        <div className="mt-10 text-center">
          <Button asChild className="gap-2 rounded-full brand-gradient text-white">
            <Link href="/resources/ai-human-flourishing/tools">
              Explore all 12 tools
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>

        {/* Download CTA */}
        <div className="mt-6 text-center">
          <Button
            asChild
            variant="outline"
            className="gap-2 rounded-full"
          >
            <a
              href="https://aiandtheartofbeinghuman.com/the-tools"
              target="_blank"
              rel="noreferrer noopener"
            >
              <Download className="size-4" />
              Download every tool free
              <ExternalLink className="size-3.5 opacity-60" />
            </a>
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-20 pt-10 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <BrandLogo size="md" />
                <div className="flex flex-col leading-none">
                  <span className="font-display text-lg font-bold lowercase">
                    aisalon
                  </span>
                  <span className="tagline text-[0.55rem] text-muted-foreground mt-0.5">
                    Empowering AI Connections
                  </span>
                </div>
              </div>
              <p className="text-sm text-foreground/70 leading-relaxed">
                A global campaign grounded in{" "}
                <em>AI and the Art of Being Human</em> by Jeff Abbott &amp;
                Andrew Maynard.
              </p>
              <p className="mt-3 brand-gradient-text font-display font-bold text-base">
                Go Be Human.
              </p>
            </div>

            <div>
              <p className="tagline text-muted-foreground mb-3">Connect</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://www.aisalon.ai"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-foreground/80 hover:text-pink transition-colors"
                  >
                    aisalon.ai
                  </a>
                </li>
                <li>
                  <a
                    href="https://aiandtheartofbeinghuman.com"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-foreground/80 hover:text-pink transition-colors"
                  >
                    aiandtheartofbeinghuman.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://aiandtheartofbeinghuman.com/the-tools"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-foreground/80 hover:text-pink transition-colors"
                  >
                    The Tools (free download)
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="tagline text-muted-foreground mb-3">Publisher</p>
              <p className="text-sm text-foreground/80">
                Waymark Works Publishing
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Drawn from <em>AI and the Art of Being Human</em>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Brand identity by Sightbox
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border/60">
            <p className="text-xs text-muted-foreground text-center sm:text-left">
              An interactive companion to the Facilitator&apos;s Field Guide.
              <br className="sm:hidden" />{" "}
              <span className="text-foreground/60">
                Not what can AI do — but who are we becoming while it does it?
              </span>
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={scrollTop}
              className="text-muted-foreground hover:text-pink gap-1.5 flex-none"
            >
              Back to top
              <ArrowUp className="size-3.5" />
            </Button>
          </div>
        </div>
      </footer>
    </section>
  );
}
