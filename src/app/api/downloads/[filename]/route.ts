import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

/**
 * GET /api/downloads/[filename]
 *
 * Streams a file from /home/z/my-project/download/ to the browser.
 *
 * Query params:
 *   ?inline=1   → serve with Content-Disposition: inline (lets the browser
 *                 render PDFs / images / videos directly instead of forcing
 *                 a download). Useful for embedding in <iframe> / <embed>
 *                 and for the IM preview panel.
 *
 * Security: only serves files inside /home/z/my-project/download/.
 * The filename is sanitized to prevent path traversal.
 */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  json: "application/json",
  csv: "text/csv",
  txt: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function mimeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ filename: string }> },
) {
  const { filename } = await ctx.params;

  // Sanitize: only allow filenames matching [A-Za-z0-9._-]+ (no leading dot).
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename)) {
    return NextResponse.json(
      { error: "Invalid filename" },
      { status: 400 },
    );
  }

  const DOWNLOAD_DIR = "/home/z/my-project/download";
  const filePath = path.join(DOWNLOAD_DIR, filename);

  // Resolve and verify the path is still inside DOWNLOAD_DIR
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
  const contentType = mimeFor(filename);

  // ?inline=1 → render in-browser (PDF in iframe, etc.)
  // default → force download
  const wantInline = req.nextUrl.searchParams.get("inline") === "1";
  const disposition = wantInline ? "inline" : "attachment";
  const dispositionHeader =
    disposition === "inline"
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`;

  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stats.size),
      "Content-Disposition": dispositionHeader,
      // Allow iframe embedding from same origin (preview panel uses iframes)
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
