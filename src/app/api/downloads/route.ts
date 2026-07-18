import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";

/**
 * GET /api/downloads
 *
 * Returns a JSON list of all files in /home/z/my-project/download/
 * with their size and a direct download URL. Useful for the user to
 * discover what's available without poking around the filesystem.
 */
export async function GET() {
  const DOWNLOAD_DIR = "/home/z/my-project/download";

  let entries: string[];
  try {
    entries = await readdir(DOWNLOAD_DIR);
  } catch {
    return NextResponse.json({ files: [] });
  }

  const files = await Promise.all(
    entries
      .filter((name) => !name.startsWith("."))
      .map(async (name) => {
        const full = path.join(DOWNLOAD_DIR, name);
        try {
          const s = await stat(full);
          return {
            name,
            size: s.size,
            sizeLabel: humanSize(s.size),
            url: `/api/downloads/${encodeURIComponent(name)}`,
            modified: s.mtime.toISOString(),
          };
        } catch {
          return null;
        }
      }),
  );

  return NextResponse.json({
    files: files
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => b.modified.localeCompare(a.modified)),
  });
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
