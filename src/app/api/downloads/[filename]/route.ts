import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

/**
 * GET /api/downloads/[filename]
 *
 * Streams a file from /home/z/my-project/download/ to the browser.
 * Used to expose the backup zip files (and any other deliverable in
 * the download folder) so the user can fetch them via the dev server
 * URL instead of needing direct filesystem access.
 *
 * Security: only serves files inside /home/z/my-project/download/.
 * The filename is sanitized to prevent path traversal (../etc/passwd
 * and friends).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ filename: string }> },
) {
  const { filename } = await ctx.params;

  // Sanitize: only allow filenames matching [A-Za-z0-9._-]+
  // (no slashes, no leading dots, no traversal sequences).
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename)) {
    return NextResponse.json(
      { error: "Invalid filename" },
      { status: 400 },
    );
  }

  const DOWNLOAD_DIR = "/home/z/my-project/download";
  const filePath = path.join(DOWNLOAD_DIR, filename);

  // Resolve and verify the path is still inside DOWNLOAD_DIR
  // (defensive — the regex above already prevents traversal, but
  // belt-and-suspenders in case the regex is ever loosened).
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(DOWNLOAD_DIR + "/")) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  let stats;
  try {
    stats = await stat(resolved);
  } catch {
    return NextResponse.json(
      { error: "File not found" },
      { status: 404 },
    );
  }

  if (!stats.isFile()) {
    return NextResponse.json(
      { error: "Not a file" },
      { status: 400 },
    );
  }

  const data = await readFile(resolved);

  // Force browser to download (attachment) rather than try to render.
  // Includes Content-Length so the browser can show a progress bar.
  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(stats.size),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
