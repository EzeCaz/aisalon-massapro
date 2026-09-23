"use client";

import { useEffect, useState } from "react";
import DocumentPanel from "./document-panel";
import PreviewPanel from "./preview-panel";
import CodePanel from "./code-panel";
import { ASSET_BASE, DOCX_NAME, type Block, type Manifest } from "./types";

/**
 * /doc/platform-summary — workspace viewer for
 * download/coma-platform-capabilities-and-goals.docx
 *
 * Three panels:
 *   📄 Document — the full rendered report content
 *   🔍 Preview  — the 10 rendered pages (docx → PDF → PNG)
 *   💻 Code     — the generator pipeline behind the document
 */

type Tab = "document" | "preview" | "code";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "document", label: "Document", icon: "📄" },
  { id: "preview", label: "Preview", icon: "🔍" },
  { id: "code", label: "Code Workspace", icon: "💻" },
];

function humanBytes(b: number) {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}

export default function PlatformSummaryDocPage() {
  const [tab, setTab] = useState<Tab>("document");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${ASSET_BASE}/manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((m: Manifest) => {
        setManifest(m);
        return fetch(`${ASSET_BASE}/content.json`);
      })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setBlocks(d.blocks ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  const stats = manifest?.stats;

  return (
    <main className="min-h-screen bg-slate-100">
      {/* header */}
      <header
        className="text-white"
        style={{
          background:
            "linear-gradient(135deg, #0A1F44 0%, #10294f 60%, #0d2145 100%)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p
                className="mb-2 text-[10px] font-bold tracking-[0.35em]"
                style={{ color: "#F5A623" }}
              >
                DOCUMENT WORKSPACE
              </p>
              <h1 className="text-2xl font-extrabold sm:text-3xl">
                Coma Platform — Capabilities &amp; Goals
              </h1>
              <p className="mt-2 font-mono text-xs text-slate-400">
                {DOCX_NAME}
                {stats ? ` · ${humanBytes(stats.sizeBytes)} · ${stats.wordCount.toLocaleString()} words` : ""}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <a
                href={`/api/downloads/${DOCX_NAME}`}
                className="rounded-md px-4 py-2 text-sm font-bold text-[#0A1F44] transition hover:brightness-95"
                style={{ background: "#F5A623" }}
              >
                ⬇ Download .docx
              </a>
              <a
                href={`${ASSET_BASE}/document.pdf`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                PDF ↗
              </a>
            </div>
          </div>

          {/* stat chips */}
          {stats && (
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                ["Pages", manifest!.pages.length],
                ["Sections", stats.headings],
                ["Tables", stats.tables],
                ["Words", stats.wordCount.toLocaleString()],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-2"
                >
                  <p className="text-lg leading-none font-bold" style={{ color: "#F5A623" }}>
                    {value}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* tab bar */}
      <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative shrink-0 px-4 py-3.5 text-sm font-semibold transition ${
                tab === t.id
                  ? "text-[#0A1F44]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>
              {t.label}
              {tab === t.id && (
                <span
                  className="absolute inset-x-3 bottom-0 h-[3px] rounded-t"
                  style={{ background: "#F5A623" }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* panels */}
      {error && (
        <div className="mx-auto mt-8 max-w-3xl rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Failed to load document assets: {error}
        </div>
      )}

      {!error && (!manifest || !blocks) && (
        <div className="py-24 text-center text-sm text-slate-500">
          Loading document…
        </div>
      )}

      {!error && manifest && blocks && (
        <>
          {tab === "document" && <DocumentPanel blocks={blocks} />}
          {tab === "preview" && <PreviewPanel manifest={manifest} />}
          {tab === "code" && <CodePanel files={manifest.code} />}
        </>
      )}

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        Generated {manifest ? new Date(manifest.generatedAt).toLocaleString() : "…"} ·
        pipeline: python-docx extraction · LibreOffice PDF · pdftoppm pages
      </footer>
    </main>
  );
}
