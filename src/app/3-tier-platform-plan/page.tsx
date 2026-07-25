"use client";

import { useEffect, useState } from "react";

/**
 * /3-tier-platform-plan
 *
 * Landing page for the AI Salon 3-Tier Platform Plan PDF.
 *
 * Renders the 59-page PDF inline via <iframe> so the IM preview panel
 * shows actual document content (not just a blank page), and provides
 * a prominent Download button for users who want the file.
 *
 * The PDF itself is served by /api/downloads/3-tier-platform-plan.pdf?inline=1
 * which streams it with Content-Type: application/pdf and
 * Content-Disposition: inline so the browser renders it natively.
 */
export default function ThreeTierPlatformPlanPage() {
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    // Cache-busting query so a refresh always re-fetches the latest PDF.
    const bust = Date.now();
    setPdfUrl(`/api/downloads/3-tier-platform-plan.pdf?inline=1&t=${bust}`);
    setDownloadUrl(`/api/downloads/3-tier-platform-plan.pdf?t=${bust}`);
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header band */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#0066FF]">
              AI Salon · Platform Architecture
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 leading-tight">
              3-Tier Platform Plan
              <span className="ml-2 text-base font-normal text-slate-500">
                Global → Country → City / Chapter
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              59 pages · Crystal Blue Tech Blueprint · PDF preview rendered inline
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIframeKey((k) => k + 1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              title="Reload the PDF preview"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <polyline points="21 4 21 10 15 10" />
              </svg>
              Refresh preview
            </button>
            <a
              href={downloadUrl}
              download="3-tier-platform-plan.pdf"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0052CC]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PDF
            </a>
          </div>
        </div>
      </header>

      {/* PDF preview iframe */}
      <section className="mx-auto max-w-6xl px-6 py-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-100 px-4 py-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
            <span className="ml-3 text-xs font-mono text-slate-500 truncate">
              3-tier-platform-plan.pdf
            </span>
          </div>
          <div className="h-[80vh] min-h-[600px] bg-slate-200">
            {pdfUrl ? (
              <iframe
                key={iframeKey}
                src={pdfUrl}
                title="3-Tier Platform Plan PDF preview"
                className="h-full w-full border-0"
                style={{ background: "white" }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Loading PDF…
              </div>
            )}
          </div>
        </div>

        {/* Direct link row (mobile-friendly fallback) */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Direct links:</span>
          <code className="rounded bg-slate-200 px-1.5 py-0.5">
            /api/downloads/3-tier-platform-plan.pdf
          </code>
          <span className="text-slate-400">·</span>
          <code className="rounded bg-slate-200 px-1.5 py-0.5">
            /api/downloads/3-tier-platform-plan.pdf?inline=1
          </code>
        </div>
      </section>
    </main>
  );
}
