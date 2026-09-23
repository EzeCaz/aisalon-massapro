"use client";

import { Fragment } from "react";
import type { Block, Run } from "./types";

/**
 * DocumentPanel — renders the extracted docx blocks as a styled document.
 *
 * Block 0 is the cover (rendered as a table cell in the docx — R1 recipe),
 * so we special-case it into a navy hero card. Blocks 1-2 are the TOC note.
 * Everything after renders as headings / paragraphs / bullet items / tables.
 */

const NAVY = "#0A1F44";
const AMBER = "#F5A623";

function Runs({ runs, fallback }: { runs?: Run[]; fallback: string }) {
  if (!runs || runs.length === 0) return <>{fallback}</>;
  return (
    <>
      {runs.map((r, i) => (
        <Fragment key={i}>
          {r.bold ? <strong className="font-semibold">{r.text}</strong> : r.text}
        </Fragment>
      ))}
    </>
  );
}

function CoverCard({ block }: { block: Block }) {
  const text = block.rows?.[0]?.[0] ?? "";
  // Cover text: eyebrow, then title, subtitle, meta lines, footer
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = "Coma Platform";
  const title2 = "Capabilities & Goals";
  const eyebrow = "P L A T F O R M   O V E R V I E W";
  const meta = [
    "Platform Summary Report",
    "Parent platform: platform.joincoma.com",
    "First white-label community: AI Salon",
    "Prepared by: MassaPro",
    "Date: September 2026",
  ];
  return (
    <section
      className="relative overflow-hidden rounded-xl text-white shadow-lg"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #10294f 55%, #0d2145 100%)` }}
    >
      {/* amber corner accent */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-20"
        style={{ background: `radial-gradient(circle, ${AMBER} 0%, transparent 70%)` }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full opacity-10"
        style={{ background: `radial-gradient(circle, #E84855 0%, transparent 70%)` }}
      />
      <div className="relative px-8 py-12 sm:px-12 sm:py-16">
        <p
          className="mb-6 text-[11px] font-bold tracking-[0.45em]"
          style={{ color: AMBER }}
        >
          {eyebrow}
        </p>
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
          {title}
          <br />
          <span className="font-bold" style={{ color: "#C8D2E0" }}>
            {title2}
          </span>
        </h1>
        <div className="mt-8 space-y-1.5 text-sm" style={{ color: "#A8B8CC" }}>
          {meta.map((m, i) => (
            <p key={i}>
              {i === 0 ? (
                <span className="font-semibold text-white/90">{m}</span>
              ) : (
                m
              )}
            </p>
          ))}
        </div>
        <div
          className="mt-10 flex items-center justify-between border-t pt-5 text-xs"
          style={{ borderColor: "rgba(255,255,255,0.15)", color: "#8A9AB0" }}
        >
          <span className="font-semibold tracking-wide">MassaPro</span>
          <span className="italic">
            Building the Operating System for Communities
          </span>
        </div>
      </div>
      {/* hidden original text for a11y */}
      <span className="sr-only">{lines.join(" ")}</span>
    </section>
  );
}

function TableBlock({ rows }: { rows: string[][] }) {
  if (!rows || rows.length === 0) return null;
  const [head, ...body] = rows;
  return (
    <div className="my-6 overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr style={{ background: NAVY }}>
            {head.map((c, i) => (
              <th
                key={i}
                className="border-b-2 px-4 py-3 text-left font-semibold text-white"
                style={{ borderColor: AMBER }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className={r % 2 === 0 ? "bg-white" : "bg-slate-50"}>
              {row.map((c, i) => (
                <td
                  key={i}
                  className="border-t border-slate-200 px-4 py-2.5 align-top text-slate-700"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocumentPanel({ blocks }: { blocks: Block[] }) {
  // split: cover (first table), toc note, body
  const cover = blocks[0]?.type === "table" ? blocks[0] : null;
  const rest = cover ? blocks.slice(1) : blocks;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      {cover && <CoverCard block={cover} />}

      {/* TOC note */}
      <div className="mt-8 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <p className="mb-1 font-semibold">Table of Contents</p>
        <p className="leading-relaxed">
          The .docx opens with a field-code table of contents (22 headings).
          Open the file in Word and press <em>Ctrl+A → F9</em> (or right-click →
          Update Field) to refresh page numbers after any edits.
        </p>
      </div>

      <div className="document-body">
        {rest.map((b, i) => {
          if (b.type === "heading") {
            if (b.level === 1) {
              return (
                <h2
                  key={i}
                  className="mt-12 mb-4 border-l-4 pl-4 text-2xl font-bold"
                  style={{ color: NAVY, borderColor: AMBER }}
                >
                  <Runs runs={b.runs} fallback={b.text ?? ""} />
                </h2>
              );
            }
            if (b.level === 2) {
              return (
                <h3
                  key={i}
                  className="mt-8 mb-3 text-lg font-bold"
                  style={{ color: NAVY }}
                >
                  <Runs runs={b.runs} fallback={b.text ?? ""} />
                </h3>
              );
            }
            return (
              <h4 key={i} className="mt-6 mb-2 font-semibold text-slate-800">
                <Runs runs={b.runs} fallback={b.text ?? ""} />
              </h4>
            );
          }

          if (b.type === "table") {
            return <TableBlock key={i} rows={b.rows ?? []} />;
          }

          if (b.type === "pagebreak") {
            return <hr key={i} className="my-8 border-slate-200" />;
          }

          const text = b.text ?? "";
          const isBullet = text.trimStart().startsWith("•");
          const isCaption = /^Table \d+\s+—/.test(text.trim());

          if (isBullet) {
            return (
              <div key={i} className="my-2 flex items-start gap-3 pl-2">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: AMBER }}
                />
                <p className="text-[15px] leading-relaxed text-slate-700">
                  <Runs runs={b.runs} fallback={text.replace(/^\s*•\s*/, "")} />
                </p>
              </div>
            );
          }

          if (isCaption) {
            return (
              <p
                key={i}
                className="mt-6 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase"
              >
                {text}
              </p>
            );
          }

          return (
            <p
              key={i}
              className="my-4 text-justify text-[15px] leading-relaxed text-slate-700"
            >
              <Runs runs={b.runs} fallback={text} />
            </p>
          );
        })}
      </div>
    </div>
  );
}
