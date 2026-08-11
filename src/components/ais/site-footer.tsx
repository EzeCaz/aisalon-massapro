import Link from "next/link";

/**
 * SiteFooter — brand-aware global footer used on member-facing pages.
 *
 * Replaces the previously per-page hardcoded footer:
 *   "© 2026 AI Salon Tel Aviv · Empowering AI Connections / Platform by MassaPro"
 *
 * New template (per user spec):
 *   "© {year} {brand} {chapter} · Empowering Human Connections / Platform by MassaPro"
 *
 * Brand + chapter are passed in by the page (which has already resolved
 * them from the signed-in user's brandSlug + chapterId). Anonymous
 * visitors fall back to AIS + the brand's default chapter name.
 *
 * NOTE: Admin pages keep their own simple footer (or none) — this
 * component is for member-facing pages only.
 */

type Props = {
  /** Brand display name (e.g. "AI Salon", "Coma"). Already resolved by the
   *  page from the user's brandSlug. */
  brandName: string;
  /** Chapter display name (e.g. "Tel Aviv", "Montréal"). Already resolved
   *  by the page from the user's chapterId. */
  chapterName: string;
};

export function SiteFooter({ brandName, chapterName }: Props) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-black/10 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
        <span>
          © {year} {brandName} {chapterName} · Empowering Human Connections
        </span>
        <span>
          Platform by{" "}
          <a
            href="https://massapro.com"
            className="text-black/80 underline-offset-4 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            MassaPro
          </a>
        </span>
      </div>
    </footer>
  );
}
