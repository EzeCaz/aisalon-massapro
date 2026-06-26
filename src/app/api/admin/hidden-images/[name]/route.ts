import { NextRequest, NextResponse } from "next/server";
import { promises as fs, createReadStream } from "fs";
import path from "path";
import { Readable } from "stream";
import { requirePermission, isError } from "@/lib/auth-guards";

/**
 * GET /api/admin/hidden-images/[name]
 *
 * Streams a single image from the project's hidden `.images/` folder.
 * ADMIN-ONLY — same gate as /admin (SUPER_ADMIN or ADMIN).
 *
 * PATH TRAVERSAL PROTECTION:
 *   - The `name` param is validated against a strict whitelist regex
 *     (letters, digits, spaces, hyphens, underscores, dots).
 *   - Any `/`, `\`, or `..` segment is rejected with 400.
 *   - The resolved absolute path is checked to ensure it is still inside
 *     `.images/` (defence-in-depth — even if the regex somehow missed an
 *     attack vector, this check would catch it).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const me = await requirePermission("members.view");
  if (isError(me)) return me;

  const { name } = await params;

  // Strict whitelist: filename only, no path separators, no `..`.
  // Allows spaces (filenames like "Falafel meerkat.jpg") and dots
  // (extension separator).
  if (!/^[A-Za-z0-9 _.\-]+$/.test(name)) {
    return NextResponse.json(
      { error: "Invalid image name" },
      { status: 400 }
    );
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return NextResponse.json(
      { error: "Invalid image name" },
      { status: 400 }
    );
  }

  const dir = path.join(process.cwd(), ".images");
  const filePath = path.join(dir, name);

  // Defence-in-depth: ensure resolved path is still inside .images/.
  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
    return NextResponse.json(
      { error: "Invalid image name" },
      { status: 400 }
    );
  }

  // Verify the file exists and is a regular file.
  let stat;
  try {
    stat = await fs.stat(resolvedFile);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // Reject non-image extensions (defence-in-depth).
  const ext = path.extname(name).toLowerCase();
  const ALLOWED_EXT = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".avif",
    ".bmp",
    ".svg",
  ]);
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type" },
      { status: 415 }
    );
  }

  const mimeType =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".avif"
              ? "image/avif"
              : ext === ".bmp"
                ? "image/bmp"
                : ext === ".svg"
                  ? "image/svg+xml"
                  : "application/octet-stream";

  // Stream the file to the response. Using createReadStream + Readable
  // avoids loading the entire file into memory (some of these images are
  // >500 KB).
  const stream = createReadStream(resolvedFile);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=300",
      // `Content-Disposition: inline` so the browser displays the image
      // rather than downloading it. (We add a filename so a "Save As"
      // from the browser still gets the original filename.)
      "Content-Disposition": `inline; filename="${name.replace(/"/g, "'")}"`,
    },
  });
}
