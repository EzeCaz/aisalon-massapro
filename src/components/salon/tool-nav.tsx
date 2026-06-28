"use client";

import Link from "next/link";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";

/**
 * Simplified top nav for tool pages.
 * Brand lockup + "Back to AI Salon" + "All Tools".
 * Maintains the same brand book styling as SiteNav.
 */
export function ToolNav() {
  return (
    <header className="sticky top-16 left-0 right-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/60 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link
            href="/resources/ai-human-flourishing/#cover"
            className="flex items-center gap-3 group"
            aria-label="Back to AI Salon home"
          >
            <BrandLogo size="md" className="flex-none" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-bold lowercase tracking-tight">
                aisalon
              </span>
              <span className="tagline text-[0.55rem] text-muted-foreground mt-0.5 hidden sm:block">
                Empowering AI Connections
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/resources/ai-human-flourishing/#cover"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-foreground/70 hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Back to AI Salon</span>
              <span className="sm:hidden">Back</span>
            </Link>
            <Link
              href="/resources/ai-human-flourishing/tools"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-foreground/70 hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <LayoutGrid className="size-3.5" />
              <span className="hidden sm:inline">All Tools</span>
              <span className="sm:hidden">Tools</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

/**
 * Mobile-only inline link that floats above the page content,
 * for quick navigation back from a tool page.
 */
export function ToolBackLink({ className }: { className?: string }) {
  return (
    <Link
      href="/resources/ai-human-flourishing/tools"
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-pink transition-colors",
        className
      )}
    >
      <ArrowLeft className="size-3.5" />
      All Tools
    </Link>
  );
}
