"use client";

import { useState } from "react";
import { ASSET_BASE, type Manifest } from "./types";

/**
 * PreviewPanel — page-by-page render of the docx (LibreOffice → PDF → PNG).
 * Continuous vertical scroll like a PDF viewer, with a zoom toggle.
 */
export default function PreviewPanel({ manifest }: { manifest: Manifest }) {
  const [wide, setWide] = useState(false);
  const total = manifest.pages.length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{total} pages</span>{" "}
          · A4 · rendered from the .docx via LibreOffice
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWide((w) => !w)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {wide ? "↔ Fit width" : "↔ Full width"}
          </button>
          <a
            href={`${ASSET_BASE}/${manifest.pdf}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-[#0A1F44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#132d5e]"
          >
            Open PDF ↗
          </a>
        </div>
      </div>

      {/* pages */}
      <div className={wide ? "" : "mx-auto max-w-[620px]"}>
        <div className="space-y-8">
          {manifest.pages.map((p, i) => (
            <figure key={p} className="relative">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Page {i + 1} of {total}
                </span>
                {i === 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-800 uppercase">
                    Cover
                  </span>
                )}
                {i === 1 && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                    TOC
                  </span>
                )}
              </div>
              <a
                href={`${ASSET_BASE}/${p}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-md border border-slate-200 bg-white shadow-md transition hover:shadow-xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${ASSET_BASE}/${p}`}
                  alt={`Page ${i + 1} of ${total}`}
                  className="w-full h-auto"
                  loading="lazy"
                />
              </a>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
