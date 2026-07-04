"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "cover", label: "Home" },
  { id: "welcome", label: "Welcome" },
  { id: "map", label: "Global Map" },
  { id: "host", label: "How to Host" },
  { id: "postures", label: "Four Postures" },
  { id: "areas", label: "Six Areas" },
  { id: "reference", label: "Practical Tools" },
  { id: "convener", label: "Become a Convener" },
];

export function SiteNav() {
  const pathname = usePathname();
  const isToolsPage = pathname?.startsWith("/resources/ai-human-flourishing/tools");
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("cover");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);

      const offsets = SECTIONS.map((s) => {
        const el = document.getElementById(s.id);
        if (!el) return { id: s.id, top: Infinity };
        const rect = el.getBoundingClientRect();
        return { id: s.id, top: rect.top };
      });
      const current =
        offsets.filter((o) => o.top < 140).pop()?.id ?? offsets[0].id;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = (id: string) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <header
      className={cn(
        "sticky top-16 left-0 right-0 z-30 transition-all duration-500",
        scrolled || isToolsPage
          ? "bg-background/90 backdrop-blur-md border-b border-border/60 shadow-sm"
          : "bg-white/80 backdrop-blur-sm border-b border-black/5"
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => handleClick(s.id)}
                className={cn(
                  "px-2.5 py-1.5 text-sm rounded-md transition-colors",
                  active === s.id && !isToolsPage
                    ? "text-foreground font-semibold"
                    : "text-foreground/60 hover:text-foreground hover:bg-secondary/60"
                )}
              >
                {s.label}
              </button>
            ))}
            <Link
              href="/resources/ai-human-flourishing/tools"
              className={cn(
                "ml-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md transition-colors",
                isToolsPage
                  ? "text-foreground font-semibold bg-secondary/60"
                  : "text-foreground/60 hover:text-foreground hover:bg-secondary/60"
              )}
            >
              <Wrench className="size-3.5" />
              Tools
            </Link>
          </nav>

          {/* Mobile toggle */}
          <div className="flex items-center gap-1 lg:hidden">
            <Link
              href="/resources/ai-human-flourishing/tools"
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md transition-colors",
                isToolsPage
                  ? "text-foreground font-semibold bg-secondary/60"
                  : "text-foreground/70 hover:text-foreground"
              )}
              aria-label="Browse all tools"
            >
              <Wrench className="size-4" />
              <span className="hidden xs:inline sm:inline">Tools</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="lg:hidden border-t border-border/60 bg-background/95 backdrop-blur-md">
          <div className="px-4 py-3 space-y-1 max-h-[80vh] overflow-y-auto brand-scroll">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => handleClick(s.id)}
                className={cn(
                  "block w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                  active === s.id && !isToolsPage
                    ? "bg-secondary text-foreground font-semibold"
                    : "text-foreground/70 hover:bg-secondary/60"
                )}
              >
                {s.label}
              </button>
            ))}
            <Link
              href="/resources/ai-human-flourishing/tools"
              onClick={() => setOpen(false)}
              className={cn(
                "block w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                isToolsPage
                  ? "bg-secondary text-foreground font-semibold"
                  : "text-foreground/70 hover:bg-secondary/60"
              )}
            >
              Tools
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
