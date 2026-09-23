"use client";

import { useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ASSET_BASE, type CodeFile } from "./types";

/**
 * CodePanel — VS Code-style workspace view of the pipeline that produced
 * the document: the docx generator, the post-processor, and the viewer
 * asset pipeline. File tree on the left, syntax-highlighted source right.
 */

const LANG_META: Record<string, { color: string; label: string }> = {
  javascript: { color: "#E9C46A", label: "JS" },
  python: { color: "#4B8BBE", label: "PY" },
};

const NOTES: Record<string, string> = {
  "generate-platform-summary.js":
    "Builds the .docx end-to-end: Coma palette, R1 cover recipe, TOC section (Roman numerals), body section (Arabic), 5 tables, 22 headings.",
  "postprocess-summary-docx.py":
    "Patches the OOXML after generation: removes the empty pgNumType, fixes footer numbering to PAGE \\* ROMAN / \\* arabic.",
  "prepare-doc-viewer.py":
    "Stages this viewer's assets: extracts structured blocks (python-docx), converts to PDF (LibreOffice), renders page PNGs (pdftoppm), copies code files.",
};

function humanBytes(b: number) {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}

export default function CodePanel({ files }: { files: CodeFile[] }) {
  const [active, setActive] = useState<string>(files[0]?.name ?? "");
  const [contents, setContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!active || contents[active] !== undefined) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${ASSET_BASE}/code/${encodeURIComponent(active)}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((t) => {
        if (!cancelled)
          setContents((c) => ({ ...c, [active]: t }));
      })
      .catch(() => {
        if (!cancelled)
          setContents((c) => ({ ...c, [active]: `// Failed to load ${active}` }));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const file = files.find((f) => f.name === active);
  const code = active ? contents[active] : undefined;
  const meta = file ? LANG_META[file.language] ?? { color: "#94A3B8", label: "?" } : null;

  const copy = () => {
    if (code === undefined) return;
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="overflow-hidden rounded-xl border border-slate-700 shadow-2xl" style={{ background: "#1e1e1e" }}>
        {/* window chrome */}
        <div
          className="flex items-center gap-2 border-b px-4 py-2.5"
          style={{ borderColor: "#333", background: "#252526" }}
        >
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs font-medium text-slate-400">
            workspace — my-project/scripts
          </span>
        </div>

        <div className="grid md:grid-cols-[240px_1fr]">
          {/* explorer */}
          <aside
            className="border-b p-3 md:border-b-0 md:border-r"
            style={{ borderColor: "#333", background: "#252526" }}
          >
            <p className="mb-2 px-1 text-[10px] font-bold tracking-widest text-slate-500 uppercase">
              Explorer — document pipeline
            </p>
            <ul className="space-y-0.5">
              {files.map((f) => {
                const m = LANG_META[f.language] ?? { color: "#94A3B8", label: "?" };
                const isActive = f.name === active;
                return (
                  <li key={f.name}>
                    <button
                      onClick={() => setActive(f.name)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                        isActive
                          ? "bg-[#094771] text-white"
                          : "text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      <span
                        className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold"
                        style={{ background: `${m.color}22`, color: m.color }}
                      >
                        {m.label}
                      </span>
                      <span className="truncate font-mono">{f.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {file && (
              <div className="mt-4 rounded-md border border-slate-700 bg-[#1e1e1e] p-3">
                <p className="text-[10px] leading-relaxed text-slate-400">
                  {NOTES[file.name] ?? "Pipeline script."}
                </p>
              </div>
            )}
          </aside>

          {/* editor */}
          <div className="min-w-0">
            {file && (
              <>
                <div
                  className="flex items-center justify-between gap-3 border-b px-4 py-2"
                  style={{ borderColor: "#333", background: "#2d2d2d" }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold"
                      style={{ background: `${meta!.color}22`, color: meta!.color }}
                    >
                      {meta!.label}
                    </span>
                    <span className="truncate font-mono text-xs text-slate-200">
                      {file.path}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-[10px] text-slate-500">
                    <span>{file.lines} lines</span>
                    <span>{humanBytes(file.bytes)}</span>
                    <button
                      onClick={copy}
                      className="rounded border border-slate-600 px-2 py-0.5 text-slate-300 hover:bg-white/10"
                    >
                      {copied ? "✓ copied" : "copy"}
                    </button>
                  </div>
                </div>

                <div className="max-h-[70vh] overflow-auto">
                  {loading && code === undefined ? (
                    <p className="p-6 font-mono text-xs text-slate-500">loading…</p>
                  ) : code !== undefined ? (
                    <SyntaxHighlighter
                      language={file.language}
                      style={oneDark}
                      showLineNumbers
                      customStyle={{
                        margin: 0,
                        background: "#1e1e1e",
                        fontSize: "12px",
                        lineHeight: 1.6,
                      }}
                      codeTagProps={{
                        style: { fontFamily: "var(--font-inter), ui-monospace, monospace" },
                      }}
                    >
                      {code}
                    </SyntaxHighlighter>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
