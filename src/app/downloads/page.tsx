"use client";

import { useEffect, useState } from "react";

/**
 * /downloads — friendly UI listing all files in /home/z/my-project/download/
 * with one-click download buttons. Intended for the developer/operator to
 * pull backups and other deliverables out of the workspace.
 */
type FileEntry = {
  name: string;
  size: number;
  sizeLabel: string;
  url: string;
  modified: string;
};

export default function DownloadsPage() {
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/downloads")
      .then((r) => r.json())
      .then((d) => setFiles(d.files ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Downloads</h1>
        <p className="text-sm text-gray-600 mb-8">
          Backup files and other deliverables from{" "}
          <code className="bg-gray-200 px-1 rounded">
            /home/z/my-project/download/
          </code>
        </p>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            Error loading files: {error}
          </div>
        )}

        {files === null && !error && (
          <div className="text-sm text-gray-500">Loading…</div>
        )}

        {files && files.length === 0 && (
          <div className="text-sm text-gray-500">No files available.</div>
        )}

        {files && files.length > 0 && (
          <ul className="space-y-3">
            {files.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm text-gray-900 truncate">
                    {f.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {f.sizeLabel} ·{" "}
                    {new Date(f.modified).toLocaleString()}
                  </div>
                </div>
                <a
                  href={f.url}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-[#0066FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0052CC]"
                  download={f.name}
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
